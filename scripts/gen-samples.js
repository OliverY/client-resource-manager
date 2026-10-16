'use strict';

/**
 * 生成示例 PNG（@3x / @2x），用于验证上传->打包链路。
 * 用法: node scripts/gen-samples.js
 */
const fs = require('fs');
const path = require('path');
const sharp = require('sharp');

const OUT = path.resolve(__dirname, '..', 'samples');

const icons = {
  home_icon_search: { bg: '#2563eb', fg: '#ffffff', d: 'M11 4a7 7 0 105.2 11.7l4 4 1.4-1.4-4-4A7 7 0 0011 4zm0 2a5 5 0 110 10 5 5 0 010-10z' },
  home_icon_user: { bg: '#16a34a', fg: '#ffffff', d: 'M12 4a4 4 0 100 8 4 4 0 000-8zm0 10c-4 0-8 2-8 4v2h16v-2c0-2-4-4-8-4z' },
  common_icon_close: { bg: '#dc2626', fg: '#ffffff', d: 'M6 6l12 12M18 6L6 18' },
  common_icon_star: { bg: '#d97706', fg: '#ffffff', d: 'M12 3l2.9 5.9 6.5.9-4.7 4.6 1.1 6.5L12 18l-5.8 3 1.1-6.5L2.6 9.8l6.5-.9z' },
};

function svg(icon, size) {
  const stroke = icon.d.includes('l') && !icon.d.includes('z') ? `fill="none" stroke="${icon.fg}" stroke-width="2.2" stroke-linecap="round"` : `fill="${icon.fg}"`;
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}" viewBox="0 0 24 24">
    <rect width="24" height="24" rx="6" fill="${icon.bg}"/>
    <path d="${icon.d}" ${stroke}/>
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
