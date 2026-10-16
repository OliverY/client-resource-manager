'use strict';

const fs = require('fs');
const path = require('path');
const sharp = require('sharp');

/** 读取图片尺寸信息 */
async function probe(filePath) {
  const meta = await sharp(filePath).metadata();
  return {
    width: meta.width || 0,
    height: meta.height || 0,
    format: meta.format || path.extname(filePath).slice(1),
  };
}

/**
 * 从一个已知倍率的源图渲染出目标倍率的 PNG。
 * 同倍率直接拷贝；不同倍率按宽度等比缩放（Lanczos3，降采样质量好）。
 */
async function renderScaled(srcPath, srcScale, targetScale, outPath) {
  fs.mkdirSync(path.dirname(outPath), { recursive: true });

  if (Number(srcScale) === Number(targetScale)) {
    await fs.promises.copyFile(srcPath, outPath);
    return;
  }

  const meta = await sharp(srcPath).metadata();
  const factor = targetScale / srcScale;
  const width = Math.max(1, Math.round((meta.width || 1) * factor));

  await sharp(srcPath)
    .resize({ width, kernel: 'lanczos3', withoutEnlargement: false })
    .png({ compressionLevel: 9 })
    .toFile(outPath);
}

/**
 * 为某个目标倍率挑选最合适的源图：
 *  - 有同倍率源 → 直接用
 *  - 否则选倍率最高的源（降采样优于放大）
 */
function pickSource(sources, targetScale) {
  const list = Object.values(sources || {}).filter(Boolean);
  if (!list.length) return null;

  const exact = list.find((s) => Number(s.scale) === Number(targetScale));
  if (exact) return exact;

  return list.slice().sort((a, b) => b.scale - a.scale)[0];
}

module.exports = { probe, renderScaled, pickSource };
