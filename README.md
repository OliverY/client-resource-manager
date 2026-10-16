# 图片资源管理器

把「设计出的图」变成「客户端可直接依赖的库」——设计师上传 PNG，平台自动打包出 **Android AAR（本地/私有 Maven 库）** 与 **iOS SPM 资源包**，客户端只需升级依赖版本号即可拿到最新资源。

## 项目（多 App 隔离）

所有资源、版本与打包产物都归属某个**项目**（一个 App 一个项目，如 `demo`、`shop`、各 Demo）。每个项目有独立的：

- 资源库与版本序列（版本号各自从 `1.0.0` 递增）
- 打包坐标：资源前缀、Maven `groupId/artifactId`、iOS SPM 包名
- 数据目录：`data/projects/<id>/{db.json, uploads/, output/}`

项目在 Web 面板顶栏切换；「设计师」角色可新建 / 编辑项目（编辑前缀只影响之后发布的产物名）。

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

- **设计师**：拖拽批量上传 PNG、删除资源 → 修改先落在资源库并提示「有修改未保存」→ 点「发布新版本」批量提交
- **开发**：查看资源列表（时间倒序 / 按名称排序）、版本记录、任意两版 diff、复制依赖坐标

## 修改与发布（批量提交）

上传 / 删除 / 恢复都只是修改资源库，**发布新版本**才是批量提交动作：

- 资源库与最新已发布版本存在差异时，页面顶部会提示「有修改未保存，请保存发布新版本」，可一键发布
- 资源列表只展示图标与名称，点击卡片在右侧面板查看详细信息（Android / iOS 物理名、尺寸、倍率）
- 点击预览图或「查看大图」查看大图；详情面板支持**着色预览**（仅对矢量图 / 单色图标生效，多彩位图与照片不支持；仅展示用，不影响源图与打包产物）

## 目录结构

```
server/
  index.js              Express 入口（迁移检查 + 按 project 托管 uploads / artifacts）
  config.js             端口、路径、新建项目默认坐标、密度策略
  lib/
    naming.js           逻辑名 → 三端物理名映射 + 校验
    image.js            sharp 封装：探测尺寸、按倍率渲染
    snapshot.js         资源快照 + 版本 diff
    store.js            项目注册表 + 每项目 JSON 元数据存储（MVP 用，可换 PostgreSQL）
    migrate.js          旧版单项目数据一次性迁入 demo（启动时自动执行，幂等）
  packagers/
    android.js          生成 AAR + 落地本地 Maven 仓库
    ios.js              生成 SPM 资源包（Package.swift + Assets.xcassets）
  routes/api.js         项目管理 + 上传 / 发布 / 版本 / diff 接口
  public/               Web 面板（无构建步骤，纯静态）
scripts/gen-samples.js  生成示例 PNG
samples/                示例图片
data/
  projects.json         项目注册表
  projects/<id>/        每项目：db.json + uploads/（原图） + output/（产物）
  import/               历史导入素材记录（只读留存）
```

## API

所有资源操作都挂在项目作用域下（`:pid` 为项目 ID）。

| 方法 | 路径 | 说明 |
|---|---|---|
| GET | `/api/projects` | 项目列表（含资源数 / 版本数 / 最新版本） |
| POST | `/api/projects` | 新建项目（`{ id, name?, prefix?, groupId?, artifactId?, iosPackage? }`，缺省自动推导） |
| PATCH | `/api/projects/:pid` | 编辑项目（名称 / 前缀 / 打包坐标） |
| GET | `/api/projects/:pid/state` | 全量状态（项目配置 + 资源 + 版本 + 待发布修改 `pending`） |
| POST | `/api/projects/:pid/assets` | 批量上传（multipart，字段 `files`） |
| POST | `/api/projects/:pid/assets/:logical/remove` | 删除资源（软删除，发布新版本后从新版本中移除） |
| POST | `/api/projects/:pid/assets/:logical/restore` | 恢复 |
| POST | `/api/projects/:pid/publish` | 发布新版本（构建该项目的三端产物） |
| GET | `/api/projects/:pid/releases` | 版本列表（倒序） |
| GET | `/api/projects/:pid/diff?from=&to=` | 两版差异（新增 / 修改 / 删除） |

静态资源同样按项目隔离：原图 `/uploads/<pid>/...`、产物 `/artifacts/<pid>/...`。

## 上传命名约定

| 文件名 | 逻辑名 | 说明 |
|---|---|---|
| `home_icon_search@3x.png` | `home_icon_search` | 3 倍图源 |
| `home_icon_search@2x.png` | `home_icon_search` | 2 倍图源 |
| `home_icon_search.png` | `home_icon_search` | 不带后缀默认按 @3x |

同一逻辑名可同时上传 `@2x` 与 `@3x`；只传其一，另一档会自动按倍率派生。

## 产物与客户端接入

发布后产物在 `data/projects/<pid>/output/`，也可通过 `/artifacts/<pid>/` 浏览下载。下面以 `demo` 项目为例。

### Android

- AAR：`data/projects/demo/output/android/design-assets-<version>.aar`
- 本地 Maven 仓库：`data/projects/demo/output/maven/`

```kotlin
// settings.gradle.kts
dependencyResolutionManagement {
    repositories {
        maven { url = uri("/绝对路径/data/projects/demo/output/maven") }
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

- SPM 包：`data/projects/demo/output/ios/DesignAssets/`

```swift
// Package.swift（或 Xcode 添加本地包）
.package(path: "/绝对路径/data/projects/demo/output/ios/DesignAssets")

// 代码中使用（自动生成的访问器）
import DesignAssets
imageView.image = DesignAssets.demoHomeIconSearch
```

## 命名映射

物理资源名前缀取自项目配置（`demo` 项目为 `demo_`，新项目默认 `<项目ID>_`，可编辑）：

| 逻辑名 | Android | iOS |
|---|---|---|
| `home_icon_search` | `demo_home_icon_search` | `demoHomeIconSearch` |

Android 资源名全局唯一，统一加前缀避免冲突；iOS 用 camelCase 并加前缀。

## 部署到远程服务器

远程服务器是局域网的 Mac mini（`user@host`，内网 IP `host-ip`），服务由 launchd 守护（标签 `com.example.design.resource-manager`，开机自启）。

```bash
# 首次：配置免密登录（输入一次密码；已配过可跳过）
ssh-copy-id user@host

# 发布（rsync 同步代码 → npm install → launchd/pm2 重启 → 健康检查）
bash scripts/deploy.sh
# 服务器缺 node / rsync 时先执行
bash scripts/deploy.sh --setup
```

发布后访问 http://host-ip:5173。服务器上的 `~/client-resource-manager/data/` 是运行数据（上传图 / 版本库 / 产物），同步时始终排除，不会被覆盖或删除。也可在 ZCode 里直接使用项目 skill `/deploy`。详见 `.zcode/skills/deploy/SKILL.md`。

## 已知限制（下一步）

- 元数据用 JSON 文件存储，多人并发需换 PostgreSQL。
- Android 走「免 SDK 的纯 Node 打包」（适合纯资源库）；若库内要放 Kotlin 代码，需切到 Gradle 构建（`packagers/android.js` 已预留 `generateGradleModule`）。
- iOS 目前生成本地路径依赖；生产环境应推送到私有 Git / SPM registry。
- 矢量图（SVG/PDF）与深色模式变体尚未接入。
- 尚未接入权限体系（角色目前是前端切换）、项目删除、审计日志、发布通知。
- 修改项目资源前缀后，逻辑名的 Android/iOS 物理名只对**之后发布的版本**生效，已发布版本保持不变。
