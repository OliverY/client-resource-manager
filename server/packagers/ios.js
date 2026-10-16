'use strict';

const fs = require('fs');
const path = require('path');

const { renderScaled, pickSource } = require('../lib/image');
const { LIB, DENSITIES, OUTPUT_DIR } = require('../config');

/**
 * 构建 iOS 资源依赖库（Swift Package Manager 文本包）。
 *
 * 关键点：纯资源包不需要 macOS / Xcode —— 产物是 Package.swift + 资源目录，
 * 使用方在 Xcode 里添加依赖即可，Xcode 集成时自动把 Assets.xcassets 编译进 bundle。
 * 因此这条链路完全跑在 Linux/Node 上，规避了 macOS 构建机。
 */
async function buildIos({ assets, version }) {
  const pkgDir = path.join(OUTPUT_DIR, 'ios', LIB.iosPackage);
  const targetDir = path.join(pkgDir, 'Sources', LIB.iosPackage);
  const resourcesDir = path.join(targetDir, 'Resources');
  const xcassets = path.join(resourcesDir, 'Assets.xcassets');

  fs.rmSync(resourcesDir, { recursive: true, force: true });
  fs.mkdirSync(xcassets, { recursive: true });

  // 资产目录根
  fs.writeFileSync(path.join(xcassets, 'Contents.json'),
    JSON.stringify({ info: { author: 'xcode', version: 1 } }, null, 2) + '\n', 'utf8');

  for (const asset of assets) {
    const name = asset.iosName;
    const imageset = path.join(xcassets, `${name}.imageset`);
    fs.mkdirSync(imageset, { recursive: true });

    const images = [{ idiom: 'universal', scale: '1x' }];
    for (const d of DENSITIES.ios) {
      const src = pickSource(asset.sources, d.scale);
      if (!src) continue;
      const fileName = `${name}${d.suffix}.png`;
      await renderScaled(src.path, src.scale, d.scale, path.join(imageset, fileName));
      images.push({ filename: fileName, idiom: 'universal', scale: `${d.scale}x` });
    }

    fs.writeFileSync(path.join(imageset, 'Contents.json'),
      JSON.stringify({ images, info: { author: 'xcode', version: 1 } }, null, 2) + '\n', 'utf8');
  }

  // Package.swift
  const manifest = `// swift-tools-version:5.7
import PackageDescription

let package = Package(
    name: "${LIB.iosPackage}",
    platforms: [.iOS(.v13)],
    products: [
        .library(name: "${LIB.iosPackage}", targets: ["${LIB.iosPackage}"])
    ],
    targets: [
        .target(
            name: "${LIB.iosPackage}",
            resources: [.process("Resources")]
        )
    ]
)
`;
  fs.writeFileSync(path.join(pkgDir, 'Package.swift'), manifest, 'utf8');

  // 生成的访问器（对标 Android 的 R.xxx）
  fs.writeFileSync(path.join(targetDir, `${LIB.iosPackage}.swift`), swiftAccessors(assets), 'utf8');

  return {
    platform: 'ios',
    packageName: LIB.iosPackage,
    dir: pkgDir,
    resourceCount: assets.length,
    usage: `.package(url: "https://git.company.com/design/${LIB.iosPackage.toLowerCase()}.git", from: "${version}")`,
    localUsage: `.package(path: "${path.relative(process.cwd(), pkgDir)}")`,
  };
}

function swiftAccessors(assets) {
  const lines = assets.map((a) => `    /// ${a.logical}
    public static var ${a.iosName}: UIImage? {
        UIImage(named: "${a.iosName}", in: bundle, compatibleWith: nil)
    }`).join('\n\n');

  return `// 由资源管理器自动生成，请勿手改
#if canImport(UIKit)
import UIKit

public enum ${LIB.iosPackage} {
    private static let bundle = Bundle.module

${lines}
}
#endif
`;
}

module.exports = { buildIos };
