'use strict';

/**
 * 把原图目录里的资源分成 N 批，逐批「上传 + 发布」，生成 N 条版本记录。
 *
 * 用法：node scripts/upload-batches.js [项目id] [批数] [原图目录]
 * 默认：node scripts/upload-batches.js demo 10 data/import/demo-asset
 *
 * 原图命名约定：<logical>@2x.png / <logical>@3x.png，同一逻辑名两个倍率必须齐全。
 */

const fs = require('fs');
const path = require('path');

const BASE = process.env.BASE_URL || 'http://127.0.0.1:5173';
const PID = process.argv[2] || 'demo';
const BATCHES = Number(process.argv[3]) || 10;
const SRC = path.resolve(process.argv[4] || path.join(__dirname, '..', 'data', 'import', 'demo-asset'));

if (!fs.existsSync(SRC)) {
  console.error(`原图目录不存在: ${SRC}`);
  process.exit(1);
}

/* 1. 按逻辑名归组 @2x / @3x 源图 */
const byLogical = new Map();
for (const name of fs.readdirSync(SRC)) {
  const m = name.match(/^(.+)@(\d)x\.png$/i);
  if (!m) continue;
  if (!byLogical.has(m[1])) byLogical.set(m[1], {});
  byLogical.get(m[1])[m[2]] = name;
}
const logicals = [...byLogical.keys()].sort();
for (const l of logicals) {
  const s = byLogical.get(l);
  if (!s['2'] || !s['3']) {
    console.error(`${l} 缺少 @2x 或 @3x 源图，终止`);
    process.exit(1);
  }
}

/* 2. 均衡分批：余数摊给前面的批次 */
const base = Math.floor(logicals.length / BATCHES);
const rem = logicals.length % BATCHES;
const chunks = [];
let off = 0;
for (let i = 0; i < BATCHES; i++) {
  const n = base + (i < rem ? 1 : 0);
  chunks.push(logicals.slice(off, off + n));
  off += n;
}

async function uploadBatch(chunk) {
  const fd = new FormData();
  for (const logical of chunk) {
    for (const scale of ['2', '3']) {
      const name = byLogical.get(logical)[scale];
      fd.append('files', new Blob([fs.readFileSync(path.join(SRC, name))], { type: 'image/png' }), name);
    }
  }
  const res = await fetch(`${BASE}/api/projects/${PID}/assets`, { method: 'POST', body: fd });
  return res.json();
}

async function publish(note) {
  const res = await fetch(`${BASE}/api/projects/${PID}/publish`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ by: 'designer', note }),
  });
  return res.json();
}

(async () => {
  console.log(`项目: ${PID}  原图: ${SRC}  逻辑名: ${logicals.length}  批数: ${BATCHES}`);
  const versions = [];

  for (let i = 0; i < chunks.length; i++) {
    const chunk = chunks[i];
    const label = `${chunk[0]} ~ ${chunk[chunk.length - 1]}`;

    const up = await uploadBatch(chunk);
    if (!up.ok) throw new Error(`第 ${i + 1} 批上传失败: ${up.error || JSON.stringify(up).slice(0, 200)}`);

    const pub = await publish(`分批导入 第 ${i + 1}/${BATCHES} 批：${label} 共 ${chunk.length} 个资源`);
    if (!pub.ok) throw new Error(`第 ${i + 1} 批发布失败: ${pub.error || JSON.stringify(pub).slice(0, 200)}`);

    const { version, changelog, assetCount } = pub.release;
    versions.push({ version, added: changelog.added.length, modified: changelog.modified.length, removed: changelog.removed.length, assetCount });
    console.log(`[${i + 1}/${BATCHES}] ${version}  +${changelog.added.length}  累计 ${assetCount} 个资源  (${label})`);
  }

  console.log('\n版本记录：');
  for (const v of versions) {
    console.log(`  ${v.version}  新增 ${v.added} / 修改 ${v.modified} / 删除 ${v.removed}  资源总数 ${v.assetCount}`);
  }
})().catch((e) => {
  console.error(e.message);
  process.exit(1);
});
