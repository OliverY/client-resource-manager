'use strict';

const { androidName, iosName, harmonyName } = require('./naming');

/** 从当前资产库生成一个「资源快照」，供打包与 diff 使用；物理名前缀取项目配置 */
function buildSnapshot(db, lib) {
  const prefix = (lib && lib.prefix) || '';
  return db.assets
    .filter((a) => a.status !== 'removed')
    .map((a) => ({
      logical: a.logical,
      androidName: androidName(a.logical, prefix),
      iosName: iosName(a.logical, prefix),
      harmonyName: harmonyName(a.logical, prefix),
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
