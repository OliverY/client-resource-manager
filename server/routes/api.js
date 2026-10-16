'use strict';

const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const express = require('express');
const multer = require('multer');

const store = require('../lib/store');
const { probe, isVectorLike } = require('../lib/image');
const { normalizeLogical, validateLogical, androidName, iosName } = require('../lib/naming');
const { buildSnapshot, diffSnapshots } = require('../lib/snapshot');
const { buildAndroid } = require('../packagers/android');
const { buildIos } = require('../packagers/ios');
const { DEFAULT_LIB } = require('../config');

const router = express.Router();

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 20 * 1024 * 1024, files: 200 },
});

function sha1(buf) {
  return crypto.createHash('sha1').update(buf).digest('hex');
}

/** 解析上传文件名：`home_icon_search@3x.png` / `home_icon_search.png`（默认 3x）；.svg 无倍率概念 */
function parseUploadName(originalname) {
  const base = path.basename(originalname);
  const m = base.match(/^(.*?)@(\d)x(\.[a-zA-Z0-9]+)?$/i);
  if (m) return { logical: normalizeLogical(m[1]), scale: Number(m[2]) };
  return { logical: normalizeLogical(base), scale: 3 };
}

/* ================= 项目管理 ================= */

const RE_PREFIX = /^[a-z0-9_]*$/;
const RE_GROUP_ID = /^[a-zA-Z0-9_.]+$/;
const RE_ARTIFACT_ID = /^[a-zA-Z0-9_-]+$/;
const RE_IOS_PACKAGE = /^[A-Za-z][A-Za-z0-9_]*$/;

function pascalCase(id) {
  return id.split(/[_-]/).map((s) => s.charAt(0).toUpperCase() + s.slice(1)).join('');
}

/** 按用户输入整理项目字段，缺省项自动推导 */
function normalizeProjectFields(id, body) {
  // 未提供 prefix 才按项目 ID 推导；显式传空串表示不要前缀
  const prefix = body.prefix == null
    ? `${id}_`
    : String(body.prefix).trim().toLowerCase().replace(/[^a-z0-9_]/g, '');
  const groupId = String(body.groupId ?? '').trim() || DEFAULT_LIB.groupId;
  const artifactId = String(body.artifactId ?? '').trim() || `${id}-assets`;
  const iosPackage = String(body.iosPackage ?? '').trim() || pascalCase(id) + DEFAULT_LIB.iosPackageSuffix;

  const issues = [];
  if (prefix && !RE_PREFIX.test(prefix)) issues.push('资源前缀只能含小写字母、数字、下划线');
  if (!RE_GROUP_ID.test(groupId)) issues.push('groupId 格式不合法');
  if (!RE_ARTIFACT_ID.test(artifactId)) issues.push('artifactId 格式不合法');
  if (!RE_IOS_PACKAGE.test(iosPackage)) issues.push('iOS 包名必须是合法标识符');
  if (String(body.name ?? '').trim().length > 50) issues.push('项目名称过长（>50 字符）');

  return {
    issues,
    fields: {
      name: String(body.name ?? '').trim() || id,
      prefix,
      groupId,
      artifactId,
      iosPackage,
    },
  };
}

function publicProject(p, db) {
  const out = {
    id: p.id,
    name: p.name,
    prefix: p.prefix || '',
    groupId: p.groupId,
    artifactId: p.artifactId,
    iosPackage: p.iosPackage,
    createdAt: p.createdAt,
  };
  if (db) {
    out.assetCount = db.assets.length;
    out.releaseCount = db.releases.length;
    out.latestVersion = db.releases.length ? db.releases[db.releases.length - 1].version : null;
  }
  return out;
}

router.get('/projects', (req, res) => {
  const projects = store.loadRegistry().map((p) => publicProject(p, store.load(p.id)));
  res.json({ projects });
});

router.post('/projects', (req, res) => {
  const id = String((req.body || {}).id ?? '').trim().toLowerCase();
  if (!store.isValidProjectId(id)) {
    return res.status(400).json({ ok: false, error: '项目 ID 必须是小写字母开头，仅含小写字母/数字/下划线/中划线，长度 ≤32' });
  }
  const { issues, fields } = normalizeProjectFields(id, req.body || {});
  if (issues.length) return res.status(400).json({ ok: false, error: issues.join('；') });

  const projects = store.loadRegistry();
  if (projects.some((p) => p.id === id)) {
    return res.status(409).json({ ok: false, error: `项目已存在: ${id}` });
  }

  const project = { id, ...fields, createdAt: new Date().toISOString() };
  projects.push(project);
  store.saveRegistry(projects);

  // 预建目录：让静态路由与后续上传/发布开箱即用
  fs.mkdirSync(store.uploadDir(id), { recursive: true });
  fs.mkdirSync(store.outputDir(id), { recursive: true });

  res.json({ ok: true, project: publicProject(project, store.EMPTY) });
});

function resolveProject(req, res, next) {
  const pid = req.params.pid;
  if (!store.isValidProjectId(pid)) {
    return res.status(400).json({ ok: false, error: `非法项目 ID: ${pid}` });
  }
  const project = store.findProject(pid);
  if (!project) return res.status(404).json({ ok: false, error: `项目不存在: ${pid}` });
  req.project = project;
  next();
}

/** 编辑项目：名称 / 资源前缀 / 打包坐标。改前缀只影响之后的发布产物名 */
router.patch('/projects/:pid', resolveProject, (req, res) => {
  const { issues, fields } = normalizeProjectFields(req.project.id, req.body || {});
  if (issues.length) return res.status(400).json({ ok: false, error: issues.join('；') });

  const projects = store.loadRegistry();
  const idx = projects.findIndex((p) => p.id === req.project.id);
  projects[idx] = { ...projects[idx], ...fields };
  store.saveRegistry(projects);

  res.json({ ok: true, project: publicProject(projects[idx], store.load(req.project.id)) });
});

/* ================= 项目作用域端点 ================= */

const scoped = express.Router({ mergeParams: true });
scoped.use(resolveProject);

function lib(req) {
  return store.libOf(req.project);
}

/**
 * 未发布的修改：对比最新已发布版本快照与当前资源库。
 * 上传 / 删除 / 恢复都先落在资源库，发布新版本时才批量提交，此差异即「待保存」的修改。
 */
function computePending(db, l) {
  const latest = store.latestRelease(db);
  const current = buildSnapshot(db, l);
  const changelog = diffSnapshots(latest ? latest.assets : [], current);
  const total = changelog.added.length + changelog.modified.length + changelog.removed.length;
  return {
    hasChanges: total > 0,
    total,
    added: changelog.added,
    modified: changelog.modified,
    removed: changelog.removed,
    baselineVersion: latest ? latest.version : null,
  };
}

/** 全量状态：供 Web 面板渲染 */
scoped.get('/state', async (req, res) => {
  const pid = req.project.id;
  const db = store.load(pid);
  const l = lib(req);

  // 旧数据回填：上传时还没算「矢量图」标记的资源，按主源图补算一次（幂等）
  let dirty = false;
  for (const a of db.assets) {
    if (a.vectorLike != null) continue;
    const primary = Object.values(a.sources || {}).sort((x, y) => y.scale - x.scale)[0];
    a.vectorLike = primary ? await isVectorLike(primary.path) : false;
    dirty = true;
  }
  if (dirty) store.save(pid, db);

  const addedVersion = firstVersionMap(db);
  res.json({
    project: publicProject(req.project, db),
    config: {
      prefix: l.prefix,
      groupId: l.groupId,
      artifactId: l.artifactId,
      iosPackage: l.iosPackage,
    },
    assets: db.assets.map((a) => publicAsset(a, l.prefix, addedVersion.get(a.logical))),
    // releases 倒序（最新在前）：与 /releases 一致，前端「更新对比」默认选中最新一版依赖此顺序
    releases: db.releases.map(publicRelease).reverse(),
    pending: computePending(db, l),
  });
});

function publicAsset(a, prefix, addedVersion) {
  return {
    id: a.id,
    logical: a.logical,
    androidName: androidName(a.logical, prefix),
    iosName: iosName(a.logical, prefix),
    format: a.format,
    // 矢量图（单色图标）：只有这类资源开放着色预览
    vectorLike: !!a.vectorLike,
    status: a.status,
    width: a.width,
    height: a.height,
    hash: a.hash,
    tags: a.tags || [],
    scales: Object.keys(a.sources || {}).map(Number).sort(),
    // 首次出现的发布版本；未发布过为 null（前端「按版本」分组用）
    addedVersion: addedVersion || null,
    createdAt: a.createdAt,
    updatedAt: a.updatedAt,
  };
}

/** 资源 logical -> 首次包含它的发布版本（按发布时间正序找第一次出现） */
function firstVersionMap(db) {
  const map = new Map();
  for (const r of db.releases) {
    for (const s of r.assets || []) {
      if (!map.has(s.logical)) map.set(s.logical, r.version);
    }
  }
  return map;
}

function publicRelease(r) {
  return {
    version: r.version,
    at: r.at,
    by: r.by,
    note: r.note,
    changelog: r.changelog,
    artifacts: r.artifacts,
    assetCount: (r.assets || []).length,
  };
}

/** 批量上传（设计师） */
scoped.post('/assets', upload.array('files'), async (req, res) => {
  try {
    const pid = req.project.id;
    const uploadRoot = store.uploadDir(pid);
    const db = store.load(pid);
    const byLogical = new Map();
    const warnings = [];

    for (const file of req.files || []) {
      let parsed;
      try {
        parsed = parseUploadName(file.originalname);
      } catch (e) {
        warnings.push(`${file.originalname}: ${e.message}`);
        continue;
      }
      const { logical, scale: rawScale } = parsed;
      const isSvg = path.extname(file.originalname).toLowerCase() === '.svg';
      // SVG 是矢量单源，与倍率无关，统一按 scale 1 归档
      const scale = isSvg ? 1 : rawScale;
      if (![1, 2, 3].includes(scale)) {
        warnings.push(`${file.originalname}: 只支持 @2x / @3x`);
        continue;
      }
      const { issues } = validateLogical(logical);
      if (issues.length) warnings.push(`${logical}: ${issues.join('；')}`);

      const buf = file.buffer;
      const ext = isSvg ? '.svg' : '.png';
      const tmp = path.join(uploadRoot, `.tmp-${Date.now()}-${logical}@${scale}x${ext}`);
      fs.mkdirSync(uploadRoot, { recursive: true });
      fs.writeFileSync(tmp, buf);
      const meta = await probe(tmp);
      fs.rmSync(tmp, { force: true });

      const destDir = path.join(uploadRoot, logical);
      fs.mkdirSync(destDir, { recursive: true });
      const dest = path.join(destDir, isSvg ? 'source.svg' : `source@${scale}x.png`);
      fs.writeFileSync(dest, buf);

      if (!byLogical.has(logical)) byLogical.set(logical, {});
      byLogical.get(logical)[String(scale)] = {
        path: dest,
        scale,
        width: meta.width,
        height: meta.height,
        hash: sha1(buf),
      };
    }

    const now = new Date().toISOString();
    let created = 0;
    let updated = 0;

    for (const [logical, sources] of byLogical) {
      let asset = db.assets.find((a) => a.logical === logical);
      const highest = Object.values(sources).sort((a, b) => b.scale - a.scale)[0];

      if (!asset) {
        asset = {
          id: store.nextAssetId(db),
          logical,
          format: path.extname(Object.values(sources)[0].path).toLowerCase() === '.svg' ? 'svg' : 'png',
          tags: [],
          status: 'active',
          createdAt: now,
          updatedAt: now,
          sources: {},
        };
        db.assets.push(asset);
        created += 1;
      } else {
        updated += 1;
      }

      // 合并源图：新上传更高倍率时，丢弃过期的低倍率源（打包时会自动重新派生）
      const merged = { ...(asset.sources || {}), ...sources };
      const maxUploaded = Math.max(...Object.values(sources).map((s) => s.scale));
      for (const key of Object.keys(merged)) {
        if (!sources[key] && merged[key].scale < maxUploaded) delete merged[key];
      }
      asset.sources = merged;
      asset.hash = highest.hash;
      asset.width = highest.width;
      asset.height = highest.height;
      asset.sourceScale = highest.scale;
      asset.format = path.extname(highest.path).toLowerCase() === '.svg' ? 'svg' : 'png';
      asset.vectorLike = await isVectorLike(highest.path);
      asset.updatedAt = now;
      if (asset.status === 'removed') asset.status = 'active';
    }

    store.save(pid, db);
    res.json({ ok: true, created, updated, warnings, assets: db.assets.map((a) => publicAsset(a, lib(req).prefix)) });
  } catch (err) {
    console.error(err);
    res.status(500).json({ ok: false, error: err.message });
  }
});

/** 软删除（标记 removed，不物理删除，保证老版本 App 兼容） */
scoped.post('/assets/:logical/remove', (req, res) => {
  const pid = req.project.id;
  const db = store.load(pid);
  const asset = db.assets.find((a) => a.logical === req.params.logical);
  if (!asset) return res.status(404).json({ ok: false, error: 'not found' });
  asset.status = 'removed';
  asset.updatedAt = new Date().toISOString();
  store.save(pid, db);
  res.json({ ok: true });
});

/** 恢复 */
scoped.post('/assets/:logical/restore', (req, res) => {
  const pid = req.project.id;
  const db = store.load(pid);
  const asset = db.assets.find((a) => a.logical === req.params.logical);
  if (!asset) return res.status(404).json({ ok: false, error: 'not found' });
  asset.status = 'active';
  asset.updatedAt = new Date().toISOString();
  store.save(pid, db);
  res.json({ ok: true });
});

/** 发布：构建三端产物 */
scoped.post('/publish', async (req, res) => {
  try {
    const pid = req.project.id;
    const l = lib(req);
    const { by = 'unknown', note = '' } = req.body || {};
    const db = store.load(pid);
    const snapshot = buildSnapshot(db, l);
    if (!snapshot.length) return res.status(400).json({ ok: false, error: '没有可发布的资源' });

    const version = store.nextVersion(db);
    const prev = store.latestRelease(db);
    const changelog = diffSnapshots(prev ? prev.assets : [], snapshot);

    const allVersions = db.releases.map((r) => r.version);
    const outputDir = store.outputDir(pid);
    const android = await buildAndroid({ lib: l, outputDir, assets: snapshot, version, allVersions });
    const ios = await buildIos({ lib: l, outputDir, assets: snapshot, version });

    const release = {
      version,
      at: new Date().toISOString(),
      by,
      note,
      assets: snapshot,
      changelog,
      artifacts: { android, ios },
    };
    db.releases.push(release);
    store.save(pid, db);

    res.json({ ok: true, release: publicRelease(release) });
  } catch (err) {
    console.error(err);
    res.status(500).json({ ok: false, error: err.message });
  }
});

/** 版本列表 */
scoped.get('/releases', (req, res) => {
  const db = store.load(req.project.id);
  res.json({ releases: db.releases.map(publicRelease).reverse() });
});

/** 任意两个版本的 diff（默认：最新 vs 上一版） */
scoped.get('/diff', (req, res) => {
  const db = store.load(req.project.id);
  const rels = db.releases;
  if (!rels.length) return res.json({ from: null, to: null, added: [], modified: [], removed: [] });

  const toIdx = req.query.to ? rels.findIndex((r) => r.version === req.query.to) : rels.length - 1;
  const fromIdx = req.query.from ? rels.findIndex((r) => r.version === req.query.from) : toIdx - 1;

  if (req.query.to && toIdx === -1) return res.status(404).json({ ok: false, error: `发布版本不存在: ${req.query.to}` });
  if (req.query.from && fromIdx === -1) return res.status(404).json({ ok: false, error: `发布版本不存在: ${req.query.from}` });

  const to = rels[toIdx];
  const from = fromIdx >= 0 ? rels[fromIdx] : null;
  const changelog = diffSnapshots(from ? from.assets : [], to.assets);

  res.json({
    from: from ? from.version : null,
    to: to.version,
    ...changelog,
  });
});

router.use('/projects/:pid', scoped);

module.exports = router;
