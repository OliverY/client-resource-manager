'use strict';

const path = require('path');
const express = require('express');

const config = require('./config');
const store = require('./lib/store');
const api = require('./routes/api');

store.ensureDirs();

const app = express();
app.use(express.json());

// 静态资源：Web 面板
app.use(express.static(config.PUBLIC_DIR));

// 产物目录（AAR / 本地 Maven 仓库 / SPM 包）与原图目录，按项目隔离：
//   /uploads/<pid>/...    -> data/projects/<pid>/uploads
//   /artifacts/<pid>/...  -> data/projects/<pid>/output
const staticCache = new Map();
function projectStatic(sub, opts) {
  return (req, res, next) => {
    const pid = req.params.pid;
    if (!store.isValidProjectId(pid)) return next();
    const key = `${pid}:${sub}`;
    let handler = staticCache.get(key);
    if (!handler) {
      handler = express.static(path.join(config.PROJECTS_DIR, pid, sub), opts);
      staticCache.set(key, handler);
    }
    handler(req, res, next);
  };
}
app.use('/artifacts/:pid', projectStatic('output', { dotfiles: 'allow' }));
app.use('/uploads/:pid', projectStatic('uploads'));

// API
app.use('/api', api);

app.get('/healthz', (req, res) => res.json({ ok: true }));

app.listen(config.PORT, () => {
  console.log(`资源管理器已启动: http://localhost:${config.PORT}`);
  console.log(`  数据目录: ${config.DATA_DIR}`);
  console.log(`  项目目录: ${config.PROJECTS_DIR}`);
});
