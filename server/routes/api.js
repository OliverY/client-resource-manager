'use strict';

const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const express = require('express');
const multer = require('multer');

const store = require('../lib/store');
const { probe } = require('../lib/image');
const { normalizeLogical, validateLogical, androidName, iosName } = require('../lib/naming');
const { buildSnapshot, diffSnapshots } = require('../lib/snapshot');
const { buildAndroid } = require('../packagers/android');
const { buildIos } = require('../packagers/ios');
const { UPLOAD_DIR, LIB } = require('../config');

const router = express.Router();

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 20 * 1024 * 1024, files: 200 },
});

function sha1(buf) {
  return crypto.createHash('sha1').update(buf).digest('hex');
}

/** 解析上传文件名：`home_icon_search@3x.png` / `home_icon_search.png`（默认 3x） */
function parseUploadName(originalname) {
  const base = path.basename(originalname);
  const m = base.match(/^(.*?)@(\d)x(\.[a-zA-Z0-9]+)?$/i);
  if (m) return { logical: normalizeLogical(m[1]), scale: Number(m[2]) };
  return { logical: normalizeLogical(base), scale: 3 };
}

/** 全量状态：供 Web 面板渲染 */
router.get('/state', (req, res) => {
  const db = store.load();
  res.json({
    config: {
      prefix: LIB.prefix,
      groupId: LIB.groupId,
      artifactId: LIB.artifactId,
      iosPackage: LIB.iosPackage,
    },
    assets: db.assets.map(publicAsset),
    // releases 倒序（最新在前）：与 /api/releases 一致，前端「更新对比」默认选中最新一版依赖此顺序
    releases: db.releases.map(publicRelease).reverse(),
  });
});

function publicAsset(a) {
  return {
    id: a.id,
    logical: a.logical,
    androidName: androidName(a.logical, LIB.prefix),
    iosName: iosName(a.logical, LIB.prefix),
    format: a.format,
    status: a.status,
    width: a.width,
    height: a.height,
    hash: a.hash,
    tags: a.tags || [],
    scales: Object.keys(a.sources || {}).map(Number).sort(),
    createdAt: a.createdAt,
    updatedAt: a.updatedAt,
  };
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
router.post('/assets', upload.array('files'), async (req, res) => {
  try {
    const db = store.load();
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
      const { logical, scale } = parsed;
      if (![2, 3].includes(scale)) {
        warnings.push(`${file.originalname}: 只支持 @2x / @3x`);
        continue;
      }
      const { issues } = validateLogical(logical);
      if (issues.length) warnings.push(`${logical}: ${issues.join('；')}`);

      const buf = file.buffer;
      const tmp = path.join(UPLOAD_DIR, `.tmp-${Date.now()}-${logical}@${scale}x.png`);
      fs.mkdirSync(UPLOAD_DIR, { recursive: true });
      fs.writeFileSync(tmp, buf);
      const meta = await probe(tmp);
      fs.rmSync(tmp, { force: true });

      const destDir = path.join(UPLOAD_DIR, logical);
      fs.mkdirSync(destDir, { recursive: true });
      const dest = path.join(destDir, `source@${scale}x.png`);
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
          format: 'png',
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
      asset.format = 'png';
      asset.updatedAt = now;
      if (asset.status === 'removed') asset.status = 'active';
    }

    store.save(db);
    res.json({ ok: true, created, updated, warnings, assets: db.assets.map(publicAsset) });
  } catch (err) {
    console.error(err);
    res.status(500).json({ ok: false, error: err.message });
  }
});

/** 软删除（标记 removed，不物理删除，保证老版本 App 兼容） */
router.post('/assets/:logical/remove', (req, res) => {
  const db = store.load();
  const asset = db.assets.find((a) => a.logical === req.params.logical);
  if (!asset) return res.status(404).json({ ok: false, error: 'not found' });
  asset.status = 'removed';
  asset.updatedAt = new Date().toISOString();
  store.save(db);
  res.json({ ok: true });
});

/** 恢复 */
router.post('/assets/:logical/restore', (req, res) => {
  const db = store.load();
  const asset = db.assets.find((a) => a.logical === req.params.logical);
  if (!asset) return res.status(404).json({ ok: false, error: 'not found' });
  asset.status = 'active';
  asset.updatedAt = new Date().toISOString();
  store.save(db);
  res.json({ ok: true });
});

/** 发布：构建三端产物 */
router.post('/publish', async (req, res) => {
  try {
    const { by = 'unknown', note = '' } = req.body || {};
    const db = store.load();
    const snapshot = buildSnapshot(db);
    if (!snapshot.length) return res.status(400).json({ ok: false, error: '没有可发布的资源' });

    const version = store.nextVersion(db);
    const prev = store.latestRelease(db);
    const changelog = diffSnapshots(prev ? prev.assets : [], snapshot);

    const allVersions = db.releases.map((r) => r.version);
    const android = await buildAndroid({ assets: snapshot, version, allVersions });
    const ios = await buildIos({ assets: snapshot, version });

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
    store.save(db);

    res.json({ ok: true, release: publicRelease(release) });
  } catch (err) {
    console.error(err);
    res.status(500).json({ ok: false, error: err.message });
  }
});

/** 版本列表 */
router.get('/releases', (req, res) => {
  const db = store.load();
  res.json({ releases: db.releases.map(publicRelease).reverse() });
});

/** 任意两个版本的 diff（默认：最新 vs 上一版） */
router.get('/diff', (req, res) => {
  const db = store.load();
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

module.exports = router;
