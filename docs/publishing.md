# 发布说明（维护者用）

这份文档写给要往 npm / GitHub 发版本的人（多数时候就是维护者自己）。**当前状态：源码版本 0.4.2，尚未以 `@liuyong0426/dsh-remote-control` 名义发布过 npm 包，也还没有打过本仓库的标签。**

## 改包名带来的一件要紧事

早期公开版本的包名是 `@copylee/dsh-remote-control`，现在改成了 `@liuyong0426/dsh-remote-control`。CI 里的 [publish.yml](../.github/workflows/publish.yml) 不写死包名（用 `node -p 'require("./package.json").name'` 读），所以**工作流代码不用改**，但下面三件事得先办：

1. **npm scope**：`@liuyong0426` 是 npm 的用户名／组织名，和 GitHub 账号不是同一个体系。先到 <https://www.npmjs.com/> 确认这个 scope 归你可用；如果被占用，改用一个未被占用的 scope 或不带 scope 的名字，并同步改 `package.json` 的 `name`、`cordis.patch.yml`、`tsdown.config.ts`、`src/index.ts`、`src/remote/management.ts`、`scripts/` 下的 QA 脚本与 README 安装段。
   - 2026-11-10 核实：npm 用户 `liuyong0426` 存在（profile 页可访问，当前 0 个包），`@liuyong0426/dsh-remote-control` 在 registry 上返回 404，**包名可用**。
2. **Trusted Publisher**：`.github/workflows/publish.yml` 用 `npm publish --provenance`（OIDC），npm 侧要为**新包名**、这个仓库、这个 workflow 文件配置 Trusted Publisher，否则打标签时发布步骤会因鉴权失败而红。npm 包名与仓库名的对应关系在 npm 包设置页里维护，旧包名 `@copylee/...` 的配置不要动、也用不上。
3. **npm badge**：发布成功后，再把 README 顶部的 npm 徽章加回来（片段见下）。没发布之前放着一个指向不存在包的徽章，反而让人误会。

```markdown
[![npm](https://img.shields.io/npm/v/@liuyong0426/dsh-remote-control)](https://www.npmjs.com/package/@liuyong0426/dsh-remote-control)
```

## 发一个版本

```bash
# 1. 本地过一遍
pnpm install --frozen-lockfile
pnpm typecheck && pnpm test && pnpm build
npm pack --dry-run --ignore-scripts --json > package-manifest.json
node scripts/check-package.mjs package-manifest.json

# 2. 改版本号（CHANGELOG.md 也把「未发布」挪到对应版本下）
#    package.json version / CITATION.cff version / CHANGELOG.md

# 3. 提交、打标签、推送（只有 push 时才需要仓库已建好）
git tag v0.4.3
git push origin main --follow-tags
```

`publish.yml` 会校验 `v` + `package.json` 的 version 是否与标签一致，然后跑 typecheck / test / build / pack 检查，最后 `npm publish --access public --provenance`；若该版本已存在则跳过。`ci.yml` 会在 Ubuntu 与 Windows 上各跑一遍。

## 打包内容

`package.json` 的 `files` 决定进 npm 包的东西：`lib/` 构建产物（含自动生成的 `lib/LICENSES.txt`，汇总运行时依赖许可证）、`assets/`、`cordis.patch.yml`、`README.md`、`docs/*.md`、`LICENSE`、`NOTICE`、`CHANGELOG.md`、`SECURITY.md`。`scripts/check-package.mjs` 会检查必需文件、禁止打进 `.qa/`／`scripts/`／`tests/`／`node_modules/` 与 `.npmrc`，并校验包名版本与懒加载 chunk。

`.github/`、issue 模板、`.editorconfig`、`.gitattributes` 等只存在于 Git 仓库里，不会进 npm 包。

## 许可与归属，别漏

- `LICENSE` 中 `Copyright (c) 2026 Copy` 是原样保留的早期声明，**任何版本都不要删**。完整理由见 [provenance.md](provenance.md) 与 [NOTICE](../NOTICE)。
- `NOTICE` 必须随包分发；`lib/LICENSES.txt` 由 `tsdown.config.ts` 的 `bundled-runtime-licenses` 插件在构建时生成，缺依赖许可证会直接报错，不要手工编造。
- 升级依赖后顺手确认 `lib/LICENSES.txt` 仍生成成功，`npm pack --dry-run` 里能看到它。

## 还没做的验收

早期记录里写过「GitHub Actions 的 Trusted Publisher 首次 OIDC 发布尚未验收」。换到新包名之后，第一次真正的 OIDC 发布同样还没跑过；第一次打标签时请留意发布步骤的结果，别只看到 CI 绿就当作发布成功。

## 首次手动发布踩到的坑（2026-11-10）

第一次尝试用本机 Granular Access Token 直接 `npm publish` 时，产物打包、鉴权身份都正常，最后一步被挡：

```
npm error code E403
npm error 403 403 Forbidden - PUT https://registry.npmjs.org/@liuyong0426%2fdsh-remote-control
npm error Two-factor authentication or granular access token with bypass 2fa enabled is required to publish packages.
```

结论与对策：

- 账号开了 2FA 时，Granular Access Token 必须带 `bypass_2fa`（生成 token 时勾选 bypass two-factor authentication），或者发布命令带 `--otp=<6 位动态码>`；否则 `npm whoami` 能过、`npm publish` 必 403。
- 网页版 `npm login --auth-type=web` 在直连 `www.npmjs.com` 被 Cloudflare 挑战（403 `Cf-Mitigated: challenge`）的网络环境下拿不到 token（`GET /-/v1/done` 一直 202），这条路径不要依赖。
- 因此**推荐用打标签 + `.github/workflows/publish.yml` 的 OIDC 发布**：不需要本地 token、不需要 2FA 动态码，但前提是先在 npm 包设置页为该包配好 Trusted Publisher（仓库 `liuyong0426/dsh-remote-control`、workflow `publish.yml`）。
- 发布用的 token 用完要从 `~/.npmrc` 删掉，并在 npm 网页上 Revoke。