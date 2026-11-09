# 仓库规范

## 发布正文（Release notes）

插件市场的「版本更新」弹窗直接显示 GitHub Release 的 body 原文（`dshmarket/lib/changelog.js` 的 `updateNotesFor` 优先取 release body，其次抓最近 5 条 commit，最后只给 npm 发布时间）。本仓库直推 main、没有 PR，`gh release create --generate-notes` 只能产出一行 `**Full Changelog**` 比较链接——用户看到的就是「一句话」。

所以：

- 每个 `vX.Y.Z` tag 必须提交 `.github/releases/vX.Y.Z.md`，文件名与 tag 完全一致（含 `v` 前缀）。
- 该目录必须进仓库，`.gitignore` 不得忽略 `.github/releases/`。CI 在 tag 上 checkout 时读不到文件，等同于没写。
- `release.yml` 的 `Verify release notes` 在 npm 发布之前校验：文件存在、≥300 字节、≥8 个非空行、至少一个 `## ` 小节、含 `**Full Changelog**`。任一不满足即 `::error::` 退出，npm 不会发布，补好文件重推 tag 即可。
- 创建或更新 Release 一律用 `--notes-file`，没有 `--generate-notes` 兜底分支。
- 已发布但正文缺失的版本用 `gh release edit <tag> --notes-file .github/releases/<tag>.md` 补写，不必重新发版；市场探针 TTL 1 小时，最迟次日刷新。

### 正文格式

```markdown
# vX.Y.Z — 一句话主题

1–2 句说明这个版本解决什么问题、面向谁。

## 新增 / 修复 / 变更 / 移除（按实际取舍）

### 短标题 `涉及的主要文件`

改之前是什么行为、为什么有问题；改之后是什么行为、边界条件如何；涉及取舍的写明被否决的方案及原因。

## 回归测试

覆盖了哪些用例文件、新增多少条、全量是否通过。

**Full Changelog**: https://github.com/GaoHu1997/dsh-model-think-level/compare/<prev>...<tag>
```

按模块分条，每条锚定具体文件路径；写「为什么」而不只是「改了什么」；破坏性变更单独成条并写明迁移方式；不写「详见 compare」「若干修复」这类无信息量的句子。

## 版本号

无用户明确指令，禁止更新 `package.json` 的 `version` 字段；发版升号由用户发起，且应作独立的 `chore` 提交。

## 决策记录

非平凡变更须在同一个提交里新增或更新 `docs/decisions/` 下的决策记录，规范见 `docs/decisions/README.md`。
