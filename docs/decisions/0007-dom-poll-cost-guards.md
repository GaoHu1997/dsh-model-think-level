# 0007 — 会话页两条轮询的「无事可做」快路径

## 背景

桌面端连续运行 8 小时后打字明显卡顿，跨会话排查把矛头指向若干第三方插件在
`document.body` 上的全树观察与定时全文档扫描。其中属于本插件的两条路径，都是
会话页常驻的：

- `injection/error-detail.ts`：`MutationObserver(document.body, {childList,
  subtree})` → 120ms debounce → `decorate()`，以及 `setInterval(decorate, 1500)`
  的兜底扫描。`decorate()` 的第一件事是
  `document.querySelectorAll('[class*="turnErrorRow"]')`。
- `AutoContinueController.tsx`：同形状的 body 观察器 → 400ms 节流 → `ensure()`，
  而 `ensure()` 的第一件事是 `anchorRow()`，其结尾用 `getClientRects()` 判断
  dock 是否可见。

Headless Chromium 实测（45k / 100k 元素、180 条失败行的合成会话页）：

| 操作 | 45k 元素 | 100k 元素 |
| --- | --- | --- |
| `querySelectorAll('[class*="turnErrorRow"]')` | 0.63 ms | 1.86 ms |
| 追加一个字符 + 强制布局 | 3.16 ms | 7.13 ms |

即：扫描本身是亚毫秒到毫秒级，**单次成本不足以解释卡顿**；但它在打字路径上的
触发频率是每 120ms 一次（每次 composer 重渲染都是一次 mutation），而
`getClientRects()` 在转录区已脏时会把这次追加的 3–7ms 强制布局**搬到本插件的
回调里**。这两条路径都不产生任何结果：没有 `failures` 就装不了按钮，单 dock 且
chip 已就位就没有锚点可解析。

## 决策

给两条路径各加一个 O(1) 的"无事可做"判据，其它行为一律不动：

1. `decorate()` 在 `failures.length === 0` 且本模块没有存活按钮时直接返回。
   失败列表是 `scan()`（事件源订阅）维护的，空列表意味着这次扫描既不能加、也
   不能改按钮；唯一的例外是切会话后官方转录尚未重绘、旧按钮还在 DOM 里，用
   本模块自己的 `Set<HTMLButtonElement>` + `isConnected` 兜住——不用
   `querySelector('[data-bre-error-detail]')`，那个属性选择器在长会话上仍要
   遍历整棵树（45k 元素 0.26ms、100k 元素 0.71ms）。
2. `chipInPlace(host, docks)`：恰好一个 dock、且 chip 是它的直接子元素时，
   `ensure()` 不再调用 `anchorRow()`。多个 dock 时仍走完整解析——那时"最后一个
   可见 dock"才是决定 chip 去留的问题。

## 被否决的方案

- **把扫描限定到转录容器**：官方 DOM 没有稳定的容器选择器，猜一个会把失败详情
  在容器改名时静默丢掉。
- **把 1500ms sweep 也停掉**：sweep 是官方 text-only 更新的唯一兜底；加了判据
  之后它已是 O(1)，没有性能理由停它。
- **按 mutation 记录过滤（只处理 composer 相关节点）**：判定"哪些 mutation 与
  失败行有关"需要反向依赖官方 class，误判会让按钮漏装。

## 影响

- 打字路径上本插件的 DOM 成本归零：无失败会话里 observer 回调只做一次属性
  查询；单 dock 页面里 chip 不再触发强制布局。
- 行为边界：存在失败行时 `decorate()` 仍做全文档扫描（每 1.5s 一次，亚毫秒
  级）；多 dock 时 chip 仍按"最后一个可见 dock"迁移。
- 回归测试：`tests/error-detail-perf.spec.ts`（3 条）锁住"空失败列表不扫文档"
  与"失败到达后仍装饰"；`tests/auto-continue-chip.spec.ts`（5 条）锁住快路径
  判据。全量 114 个文件、2369 条通过（`tests/host.spec.ts`、`tests/key-index.spec.ts`
  里个别 host 侧用例在本机并行满载时会偶发 5s 超时，单跑均通过，与本改动无关）。
