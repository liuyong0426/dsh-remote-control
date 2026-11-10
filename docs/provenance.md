# 项目来历与授权说明

这份文档把「代码从哪来、为什么会带着另一个账号的署名、现在怎么处理」写清楚，并留下可以自己复核的证据。它是给未来的读者（也包括面试或答辩时被问到的自己）看的，所以只记能查证的事实，不替任何人下法律结论。

## 一句话结论

本仓库是**在一个更早的公开 MIT 快照基础上继续维护的版本**：早期代码以 `Copyright (c) 2026 Copy` 发布，如今由 `liuyong0426` 在自己的 GitHub 账号下继续开发。按 MIT 的要求，原始版权行与完整许可文本原样保留，同时补上本仓库维护者的版权行与 [NOTICE](../NOTICE)。

## 背景（维护者自述，非技术取证）

- 项目最初是在这台电脑的 **DSH 桌面版** 里开始做的，后来在使用中发现各种问题，转到 **DSH 懒人版** 里一点点完善到现在的 0.4.2。
- 桌面版阶段，出现了一个以第三方账号 `copylee711` 发布的公开仓库 <https://github.com/copylee711/dsh-remote-control>，以及 npm 包 `@copylee/dsh-remote-control`。
- 维护者表示：**该 GitHub 账号不是自己的，当时也没有要求过把代码上传到那个仓库**。
- 现在希望把基本完成的版本开源到自己账号 <https://github.com/liuyong0426> 下，并把归属写清楚，让它以后能作为一份可以坦然展示的作品。

这段话是维护者的陈述，本文件不把它当作已证实的权利归属结论；下面列出的才是可复核的技术证据。

## 技术取证（只读比对，2026-11-10）

对比对象：公开仓库 `copylee711/dsh-remote-control` 的标签 `v0.2.9`（该仓库 main 分支最后一次 push 为 2026-10-23），与本地当前源码目录。

| 项目 | 结果 |
| --- | --- |
| 公开 `v0.2.9` git tree | 73 个 blob，`truncated=false`；tags 共 11 个（`v0.1.0` … `v0.2.9`） |
| 本地候选文件 | 排除 `node_modules/`、`.qa/`、`.git/`、`.backup-*`、`agentworkrecords/`、`lib/`、测试产物后 86 个 |
| 同路径同名 | 66 个 |
| 逐字节一致（换行归一后） | `agentworkrecords/2026-10-03-first-release.md`（1421/1421 字节）、`LICENSE`（1060/1060）、`.gitignore`（124/124） |
| 本地明显更长（像长期续写，不是简单加前缀） | `src/index.ts` 22450 → 36633；`src/tunnel.ts` 11344 → 19426；`docs/verification.md` 5664 → 12138；`README.md` 4619 → 5874；`package.json` 4304 → 4406；`docs/research.md` 2594 → 2596；`agentworkrecords/2026-10-04-startup-accent-readme.md` 1307 → 1309 |
| 公开仓库有、本地没有 | 4 份 `agentworkrecords/*.md`、三张 `assets/` 截图（已于 2026-11-10 由维护者自有截图替换）、`screenshots.json`、若干旧版 `scripts/` 与 `docs/` |
| 本地新增 | `src/cloudflared.ts`、`src/identity.ts`、`src/remote/hosts.ts`、`src/remote/node-fs.ts`、`src/remote/node-fs-promises.ts`、`scripts/multi-host-qa.mjs`、PWA 图标与 `assets/manifest.webmanifest` |
| 公开仓库 main 提交 | 28 次，最早 `2026-10-03T05:23:28Z Initial commit`，最新 `2026-10-23T15:38:14Z`；署名两种：`Copy <1617110693@qq.com>`、`Copy <97714705+copylee711@users.noreply.github.com>` |
| 许可与包信息 | 公开 `v0.2.9` 与 `v0.1.0` 的 LICENSE 版权行都是 `Copyright (c) 2026 Copy`；公开 `package.json` 为 `@copylee/dsh-remote-control@0.2.9`；本地为 `0.4.2` |

`agentworkrecords/2026-10-03-first-release.md` 里有两句原始记录，值得原样引用：

> npm whoami 已确认账号 copylee，包名 @copylee/dsh-remote-control，首版 0.1.0。实现通过功能分支快进合并到 main，提交 e5f736e 已推送。

> 首次本地 npm publish --access public 返回成功。

这是一份当时的 AI 工作记录，只能说明「那台机器上确实做过一次以 copylee 身份的推送与 npm 发布」，**不能说明是谁授权的、账号属于谁、以及那次发布是否经过维护者同意**。本机没有 `.npmrc`，插件目录与上级目录都没有 `.git`，所以无法从本机反推当时的登录身份。

三张 README 截图（`assets/phone.png`、`desktop-panel.png`、`pair-request.png`）原本就在公开 `v0.2.9` 里，大小分别为 137591 / 77494 / 96709 字节。2026-11-10 已按维护者要求**全部替换**为他本人用自己的 DSH 环境截取的新截图（`phone.png`、`phone-sidebar.png`、`desktop-panel.png`、`pair-request.png`），其中只对电脑面板上的配对二维码、手机侧栏里的头像与昵称做了马赛克处理。因此当前仓库里的这四张图**不属于早期公开快照**，版权行为 `Copyright (c) 2026 liuyong0426`；旧图若需核对，按上面的方法从公开仓库 `v0.2.9` 取回即可（同为 MIT）。

### 怎么自己复核

```bash
# 公开仓库的文件树与提交历史
curl -H "Accept: application/vnd.github+json" \
  https://api.github.com/repos/copylee711/dsh-remote-control/git/trees/v0.2.9?recursive=1
curl https://api.github.com/repos/copylee711/dsh-remote-control/commits?per_page=100
curl https://api.github.com/repos/copylee711/dsh-remote-control/tags?per_page=100

# 单个文件的原文（返回 JSON，content 为 base64）
curl -H "Accept: application/vnd.github.raw+json" \
  https://api.github.com/repos/copylee711/dsh-remote-control/contents/LICENSE?ref=v0.2.9
```

## 这些证据能证明什么、不能证明什么

**能证明**：公开 `v0.2.9` 与本地代码高度同源；本地在关键源码与文档上有大量后续修改；公开版本是 MIT 且带有 `Copyright (c) 2026 Copy`。整体形态更像「公开的是这个项目的早期快照，本地是继续长出来的版本」。

**不能证明**：`copylee711` 账号属于谁、那次上传是否获得授权、各阶段代码的著作权归属，以及任何一方的法律责任。技术比对不是权利鉴定，本仓库也不对第三方账号作任何主张。

## 现在的处理方式

1. **保留原始许可**：`LICENSE` 里的 `Copyright (c) 2026 Copy` 与 MIT 全文原样不动；只在其下追加 `Copyright (c) 2026 liuyong0426`。MIT 只要求保留声明与许可文本，允许修改与再分发，所以可以继续维护并在自己的账号下发布。
2. **写明来历**：README「项目来历」、本文件与 `NOTICE` 都指向早期公开仓库，不遮掩、不假装从零开始。
3. **换成自己的身份**：包名 `@liuyong0426/dsh-remote-control`、插件 id `liuyong0426-remote-control`、仓库链接与 issue 地址统一指向 `github.com/liuyong0426/dsh-remote-control`，author 改为 `liuyong0426`。
4. **保留旧协议键**：`copylee.dsh.accent`、`copylee-dsh-accent`、`copylee.dsh.accent.remote-control` 是与同套 DSH 插件共享强调色的 `localStorage`／事件名，改名会丢用户设置、让兄弟插件配色不同步，故按原样保留，并在 `NOTICE` 里说明它们不是署名。历史工作记录 `agentworkrecords/` 亦保持原样。
5. **旧仓库不作处理**：不申请转移、不提交正式申诉、不替换第三方账号的内容。这类动作属于对外主张，需要维护者本人明确决定后才做。

## 如果以后需要更正式的澄清

可以先保存一份本文件里列出的比对结果与当时的沟通记录；若确实需要，再考虑与第三方账号所有者协商、通过 GitHub 官方渠道处理，或咨询专业人士。这些都不在本仓库当前的动作范围内。

## 相关文件

- [LICENSE](../LICENSE)、[NOTICE](../NOTICE)：许可与归属声明
- [CHANGELOG.md](../CHANGELOG.md)：版本沿革（含早期公开记录）
- [README.md](../README.md)「项目来历」：给普通读者的一句话版本
- [publishing.md](publishing.md)：换包名后的发布准备