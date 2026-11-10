# 贡献指南

谢谢你愿意花时间看这个项目。它是给 DeepSeek Harness（DSH）用的远程控制插件，一个人慢慢做出来的，所以不管是一个错字、一条复现步骤，还是一段代码，都很欢迎。不用先问「我可以提吗」，直接提就好。

## 开始之前

- Node.js `^22.19.0 || >=24.0.0`，pnpm `10.28.0`（见 `package.json` 的 `engines` 与 `packageManager`）。
- 需要一份能跑起来的 DSH 宿主（桌面版或 `dsh web`）才能做端到端验证；只跑单测不需要。

```bash
pnpm install --frozen-lockfile
pnpm typecheck
pnpm test
pnpm build
node scripts/check-package.mjs   # 构建后检查 npm 打包内容
```

`pnpm qa:host` 会在仓库的 `.qa/` 目录里起一个隔离的 DSH Web profile，不碰你日常用的 DSH 配置；`.qa/` 已被 `.gitignore` 忽略，**请不要把里面的凭据、cookie 或连接信息提交上来**。

## 提 issue

用仓库的 issue 模板就好。最有用的三类信息：

1. 环境（DSH 版本、Node 版本、桌面版还是 `dsh web`、手机浏览器与系统）；
2. 复现步骤和期望／实际结果；
3. 面板截图或日志（**先确认截掉了二维码、临时公网地址、token 和设备密钥**）。

涉及安全漏洞请**不要**开公开 issue，走 [SECURITY.md](SECURITY.md)。

## 提 pull request

- 一个 PR 只做一件事，标题说清改了什么、为什么。
- 改动前先说一句你想怎么改，避免两个人撞车；小修小补直接提也没关系。
- 提交前跑一遍 `pnpm typecheck && pnpm test && pnpm build`，CI 会在 Ubuntu 与 Windows 上再跑一次。
- 改到配对、授权、网关或隧道的代码，请补一条测试；改到行为或配置，请顺手更新 `README.md` 与 `docs/` 里对应的说明。
- 不要提交 `.qa/`、备份目录、`*.tgz`、`lib/` 编译产物或任何真实凭据。

提交信息用一句话说清目的即可，例如 `fix: keep the paired device list after a tunnel restart`；不要求特定格式。

## 关于本项目的来历

本仓库是在一个更早的公开快照（MIT）基础上继续维护的，`LICENSE` 里的原始版权行 `Copyright (c) 2026 Copy` 必须原样保留，请勿删除或替换。新增文件默认沿用 MIT，具体见 [LICENSE](LICENSE)、[NOTICE](NOTICE) 与 [docs/provenance.md](docs/provenance.md)。

代码里还保留着几个旧版协议键（如 `copylee.dsh.accent`）用于兼容同套插件的强调色同步，**不要顺手改名**，原因写在 `NOTICE` 里。

## 行为准则

参与本项目即表示同意遵守 [CODE_OF_CONDUCT.md](CODE_OF_CONDUCT.md)。