# DSH Model Think Level

DSH 的第三方模型补齐思考等级：在官方 Models 页每个模型行注入 Thinking 开关和强度/模态编辑器（插件编辑器所在的行会隐藏官方自带的「推理等级」编辑区，同一个字段只留一份控件），在输入框模型菜单加供应商→模型选择器、视觉徽章与等级行，并带搜索、拖拽排序、供应商启用开关；以及按路由接管请求头与 user-agent。

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

## 多密钥与按模型分流

同一个供应商可以登记多把密钥，请求进来时按「模型 → 密钥」自动分流：

- 密钥按列表顺序排队，第一把是默认密钥。一个模型如果多把密钥都能访问，先走第一把。
- 某把密钥对某模型请求失败（401/403/408/429/5xx）时，自动换下一把能访问该模型的密钥重试；400/404/422 这类请求本身的问题不重试，直接返回。
- 密钥能访问哪些模型可自动探测（密钥面板的「探测模型」按钮会逐一读取每把密钥各自的 `/models` 列表并记录），也可在「模型」里手动填写覆盖。
- 未探测过的密钥视为「通吃」，可以服务任何模型；探测后只服务列表内的模型。
- 旧的「启用某把密钥」单选已移除：所有登记的密钥都参与路由，顺序即优先级。插件自身元数据保存在 DSH 数据目录的 `dsh-model-think-level/key-index.json`，只记录引用、别名与模型清单，绝不保存密钥值（密钥值始终由 DSH 凭据库保管）。

### 按密钥切换协议与双地址

有些供应商同一把密钥只在某一种线上协议下可用（例如同一家既有 OpenAI Chat Completions 端点、又有 Anthropic Messages 端点）。插件支持在密钥面板里给每把密钥单独指定协议：

- 「这个密钥可用的协议」有「任意协议」「Anthropic」「Chat Completions」「Responses」四档，默认「任意协议」——跟随该供应商自身配置的协议。
- 给某把密钥指定协议后，命中该密钥的请求会真正换用对应的线上协议（不只是换 URL/鉴权头：请求体也按该协议重新编码），由插件在 pi-ai 适配层重新派发到 `@earendil-works/pi-ai` 的对应协议实现。
- 供应商可以同时配置两个基础地址：一个 OpenAI 系（Chat Completions / Responses 共用）、一个 Anthropic 系。密钥指定协议后，就用与之匹配的那个地址；未指定协议的密钥仍使用供应商自身的 `baseURL`。
- 密钥面板的「模型」选择改为可点选的真实模型清单（探测得到的模型做成多选胶囊），选中的模型才交给这把密钥；下面的「全部模型」表示不做限制。该项与其它操作按钮一样只在悬停时显示。

## 开发与验证

使用 Node.js `^22.19.0 || >=24`。依次运行 `npm ci`、`npm run typecheck`、`npm test`、`npm run build`、`npm run check:package`。测试最多并行 4 个 worker，以控制 DOM 测试的内存占用；仍使用 Vitest 默认超时。

`check:package` 检查 npm 实际打包清单中的入口、截图和声明文件依赖，CI 与发布流程都会执行。类型声明所引用的 DSH 可选 peer 由宿主开发环境提供，不会自动安装额外宿主插件。

更新模型知识表后，可运行 `npm run docs:models` 生成可查阅的模型列表。`node scripts/wire-repro.mjs` 使用当前安装的 pi-ai，向本地回显服务发送测试请求，无需供应商凭据。
