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

function load(projectId) {
  ensureDirs();
  const file = path.join(projectDir(projectId), 'db.json');
  if (!fs.existsSync(file)) return structuredClone(EMPTY);
  try {
    const db = JSON.parse(fs.readFileSync(file, 'utf8'));
    return { assets: db.assets || [], releases: db.releases || [] };
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
  fs.writeFileSync(tmp, JSON.stringify(db, null, 2), 'utf8');
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
