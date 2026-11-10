## 改了什么

<!-- 一句话说清目的，再说怎么改的 -->

## 为什么

<!-- 关联 issue：Closes #123 -->

## 怎么验的

- [ ] `pnpm typecheck`
- [ ] `pnpm test`
- [ ] `pnpm build`
- [ ] `node scripts/check-package.mjs`（改到构建/打包时）
- [ ] 在真实 DSH 里试过（写明桌面版还是 `dsh web`、哪种连接方式）

## 说明与文档

<!-- 改到行为/配置就顺手更新 README 或 docs/；没有就写「无」 -->

- [ ] 没有提交 `.qa/`、备份目录、`*.tgz`、`lib/` 或任何真实凭据
- [ ] 没有删改 `LICENSE` 里的 `Copyright (c) 2026 Copy`
- [ ] 没有顺手重命名旧协议键（见 `NOTICE`）

参与本项目即表示同意 [CODE_OF_CONDUCT.md](../CODE_OF_CONDUCT.md)；更细的要求在 [CONTRIBUTING.md](../CONTRIBUTING.md)。