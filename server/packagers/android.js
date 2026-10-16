'use strict';

const fs = require('fs');
const path = require('path');
const AdmZip = require('adm-zip');

const { renderScaled, pickSource } = require('../lib/image');
const { LIB, DENSITIES, OUTPUT_DIR } = require('../config');

function xmlEscape(s) {
  return String(s).replace(/[<>&"]/g, (c) => ({ '<': '&lt;', '>': '&gt;', '&': '&amp;', '"': '&quot;' }[c]));
}

/**
 * 构建 Android 二方库：
 *   1. 生成 AAR（res/ + AndroidManifest.xml + R.txt）
 *   2. 落地到本地 Maven 仓库目录（可直接作为 maven { url } 使用）
 *
 * 注意：本实现为「免 Android SDK」的纯 Node 打包路径，适合资源型库（无代码）。
 * 若库内需要 Kotlin/Java 代码，请改用 generateGradleModule() 走 Gradle 构建。
 */
async function buildAndroid({ assets, version, allVersions = [] }) {
  const root = path.join(OUTPUT_DIR, 'android');
  const moduleDir = path.join(root, 'module');
  fs.rmSync(moduleDir, { recursive: true, force: true });
  fs.mkdirSync(moduleDir, { recursive: true });

  const resDir = path.join(moduleDir, 'res');
  const rLines = [];

  for (const asset of assets) {
    const name = asset.androidName;
    rLines.push(`int drawable ${name} 0x0`);

    for (const d of DENSITIES.android) {
      const src = pickSource(asset.sources, d.scale);
      if (!src) continue;
      const out = path.join(resDir, d.dir, `${name}.png`);
      await renderScaled(src.path, src.scale, d.scale, out);
    }
  }

  // AndroidManifest.xml
  const manifest = `<?xml version="1.0" encoding="utf-8"?>
<manifest xmlns:android="http://schemas.android.com/apk/res/android"
    package="${LIB.androidPackage}">
</manifest>
`;
  fs.writeFileSync(path.join(moduleDir, 'AndroidManifest.xml'), manifest, 'utf8');

  // R.txt 资源符号表
  fs.writeFileSync(path.join(moduleDir, 'R.txt'), rLines.join('\n') + '\n', 'utf8');

  // 打成 AAR
  const aarName = `${LIB.artifactId}-${version}.aar`;
  const aarPath = path.join(root, aarName);
  fs.rmSync(aarPath, { force: true });

  const zip = new AdmZip();
  zip.addLocalFile(path.join(moduleDir, 'AndroidManifest.xml'));
  zip.addLocalFile(path.join(moduleDir, 'R.txt'));
  zip.addLocalFolder(resDir, 'res');
  zip.writeZip(aarPath);

  // 发布到本地 Maven 仓库
  const maven = await publishToLocalMaven({ aarPath, version, allVersions });

  return {
    platform: 'android',
    artifact: `${LIB.groupId}:${LIB.artifactId}:${version}`,
    aar: aarPath,
    aarSize: fs.statSync(aarPath).size,
    resourceCount: assets.length,
    maven,
    usage: `implementation("${LIB.groupId}:${LIB.artifactId}:${version}")`,
  };
}

async function publishToLocalMaven({ aarPath, version, allVersions }) {
  const groupPath = LIB.groupId.replace(/\./g, '/');
  const base = path.join(OUTPUT_DIR, 'maven', groupPath, LIB.artifactId);
  const versionDir = path.join(base, version);
  fs.mkdirSync(versionDir, { recursive: true });

  const aarName = `${LIB.artifactId}-${version}.aar`;
  fs.copyFileSync(aarPath, path.join(versionDir, aarName));

  const pom = `<?xml version="1.0" encoding="UTF-8"?>
<project xmlns="http://maven.apache.org/POM/4.0.0"
         xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance"
         xsi:schemaLocation="http://maven.apache.org/POM/4.0.0 http://maven.apache.org/xsd/maven-4.0.0.xsd">
  <modelVersion>4.0.0</modelVersion>
  <groupId>${LIB.groupId}</groupId>
  <artifactId>${LIB.artifactId}</artifactId>
  <version>${version}</version>
  <packaging>aar</packaging>
  <name>${LIB.artifactId}</name>
  <description>Design assets library (auto-generated)</description>
</project>
`;
  fs.writeFileSync(path.join(versionDir, `${LIB.artifactId}-${version}.pom`), pom, 'utf8');

  const versions = Array.from(new Set([...(allVersions || []), version]));
  const metadata = `<?xml version="1.0" encoding="UTF-8"?>
<metadata>
  <groupId>${LIB.groupId}</groupId>
  <artifactId>${LIB.artifactId}</artifactId>
  <versioning>
    <latest>${version}</latest>
    <release>${version}</release>
    <versions>
${versions.map((v) => `      <version>${v}</version>`).join('\n')}
    </versions>
    <lastUpdated>${new Date().toISOString().replace(/[-:TZ.]/g, '').slice(0, 14)}</lastUpdated>
  </versioning>
</metadata>
`;
  fs.writeFileSync(path.join(base, 'maven-metadata.xml'), metadata, 'utf8');

  return {
    repoDir: path.join(OUTPUT_DIR, 'maven'),
    coordinate: `${LIB.groupId}:${LIB.artifactId}:${version}`,
    path: `${groupPath}/${LIB.artifactId}/${version}/${aarName}`,
  };
}

/**
 * 可选路径：生成一个标准 Gradle Library 模块（供需要代码/AGP 校验时使用）。
 * 生成后可在有 Android SDK 的环境执行 `./gradlew assembleRelease`。
 */
async function generateGradleModule({ assets, version }) {
  const dir = path.join(OUTPUT_DIR, 'android', 'gradle-module');
  fs.rmSync(dir, { recursive: true, force: true });

  const resDir = path.join(dir, 'src', 'main', 'res');
  for (const asset of assets) {
    for (const d of DENSITIES.android) {
      const src = pickSource(asset.sources, d.scale);
      if (!src) continue;
      await renderScaled(src.path, src.scale, d.scale, path.join(resDir, d.dir, `${asset.androidName}.png`));
    }
  }

  fs.writeFileSync(path.join(dir, 'settings.gradle.kts'), `rootProject.name = "design-assets"\n`, 'utf8');
  fs.writeFileSync(path.join(dir, 'build.gradle.kts'), `plugins {
    id("com.android.library")
    id("maven-publish")
}

android {
    namespace = "${LIB.androidPackage}"
    compileSdk = 34
    defaultConfig { minSdk = 21 }
    resourcePrefix = "${LIB.prefix}"
}

afterEvaluate {
    publishing {
        publications {
            create<MavenPublication>("release") {
                from(components["release"])
                groupId = "${LIB.groupId}"
                artifactId = "${LIB.artifactId}"
                version = "${version}"
            }
        }
    }
}
`, 'utf8');
  fs.writeFileSync(path.join(dir, 'src', 'main', 'AndroidManifest.xml'),
    `<?xml version="1.0" encoding="utf-8"?>\n<manifest />\n`, 'utf8');

  return { dir, note: '在具备 Android SDK 的环境执行 ./gradlew assembleRelease' };
}

module.exports = { buildAndroid, publishToLocalMaven, generateGradleModule };
