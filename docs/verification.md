# 验证记录

## 0.4.2 / 手机打开远程页报「请求处理失败」（2026-11-08）

宿主机从 0.2.1-rc.2 升到 **0.2.2-rc.1** 之后，手机扫完码、本机也批准了，打开的却是一句 `{"error":"请求处理失败，请在本机查看状态。"}`。

### 原因与接口核对

- 那句文案是 `src/gateway.ts` 里 `createServer(...)` 的兜底：`handle()` 抛异常时回 500，**原始错误被吞掉**，所以手机上、日志里都看不出发生了什么。
- 宿主 0.2.2 把 `WebServer.renderIndex` 从 `renderIndex(html: string): string` 改成 `renderIndex(html: string, peer: PeerScope): string`（`dsh-host-webserver/lib/types/index.d.ts:277`），并把 `peer` 透传给每一个 `webserver/index-inject` 监听器。`@deepseek-ai/dsh-api-remote-access/lib/index.js:158-164` 的监听器第一句就是 `this.snapshotFor(peer.principal)`（`snapshotFor` 在 `:269-270` 读 `principal.kind`），`peer` 为 `undefined` 时抛 `TypeError: Cannot read properties of undefined (reading 'principal')`。
- 插件编译时依赖的是本仓库 `node_modules` 里的 `dsh-host-webserver 0.2.1-rc.2`（单参签名），所以 `src/index.ts` 一直只传 html。宿主自己的写法是 `renderIndex(html, peer ?? ctx.connection.browserPeer)`（`dsh-host-frontend-static/lib/index.js`）。
- 第二个坑：第一次改完仍然是 500，用「只对本机返回 detail」的临时探针拿到真实堆栈 —— `TypeError: Cannot read properties of undefined (reading 'applyIndexTaps')`，即把方法取到变量再调用丢了 `this`。

### 修复

- `src/index.ts`：`const render = ready.webServer.renderIndex as (page: string, peer?: object) => string; return render.call(ready.webServer, html, ready.connection.browserPeer)`。用 cast 是因为编译期类型仍是单参（旧宿主忽略多余参数，新宿主用上 peer）；用 `call` 是因为 `renderIndex` 依赖 `this.applyIndexTaps`。
- `src/gateway.ts`：500 的兜底不再无条件吞异常 —— 本机请求（`Host` 是回环名）的响应体带 `detail`，经隧道/局域网进来的设备只看到原来那句。判据是 `Host` 头，因为隧道会把 Host 改写成公网名。

### 本轮验证

| 检查 | 结果 |
|---|---|
| `tsc --noEmit` / `tsc` + `tsdown` | 通过，62 个文件、5.13 MB |
| `vitest`（9 个文件） | **79 项通过**；`tests/gateway.test.ts` 新增 1 项（renderer 抛错时：远端只得到「请求处理失败」、本机响应带 `detail`） |
| 真实宿主（0.2.2-rc.1，网关 49265，临时设备 + 真 `dsh_rc` cookie，`Host: 127.0.0.1:49265`） | 修复前 `/` 500；修复后 **200、54599 字节**，页面里 `viewport-fit=cover`、`/rc-app/manifest.webmanifest`、`apple-touch-icon`、`apple-mobile-web-app-title「DSH 远程」`、`/rc-assets/remote.js`、`<title>DSH · 远程</title>` 全部到位 |
| 隧道（`https://<quick-tunnel>/pair`） | 200 |
| 未配对访问 `/` | 403（正确） |

临时验证设备用完已从 `devices.json` 恢复原样（那台 iPhone 的记录已还原），`detail` 只在 `Host` 为回环名时出现。

## 0.4.0 / 完成提醒与「添加到主屏幕」（2026-11-07）

两件在手机上用得着的事：会话在后台跑完或停下来等人时能被提醒；从浏览器添加到主屏幕时得到自己的名字和图标，而不是宿主的「DeepSeek Harness」+ SVG。

### 实现要点

- **独立的主屏幕身份**：新增 `assets/manifest.webmanifest`（`name`/`short_name` 为「DSH 远程」、`display: standalone`、`theme_color: #111827`）与 4 个 PNG（192 / 512 / maskable-512 / apple-touch-icon 180）。`src/index.ts` 的 `renderIndex` 用 `MOBILE_HEAD` 替换宿主的 manifest link 与图标，并把 viewport 补成 `viewport-fit=cover`（此前宿主没有该属性，`style.ts` 里所有 `env(safe-area-inset-*)` 实际都是 0）；`asset()` 新增 `/rc-app/` 分支，只放行这 5 个名字。
- 路由层在 `src/gateway.ts` 的 `/pair` 之后、`this.device(req)` 授权检查**之前**放行 `/rc-app/`：手机上「添加到主屏幕」是在未配对状态下抓取清单与图标的，等授权就会 404。
- 配对页与拒绝页（`src/pages.ts`）也注入同一份 head，避免从配对页安装时退回宿主图标。
- **完成提醒**分两层，互不依赖：
  - 页内：会话行圆点（实心＝已完成，空心＝在等你答）+ 页签标题计数。任何连接方式都有效，不需要任何浏览器许可。
  - 页外：系统通知 + 轻震。只在安全上下文（https / localhost）且用户点过「完成提醒」开关时尝试，全部调用包在 try/catch 里（iOS Safari 在非安装态调用 `new Notification` 会抛）。
- **为什么不用宿主的 `completionUnread`**：宿主 `dsh-client-ui-session` 只在会话**不是**主视图时置位该标志（`observeRunning` 里 `!isMain(id)`），而远程页打开会话就会被登记为主视图，标志加上去立刻又被清掉。实测 4 轮探针均拿不到该字段，因此改用 `src/remote/unread.ts` 里的 `advanceUnread`：自己看状态流，「看到在跑 → 再看到不在跑」即判定完成，`pendingInteraction` 出现即判定等待。宿主的标志仍然尊重（首帧或翻转时采用），但没有任何逻辑依赖它。
- `advanceUnread` 是纯函数，单独成文件是为了能直接单测（`tests/unread.test.ts`，13 项）。

### 本轮验证

| 检查 | 结果 |
|---|---|
| `tsc --noEmit` | 通过 |
| `vitest`（8 个文件） | 73 项通过；新增 `tests/unread.test.ts` 13 项、`tests/gateway.test.ts` 1 项（未配对也能取到主屏幕身份，且 `/rc-app/secret.txt`、`/rc-app/../devices.json` 被拒）、`tests/identity.test.ts` 3 项（三个页面都注入同一份 head） |
| `tsc` + `tsdown` | 通过，62 个文件、5.13 MB |
| 隔离 DSH Web 宿主 + Edge headless（CDP，390×844） | 远程页正常渲染，控制台零异常；设置页「提醒 → 完成提醒」开关与说明文案正确 |
| `/rc-app/` 实测（未配对，curl 带 `Host`） | manifest 200 `application/manifest+json` 674 B、4 个 PNG 均 200 且字节数与磁盘一致、`/rc-app/secret.txt` 403、`/rc-app/../devices.json` 403 |
| 已配对远程页 head（curl 带 cookie） | `viewport-fit=cover`、`manifest /rc-app/manifest.webmanifest`、`apple-touch-icon`、`apple-mobile-web-app-title`、`theme-color`、注入的 `remote.js` 全部到位 |
| 完成圆点（CDP 实测） | 新会话 → 发消息 → 等到 `running: true` → 切到别的会话：圆点出现、标题变 `(1) DSH · 远程`；点回该会话：圆点消失、标题复原。等待审批的会话同样会亮 |
| `npm pack --dry-run --ignore-scripts` | 5 个 assets 文件都在包内（`files` 已加 `assets/*.png`、`assets/*.webmanifest`） |

已知环境噪声：隔离 QA 宿主的聊天页会显示 `Cannot find the native Koffi module` 红字，是隔离 profile 缺原生模块，与本插件无关；本机只有 Edge，`scripts/*.mjs` 的 Playwright 浏览器路径需用 `DSH_QA_BROWSER` 指过去。

## 0.3.x / 一台手机连多台电脑（2026-11-06）

新增多主机（多电脑、多账户）支持：手机记住多台电脑的远程地址并在侧栏顶部切换，每台电脑有自己的名字。

### 实现要点

- 电脑端在插件存储目录写 `host.json`（`{version,id,label}`）：`id` 首次随机生成后固定，`label` 默认取「计算机名 · 配置名」，可在桌面面板「这台电脑」一栏改名；`status` 与 `requests` 返回 `host:{id,label,computer,profile}`，新增 `renameHost` 管理动作。
- 配对页标题显示「连接 <电脑名>」，未配对页同样带上名字；`Gateway` 的选项新增 `label?: () => string`。
- 手机端主机列表存在 `localStorage` 的 `dsrc-hosts`（每个来源一份），条目为 `{i,l,b,a?,t?}`。跨电脑靠链接携带：`?rcfrom=<base64url [{i,l,b}]>`，目标页面合并后 `history.replaceState` 去掉参数。合并规则在 `src/remote/hosts.ts` 里实现一次，另在 `src/boot.ts` 的 `ADOPT_SCRIPT` 与 `src/pages.ts` 的配对页内联脚本各复制一份（内联脚本无法 import），由 `tests/identity.test.ts` 检查三处一致。
- 临时公网地址（`.trycloudflare.com` / `.lhr.life`）每次开启都会变：合并时把同一台电脑的旧临时地址替换成新地址，而不是新增一条。
- 侧栏顶部是电脑名字按钮（`HostChip`），点开是「我的电脑」抽屉：切换、添加另一台电脑（粘贴完整配对链接或裸地址；私有地址自动补 `http://`，公网域名补 `https://`）、重命名、复制地址、移除。断线横幅新增「切换到其他电脑」。
- 可选的应用内扫码（`BarcodeDetector` + `getUserMedia`）只在 HTTPS 下可用；局域网 HTTP 与 iOS Safari 不支持，此时回退到粘贴链接。

### 本轮验证

| 检查 | 结果 |
|---|---|
| `tsc --noEmit` | 通过 |
| `vitest`（7 个文件） | 57 项通过；新增 `tests/identity.test.ts` 12 项 |
| `tsc` + `tsdown` | 通过，62 个文件、5.12 MB |
| `scripts/multi-host-qa.mjs`（Playwright + Edge，隔离 DSH Web 宿主） | 22 / 22 通过 |

`scripts/multi-host-qa.mjs` 的 22 项：桌面面板渲染「这台电脑」一栏并可改名且落盘；`status.host` 与改名后一致；局域网网关就绪并给出配对链接；桌面看到待确认请求并批准；手机进入远程界面；侧栏显示电脑名字；抽屉列出当前电脑并标记「正在使用」、提供「添加另一台电脑」；手机写入 `dsrc-hosts`；携带 `?rcfrom=` 的链接保留列表且从地址栏消失；配对页合并外来电脑列表；断线横幅出现并给出「切换到其他电脑」。截图见 `.qa/multi-host-sheet.png` 与 `.qa/multi-host-offline.png`（不进入发布包）。

### 0.3.1 / 新公网地址的 DNS 生效等待

实测本机：cloudflared 4.1 秒拿到新地址，但该主机名在 DNS 里 **60 秒仍为 `ENOTFOUND`，61 秒才解析出来**；旧逻辑 `VERIFY_MS = 60_000` 正好在此之前判定失败并关闭入口。手动 `cloudflared tunnel` 与 `dns.lookup` 都正常，说明不是网络故障，而是新名字发布需要时间。

- 正常验证窗口从 60 秒放宽到 90 秒。
- `ENOTFOUND` / `EAI_AGAIN` 视为「名字还没发布」而非失败：从第一次出现起额外等 180 秒，期间面板显示「公共地址正在生效，第一次使用需要等一会儿」，生效后该提示自动消失。
- 实测修复后：`phase=starting` → 6 秒 `verifying` → **21 秒 `ready`**，拿到 `https://midwest-strategic-pros-nobody.trycloudflare.com` 与配对链接。
- 新增单测覆盖：第一次超时只延长窗口不失败；发布窗口用尽后仍判定失败并上报。

## 0.2.9 / 侧栏入口与更新按钮重叠（2026-10-23）

宽侧栏的远程入口原先通过绝对定位覆盖在账户行右下角，Desktop 原生更新／重启提示出现时会占用同一位置。现在把远程入口放入账户行的横向布局，位于账户入口与原生状态按钮之间，按实际宽度占位并沿用行内间距；不再使用右下角坐标，也不额外增加一行。

DSH 0.2.1-rc.2 没有公开的账户行尾部插槽，`sidebar.footer.action` 实际位于账户行上方。因此使用一个范围受限的适配器，在该插槽相邻的设置区域找到原生 flex 行，通过 React Portal 仅挂载本插件的容器。结构不匹配时保留普通 footer 插槽入口；侧栏折叠、展开或组件卸载时清理并重新挂载，不改宿主样式。

- `scripts/sidebar-footer-qa.mjs`：使用生产组件、适配器、样式及官方 sidebar/settings 样式，覆盖 260px、320px 宽侧栏和 56px 折叠栏，以及更新占位隐藏／显示的 12 种组合。检查同一行对齐、不重叠、可聚焦与命中点击区域。旧代码可复现重叠失败。
- `scripts/sidebar-entry-host-qa.mjs`：隔离的 Electron 0.2.1-rc.2 宿主经浏览器载入实际界面，验证账户行内排列、打开／关闭远程面板、更新占位动态显示／隐藏、侧栏折叠与展开后无重复入口。更新控件使用仅存在于测试页面的占位按钮，没有触发真实更新下载或安装。
- 类型检查、45 项单元测试、构建及 npm 包内容检查均通过（104 个文件、57 个懒加载块）；UI strict audit 无发现。QA 截图和临时 profile 不进入发布包。

## 0.2.8 / issue #1（2026-10-23）

### 原因与接口核对

在隔离 DSH Web 0.2.1-rc.2 上复现 0.2.7 的 `Cannot read properties of undefined (reading 'list')`。官方发布包仍提供 `ctx.sessions.list`、`ctx.workspaces.list` 和 `ctx.remote.*`，并未把这些服务统一改成另一个命名空间。实际问题是自定义启动器缺少新版平台种子模块 `zod` 与 `@tanstack/react-virtual`，导致 Remote、会话等客户端模块未激活；`loader.await()` 只等待任务结束，不能保证每个服务已加载，后续读取 `ctx.sessions.list` 才报错。

将内置客户端运行时及原生前端对齐到 0.2.1-rc.2，补齐种子模块。读取客户端服务前检查形状；Remote 调用统一检查命名空间和方法；异步加载同时捕获同步抛错、Promise 拒绝并忽略过期结果。基础服务缺失时提供恢复入口，可选服务缺失时只提示对应功能。

### 本轮验证

| 检查 | 结果 |
|---|---|
| `pnpm typecheck`、`pnpm test`、`pnpm build` | 通过：6 个测试文件、45 项测试 |
| `pnpm install --frozen-lockfile --ignore-scripts` | 通过，锁文件无需修改 |
| `npm pack --dry-run --ignore-scripts --json` + `scripts/check-package.mjs` | 通过：103 个文件、57 个懒加载块，不包含 QA 数据或开发文件 |
| 新增根页面回归测试 | 修复前准确触发 `reading 'list'`，修复后显示服���说明及原生 UI 链接 |
| DSH Web 0.2.1-rc.2，隔离 profile，局域网 | 23 项功能检查通过；另两个第三方插件未加载，未计入通过数 |
| Electron 0.2.1-rc.2，隔离 profile，局域网 | 25 / 25 通过，包括 computer-use 与 proxy 的设置页 |
| `scripts/issue-1-qa.mjs`，Web 与 Electron | 各 7 项通过：未授权拦截、模块全部激活、默认 UI 保存及刷新、临时切换、Agent 预设缺失保留输入、文件服务缺失提示、原生回退 |
| UI 静态检查 | frontend-design-premium strict audit：0 findings；沿用 `docs/ui-spec.md` 与现有控件 |

完整功能脚本为 `scripts/remote-qa.mjs`；专项脚本为 `scripts/issue-1-qa.mjs`。测试使用实际宿主和本地确定性模型，不调用外部模型。Desktop Fetch 测试适配了新版要求的 owner Peer；断网恢复后的自动化检查改为先核验 RPC 成功再读取结果，避免测试脚本因暂未恢复的命名空间报 `.length` 错误。

本轮没有复测实体 Android/iPhone、Cloudflare 公网通道或大陆手机直连。下方旧版公网与设备记录属于历史验证，不代表 0.2.8 已重新覆盖。0.2.8 的最低宿主声明提升到 0.2.1-rc.2；旧版 DSH 可继续使用 0.2.7。

---

日期：2026-10-03。0.1.0 的记录见 [verification-v0.1.md](verification-v0.1.md)。

## 自动检查

| 项目 | 结果 |
|---|---|
| `pnpm typecheck` | 通过 |
| `pnpm test`（vitest，4 个文件 36 项） | 通过 |
| `pnpm build`、`npm pack --dry-run`、`scripts/check-package.mjs` | 通过 |

单元测试覆盖：配对与撤销、网关准入与转发、模式切换与取消、偏好保存失败回滚，以及本版新增的局域网地址变化、设备数上限淘汰、网关转发标记、公网自检失败不拆连接、偏好文件损坏回退。

## 真实宿主回归（Playwright，隔离 profile，本地确定性测试模型）

脚本 `scripts/remote-qa.mjs`，25 项。三种组合各跑一遍，全部通过：

| 宿主 | 连接方式 | 结果 |
|---|---|---|
| `dsh web` 0.2.0-rc.2 | 局域网 | 25 / 25 |
| Electron 桌面 0.2.0-rc.2 | 局域网 | 25 / 25 |
| `dsh web` 0.2.0-rc.2 | 临时公网（电脑端经本机 HTTP 代理） | 25 / 25 |

25 项内容：模式选择不影响现有连接；未授权拦截、等待页、本机批准、界面启动；新建会话、发送、流式回复；模型选择；工具审批只执行一次；二进制附件上传；多选问题回答；重命名、归档、恢复；断网恢复且不重放；长代码块不撑破页面；输入法组合期间不提交、触屏 Enter 换行；文件列表、文本预览、二进制下载；设置表单按版本号写入；凭据写入后不留在浏览器存储；插件清单；computer-use 与 proxy 的自定义设置页；自动化任务创建、读取、修改、记录、删除；360 / 390 / 430 / 844px 无横向溢出；刷新后草稿保留且不重发；深色主题；撤销后无法继续读取。

隔离宿主加载了 computer-use、proxy 和官方实验性自动化插件。日常使用的 DSH 配置、会话和插件没有被读取或修改。

## Android 模拟器（Android 15，Chrome 124，经 adb reverse 访问）

实际操作并截图确认：扫码链接配对与电脑端弹窗、聊天页、模型选择面板（按供应商分组）、返回键关闭面板、附件选择器进入系统文件浏览、抽屉、设置页的外观卡片、从外部应用再次打开链接仍保持已配对。

## 发布前的最后一轮

全部改动完成后，三种组合各重跑一遍，均为 25 / 25：`dsh web` 局域网、Electron 桌面局域网、`dsh web` 任意网络（电脑端经本机代理）。

任意网络那一组前两次没有跑起来：一次是到 Cloudflare 的 TLS 连接被断开，两次是新地址 60 秒内没有连通；第三次通过。当时代理和直连访问 Cloudflare 都正常，原因没有查明，怀疑是短时间内反复创建临时通道。

另外在隔离宿主里单独确认并截图：配对请求弹窗、电脑面板的连接方式选择、侧栏入口的位置、手机端断开连接后的提示（关闭连接后约 12 秒出现）、折叠步骤、表格、文件列���与文本预览。

没有走完整流程的：已连接时更换连接方式的确认条；图片文件预览（隔离工作区里没有图片）；“任意网络”配对时上报手机型号。

## 0.2.1

- 单元测试 38 项通过。三种组合的 25 项回归全部重跑通过：`dsh web` 同一 Wi‑Fi、Electron 桌面、`dsh web` 任意网络（Cloudflare，经代理）。
- localhost.run 线路：在隔离宿主上真实开启、配对并进入聊天页，首次打开用了约 3 分 24 秒；没有在这条线路上跑完整的 25 项回归。
- 文件路径图片：在 web 与桌面两种隔离宿主上，把一张 PNG 放进会话工作目录，经网关请求宿主文件路由返回 200 并能被 `<img>` 解码。没有让模型真实输出一条带图片的回复来看最终渲染。
- 长按菜单、工作区面板：截图确认（用右键事件触发）。真机长按没有测。
- 新会话复用：已有未使用会话时连点两次“新会话”，会话数不变。

## 0.2.2

单元测试 39 项通过；`dsh web` 同一 Wi‑Fi 回归 25 / 25。桌面和任意网络两组这次没有重跑。在隔离宿主上另外确认：关闭再开启后端口不变；已配对的浏览器打开新二维码的链接后直接进入、没有新的配对请求、设备数仍为 1；系统代理能检测到（该环境里来自环境变量，Windows 注册表那一路只有单元测试）；面板截图确认二维码悬停提示。“用检测到的系统代理真实开启任意网络”没有单独验证。

## 0.2.3

单元测试 39 项通过；`dsh web` 任意网络（不使用代理，新的默认）25 / 25，同一 Wi‑Fi 25 / 25。桌面一组没有重跑。“自检在代理失败后改走直连”没有复现用户那种代理被拒的环境来验证。

## 0.2.4

- 改动：`ws`、`undici`、`qrcode` 改为用到时加载；强调色与其他插件共用并与宿主端双向同步；README 重写。
- `pnpm typecheck`、`pnpm test`（5 个文件 39 项）、`pnpm build`、`scripts/check-package.mjs` 通过。
- `dsh web` 0.2.0-rc.2 局域网回归 25 / 25（同时加载 computer-use、proxy 的新构建）。
- 强调色：隔离宿主里六个插件一起加载，在远程控制面板选蓝色、在网络代理页选黑色，电脑控制、网络代理、远程控制、网页搜索卡片和绘画页都随之变色，宿主端保存的值同步为黑色；浅色与深色主题各看了一遍。
- 本版没有重跑：Electron 桌面回归、“任意网络”回归（默认不走代理时不加载 undici，走代理的路径只有单元测试）、手机端改色后电脑端跟随（逻辑见 `src/client/accent-sync.ts`，未实测）。

## 0.2.5

- 手机界面的“+”菜单：在隔离宿主（`dsh web` 0.2.0-rc.2，本地测试模型，Pixel 7 视口）里实测。菜单列出文件、目标、计划、反馈、压缩、权限、模型、导出；点“目标”把 `/goal ` 写进输入框，发送 `/goal …` 后会话里出现“Goal created …”；“计划”执行后出现“Entering plan mode …”；`/feedback …` 出现“Feedback recorded …”；“压缩”当时因 Agent 正在运行被宿主拒绝，拒绝的原因同样显示在会话里。页面没有脚本错误。
- 这次测试往隔离宿主提交了一条内容为“远程菜单的反馈测试”的反馈。
- 没有实测：电脑面板的“已复制”浮层和设置页导航的手机图标（都是桌面界面里的，只过了类型检查和构建）；“导出”“权限”“模型”三行的点击；带附件时输入指令。

## 已知情况

- 临时公网不带电脑端代理时，本机到 `trycloudflare.com` 的自检被重置（`ECONNRESET`），启动验证 60 秒后判定失败并关闭入口。配置电脑端代理后通过。手机是否需要代理取决于手机所在网络。
- 连接建立后的巡检失败不再断开连接，只在面板显示提示；隧道进程退出才判定失败。

## 没有实测的部分

- Android Chrome、iPhone Safari 真机：只有自动化浏览器的视口与触屏模拟结果。包拥有者在 0.1.0 上反馈过公网与局域网均可连接；0.2.0 的新界面尚未在真机确认。
- 手机软键盘、安全区、切后台恢复的真机表现。
- 插件安装 / 卸载用例（`DSH_QA_INSTALL=1`）本轮未重跑，上一轮结果见 git 历史中的记录。
- 第三方自定义设置页只验证了 computer-use 与 proxy。
