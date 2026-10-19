# DSH Model Think Level

DSH 的第三方模型补齐思考等级：在官方 Models 页每个模型行注入 Thinking 开关和强度/模态编辑器（插件编辑器所在的行会隐藏官方自带的「推理等级」编辑区，同一个字段只留一份控件），在输入框模型菜单加供应商→模型选择器、视觉徽章与等级行，并带搜索、拖拽排序、供应商启用开关；以及按路由接管请求头与 user-agent。

## 模型选择器

![供应商与模型选择器](./docs/image.png)
![思考等级与模型搜索](./docs/image2.png)

## 供应商配置

![供应商配置面板](./docs/image3.png)
![模型能力配置](./docs/image4.png)
![供应商高级配置](./docs/image5.png)

## 其他配置（高级配置）

供应商卡片的「高级配置」里，请求头下面还有一节独立的「其他配置」，带自己的标题，不是请求头的一项；长缓存保留就是这一节里的一行开关，说明用小字写在该行下面。整块面板的「取消 / 保存」压在这一节之后，所以在高级配置里它是整个面板的提交行，而不是请求头那一节的。

开关写的是该路由 profile 的 `compat.supportsLongCacheRetention`。有些中转站会拒绝 OpenAI 的缓存字段（典型报错 `未知请求字段：prompt_cache_key`）；这两个字段由适配器写进**请求体**，任何请求头都加不进去也删不掉，能关掉它们的只有这个 `compat` 开关：

- 关掉「长缓存保留」→ 写入 `compat.supportsLongCacheRetention: false`，`prompt_cache_key` 与 `prompt_cache_retention` 都不再发送，短时缓存不受影响。
- 再打开 → 删除该键（`unset`），路由重新跟随适配器默认值。若下层配置（如 `cordis.patch.yml` 里手写的那份）同样固定了该键，删掉用户层的值只会把它暴露出来，此时改为显式写入 `true`，开关才不会看起来关不掉。

开关跟着它标注的设置走：打开就是保留。没有显式配置时也是打开（跟随适配器默认的长缓存判定）；一个开关表示不了「跟随默认」和「显式开启」的差别，所以该路由显式写入了值时，说明下面会再补一行小字。

写入是立即生效的一步操作，没有单独的保存按钮；该路由后续请求按新值走，无需重启 DSH。只写这一个叶子键，`compat` 里其他开关（如 `supportsDeveloperRole`）不会被覆盖。

仅在协议提供该开关时显示：`openai-completions`、`openai-responses`、`azure-openai-responses`、`openai-codex-responses`、`anthropic-messages`。其他协议（如 `mistral-conversations`）会直接说明该协议没有这个开关，而不是给一个写了也不生效的控件。新建供应商卡片时还没有真实路由可写，所以那里不显示这一节。

## 兼容字段与已有配置

1.1.4 起不再提供 `thinkingTokenBudgetField`、`vllmPriority`、`supportsMaxOutputTokens` 的专用编辑控件。已有值仍由 DSH 的 pi-ai 适配器使用；修改模型的思考档位或输入模态时，插件会保留这些值和其他手动兼容配置，避免覆盖供应商的定制行为。

需要调整旧值时，先备份当前 profile 的 `cordis.patch.yml`（位于 DSH 数据目录的 `profiles/<profile>/`），找到 `llm-pi-ai` 对应供应商、模型行的 `compat`，仅修改或删除所需字段，保存后重新加载该 profile：

- `thinkingTokenBudgetField`：令牌预算的请求字段名，可设为 `thinking_token_budget`、`thinking_budget` 或 `thinking_budget_tokens`。删除后使用默认字段；启用令牌预算的模型在后续适配或保存时可能重新补入 `thinking_token_budget`。若端点不支持令牌预算，应将 `supportsThinkingTokenBudget` 设为 `false`。
- `vllmPriority`：删除后不再发送定制的 vLLM 优先级。
- `supportsMaxOutputTokens`：删除后恢复适配器默认行为；保留 `false` 会继续关闭对应输出令牌参数。

不要删除整个供应商配置，也不要将包含 API key 的配置文件贴到公开 issue。

## 开发与验证

使用 Node.js `^22.19.0 || >=24`。依次运行 `npm ci`、`npm run typecheck`、`npm test`、`npm run build`、`npm run check:package`。测试最多并行 4 个 worker，以控制 DOM 测试的内存占用；仍使用 Vitest 默认超时。

`check:package` 检查 npm 实际打包清单中的入口、截图和声明文件依赖，CI 与发布流程都会执行。类型声明所引用的 DSH 可选 peer 由宿主开发环境提供，不会自动安装额外宿主插件。

更新模型知识表后，可运行 `npm run docs:models` 生成可查阅的模型列表。`node scripts/wire-repro.mjs` 使用当前安装的 pi-ai，向本地回显服务发送测试请求，无需供应商凭据。
