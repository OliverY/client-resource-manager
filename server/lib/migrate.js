'use strict';

const fs = require('fs');
const path = require('path');

const { DATA_DIR, PROJECTS_DIR } = require('../config');
const store = require('./store');

const OLD_DB_FILE = path.join(DATA_DIR, 'db.json');
const OLD_UPLOAD_DIR = path.join(DATA_DIR, 'uploads');
const OLD_OUTPUT_DIR = path.join(DATA_DIR, 'output');

/** 单项目时代的坐标，迁移后的 demo 项目原样沿用，保证已接入 App 不受影响 */
const LEGACY_LIB = {
  prefix: 'demo_',
  groupId: 'com.example.design',
  artifactId: 'design-assets',
  iosPackage: 'DesignAssets',
};

/**
 * 一次性迁移：把单项目时代的 data/{db.json,uploads,output} 迁入 data/projects/demo/。
 * 幂等：demo 已存在注册表或目录时跳过；db.json 不存在（全新安装）时不做任何事。
 */
function migrateIfNeeded() {
  if (!fs.existsSync(OLD_DB_FILE)) return false;

  const registry = store.loadRegistry();
  if (registry.some((p) => p.id === 'demo') || fs.existsSync(store.projectDir('demo'))) {
    console.warn('[migrate] 检测到旧版 db.json，但 demo 项目已存在，跳过迁移（旧文件保留原处）');
    return false;
  }

  let raw = fs.readFileSync(OLD_DB_FILE, 'utf8');
  // sources[].path 存的是绝对路径，产物使用说明里有相对形式，两种都替换
  raw = raw
    .split(path.join(DATA_DIR, 'uploads')).join(store.uploadDir('demo'))
    .split(path.join(DATA_DIR, 'output')).join(store.outputDir('demo'))
    .split('data/uploads').join('data/projects/demo/uploads')
    .split('data/output').join('data/projects/demo/output');

  let db;
  try {
    db = JSON.parse(raw);
  } catch (e) {
    console.error('[migrate] 旧 db.json 解析失败，放弃迁移：', e.message);
    return false;
  }

  fs.mkdirSync(PROJECTS_DIR, { recursive: true });
  fs.mkdirSync(store.projectDir('demo'), { recursive: true });
  if (fs.existsSync(OLD_UPLOAD_DIR)) fs.renameSync(OLD_UPLOAD_DIR, store.uploadDir('demo'));
  if (fs.existsSync(OLD_OUTPUT_DIR)) fs.renameSync(OLD_OUTPUT_DIR, store.outputDir('demo'));

  store.save('demo', db);

  registry.push({
    id: 'demo',
    name: 'Demo',
    ...LEGACY_LIB,
    createdAt: new Date().toISOString(),
    migratedFrom: 'legacy-single-project',
  });
  store.saveRegistry(registry);
  fs.rmSync(OLD_DB_FILE, { force: true });

  console.log(`[migrate] 已把旧版数据迁入项目 demo（${db.assets.length} 个资源、${db.releases.length} 个版本）`);
  return true;
}

module.exports = { migrateIfNeeded };
