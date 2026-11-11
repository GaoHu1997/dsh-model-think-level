# 决策记录

非平凡变更须新增或更新本目录中的 ADR，并与代码一起提交。文件名使用递增四位序号与 kebab-case 标题；记录包含背景、决策、影响，状态为已接受或已废弃。

## 索引

- [0001 — 模型显示状态的文件赢家与同步交接](0001-model-order-sync-handoff.md) — 已接受
- [0002 — 请求伪装与旧话题恢复跟着 dsh-webdav 走：文件改名与自声明](0002-syncable-request-camouflage-and-topic-recovery.md) — 已接受；`camouflage.json` 与改名后的 `topic-recovery.json` 进 `dsh.webdavSync.configFiles`；`history` 段被同步层拒绝，故改名并在读取时从旧 `history-compat.json` 迁移，同源路由名不变；自动继续仍只在 localStorage
- [0003 — 生图模型只从宿主实时设置派生，文件只保存偏好与诊断](0003-live-image-configuration-source.md) — 已接受；所有入口使用实时 descriptor，version 3 文件不再保存可执行模型目录
- [0004 — 发布正文从本地草稿改为随仓库提交](0004-release-notes-must-be-committed.md) — 已接受；移除 `.gitignore` 对 `.github/releases/` 的排除并提交既有正文，`release.yml` 发布前校验正文，去掉 `--generate-notes` 回退，补写历史走 `sync-release-notes.yml`
- [0005 — 旧话题恢复同时覆盖拆开的 `fc_`/`rs_` 项对](0005-history-recovery-covers-split-item-pairs.md) — 已接受；把 `provided without its required … reasoning` 并入识别集合，与资源拒绝共用一条降级阶梯
- [0006 — 自动继续的状态行改版与后台链条](0006-auto-continue-chip-and-background-chain.md) — 已接受；chip 改为「动词 + 倒计时环 + 弱化次数」；链条改为按会话持有，切走会话/最小化不再取消已决定的那一发，后台失败也会继续接管，空闲链按会话回收
- [0007 — 会话页两条轮询的「无事可做」快路径](0007-dom-poll-cost-guards.md) — 已接受；失败列表为空时 `decorate()` 不扫文档，单 dock 且 chip 已就位时 `ensure()` 不重新解析锚点，消除打字路径上的全文档扫描与强制布局
- [0008 — 自动继续显式持有会话引用，后台巡检不依赖当前页面](0008-auto-continue-owns-session-references.md) — 已接受；正式 retain 保活、运行会话发现、全链巡检、代际守卫与全局取消

