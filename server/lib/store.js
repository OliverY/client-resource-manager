'use strict';

const fs = require('fs');
const path = require('path');
const { DB_FILE, DATA_DIR } = require('../config');

const EMPTY = { assets: [], releases: [] };

function ensureDirs() {
  for (const dir of [
    DATA_DIR,
    path.dirname(DB_FILE),
  ]) {
    fs.mkdirSync(dir, { recursive: true });
  }
}

function load() {
  ensureDirs();
  if (!fs.existsSync(DB_FILE)) return structuredClone(EMPTY);
  try {
    const raw = fs.readFileSync(DB_FILE, 'utf8');
    const db = JSON.parse(raw);
    return { assets: db.assets || [], releases: db.releases || [] };
  } catch (e) {
    console.error('[store] db.json 解析失败，使用空库：', e.message);
    return structuredClone(EMPTY);
  }
}

function save(db) {
  ensureDirs();
  const tmp = DB_FILE + '.tmp';
  fs.writeFileSync(tmp, JSON.stringify(db, null, 2), 'utf8');
  fs.renameSync(tmp, DB_FILE);
}

function nextAssetId(db) {
  return 'a' + String(db.assets.length + 1).padStart(4, '0');
}

/** 计算下一个发布版本号：1.0.0 -> 1.0.1 */
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
  load,
  save,
  nextAssetId,
  nextVersion,
  findAsset,
  latestRelease,
};
