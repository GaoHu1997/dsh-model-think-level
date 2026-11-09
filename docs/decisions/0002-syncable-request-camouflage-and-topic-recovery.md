# 0002 — 请求伪装与旧话题恢复跟着 dsh-webdav 走：文件改名与自声明

状态：已接受

## 背景

dsh-webdav 的「已安装插件」只同步一份内置清单，外加插件包在 `dsh.webdavSync.configFiles` 里的自声明。本插件 2.4 新增的 `camouflage.json`（每路由的请求伪装身份）和 `history-compat.json`（每路由是否允许旧话题恢复）都没有出现在任何一处，于是它们永远留在本机。

`history-compat.json` 还有第二道门槛：dsh-webdav 的 `FORBIDDEN` 把任何由 `[._-]` 分隔的 `history` 段当会话历史，显式声明也会被拒绝。这不是可以放宽的规则，而是同步层刻意不带走会话历史。

## 决策

- 旧话题恢复的落盘文件改名为 `topic-recovery.json`。开关数据本身没变（仍是 `version` + `providers` 里只记开着的那几条）；同源 API 路由 `/dsh-model-think-level/history-compat` 是接口名，不改。
- 旧名 `history-compat.json` 不删、不失效：读取新名文件不存在时，读同目录旧名，解析成功后写一份新名文件，之后以新名为准。写失败（只读 home）不影响本次返回，下次保存再补。
- 包在 `package.json` 的 `dsh.webdavSync.configFiles` 声明 `camouflage.json` 与 `topic-recovery.json` 两条 home 路径，dsh-webdav 侧也把这两份加进 `dsh-model-think-level` 的内置清单——两边任一先升级都能识别。
- 自动继续不同步：开关和次数只在浏览器 localStorage（`dsh-model-think-level.auto-continue.enabled` / `.auto-continue.config`），宿主侧没有文件，也没有需要跨机一致的路由状态。要同步得先在宿主落一份文件，属于另一件事。

## 影响

两台电脑之间请求伪装与旧话题恢复不再需要手动搬运，也不依赖附加目录；这两份文件只有路由名与开关，没有秘密，随配置同步不额外暴露信息。已存过 `history-compat.json` 的电脑不会丢开关，升级后第一次读到即迁移。

已知取舍：dsh-webdav 按整份文件时间仲裁，这两份是「每路由开关」字典——两台电脑各改不同路由时，后写的那份会盖掉另一份里别的路由。这与其余配置同一取舍，未引入字段级合并；若实际使用中出现，再为它们各自的 `savedAt` 补一条仲裁规则。
