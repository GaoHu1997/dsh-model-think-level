# 0012 — 自动继续不观察、不改写官方重试

状态：已接受

## 背景

0009 把「官方供应商重试」与「插件轮后自动继续」做了分层：读 `llm/retry` / `llm/retry-started` 事件推出 `provider-retrying` 阶段，把 `llm/retry-started` 计入失败链的请求预算，并在官方模型页用 DOM 隐藏 `retryPolicy` 入口。

这套耦合带来三个问题：

- **预算被官方污染**：官方在同一轮内重试几次，插件的「请求预算」就少几次。用户看到的「请求已用尽」可能一次都不是插件发的。
- **状态解释成本高**：`provider-retrying` 是纯展示态，却要和等待、已发送、耗尽并列解释；用户分不清「现在是谁在跑」。
- **DOM 隐藏很脆**：`official-retry-policy` 依赖宿主表单的 class 词干、`aria-labelledby` 后缀与 select 结构，宿主一改标记就失效，还承担「隐藏却保留数据」的误解成本。

用户明确要求：官方重不重试与插件无关；官方中断之后插件接手，我们自己发的「继续」才算我们的。

## 决策

- **只看 `turn/end`**：删除 `provider-retrying` 阶段及其状态字段（`AutoContinueStatus.providerRetry`、`Attached.providerRetry`），控制器不再渲染官方重试倒计时；判定仍然只在回合结束后发生，回合仍在运行（含官方同轮重试）时不抢发。
- **官方重试事件不参与预算与计时**：`observeRequest` 不再处理 `llm/retry` / `llm/retry-started`。请求预算只统计可见的 `turn/start`、`step/start`、`turn/end`；失败链的 `startedAt` 只由插件自己的 `continue` 判定写入。失败链未被启用时（`startedAt` 为空），健康回合的多个 `step/start` 仍只记 1 次请求。
- **删除官方入口隐藏**：移除 `official-retry-policy` 模块、`models-page` 的挂载/回收与对应测试。插件不再读写官方 `retryPolicy` 的任何 DOM，宿主表单恢复原样。
- **保留与官方无关的部分**：错误里的 `providerRetryAfterMs`（上游 `Retry-After`）仍是等待下限；指数退避、次数/请求/时限预算、回声归属与跨标签页认领都不变。
- 0009 中关于「观察官方重试、`provider-retrying`、隐藏 `retryPolicy` 入口」的条目由本记录取代，其余预算与退避决策继续有效。

## 影响

- UI 少一个阶段：控制器只有等待、已发送、已停手三态；`…` 弹层不再出现「官方重试」相关说明，请求计数文案改为「已观察到 N 次请求」。
- 请求预算数字会比以前小（不再含官方重试），语义更接近「我们这条链实际看到的请求」，仍是下界而非计费上限。
- 升级后官方模型页的「重试策略」入口重新可见，已有 `retryPolicy` 数据与官方执行器从未被改动，行为一致。
- 宿主若在未来把官方重试做成跨轮次的事件，插件也不会因此改变行为；两者只通过「回合是否结束、是否值得继续」这一个事实耦合。

## 验证

- `tests/auto-continue-runtime.spec.ts` 删除 `providerRetryOf` 用例，新增「官方重试事件不计请求、不写 `startedAt`」断言。
- `tests/auto-continue-run.spec.ts` 删除三个 `provider-retrying` 集成用例；保留并覆盖等待、退避、预算、回声归属、恢复与后台链。
- `tests/auto-continue-controller.spec.tsx` 删除 provider 阶段用例，无障碍用例改用等待态；弹层不再断言官方重试提示。
- 删除 `tests/official-retry-policy.spec.ts` 与对应模块；`tsc --noEmit`、`build:client`、全量 `vitest run` 通过。
- 未把本工作区安装到运行中的宿主，因此未做实时页面视觉验证；未修改插件版本、官方安装包或 profile。
