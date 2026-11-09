# 决策记录

非平凡变更须新增或更新本目录中的 ADR，并与代码一起提交。文件名使用递增四位序号与 kebab-case 标题；记录包含背景、决策、影响，状态为已接受或已废弃。

## 索引

- [0001 — 模型显示状态的文件赢家与同步交接](0001-model-order-sync-handoff.md) — 已接受
- [0002 — 请求伪装与旧话题恢复跟着 dsh-webdav 走：文件改名与自声明](0002-syncable-request-camouflage-and-topic-recovery.md) — 已接受；`camouflage.json` 与改名后的 `topic-recovery.json` 进 `dsh.webdavSync.configFiles`；`history` 段被同步层拒绝，故改名并在读取时从旧 `history-compat.json` 迁移，同源路由名不变；自动继续仍只在 localStorage
