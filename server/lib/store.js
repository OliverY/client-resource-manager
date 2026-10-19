'use strict';

const fs = require('fs');
const path = require('path');
const { DATA_DIR, PROJECTS_DIR, REGISTRY_FILE, PROJECT_ID_RE } = require('../config');

const EMPTY = { assets: [], releases: [] };

function isValidProjectId(id) {
  return typeof id === 'string' && PROJECT_ID_RE.test(id);
}

function projectDir(projectId) {
  return path.join(PROJECTS_DIR, projectId);
}

function uploadDir(projectId) {
  return path.join(projectDir(projectId), 'uploads');
}

function outputDir(projectId) {
  return path.join(projectDir(projectId), 'output');
}

function ensureDirs() {
  fs.mkdirSync(DATA_DIR, { recursive: true });
  fs.mkdirSync(PROJECTS_DIR, { recursive: true });
}

/* ---------------- 项目注册表 ---------------- */

function loadRegistry() {
  ensureDirs();
  if (!fs.existsSync(REGISTRY_FILE)) return [];
  try {
    const list = JSON.parse(fs.readFileSync(REGISTRY_FILE, 'utf8'));
    return Array.isArray(list) ? list : [];
  } catch (e) {
    console.error('[store] projects.json 解析失败，视为空注册表：', e.message);
    return [];
  }
}

function saveRegistry(projects) {
  ensureDirs();
  const tmp = REGISTRY_FILE + '.tmp';
  fs.writeFileSync(tmp, JSON.stringify(projects, null, 2), 'utf8');
  fs.renameSync(tmp, REGISTRY_FILE);
}

function findProject(projectId) {
  return loadRegistry().find((p) => p.id === projectId) || null;
}

/** 打包坐标：androidPackage 恒为 groupId + '.assets'，不单独存储 */
function libOf(project) {
  return {
    prefix: project.prefix || '',
    groupId: project.groupId,
    artifactId: project.artifactId,
    iosPackage: project.iosPackage,
    androidPackage: `${project.groupId}.assets`,
  };
}

/* ---------------- 项目资源库 ---------------- */

/**
 * 源图路径在 db.json 里存「相对 data/ 目录」的路径，不存绝对路径。
 * 否则把 data/ 搬到另一台机器（部署到服务器、备份恢复）后，所有路径都指向旧机器，下载/打包全挂。
 */
function toStoredPath(p) {
  if (!p) return p;
  const rel = path.relative(DATA_DIR, p);
  if (!rel || rel.startsWith('..')) return p; // 不在 data/ 下的路径保持原样
  return rel.split(path.sep).join('/');
}

function toAbsolutePath(p) {
  if (!p) return p;
  if (path.isAbsolute(p)) return p; // 兼容早期写入的绝对路径
  return path.join(DATA_DIR, p.split('/').join(path.sep));
}

function mapSourcePaths(db, fn) {
  const apply = (assets) => {
    for (const asset of assets || []) {
      for (const key of Object.keys(asset.sources || {})) {
        const src = asset.sources[key];
        if (src && src.path) src.path = fn(src.path);
      }
    }
  };
  apply(db.assets);
  // 发布记录里的快照也带 sources，一并处理，避免历史数据把绝对路径带回去
  for (const rel of db.releases || []) apply(rel.assets);
  return db;
}

/** 产物路径同理：只影响展示，但搬机器后别留旧机器的绝对路径 */
function mapArtifactPaths(db, fn) {
  for (const rel of db.releases || []) {
    const art = rel.artifacts;
    if (!art) continue;
    if (art.android) {
      if (art.android.aar) art.android.aar = fn(art.android.aar);
      if (art.android.maven && art.android.maven.repoDir) art.android.maven.repoDir = fn(art.android.maven.repoDir);
    }
    if (art.ios && art.ios.dir) art.ios.dir = fn(art.ios.dir);
  }
  return db;
}

function mapAllPaths(db, fn) {
  return mapArtifactPaths(mapSourcePaths(db, fn), fn);
}

function load(projectId) {
  ensureDirs();
  const file = path.join(projectDir(projectId), 'db.json');
  if (!fs.existsSync(file)) return structuredClone(EMPTY);
  try {
    const db = JSON.parse(fs.readFileSync(file, 'utf8'));
    const out = { assets: db.assets || [], releases: db.releases || [] };
    // 读出来一律还原成绝对路径，上层各模块拿到的都是可直接读的文件路径
    return mapAllPaths(out, toAbsolutePath);
  } catch (e) {
    console.error('[store] db.json 解析失败，使用空库：', e.message);
    return structuredClone(EMPTY);
  }
}

function save(projectId, db) {
  const dir = projectDir(projectId);
  fs.mkdirSync(dir, { recursive: true });
  const file = path.join(dir, 'db.json');
  const tmp = file + '.tmp';
  // 写盘前转成相对路径；用副本，避免改到调用方正在用的对象
  const payload = mapAllPaths(structuredClone({ assets: db.assets, releases: db.releases }), toStoredPath);  fs.writeFileSync(tmp, JSON.stringify(payload, null, 2), 'utf8');
  fs.renameSync(tmp, file);
}

function nextAssetId(db) {
  return 'a' + String(db.assets.length + 1).padStart(4, '0');
}

/** 计算下一个发布版本号：1.0.0 -> 1.0.1（每个项目独立计数） */
function nextVersion(db) {
  const n = db.releases.length;
  return `1.0.${n}`;
}

function findAsset(db, logical) {
  return db.assets.find((a) => a.logical === logical);
}

function latestRelease(db) {
  return db.releases.length ? db.releases[db.releases.length - 1] : null;
}

module.exports = {
  EMPTY,
  ensureDirs,
  isValidProjectId,
  projectDir,
  uploadDir,
  outputDir,
  loadRegistry,
  saveRegistry,
  findProject,
  libOf,
  load,
  save,
  nextAssetId,
  nextVersion,
  findAsset,
  latestRelease,
};
