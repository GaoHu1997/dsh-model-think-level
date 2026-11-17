# 0011 — 自动继续的累计时限不跨会话恢复复活

状态：已接受

## 背景

自动继续的「累计时限」是**墙钟**预算：一条失败链从第一次需要继续（`turn/end` 判定为 `continue`）起，累计超过 `maxChainMinutes`（默认 30 分钟）就停止后续自动继续。它的起点 `startedAt` 只在 `continue` 判定时用 `??=` 写入，并随每会话 ledger 持久化到 `localStorage`，保留 24 小时。

问题出在「暂停 / 离开」与「恢复」之间：待发倒计时按设计**不跨新文档重放**（见 0009 决策），但 ledger 里的 `startedAt` 会存活 24 小时。于是出现这样的链路：

1. 某会话失败一次，进入等待，`startedAt = 事件时间`；此时 `consecutive` 仍为 0（「继续」还没真正发出）。
2. 用户在倒计时中途刷新页面、关掉标签页或切走。
3. 数小时后回到该会话，新文档从 ledger `restoreBudget` 原样恢复 `startedAt`。
4. `budgetReason` 算 `now - startedAt >= 30 分钟` 成立，立刻判为 `duration` 耗尽。

结果就是状态条在**并没有任何等待存在**的情况下，直接显示「⏱ 累计时限已到 0/5」——一个 `consecutive = 0` 却"累计超时"的自相矛盾组合。用户看到的就是一个没头没脑、还带着「重置」「…」的灰色胶囊。

## 决策

- **冷恢复时作废过期的计时起点**：`ensureChain` 从 ledger 恢复出 `budget` 后，若 `startedAt` 距当前已 `>= maxChainMinutes`，直接把 `startedAt` 置空。倒计时本就不跨文档重放，过期的链在新文档里没有任何可恢复的等待，恢复它只会伪造一个「已停手」。
- **不放弃次数 / 请求预算**：作废的只是**时限**起点。`consecutive` 与 `requests` 仍按 ledger 恢复，后续真正要发「继续」时继续受次数 / 请求上限约束，切页不能绕过重试上限（保持 0009 的语义）。
- **不改停止与开关的既有语义**：`stop()` 仍保留请求计数与 muted（现有回归要求如此），全局开关仍按 `settleChain` 收起。本次只收紧"恢复"这一入口；这两条路径各自的时长语义留待单独评估，避免顺手改动打破既有契约。

## 影响

- 冷恢复后，一条早已中断的失败链回到 `idle`：状态条不渲染，也不再误报「累计时限已到」。用户下次真正失败时从 1/5 重新开始。
- 链路在**同一文档内**持续失败时，累计时限仍照旧从首次 `continue` 起算并在 30 分钟时停止——实时在等超时的行为不变。
- 恢复后 `consecutive` 若已达到 `maxRetries`，不会在 `idle` 阶段凭空弹「已停手」；只有等到下一次真正尝试继续时才按次数上限拦下（`evaluate` / `send` 的既有守卫），防绕过能力不变。

## 验证

- [auto-continue-run.spec.ts](../../tests/auto-continue-run.spec.ts) 新增一条回归 `drops a stale chain duration on cold recovery instead of painting 累计时限已到`：注入一条 `startedAt` 在 2 小时前、`consecutive = 0` 的 ledger，断言恢复后 `phase = idle`、`exhaustedReason` 为空、不发送任何 prompt。
- 既有 `auto-continue-run.spec.ts`、`auto-continue-runtime.spec.ts`、`auto-continue-pref.spec.ts` 全量保持通过（含 `stop()` 保留请求计数、disable / enable 保留请求上限两条契约）。
- 未把本工作区安装到运行中的宿主，因此未做实时页面视觉验证；未修改插件版本、官方安装包或 profile。
