'use strict';

/**
 * 分批上传并回填历史日期：把原图目录分成 N 批逐批「上传 + 发布」得到 N 个版本，
 * 再通过 SSH 把各版本发布时间改写成 DATES 里的历史日期，形成自然的迭代记录。
 *
 * 用法：BASE_URL=http://<host>:5173 SSH_HOST=user@host node scripts/upload-history.js [项目id] [批数] [原图目录] [日期文件]
 * 默认：BASE_URL=http://127.0.0.1:5173 SSH_HOST=user@host node scripts/upload-history.js demo 10 data/import/demo-asset
 *
 * 日期文件（可选，JSON）：{ "dates": ["2026-08-14T02:26:41.000Z", ...], "projectCreatedAt": "..." }，
 * 覆盖下方默认历史；允许多个版本同一天。
 *
 * 前置：目标项目发布记录应为空（版本号按发布次数 1.0.N 递增，非空则中止）。
 * 原图命名约定：<logical>@2x.png / <logical>@3x.png，同一逻辑名两个倍率必须齐全。
 */

const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');

const BASE = process.env.BASE_URL || 'http://127.0.0.1:5173';
const SSH = process.env.SSH_HOST || '';
const REMOTE_DATA = process.env.REMOTE_DATA || '~/client-resource-manager/data';
const PID = process.argv[2] || 'demo';
const BATCHES = Number(process.argv[3]) || 10;
const SRC = path.resolve(process.argv[4] || path.join(__dirname, '..', 'data', 'import', 'demo-asset'));
const DATES_FILE = process.argv[5] || null;

/** 每个版本的发布时间（UTC ISO，注释为对应北京时间），长度必须等于批数 */
let DATES = [
  '2026-08-14T02:26:41.000Z', // 08-14 10:26
  '2026-08-21T08:43:12.000Z', // 08-21 16:43
  '2026-08-27T03:18:55.000Z', // 08-27 11:18
  '2026-09-03T07:52:23.000Z', // 09-03 15:52
  '2026-09-11T02:09:37.000Z', // 09-11 10:09
  '2026-09-18T06:37:08.000Z', // 09-18 14:37
  '2026-09-25T01:44:52.000Z', // 09-25 09:44
  '2026-09-30T09:21:16.000Z', // 09-30 17:21
  '2026-10-13T05:58:31.000Z', // 10-13 13:58
  '2026-10-16T06:05:44.000Z', // 10-16 14:05
];
/** 注册表里项目的创建时间（早于首个版本两天） */
let PROJECT_CREATED_AT = '2026-08-12T03:26:11.000Z';

if (DATES_FILE) {
  const custom = JSON.parse(fs.readFileSync(DATES_FILE, 'utf8'));
  if (!Array.isArray(custom.dates)) throw new Error(`日期文件 ${DATES_FILE} 缺少 dates 数组`);
  DATES = custom.dates.map(String);
  if (custom.projectCreatedAt) PROJECT_CREATED_AT = String(custom.projectCreatedAt);
}

if (!fs.existsSync(SRC)) {
  console.error(`原图目录不存在: ${SRC}`);
  process.exit(1);
}
if (!SSH) {
  console.error('请用 SSH_HOST=user@host 指定可免密登录的服务器（回填历史需要直接改写远端 db.json）');
  process.exit(1);
}
if (DATES.length !== BATCHES) {
  console.error(`DATES 只有 ${DATES.length} 个日期，与批数 ${BATCHES} 不一致`);
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

/* 2. 均衡分批：余数摊给前面的批次；按逻辑名排序切分，避免同逻辑名跨批导致高倍率丢低倍率 */
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
    body: JSON.stringify({ by: process.env.PUBLISHER || 'designer', note }),
  });
  return res.json();
}

/* 3. SSH 读写远端数据文件（服务端每次请求都从磁盘读，改完即生效） */
function sshRead(file) {
  return execSync(`ssh -o BatchMode=yes ${SSH} 'cat ${REMOTE_DATA}/${file}'`, {
    encoding: 'utf8',
    maxBuffer: 256 * 1024 * 1024,
  });
}

function sshWrite(file, content) {
  execSync(`ssh -o BatchMode=yes ${SSH} 'cat > ${REMOTE_DATA}/${file}.tmp && mv ${REMOTE_DATA}/${file}.tmp ${REMOTE_DATA}/${file}'`, {
    input: content,
  });
}

(async () => {
  console.log(`目标: ${BASE}  项目: ${PID}  原图: ${SRC}  逻辑名: ${logicals.length}  批数: ${BATCHES}`);

  const rel = await (await fetch(`${BASE}/api/projects/${PID}/releases`)).json();
  if (!Array.isArray(rel.releases)) throw new Error(`项目 ${PID} 不存在或接口异常`);
  if (rel.releases.length) throw new Error(`项目已有 ${rel.releases.length} 条发布记录，须先清空再导入`);

  const versions = [];
  for (let i = 0; i < chunks.length; i++) {
    const chunk = chunks[i];

    const up = await uploadBatch(chunk);
    if (!up.ok) throw new Error(`第 ${i + 1} 批上传失败: ${up.error || JSON.stringify(up).slice(0, 200)}`);

    const listed = chunk.slice(0, 3).join('、');
    const note = `新增 ${chunk.length} 个资源：${listed}${chunk.length > 3 ? ' 等' : ''}`;
    const pub = await publish(note);
    if (!pub.ok) throw new Error(`第 ${i + 1} 批发布失败: ${pub.error || JSON.stringify(pub).slice(0, 200)}`);

    const { version, changelog, assetCount } = pub.release;
    versions.push({ version, added: changelog.added.length, assetCount });
    console.log(`[${i + 1}/${BATCHES}] ${version}  +${changelog.added.length}  累计 ${assetCount} 个资源`);
  }

  /* 4. 回填历史日期：版本发布时间、资源创建/更新时间、项目创建时间 */
  console.log('\n回填历史日期...');
  const db = JSON.parse(sshRead(`projects/${PID}/db.json`));
  if (db.releases.length !== DATES.length) throw new Error(`远端发布数 ${db.releases.length} 与日期数 ${DATES.length} 不符`);

  const firstSeen = new Map(); // logical -> 首次出现的发布序号
  db.releases.forEach((r, i) => {
    db.releases[i].at = DATES[i];
    for (const s of r.assets || []) if (!firstSeen.has(s.logical)) firstSeen.set(s.logical, i);
  });
  for (const [idx, a] of db.assets.entries()) {
    const i = firstSeen.get(a.logical);
    if (i == null) throw new Error(`资源 ${a.logical} 未出现在任何发布快照中`);
    // 发布前约 1~2 小时上传，批内逐个错开
    const t = new Date(Date.parse(DATES[i]) - (50 + ((i * 13 + idx * 7) % 70)) * 60000).toISOString();
    a.createdAt = t;
    a.updatedAt = t;
  }
  sshWrite(`projects/${PID}/db.json`, JSON.stringify(db, null, 2));

  const reg = JSON.parse(sshRead('projects.json'));
  const p = reg.find((x) => x.id === PID);
  if (!p) throw new Error(`注册表中找不到项目 ${PID}`);
  p.createdAt = PROJECT_CREATED_AT;
  sshWrite('projects.json', JSON.stringify(reg, null, 2));

  /* 5. 验证 */
  const after = await (await fetch(`${BASE}/api/projects/${PID}/releases`)).json();
  console.log('\n最终版本记录：');
  for (const r of after.releases) {
    const at = new Date(r.at);
    const cst = new Date(at.getTime() + 8 * 3600e3).toISOString().slice(0, 16).replace('T', ' ');
    console.log(`  ${r.version}  北京时间 ${cst}  资源 ${r.assetCount}  新增 ${r.changelog.added.length}  ${r.note}`);
  }
  const state = await (await fetch(`${BASE}/api/projects/${PID}/state`)).json();
  console.log(`\n资源总数 ${state.project.assetCount}，待发布改动 ${state.pending.total} 项`);
  if (state.project.assetCount !== logicals.length) throw new Error(`资源总数 ${state.project.assetCount} != 预期 ${logicals.length}`);
  if (state.pending.total !== 0) throw new Error(`仍有 ${state.pending.total} 项待发布改动`);
  console.log('完成 ✓');
})().catch((e) => {
  console.error(e.message);
  process.exit(1);
});
