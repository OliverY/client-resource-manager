'use strict';

const { androidName, iosName, harmonyName } = require('./naming');
const { LIB } = require('../config');

/** 从当前资产库生成一个「资源快照」，供打包与 diff 使用 */
function buildSnapshot(db) {
  return db.assets
    .filter((a) => a.status !== 'removed')
    .map((a) => ({
      logical: a.logical,
      androidName: androidName(a.logical, LIB.prefix),
      iosName: iosName(a.logical, LIB.prefix),
      harmonyName: harmonyName(a.logical, LIB.prefix),
      format: a.format,
      hash: a.hash,
      width: a.width,
      height: a.height,
      status: a.status,
      sources: a.sources,
    }));
}

/** 计算两次快照的差异：新增 / 修改 / 删除 */
function diffSnapshots(prevAssets, nextAssets) {
  const prev = new Map((prevAssets || []).map((a) => [a.logical, a]));
  const next = new Map(nextAssets.map((a) => [a.logical, a]));

  const added = [];
  const modified = [];
  const removed = [];
  let unchanged = 0;

  for (const [logical, v] of next) {
    if (!prev.has(logical)) added.push(logical);
    else if (prev.get(logical).hash !== v.hash) modified.push(logical);
    else unchanged += 1;
  }
  for (const logical of prev.keys()) {
    if (!next.has(logical)) removed.push(logical);
  }

  return { added, modified, removed, unchanged };
}

module.exports = { buildSnapshot, diffSnapshots };
