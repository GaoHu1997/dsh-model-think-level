# 0004 — 发布正文从本地草稿改为随仓库提交

状态：已接受

## 背景

`.github/releases/<tag>.md` 一直存在，但 `.gitignore` 排除 `.github/releases/`，注释写明「never ships」。于是 CI 在 tag 上永远读不到文件，`release.yml` 的回退分支 `--generate-notes` 每次都会命中；正文是发布后由本地 `gh release edit --notes-file` 补上去的——v2.5.1 的 `updated_at` 比 `published_at` 晚十余分钟，就是这个人工步骤留下的痕迹。

这条流程脆弱在两点：正文只存在于发布者的机器上；一旦忘了补，市场弹窗显示的就是一行 compare 链接，而插件市场的「版本更新」直接渲染 Release body。

## 决策

- 移除 `.gitignore` 里 `.github/releases/` 一条，把已存在的 12 份正文提交进仓库。
- `release.yml` 新增 `Verify release notes`，在 `Publish to npm` 之前校验：文件存在、≥300 字节、≥8 个非空行、至少一个 `## ` 小节、含 `**Full Changelog**`，不满足即 `::error::` 退出。
- 去掉 `--generate-notes` 回退分支：Release 一律 `--notes-file`，已存在时 `gh release edit` 覆盖，不再「已存在就原样保留」。
- 补写历史正文走 `sync-release-notes.yml`（`workflow_dispatch`），不重新发版。

## 影响

正文与代码在同一个提交里，tag 就是全部证据，发布不再依赖发布者本地的未提交文件。代价是：漏写正文的 tag 会在 npm 发布前失败，需要补文件后重推 tag——这是刻意的，失败点被前移到 npm 之前，不会留下「npm 有版本、正文是空壳」的状态。
