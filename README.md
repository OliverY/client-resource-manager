# 图片资源管理器

把「设计出的图」变成「客户端可直接依赖的库」——设计师上传 PNG，平台自动打包出 **Android AAR（本地/私有 Maven 库）** 与 **iOS SPM 资源包**，客户端只需升级依赖版本号即可拿到最新资源。

## 工作流

```
设计师上传 PNG  →  命名规范化 / 多倍图派生  →  一键发布  →  三端产物落地
                                                              │
                    Android: implementation("com.example.design:design-assets:1.0.1")
                    iOS:     .package(url: "...", from: "1.0.1")
                                                              │
                                              客户端升级版本号 → 直接看到新资源
```

## 快速开始

```bash
# 1. 安装依赖
npm install

# 2. 生成示例图片（可选）
node scripts/gen-samples.js

# 3. 启动
npm start
# 打开 http://localhost:5173
```

浏览器里用右上角切换 **设计师 / 开发** 角色：

- **设计师**：拖拽批量上传 PNG → 填写发布说明 → 点「发布新版本」
- **开发**：查看资源列表（时间倒序 / 按名称排序）、版本记录、任意两版 diff、复制依赖坐标

## 目录结构

```
server/
  index.js              Express 入口（同时托管 Web 面板与产物目录）
  config.js             库坐标、密度策略等配置
  lib/
    naming.js           逻辑名 → 三端物理名映射 + 校验
    image.js            sharp 封装：探测尺寸、按倍率渲染
    snapshot.js         资源快照 + 版本 diff
    store.js            JSON 元数据存储（MVP 用，可换 PostgreSQL）
  packagers/
    android.js          生成 AAR + 落地本地 Maven 仓库
    ios.js              生成 SPM 资源包（Package.swift + Assets.xcassets）
  routes/api.js         上传 / 发布 / 版本 / diff 接口
  public/               Web 面板（无构建步骤，纯静态）
scripts/gen-samples.js  生成示例 PNG
samples/                示例图片
data/                   运行时数据（uploads 原图 / output 产物 / db.json）
```

## API

| 方法 | 路径 | 说明 |
|---|---|---|
| GET | `/api/state` | 全量状态（资源 + 版本 + 配置） |
| POST | `/api/assets` | 批量上传（multipart，字段 `files`） |
| POST | `/api/assets/:logical/remove` | 标记废弃（软删除） |
| POST | `/api/assets/:logical/restore` | 恢复 |
| POST | `/api/publish` | 发布新版本（构建三端产物） |
| GET | `/api/releases` | 版本列表（倒序） |
| GET | `/api/diff?from=&to=` | 两版差异（新增 / 修改 / 删除） |

## 上传命名约定

| 文件名 | 逻辑名 | 说明 |
|---|---|---|
| `home_icon_search@3x.png` | `home_icon_search` | 3 倍图源 |
| `home_icon_search@2x.png` | `home_icon_search` | 2 倍图源 |
| `home_icon_search.png` | `home_icon_search` | 不带后缀默认按 @3x |

同一逻辑名可同时上传 `@2x` 与 `@3x`；只传其一，另一档会自动按倍率派生。

## 产物与客户端接入

发布后产物在 `data/output/`，也可通过 `/artifacts/` 浏览下载。

### Android

- AAR：`data/output/android/design-assets-<version>.aar`
- 本地 Maven 仓库：`data/output/maven/`

```kotlin
// settings.gradle.kts
dependencyResolutionManagement {
    repositories {
        maven { url = uri("/绝对路径/data/output/maven") }
    }
}
// build.gradle.kts
dependencies {
    implementation("com.example.design:design-assets:1.0.1")
}
// 代码中使用
// imageView.setImageResource(R.drawable.demo_home_icon_search)
```

### iOS

- SPM 包：`data/output/ios/DesignAssets/`

```swift
// Package.swift（或 Xcode 添加本地包）
.package(path: "/绝对路径/data/output/ios/DesignAssets")

// 代码中使用（自动生成的访问器）
import DesignAssets
imageView.image = DesignAssets.demoHomeIconSearch
```

## 命名映射

| 逻辑名 | Android | iOS |
|---|---|---|
| `home_icon_search` | `demo_home_icon_search` | `demoHomeIconSearch` |

Android 资源名全局唯一，统一加 `demo_` 前缀避免冲突；iOS 用 camelCase 并加 `crm` 前缀。

## 已知限制（下一步）

- 元数据用 JSON 文件存储，多人并发需换 PostgreSQL。
- Android 走「免 SDK 的纯 Node 打包」（适合纯资源库）；若库内要放 Kotlin 代码，需切到 Gradle 构建（`packagers/android.js` 已预留 `generateGradleModule`）。
- iOS 目前生成本地路径依赖；生产环境应推送到私有 Git / SPM registry。
- 矢量图（SVG/PDF）与深色模式变体尚未接入。
- 尚未接入权限体系（角色目前是前端切换）、审计日志、发布通知。
