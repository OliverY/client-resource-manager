'use strict';

/**
 * SVG → Android VectorDrawable(android:vector) 转换。
 *
 * 只覆盖「设计图标」常见子集：path / g / clipPath / defs，允许 fill / fill-opacity /
 * fill-rule / stroke / stroke-width / stroke-opacity / stroke-linecap。
 * 渐变、滤镜、mask、text、image 这类不支持，遇到直接抛错，由调用方降级成 PNG。
 *
 * 为什么不用第三方库：图标 SVG 结构极简（几乎只有 <path>），一个 200 行的解析器就够，
 * 而且能保证输出的是 VD 原生支持的属性，不引入 xml 解析依赖。
 */

const NAMED_COLORS = {
  black: '#000000',
  white: '#ffffff',
  red: '#ff0000',
  green: '#008000',
  blue: '#0000ff',
  gray: '#808080',
  grey: '#808080',
  yellow: '#ffff00',
};

/* ---------------- SVG 解析 ---------------- */

/** 解析成 { name, attrs, children } 树；忽略注释、XML 声明、自闭合语义 */
function parseSvg(text) {
  const src = String(text).replace(/<!--[\s\S]*?-->/g, '').replace(/<\?xml[\s\S]*?\?>/g, '');
  const re = /<(\/?)([a-zA-Z][\w:-]*)((?:"[^"]*"|'[^']*'|[^>"'])*?)(\/?)>/g;
  const root = { name: '#root', attrs: {}, children: [] };
  const stack = [root];
  let m;
  while ((m = re.exec(src))) {
    const [, closing, name, rawAttrs, selfClose] = m;
    if (name === '!doctype' || name.startsWith('!')) continue;
    if (closing) {
      if (stack.length > 1) stack.pop();
      continue;
    }
    const node = { name, attrs: parseAttrs(rawAttrs), children: [] };
    stack[stack.length - 1].children.push(node);
    if (!selfClose) stack.push(node);
  }
  const svg = root.children.find((n) => n.name === 'svg');
  if (!svg) throw new Error('不是合法的 SVG：找不到 <svg> 根节点');
  return svg;
}

function parseAttrs(str) {
  const out = {};
  const re = /([\w:-]+)\s*=\s*(?:"([^"]*)"|'([^']*)')/g;
  let m;
  while ((m = re.exec(str))) out[m[1]] = m[2] != null ? m[2] : m[3];
  return out;
}

/* ---------------- 属性转换 ---------------- */

function parseLength(v) {
  if (v == null) return null;
  const m = String(v).trim().match(/^(-?[\d.]+)(px|dp|pt)?$/i);
  return m ? Number(m[1]) : null;
}

/** 颜色 → { color: '#aarrggbb', alpha } ；none / 空 → null */
function parseColor(value, opacity) {
  if (!value) return null;
  const v = String(value).trim().toLowerCase();
  if (!v || v === 'none' || v === 'transparent') return null;

  let hex = null;
  if (v === 'currentcolor') hex = '#000000';
  else if (NAMED_COLORS[v]) hex = NAMED_COLORS[v];
  else if (v[0] === '#') hex = v;
  else if (/^rgba?\(/.test(v)) {
    const parts = v.replace(/^rgba?\(|\)$/g, '').split(/[,\s/]+/).filter(Boolean).map(Number);
    const [r, g, b] = parts;
    const a = parts.length > 3 ? parts[3] : 1;
    return { color: '#000000', alpha: roundAlpha(a) };
  } else return null;

  if (!/^#[0-9a-f]{3,8}$/.test(hex)) return null;
  let alpha = 1;
  let rgb = hex.slice(1);
  if (rgb.length === 3) rgb = rgb.split('').map((c) => c + c).join('');
  if (rgb.length === 4) {
    rgb = rgb.split('').map((c) => c + c).join('');
    alpha = parseInt(rgb.slice(6, 8), 16) / 255;
    rgb = rgb.slice(0, 6);
  } else if (rgb.length === 8) {
    // SVG 里 #rrggbbaa 少见，按 CSS 语义处理
    alpha = parseInt(rgb.slice(6, 8), 16) / 255;
    rgb = rgb.slice(0, 6);
  } else if (rgb.length !== 6) return null;
  const o = opacity == null ? 1 : Number(opacity);
  return { color: `#${rgb}`, alpha: roundAlpha(alpha * (Number.isFinite(o) ? o : 1)) };
}

function roundAlpha(a) {
  return Math.round(Math.max(0, Math.min(1, a)) * 1000) / 1000;
}

/* ---------------- 转换 ---------------- */

function collectClipPaths(node, map) {
  if (node.name === 'clipPath' && node.attrs.id) {
    const d = node.children.filter((c) => c.name === 'path' && c.attrs.d).map((c) => c.attrs.d);
    if (d.length) map.set(node.attrs.id, d);
  }
  for (const c of node.children) collectClipPaths(c, map);
}

/** 把一条 path 节点转成 VD 的 <path> 属性列表 */
function pathToVd(attrs, inherited) {
  const merged = { ...inherited, ...attrs };
  const d = merged.d;
  if (!d) return null;
  const opacity = merged.opacity == null ? 1 : Number(merged.opacity);
  const fill = parseColor(merged.fill, multiplied(merged['fill-opacity'], opacity));
  const stroke = parseColor(merged.stroke, multiplied(merged['stroke-opacity'], opacity));
  const width = merged['stroke-width'] == null ? null : parseLength(merged['stroke-width']);

  const out = [`android:pathData="${escapeAttr(d)}"`];
  if (fill) {
    out.push(`android:fillColor="${fill.color}"`);
    if (fill.alpha < 1) out.push(`android:fillAlpha="${fill.alpha}"`);
  }
  if (stroke && width) {
    out.push(`android:strokeColor="${stroke.color}"`);
    out.push(`android:strokeWidth="${width}"`);
    if (stroke.alpha < 1) out.push(`android:strokeAlpha="${stroke.alpha}"`);
    const cap = merged['stroke-linecap'];
    if (cap === 'round' || cap === 'square') out.push(`android:strokeLineCap="${cap}"`);
  }
  if (String(merged['fill-rule']).toLowerCase() === 'evenodd') out.push('android:fillType="evenOdd"');
  return out.length ? out : null;
}

function multiplied(a, b) {
  const x = a == null ? 1 : Number(a);
  const y = b == null ? 1 : Number(b);
  return x * y;
}

function escapeAttr(s) {
  return String(s).replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/</g, '&lt;');
}

/** 父级可继承的填充 / 描边属性（SVG 的 g 会往下传） */
function inheritable(attrs, parent) {
  const keys = ['fill', 'fill-opacity', 'fill-rule', 'stroke', 'stroke-width', 'stroke-opacity', 'stroke-linecap', 'opacity'];
  const out = { ...parent };
  for (const k of keys) if (attrs[k] != null) out[k] = attrs[k];
  return out;
}

function transformGroup(attrs) {
  const t = attrs.transform;
  if (!t) return { open: '<group>', close: '</group>', ok: true };
  const parts = [...String(t).matchAll(/(translate|scale|rotate|matrix)\s*\(([^)]*)\)/g)];
  const props = [];
  for (const [, fn, argsRaw] of parts) {
    const args = argsRaw.split(/[,\s]+/).filter(Boolean).map(Number);
    if (fn === 'translate') {
      props.push(['android:translateX', args[0] || 0]);
      props.push(['android:translateY', args[1] || 0]);
    } else if (fn === 'scale') {
      props.push(['android:scaleX', args[0]]);
      props.push(['android:scaleY', args.length > 1 ? args[1] : args[0]]);
    } else if (fn === 'rotate') {
      props.push(['android:rotation', args[0]]);
      if (args.length === 3) {
        props.push(['android:pivotX', args[1]]);
        props.push(['android:pivotY', args[2]]);
      }
    } else {
      return { ok: false, reason: `不支持 matrix 变换：${t}` };
    }
  }
  const attrStr = props.map(([k, v]) => ` ${k}="${v}"`).join('');
  return { open: `<group${attrStr}>`, close: '</group>', ok: true };
}

function walk(nodes, inherited, clipPaths, lines, depth, activeClips = new Set()) {
  const pad = '  '.repeat(depth);
  for (const node of nodes) {
    if (node.name === 'defs' || node.name === 'title' || node.name === 'desc') continue;

    const clipRef = (node.attrs['clip-path'] || '').match(/url\(#([^)]+)\)/);
    const clipId = clipRef ? clipRef[1] : null;
    const clip = clipId && !activeClips.has(clipId) ? clipPaths.get(clipId) : null;
    const nextClips = clip ? new Set([...activeClips, clipId]) : activeClips;

    if (node.name === 'g') {
      const g = transformGroup(node.attrs);
      if (!g.ok) throw new Error(g.reason);
      lines.push(pad + g.open);
      if (clip) {
        for (const d of clip) lines.push(`${pad}  <clip-path android:pathData="${escapeAttr(d)}"/>`);
      }
      walk(node.children, inheritable(node.attrs, inherited), clipPaths, lines, depth + 1, nextClips);
      lines.push(pad + g.close);
      continue;
    }

    if (node.name === 'path') {
      const vd = pathToVd(node.attrs, inherited);
      if (!vd) continue;
      if (clip) {
        lines.push(pad + '<group>');
        for (const d of clip) lines.push(`${pad}  <clip-path android:pathData="${escapeAttr(d)}"/>`);
        lines.push(`${pad}  <path ${vd.join(' ')}/>`);
        lines.push(pad + '</group>');
      } else {
        lines.push(`${pad}<path ${vd.join(' ')}/>`);
      }
      continue;
    }

    // 其他元素（circle / rect / text / image / use …）一律不支持，交给上层降级
    throw new Error(`不支持的元素 <${node.name}>，无法转成 VectorDrawable`);
  }
}

/**
 * @param {string} svgText SVG 源码
 * @param {{name?: string}} [opts]
 * @returns {string} VectorDrawable XML
 */
function svgToVectorDrawable(svgText, opts = {}) {
  const svg = parseSvg(svgText);
  const viewBox = (svg.attrs.viewBox || '').split(/[,\s]+/).filter(Boolean).map(Number);
  let vw = viewBox[2];
  let vh = viewBox[3];
  if (!(vw > 0 && vh > 0)) {
    vw = parseLength(svg.attrs.width);
    vh = parseLength(svg.attrs.height);
  }
  if (!(vw > 0 && vh > 0)) throw new Error('SVG 缺少可用的 viewBox / width / height');

  const clipPaths = new Map();
  collectClipPaths(svg, clipPaths);

  const lines = [];
  walk(svg.children, inheritable(svg.attrs, {}), clipPaths, lines, 1);
  if (!lines.length) throw new Error('SVG 里没有可转换的图形');

  const w = Math.round(vw);
  const h = Math.round(vh);
  const name = opts.name ? `<!-- ${String(opts.name).replace(/--/g, '-')} -->\n` : '';
  return `<?xml version="1.0" encoding="utf-8"?>
${name}<vector xmlns:android="http://schemas.android.com/apk/res/android"
    android:width="${w}dp"
    android:height="${h}dp"
    android:viewportWidth="${vw}"
    android:viewportHeight="${vh}">
${lines.join('\n')}
</vector>
`;
}

module.exports = { svgToVectorDrawable };
