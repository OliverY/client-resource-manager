'use strict';

/**
 * 单个资源的「下载」产物：给前端详情面板的三个按钮用。
 *
 *   source   原始设计稿：svg 直接给 svg，位图给最高倍率 png
 *   android  svg → VectorDrawable XML；位图 → xxhdpi(@3x) PNG
 *   ios      <Name>.imageset 的 zip（Contents.json + @2x/@3x PNG），拖进 Assets.xcassets 即用
 *
 * 文件名统一用三端物理名（带项目前缀），下载下来就能直接丢进工程，不用改名。
 */

const fs = require('fs');
const os = require('os');
const path = require('path');
const AdmZip = require('adm-zip');

const { renderScaled, pickSource } = require('./image');
const { svgToVectorDrawable } = require('./vector-drawable');
const { androidName, iosName } = require('./naming');
const sharp = require('sharp');

const PNG = 'image/png';

/** 取最高倍率的源文件 */
function highestSource(asset) {
  const list = Object.values(asset.sources || {}).filter(Boolean);
  if (!list.length) throw new Error('资源没有可用的源图');
  return list.slice().sort((a, b) => Number(b.scale) - Number(a.scale))[0];
}

/** 把源图按目标倍率渲染成临时 PNG，返回 buffer */
async function renderToBuffer(src, targetScale) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'crm-dl-'));
  const out = path.join(dir, 'out.png');
  try {
    await renderScaled(src.path, src.scale, targetScale, out);
    return fs.readFileSync(out);
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
}

function sourceDownload(asset, prefix) {
  const src = highestSource(asset);
  const isSvg = String(src.path).toLowerCase().endsWith('.svg');
  const name = androidName(asset.logical, prefix);
  return {
    filename: isSvg ? `${name}.svg` : `${name}@${src.scale}x.png`,
    contentType: isSvg ? 'image/svg+xml' : PNG,
    buffer: fs.readFileSync(src.path),
  };
}

async function androidDownload(asset, prefix) {
  const name = androidName(asset.logical, prefix);
  const src = highestSource(asset);
  if (String(src.path).toLowerCase().endsWith('.svg')) {
    const svg = fs.readFileSync(src.path, 'utf8');
    return {
      filename: `${name}.xml`,
      contentType: 'application/xml',
      buffer: Buffer.from(svgToVectorDrawable(svg, { name }), 'utf8'),
    };
  }
  return {
    filename: `${name}.png`,
    contentType: PNG,
    buffer: await renderToBuffer(src, 3),
  };
}

/** 灰度图（黑/白/灰）适合 iOS 模板渲染，彩色图标不行，否则 tintColor 会把原色抹掉 */
async function isGrayscale(buf) {
  try {
    const st = await sharp(buf).stats();
    const [r, g, b] = st.channels.slice(0, 3).map((c) => c.mean);
    return Math.max(r, g, b) - Math.min(r, g, b) <= 12;
  } catch (_) {
    return false;
  }
}

/** iOS：整包 imageset，解压后拖进 Assets.xcassets 即可 */
async function iosDownload(asset, prefix) {
  const name = iosName(asset.logical, prefix);
  const src = highestSource(asset);

  const buf3 = await renderToBuffer(src, 3);
  const buf2 = await renderToBuffer(src, 2);

  const contents = {
    images: [
      { filename: `${name}@2x.png`, idiom: 'universal', scale: '2x' },
      { filename: `${name}@3x.png`, idiom: 'universal', scale: '3x' },
    ],
    info: { author: 'xcode', version: 1 },
  };
  // 单色（灰度）图标在 iOS 侧跟着 tintColor 走；彩色图标保持原样
  if (asset.vectorLike && (await isGrayscale(buf3))) {
    contents.properties = { 'template-rendering-intent': 'template' };
  }

  const zip = new AdmZip();
  const dir = `${name}.imageset/`;
  zip.addFile(`${dir}Contents.json`, Buffer.from(JSON.stringify(contents, null, 2) + '\n', 'utf8'));
  zip.addFile(`${dir}${name}@2x.png`, buf2);
  zip.addFile(`${dir}${name}@3x.png`, buf3);

  return {
    filename: `${name}.zip`,
    contentType: 'application/zip',
    buffer: zip.toBuffer(),
  };
}

/**
 * @param {'source'|'android'|'ios'} kind
 */
async function buildDownload(asset, lib, kind) {
  const prefix = (lib && lib.prefix) || '';
  if (kind === 'source') return sourceDownload(asset, prefix);
  if (kind === 'android') return androidDownload(asset, prefix);
  if (kind === 'ios') return iosDownload(asset, prefix);
  throw new Error(`未知的下载类型: ${kind}`);
}

module.exports = { buildDownload };
