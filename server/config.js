'use strict';

const path = require('path');

const SERVER_DIR = __dirname;                          // server/
const ROOT_DIR = path.resolve(__dirname, '..');        // 项目根目录
const DATA_DIR = process.env.DATA_DIR || path.join(ROOT_DIR, 'data');

/**
 * 新建项目时打包坐标的默认模板。
 * 实际坐标以每个项目的配置为准（data/projects.json），此处只提供缺省值。
 */
const DEFAULT_LIB = {
  // 逻辑名统一前缀，避免 Android 资源全局冲突
  prefix: '',
  // Android 私有 Maven 坐标
  groupId: 'com.example.design',
  // iOS SPM 包名后缀
  iosPackageSuffix: 'Assets',
  // Android 库的 manifest package 后缀（拼接 groupId）
  androidPackageSuffix: '.assets',
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

/** 项目 id 规则：小写字母开头的 slug，同时用作目录名，须防路径穿越 */
const PROJECT_ID_RE = /^[a-z][a-z0-9_-]{0,31}$/;

module.exports = {
  SERVER_DIR,
  ROOT_DIR,
  DATA_DIR,
  PROJECTS_DIR: path.join(DATA_DIR, 'projects'),
  REGISTRY_FILE: path.join(DATA_DIR, 'projects.json'),
  PUBLIC_DIR: path.join(SERVER_DIR, 'public'),
  PORT: Number(process.env.PORT) || 5173,
  DEFAULT_LIB,
  DENSITIES,
  PROJECT_ID_RE,
};
