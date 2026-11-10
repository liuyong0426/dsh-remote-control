# 更新日志

格式参考 [Keep a Changelog](https://keepachangelog.com/zh-CN/1.1.0/)，版本号参考 [语义化版本](https://semver.org/lang/zh-CN/)。

> **关于记录来源**：0.1.0–0.2.9 依据早期公开仓库 <https://github.com/copylee711/dsh-remote-control> 的提交历史、标签与 `agentworkrecords/` 工作记录整理。0.3.0 起属于本地持续迭代，当时没有逐版本打标签，下面这些条目是按现存源码与文档做的归纳，**不是逐条提交记录**。项目来历与可复核的证据见 [docs/provenance.md](docs/provenance.md)。

## [未发布]

### 新增

- 补齐开源项目常用说明与合规文件：`NOTICE`、`CHANGELOG.md`、`CONTRIBUTING.md`、`CODE_OF_CONDUCT.md`、`SECURITY.md`、`SUPPORT.md`、`CITATION.cff`、`.editorconfig`、`.gitattributes`，以及 `.github/` 下的 issue / PR 模板与 `docs/publishing.md`。
- README 改为**中英双语**（中文在前、英文在后，两边内容对等），并补上「从 QQ / IM 机器人重连」一节：说明 IM 机器人发「重连／远程状态」后插件如何重开隧道、出新码、自动放行一次扫码，同时明确**没有远程截图功能**（发的是插件自己画的二维码）。
- 新增四张由维护者本人截取、并做过打码处理的 README 截图：`assets/phone-sidebar.png`（手机端侧栏）、`assets/phone.png`（手机端会话）、`assets/desktop-panel.png`（电脑端远程控制面板）、`assets/pair-request.png`（配对请求弹窗）；电脑面板上的配对二维码、手机侧栏里的头像与昵称已遮蔽。
- 新增 `docs/provenance.md`，记录代码来历、逐文件比对结果与授权边界。

### 变更

- 维护身份、npm 包名、仓库链接、插件 id 由早期账号切换为 `liuyong0426`；原始 MIT 版权声明 `Copyright (c) 2026 Copy` 原样保留。
- 与兄弟插件共享的 `localStorage`／事件协议键保留不动（见 `NOTICE`）。
- README 展示图从早期公开快照的三张截图**全部替换**为上述自有截图；`NOTICE` 与 `docs/provenance.md` 里的截图来源说明同步更新（旧图不再随仓库分发，可按 `docs/provenance.md` 的方法从公开 `v0.2.9` 取回核对）。
- README 的「从 QQ / IM 机器人重连」一节改为**通用说法**：不再要求安装 `dafeiyu-qq`，任何能把消息交给插件的 IM 机器人（QQ 机器人、QQ 助手、QQ 个人号机器人、飞书／钉钉／企微机器人等）都生效，并补上两个接入入口（Cordis 服务 `dshRemoteControl` 与进程全局 `__dshRcSay`）供其它机器人作者对接。
- 两个 DSH profile（桌面版 `desktop`、懒人版 `web`）的依赖名与 bundles 由 `@copylee/dsh-remote-control` 统一为 `@liuyong0426/dsh-remote-control`，`pnpm-lock.yaml` 同步。

## [0.4.2] — 当前源码版本（本地迭代，未打标签）

- `package.json` 中版本号 0.4.2；相对 `v0.2.9` 快照，源码与文档都有明显续写：`src/index.ts` 约 22.4 KB → 36.6 KB、`src/tunnel.ts` 约 11.3 KB → 19.4 KB、`docs/verification.md` 约 5.7 KB → 12.1 KB、`README.md` 约 4.6 KB → 5.9 KB。

## [0.4.0] / [0.3.0] — 本地迭代阶段（归纳）

- 新增模块：`src/cloudflared.ts`、`src/identity.ts`、`src/remote/hosts.ts`、`src/remote/node-fs.ts`、`src/remote/node-fs-promises.ts`、`scripts/multi-host-qa.mjs`。
- 新增 PWA 资源：`assets/apple-touch-icon.png`、`icon-192.png`、`icon-512.png`、`icon-maskable-512.png`、`manifest.webmanifest`（配对页与远程页可「添加到主屏幕」）。
- 功能上逐步完善多电脑切换与命名、断线提示、完成提醒、备用线路与代理设置；对应说明见 [README](README.md) 与 [功能对应清单](docs/features.md)。
- 这一阶段没有对外发布，也没有逐版本标签；版本号的中间跨度仅表示本地迭代的程度。

## [0.2.9] — 2026-10-23

- 修复 DSH 0.2.1-rc.2 上手机端启动失败，补上原生界面回退。
- 远程控制与原生侧栏账户操作对齐。

## [0.2.7] — 2026-10-07

- README 加入三张界面截图。
- 之后（2026-10-22）补上 Awesome DSH Plugin 徽章。

## [0.2.5] — 2026-10-06

- 「+」菜单加入会话命令、复制提示、设置页手机图标。
- 移除「强调色适用于所有 copylee 插件」的说明。

## [0.2.4] — 2026-10-03

- 启动更轻；强调色与同套插件共享；补充 README。

## [0.2.3] — 2026-10-03

- 默认不走系统代理；自检同时尝试直连线路。

## [0.2.2] — 2026-10-03

- 系统代理检测、稳定端口、无需重新配对即可重扫。

## [0.2.1] — 2026-10-03

- 备用公网线路、gzip、路径图片、会话菜单、新建会话复用。

## [0.2.0] — 2026-10-03

- 独立远程界面、显式模式切换与共享 UI 规格；客户端风格界面与配对前的加固。
- 强调色（陶土橙／蓝／黑）选择、共享设置、紧凑桌面面板、配对弹窗、设备记录。
- 通俗的连接方式选择、页内选择器、返回按钮与手机端修复；折叠步骤、表格、文件列表预览、二维码续期、设备机型。
- 手机端断线提示、账户行入口。

## [0.1.0] — 2026-10-03

- 首版：独立认证网关、随机配对令牌、逐设备本机批准、授权校验值持久化、闲置过期、实时撤销、临时 untun 隧道、局域网监听、SSE／WebSocket 桥接、二进制上传与手机触控适配。
- 中文 README、选型调研、验证记录、Windows／Linux CI 与 npm Trusted Publisher 工作流。
- 依据 `agentworkrecords/2026-10-03-first-release.md`，当日曾做过一次 npm 发布与 GitHub 推送；该记录不构成本仓库对账号归属或授权状态的结论。