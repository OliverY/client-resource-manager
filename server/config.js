'use strict';

const path = require('path');

const SERVER_DIR = __dirname;                          // server/
const ROOT_DIR = path.resolve(__dirname, '..');        // 项目根目录
const DATA_DIR = process.env.DATA_DIR || path.join(ROOT_DIR, 'data');

/**
 * 库坐标配置：决定三端产物的包名 / 仓库坐标。
 * 后续可做成「项目级配置」，MVP 先写死一套。
 */
const LIB = {
  // 逻辑名统一前缀，避免 Android 资源全局冲突
  prefix: 'demo_',
  // Android 私有 Maven 坐标
  groupId: 'com.example.design',
  artifactId: 'design-assets',
  // iOS SPM 包名
  iosPackage: 'DesignAssets',
  // Android 库的 manifest package
  androidPackage: 'com.example.design.assets',
};

/**
 * 目标密度：按已确认需求
 *  - Android 只要 xhdpi(2x) / xxhdpi(3x)
 *  - iOS 只要 @2x / @3x
 */
const DENSITIES = {
  android: [
    { dir: 'drawable-xhdpi', scale: 2 },
    { dir: 'drawable-xxhdpi', scale: 3 },
  ],
  ios: [
    { suffix: '@2x', scale: 2 },
    { suffix: '@3x', scale: 3 },
  ],
};

module.exports = {
  SERVER_DIR,
  ROOT_DIR,
  DATA_DIR,
  UPLOAD_DIR: path.join(DATA_DIR, 'uploads'),
  OUTPUT_DIR: path.join(DATA_DIR, 'output'),
  DB_FILE: path.join(DATA_DIR, 'db.json'),
  PUBLIC_DIR: path.join(SERVER_DIR, 'public'),
  PORT: Number(process.env.PORT) || 5173,
  LIB,
  DENSITIES,
};
