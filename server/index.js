'use strict';

const fs = require('fs');
const path = require('path');
const express = require('express');

const config = require('./config');
const api = require('./routes/api');

const app = express();
app.use(express.json());

// 静态资源：Web 面板
app.use(express.static(config.PUBLIC_DIR));

// 产物目录（AAR / 本地 Maven 仓库 / SPM 包），便于直接下载与查看
fs.mkdirSync(config.OUTPUT_DIR, { recursive: true });
app.use('/artifacts', express.static(config.OUTPUT_DIR, { dotfiles: 'allow' }));

// 原图目录（供面板预览缩略图）
fs.mkdirSync(config.UPLOAD_DIR, { recursive: true });
app.use('/uploads', express.static(config.UPLOAD_DIR));

// API
app.use('/api', api);

app.get('/healthz', (req, res) => res.json({ ok: true }));

app.listen(config.PORT, () => {
  console.log(`资源管理器已启动: http://localhost:${config.PORT}`);
  console.log(`  数据目录: ${config.DATA_DIR}`);
  console.log(`  产物目录: ${config.OUTPUT_DIR}`);
});
