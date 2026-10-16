'use strict';

/**
 * 命名映射层：逻辑名 -> 三端物理名
 *
 * 逻辑名（内部唯一标识）统一使用 snake_case 小写，例如：
 *   home_icon_search
 *
 * 三端物理名：
 *   Android: demo_home_icon_search   （全小写 + 下划线，带库前缀，资源名全局唯一）
 *   iOS:     demoHomeIconSearch      （camelCase，带前缀避免资产目录重名）
 *   鸿蒙:    demo_home_icon_search   （小写 + 下划线，预留）
 */

const RESERVED = new Set([
  // Android 资源名保留字 / 易冲突词
  'icon', 'ic', 'app', 'default', 'item', 'layout', 'menu', 'style',
]);

/** 把任意原始名（文件名 / 用户输入）规范成逻辑名 snake_case */
function normalizeLogical(raw) {
  const base = String(raw || '')
    .replace(/\.[^.]+$/, '')            // 去掉扩展名
    .replace(/([a-z0-9])([A-Z])/g, '$1_$2') // camelCase -> snake
    .replace(/[\s\-\/\\]+/g, '_')       // 空格/横线/路径分隔 -> 下划线
    .replace(/[^a-zA-Z0-9_]/g, '')      // 去掉非法字符
    .replace(/_+/g, '_')
    .replace(/^_+|_+$/g, '')
    .toLowerCase();

  if (!base) throw new Error('无法从文件名推导出合法逻辑名');
  if (/^[0-9]/.test(base)) return 'n' + base; // 不能以数字开头
  return base;
}

function toSnake(logical) {
  return normalizeLogical(logical);
}

function toCamel(logical) {
  const snake = normalizeLogical(logical);
  return snake.replace(/_([a-z0-9])/g, (_, c) => c.toUpperCase());
}

function androidName(logical, prefix) {
  return `${prefix || ''}${toSnake(logical)}`;
}

function iosName(logical, prefix) {
  const camel = toCamel(logical);
  const p = (prefix || '').replace(/_/g, '');
  if (!p) return camel;
  return p + camel.charAt(0).toUpperCase() + camel.slice(1);
}

function harmonyName(logical, prefix) {
  return `${prefix || ''}${toSnake(logical)}`;
}

/** 校验逻辑名，返回问题列表 */
function validateLogical(logical) {
  const issues = [];
  const snake = toSnake(logical);
  if (snake.length > 60) issues.push('名称过长（>60 字符）');
  if (RESERVED.has(snake)) issues.push(`名称 "${snake}" 过于通用，易冲突`);
  if (/^[0-9]/.test(snake)) issues.push('不能以数字开头');
  return { logical: snake, issues };
}

module.exports = {
  normalizeLogical,
  toSnake,
  toCamel,
  androidName,
  iosName,
  harmonyName,
  validateLogical,
};
