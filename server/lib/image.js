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

  // SVG 源与倍率无关，任何目标倍率都要重新栅格化，不能原样拷贝
  const isSvg = srcPath.toLowerCase().endsWith('.svg');
  if (!isSvg && Number(srcScale) === Number(targetScale)) {
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
 * 判断图片是否「矢量图」（单色图标的位图导出）：
 * 所有可见像素（alpha ≥ 32）共享同一颜色（允许小容差，全局 alpha 深浅变化不影响判定）。
 * 只有这类图支持着色预览——照片 / 多彩位图着色会退化成剪影，没有意义。
 * 判定失败（读图报错、全透明）一律按非矢量图处理。
 */
async function isVectorLike(filePath) {
  try {
    const { data } = await sharp(filePath)
      .resize(96, 96, { fit: 'inside' })
      .ensureAlpha()
      .raw()
      .toBuffer({ resolveWithObject: true });

    let base = null; // 首个可见像素的颜色
    for (let i = 0; i < data.length; i += 4) {
      if (data[i + 3] < 32) continue;
      const [r, g, b] = [data[i], data[i + 1], data[i + 2]];
      if (!base) {
        base = [r, g, b];
        continue;
      }
      if (Math.abs(r - base[0]) > 10 || Math.abs(g - base[1]) > 10 || Math.abs(b - base[2]) > 10) {
        return false;
      }
    }
    return !!base;
  } catch (_) {
    return false;
  }
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

module.exports = { probe, renderScaled, pickSource, isVectorLike };
