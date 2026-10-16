# DSH Model Think Level

DSH 的第三方模型补齐思考等级：在官方 Models 页每个模型行注入 Thinking 开关和强度/模态编辑器，在输入框模型菜单加供应商→模型选择器、视觉徽章与等级行，并带搜索、拖拽排序、供应商启用开关；以及按路由接管请求头与 user-agent。

## 模型选择器

![供应商与模型选择器](./docs/image.png)
![思考等级与模型搜索](./docs/image2.png)

## 供应商配置

![供应商配置面板](./docs/image3.png)
![模型能力配置](./docs/image4.png)
![供应商高级配置](./docs/image5.png)

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
