# 0010 — 切换 Wire 协议时协议专属 compat 随同一次写入自动清理

状态：已接受

## 背景

DSH 内核 `@deepseek-ai/dsh-llm-pi-ai` 在**写入那一刻**校验整份 settings 文档：`ctx.on('internal/config')` 里调 `assertServiceable` → `resolveProfiles(..., 'strict')` → `resolveModelCompat`。`resolveModelCompat` 按路由的 wire 协议选一张 gate：

- `COMPLETIONS_COMPAT_GATE`（`openai-completions`）提供 `supportsReasoningEffort`、`thinkingFormat`、`thinkingTokenBudgetField`、`supportsThinkingTokenBudget`、`vllmPriority` 等；
- `RESPONSES_COMPAT_GATE`（`openai-responses` / `azure-openai-responses` / `openai-codex-responses`）只提供 `supportsDeveloperRole`、`supportsMaxOutputTokens`、`supportsStrictMode`、`supportsLongCacheRetention`；
- `anthropic-messages` 另有 `forceAdaptiveThinking`。

一个模型行若携带新协议 gate 不提供的键，`resolveModelCompat` 直接抛 `PiAiCatalogError`：

```
llm-pi-ai: provider "free" model "gpt-6.1-sol" sets compat "supportsReasoningEffort",
but its api is "openai-responses", which does not take it; that switch exists on
openai-completions, and "openai-responses" offers supportsDeveloperRole,
supportsMaxOutputTokens, supportsStrictMode, supportsLongCacheRetention
```

于是**整条路由、整次写入被拒**（该异常不在 `resolveEntry` 的逐条 try/catch 内），用户在官方「模型」卡片里把某路由的 API 协议从 `openai-completions` 改成 `openai-responses` 时保存直接失败，文档保持原样，只能去手改 `cordis.patch.yml`。用户要求：**变更协议时应自动处理**，而不是一次性修某个配置文件。

插件此前已有 compat guard（`buildCompatCleanupPatch` + 启动清扫 + 空闲清扫），但两者都在事件**之后**才修复，救不了这次拒绝；而在用户保存前后各插一次独立写入也不行：

- 保存**之前**写 → revision 被顶掉，卡片持有的 `expectedRevision` 冻结在打开时（issue #7），用户的保存反而得到 `settings/conflict`；
- 保存**之后**写 → 保存已经被拒，输入被丢弃。

## 决策

把清理**并入卡片自己那一次 mutate**，为此在 `ctx.remote.settings` 这一层加一个可拆卸的写 seam：

- 新增纯函数模块 `src/compat-write.ts`：
  - `protocolsSwitched(ops)`：低成本判定本次 ops 是否把某路由改到新协议（只认 `providers.<route>.api` 的 `set`，或 `providers.<route>` 整体 `set` 里含 `api`）；
  - `withCompatCleanup(ops, providers)`：对这些路由，用既有的 `stripForeignCompat` 清掉 route 级 `compat` 与每个 model 行上的外来开关。若调用方本来就写了 `models`/整条 profile，就地清理该 op（保持一条 op 一条语义）；否则追加 `providers.<route>.compat` / `providers.<route>.models` 的 `set`。路由不带显式 `api` 时一律不碰（与 `buildCompatCleanupPatch` 同一条规则：无 `api` 时协议按目录逐模型解析，插件看不到）。
- 新增 `src/client/injection/compat-write-seam.ts`：把 `ctx.remote.settings` 换成一个 Proxy 替身，只拦截 `mutate`；对 pi-ai 命名空间且 `protocolsSwitched` 的写入，先 `describe()` 取 user 层 providers，再用 `withCompatCleanup` 修补，最后以**同一个 expectedRevision** 调底层 `mutate`。其它写入零额外开销，直通。
  - 替身放在 `remote.settings` 成员上、**不改命名空间服务对象本身**：官方页、本插件、测试都读同一个成员，但服务对象被多方共享（测试还直接断言 `api.settings.mutate` 是 spy），改对象会把逻辑塞进所有消费者并越过销毁边界。
  - 引用计数 + 可拆卸：第二次 activate（HMR／重复 apply）并入既有 seam；最后一次 dispose 还原原 descriptor。空闲扫描每轮调 `ensure()` 重新挂回被宿主重挂替换掉的 seam。
- `src/client/index.ts` 在读到本插件的 `settingsApi` **之前**安装 seam，使本插件所有写入同样经过修补。

## 影响

- 用户在官方卡片切协议时，保存不再被内核拒绝：`supportsReasoningEffort` 等旧协议开关会在同一次写入里被清掉，其余字段（`supportsDeveloperMode` 之类合法键、baseURL、密钥、reasoningEfforts）原样保留。
- `openai-responses` → `openai-completions`、→ `anthropic-messages` 等所有方向都按同一 denylist 处理（`stripForeignCompat` 已有），不需要逐协议分支。
- 启动清扫与空闲清扫保留为兜底（覆盖非本次写入造成的历史脏数据），不重复写：seam 修好后它们看到的是干净文档。
- 只对**显式写了 `api`** 的写入生效；改名、改端点、改密钥等不含协议的写入完全不触发 describe，性能与之前一致。
- 仍未解决：宿主若更换 `remote.settings` 成员而不触发空闲扫描，且用户恰在其间通过官方卡片切协议，可能漏一次修补（下一次空闲扫描 `ensure()` 后会恢复）。这是已知窗口，不是回归。

## 验证

- `tests/compat-write.spec.ts`（21 例）：`protocolsSwitched` 判定、`withCompatCleanup` 各类 ops 形态（仅切协议／自带 models／整体 profile／route 级 compat／干净文档／未带协议／不可表示行／新路由）、`userProvidersOfDescribe` 取 user 层、seam 直通／修补／异命名空间放行／describe 失败与抛错回退／引用计数／重挂后 `ensure()` 恢复／无可挂服务返回 undefined。
- 全量 `npm test`：119 文件 2456 例全绿；`npm run typecheck` 与 `npm run build`（host/client/types）通过。
- 未安装到运行中的宿主做实时页面验证；未改 `package.json` 版本。
