'use strict';

/**
 * 生成示例 PNG（@3x / @2x），用于验证上传 → 打包 → 发布链路。
 * 图标全部由脚本用矢量绘制，不含任何第三方素材。
 *
 * 用法: node scripts/gen-samples.js
 */
const fs = require('fs');
const path = require('path');
const sharp = require('sharp');

const OUT = path.resolve(__dirname, '..', 'samples');

/** kind: stroke = 线性图标，fill = 实心图标 */
const icons = {
  home_icon_search:        { bg: '#2563eb', kind: 'stroke', d: 'M11 4.5a6.5 6.5 0 104.1 11.5l4 4M11 4.5a6.5 6.5 0 010 13' },
  home_icon_user:          { bg: '#16a34a', kind: 'stroke', d: 'M12 4.5a3.5 3.5 0 100 7 3.5 3.5 0 000-7zM4.5 19.5c0-3 3.4-4.5 7.5-4.5s7.5 1.5 7.5 4.5' },
  home_icon_home:          { bg: '#0ea5e9', kind: 'stroke', d: 'M3.5 10.5L12 3.5l8.5 7M5.5 9.5v10.5h13V9.5' },
  common_icon_close:       { bg: '#64748b', kind: 'stroke', d: 'M6 6l12 12M18 6L6 18' },
  common_icon_chevron:     { bg: '#7c3aed', kind: 'stroke', d: 'M9.5 5l7 7-7 7' },
  common_icon_bell:        { bg: '#d97706', kind: 'stroke', d: 'M12 3.5a5.5 5.5 0 015.5 5.5c0 4 1.5 5.5 1.5 5.5H5s1.5-1.5 1.5-5.5A5.5 5.5 0 0112 3.5zM10 18a2 2 0 004 0' },
  common_icon_share:       { bg: '#dc2626', kind: 'stroke', d: 'M8 12l7-3.5M8 12l7 3.5M6 9.5a2.5 2.5 0 100 5 2.5 2.5 0 000-5zM18 5.5a2.5 2.5 0 100 5 2.5 2.5 0 000-5zM18 13.5a2.5 2.5 0 100 5 2.5 2.5 0 000-5z' },
  common_icon_star:        { bg: '#d97706', kind: 'fill',   d: 'M12 3.2l2.7 5.6 6.1.9-4.5 4.3 1.1 6.1L12 17.2l-5.4 2.9 1.1-6.1L3.2 9.7l6.1-.9z' },
  common_icon_heart:       { bg: '#db2777', kind: 'fill',   d: 'M12 20.4l-1.6-1.5C5.6 14.6 3 12.2 3 9.2A4.7 4.7 0 017.7 4.5c1.7 0 3.3.8 4.3 2.1a5.4 5.4 0 014.3-2.1A4.7 4.7 0 0121 9.2c0 3-2.6 5.4-7.4 9.7z' },
  common_icon_theme:    { bg: '#0f766e', kind: 'stroke', d: 'M12 8.8a3.2 3.2 0 100 6.4 3.2 3.2 0 000-6.4zM12 3v2.2M12 18.8V21M3 12h2.2M18.8 12H21M5.6 5.6l1.6 1.6M16.8 16.8l1.6 1.6M18.4 5.6l-1.6 1.6M7.2 16.8l-1.6 1.6' },
};

function svg(icon, size) {
  const paint =
    icon.kind === 'stroke'
      ? `fill="none" stroke="${icon.fg || '#ffffff'}" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"`
      : `fill="${icon.fg || '#ffffff'}"`;
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}" viewBox="0 0 24 24">
    <rect width="24" height="24" rx="6" fill="${icon.bg}"/>
    <path d="${icon.d}" ${paint}/>
  </svg>`;
}

async function main() {
  fs.mkdirSync(OUT, { recursive: true });
  for (const [name, icon] of Object.entries(icons)) {
    for (const scale of [2, 3]) {
      const size = 24 * scale * 2; // 48 / 72 px 逻辑 -> 实图
      const buf = await sharp(Buffer.from(svg(icon, size))).png().toBuffer();
      const file = path.join(OUT, `${name}@${scale}x.png`);
      fs.writeFileSync(file, buf);
      console.log('生成', path.relative(process.cwd(), file), `${size}x${size}`);
    }
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
