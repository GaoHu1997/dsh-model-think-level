# 0005 — 旧话题恢复同时覆盖拆开的 `fc_`/`rs_` 项对

状态：已接受

## 背景

旧话题恢复最初只认一句拒绝：`The requested item was created under a different Azure OpenAI resource.`，含义是重放的历史项由别的资源签发。

同一个中转还有第二种说法。它把工具调用的 `fc_` 句柄留下，却没有把与它配对生成的那条 `rs_` 推理项一起重放，Responses 服务端按无状态回放的配对规则直接拒绝：

```
Item 'fc_04e5…' of type 'function_call' was provided without its required 'reasoning' item: 'rs_04e5…'.
```

DSH 侧的 pi-ai 重放同一个上下文时，工具调用的 item 句柄只在「同 provider、同 api、不同 model」时才会被清掉（`openai-responses-shared.js` 的 `isDifferentModel` 分支）；跨 provider、跨协议，或历史里的 `thinkingSignature` 已丢失时，`fc_` 句柄原样发出，而 reasoning 项不会被重放——于是必然撞上这条校验。实际表现是：在一条旧话题里切换模型后继续，服务端必拒；换密钥、重试都只是把同一个请求再发一遍。

## 决策

- 把这条措辞并入 `src/history-compat.ts` 的识别集合（`ITEM_PAIRING_MISMATCH`），与资源拒绝共用 `isHistoryStateMismatch` 一个入口。fetch 层对 `400`/`5xx` 正文的重编码、请求层对流内 `response.failed` 的重放因此自动覆盖第二类。
- 不新增恢复阶段。`portable_ids` 去掉工具调用 `id` 里的 `itemId` 半段后，`function_call` 不再带 `fc_` 句柄，服务端也就不会再去找它的配对项；仍被拒才升级到 `drop_reasoning`。两类拒绝共用同一条降级阶梯，代价是最多一至两次重放。
- 正则收窄到 `provided without its required … reasoning`，不匹配 `provided without its required header` / `field` 这类泛化错误，避免把无关失败读成历史问题。

## 影响

打开旧话题恢复的路由，在切换模型或中转账号池之后继续旧话题，可以在同一个密钥上一次重放内恢复；本地历史、`call_id` 配对、顺序、`previous_response_id` 都不改。没有打开的路由行为不变。

已知边界：如果拒绝来自 `previous_response_id` 或 compaction 里的密文项，降级阶梯刻意不碰这些项，仍会原样上报——这与此前的资源拒绝一致。
