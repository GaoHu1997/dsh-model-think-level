# 0006 — 自动继续的状态行改版与后台链条

状态：已接受

## 背景

输入框状态行最右那枚自动继续 chip 原来写的是 `第 1/5 次 · 18s`。三个问题叠在一起：

- **没有动词。** 「次」「18s」都是名词化的量，读者要自己推导「这是次数？是重试？18s 是已经花了还是还剩」。
- **与统计数字同构。** 它和旁边 `223 tok/s`、`缓存命中 89%`、`0%` 同字号、同灰阶、同一行，被读成第四个统计数字，而不是控件。
- **点开没有解释。** 旧浮层直接给四个动词（立即继续／停止／重置／设置…），在不知道发生了什么的情况下要求用户做决定。

行为上还有一处与用户预期相反：`track()` 每秒重新解析当前会话，会话一变就 `detach()`，把附件连同 `sendTimer` 一起销毁；回到该会话后 `recoverableBaselineOf` 重新判定那个 `turn/end`，**从完整等待重新计时**。结果是「离开会话，那条已经决定要发的『继续』就不发了；回来才重新开始倒计时」。

## 决策

**视觉**（`src/client/AutoContinueController.tsx`、`src/client/styles.ts`、`src/client/locales.ts`）：

- 22px 高的胶囊不改行高，信息分三级：动词「自动继续」→ 13px 倒计时环 + 秒数读数 → 10.5px 弱化的 `1/5`。环的周长是整段等待、缺口是已经过去的，`stroke-dashoffset = C·(1−p)` 让剩余弧从 12 点顺时针缩短。
- 四态各自一种语气：等待（强调淡底，唯一需要注意的状态）、已继续（透明底 + 勾）、已停手（中性 + 就地「重置」，另给一个 `⋯` 只留设置入口）、空闲（不渲染）。
- 浮层先解释再给动作：标题 + 次数徽章、「本轮被上游超时中断。N 秒后自动发送「继续」…」、动作列表、页脚（设置 / 只对当前会话生效）。设置入口只出现一次。

**行为**（`src/client/injection/auto-continue-run.ts`）：

- 链条从「当前附件的临时状态」提升为**按会话持有的链**：`chains: Map<sessionId, Attached>`。`current` 只决定 chip 渲染哪个会话，不再决定链条的生死。
- 切到另一个会话时链不销毁：`sendTimer` 继续跑，到点向**它自己的会话** `prompt()`。`send()` 的守卫因此去掉了「屏幕上仍是该会话」，其余守卫不变（开关、静音、会话可读且 `open`、无子智能体、未在运行、无待处理提交、该 `turn/end` 之后没有新的用户意图或新一轮）。
- 链的事件订阅在切走后仍在，所以后台会话**继续失败时仍会被接管**（`armForNewTurnEnd` → `evaluate` → 下一发），直到达到 `maxRetries` 或被 `stop()` 静音。
- 回收规则：`track()` 每秒把「不是当前会话、`phase === 'idle'`、没有评估计时器、评估窗口已过」的链丢掉。因此用户早已离开且空闲的会话不会被无限期自动接管；而正在等待或仍在判定那一次失败的链，切走也活得下来。
- 页面可见性不再参与：最小化窗口不冻结倒计时（旧实现的 `visibilitychange` 冻结已删除）。
- 连接重置与 `dispose` 仍然一次丢掉全部链（`dropAllChains`），因为重建后的 binding 对象已换。

## 影响

- 用户切走、最小化或换会话，已经决定的那条「继续」照发；回到会话时 chip 显示的是这个会话此刻的真实状态（可能已是「已继续」）。
- 回到会话不再重新等一整段：链一直活着，`nextSendAt` 没被重置。
- 四条回归用例随语义更新：`answers a failure that ends while the view is on another session`、`still sends after the view moved to another session`、`keeps answering a session the view moved away from`，外加新增 `keeps the chain alive through a second failure while the view is elsewhere`（后台连续两轮）。
- 文案键中英同步重排：`autoContinueControllerWaiting` 从整句改为纯动词，新增 `…Seconds`／`…Ratio`／`…PopTitle`／`…PopBadge`／`…PopDesc`／`…PopScope`。

已知边界：`exhausted` 的链会保留自己的订阅直到用户重置或关闭开关，数量等于用户主动停过的会话数；空闲链的回收没有 LRU 上限，但每条链只占一个事件窗口订阅，且只有一次失败周期内才会出现。后台连续接管只在链仍被跟踪时生效——用户离开很久、链已回收之后，该会话新的失败仍按旧话题恢复路径处理（回到会话时判定一次）。
