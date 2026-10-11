window.__ModuleLoader__.load({
	id: "dsh-model-think-level",
	factory: (require) => {
		var module = { exports: {} };
		var exports = module.exports;

"use strict";var Ft=Object.defineProperty;var Ta=Object.getOwnPropertyDescriptor;var La=Object.getOwnPropertyNames;var Ma=Object.prototype.hasOwnProperty;var Sa=(e,t,n)=>t in e?Ft(e,t,{enumerable:!0,configurable:!0,writable:!0,value:n}):e[t]=n;var Aa=(e,t)=>{for(var n in t)Ft(e,n,{get:t[n],enumerable:!0})},Ra=(e,t,n,r)=>{if(t&&typeof t=="object"||typeof t=="function")for(let o of La(t))!Ma.call(e,o)&&o!==n&&Ft(e,o,{get:()=>t[o],enumerable:!(r=Ta(t,o))||r.enumerable});return e};var Ha=e=>Ra(Ft({},"__esModule",{value:!0}),e);var Qr=(e,t,n)=>Sa(e,typeof t!="symbol"?t+"":t,n);var Cu={};Aa(Cu,{EffortEditor:()=>dn,apply:()=>Du,baselineModelsOf:()=>ti,compatOf:()=>nn,createEditorApi:()=>sn,defaultEffortOf:()=>on,describeNamespace:()=>ne,effortsOf:()=>en,findModelMenu:()=>Ur,findModelTrigger:()=>jr,inject:()=>Iu,inputOf:()=>tn,name:()=>Nu,nameOf:()=>rn,providerHeadersOf:()=>fr,providersOf:()=>we,userProvidersOf:()=>ur,writeModelRows:()=>vt,writeProviderHeaders:()=>cr});module.exports=Ha(Cu);var da=require("react");var Q="dsh-model-think-level",Zr="/dsh-model-think-level/raw-models";var Kt="/dsh-model-think-level/provider-key",eo="/dsh-model-think-level/key-index",to="/dsh-model-think-level/autofill-config",no="/dsh-model-think-level/headers-config",oe="llm-pi-ai",de="reasoningEffortsUnset",Ae="inputUnset",Ze="reasoningEffortsAutofilled",et="defaultEffort",qn=Q;var mt=require("react");function ro(e){let{locale:t}=e,n=(0,mt.useCallback)(o=>t.subscribe(o),[t]),r=(0,mt.useCallback)(()=>t.getSnapshot().revision??0,[t]);return(0,mt.useSyncExternalStore)(n,r),e.children()}var oo={reasoningEffort:"Reasoning effort",thinkingMode:"Thinking",thinkingModeOff:"Off \u2014 this model is declared as not reasoning.",autoAdapt:"Auto-adapt",autoAdaptAll:"Auto-detect thinking levels",autoAdaptWorking:"Detecting\u2026",autoAdaptDone:"Adapted {count} \xB7 save to write",autoAdaptEmpty:"All already configured",autoAdaptUnsuggested:"No suggestion available",autoAdaptBlocked:"No models to adapt yet",autoAdaptFailed:"Detection failed: {message}",autoAdaptDoneHint:"Held for {count} model(s): they land when this card is saved.",autoAdaptEmptyHint:"Every model of this provider already declares its thinking levels.",autoAdaptUnsuggestedHint:"The models that still need a declaration have no knowledge-base match \u2014 adapt them one by one.",autoAdaptBlockedHint:"Nothing to adapt yet: the card has no models, is not saved, or the settings document is read-only.",apply:"Apply",reset:"Reset",pendingSave:"Modified \u2014 it will be written when you save this card.",pendingHint:"Cancel or reload discards it, exactly like the card's own fields.",appliedHint:"Applied suggestion from {source} \xB7 confidence: {confidence}",inputHintEndpoint:"Modality advice comes from the endpoint listing.",inputHintKnowledge:"Modality advice comes from the knowledge base.",inputHintHeuristic:"Modality guessed from the name alone (low confidence) \u2014 verify.",referenceTitle:"Reference capacities (hints only, never auto-filled)",contextWindowLabel:"Context window",maxTokensLabel:"Max output",inputModality:"Input modalities",modalityImage:"Image input",modalityInherit:"Not declared \u2014 the provider default applies (usually text-only).",clearDeclaration:"Clear declaration",confidence_high:"high",confidence_medium:"medium",confidence_low:"low \u2014 verify before relying on it",noSuggestion:"No suggestion is available for this model.",conflict:"The settings document kept changing under this edit. Wait a moment, then apply again.",writeError:"Failed: {message}",renderFailed:"Reasoning-effort editor failed to render",wirePlaceholder:"Wire value",wireValue:"value",reasoningDisabled:"No reasoning-effort control declared for this model (false) \u2014 do not arm thinking levels.",bareHint:"Clearing every level removes the declaration \u2014 requests go out bare (provider default), which some relays require.",defaultRiskDisabled:"No off level: Default and provider tests send thinking: disabled, which this model rejects (e.g. 1210).",defaultRiskQwen:"No off level: Default sends enable_thinking: false \u2014 only fails where the upstream requires thinking on.",stagedHint:"Not saved yet. Staged settings are applied automatically once the model is saved.",level_off:"off",level_minimal:"minimal",level_low:"low",level_medium:"medium",level_high:"high",level_xhigh:"xhigh",level_max:"max",sliderToggleTitle:"Model and reasoning-effort rows",sliderToggleDescription:"Show the model row and the reasoning-level chips in the model menu; the levels follow the current model.",sliderToggleAria:"Enable the model and reasoning-effort rows",settingOn:"On",settingOff:"Off",sliderEffortAria:"Reasoning effort",sliderNoLevels:"The current model exposes no reasoning-effort levels.",triggerFallback:"Select model",effortDefault:"Default",modelRowLabel:"Model",effortRowLabel:"Reasoning level",tagVision:"Image input",tagThinking:"Sends thinking levels",sliderEffortTitle:"Reasoning effort \xB7 {name}",sliderEffortTitleError:"Reasoning effort failed: {error}",sliderNoCurrent:"No model selected.",compatTitle:"Endpoint compatibility",budgetFieldLabel:"Thinking budget field",budgetFieldHint:"Which parameter carries the thinking-token budget: some vLLM and self-hosted endpoints read thinking_token_budget, others thinking_budget or thinking_budget_tokens. Unset sends none of them.",budgetUnset:"Not set",defaultEffortLabel:"Default effort",defaultEffortUnset:"Follow memory",defaultEffortHint:"The level every new session starts this model at \u2014 it outranks the remembered levels. Within a session, a level you pick by hand always wins. Empty follows the memory chain.",clearDefaultEffort:"Clear pick",priorityLabel:"vLLM priority",priorityPlaceholder:"e.g. 0",priorityHint:"Scheduler priority for endpoints started with --priority, where lower runs first. Leave empty to send nothing.",priorityInvalid:"Priority must be an integer \u2014 it is not saved until fixed.",maxOutputLabel:"max_output_tokens in requests",maxOutputUnset:"Unset \u2014 follow the protocol default",maxOutputOn:"Send it",maxOutputOff:"Omit it",maxOutputHint:'For Responses-protocol gateways only, and only when a request carries an output cap: some of them reject the parameter, so "Omit it" keeps the cap out of the request entirely. Unset is the safe choice.',aliasMigrated:"Legacy alias detected \u2014 saving writes the explicit budget field.",modelSearchPlaceholder:"Search models\u2026",modelSearchNoMatches:"No matching models",modelSearchClear:"Clear search",modelSearchFailed:"Model search failed to render",editorTabsLabel:"Editor sections",editorTabProvider:"Provider",editorTabModels:"Models",editorTabAdvanced:"Advanced",keyRevealShow:"Show key",keyRevealHide:"Hide key",keyRevealFailed:"Stored key unavailable",keysLoading:"Loading keys\u2026",keysAdd:"Add another key",keysAddConfirm:"Add",keysEnable:"Use {name}",keysEnabled:"Enabled",keysMissing:"Not stored",keysEdit:"Edit",keysRemove:"Delete",keysConfirmRemove:"Confirm delete",keysCancel:"Cancel",keysSave:"Save",keysAlias:"Label",keysAliasPlaceholder:"Name (optional), e.g. Team",keysValue:"Key",keysValuePlaceholder:"Paste the API key",keysNewValuePlaceholder:"Paste the new API key",keysAddIllegal:"A key is printable ASCII without spaces.",keysAdded:"Key stored.",keysRenamed:"Label saved.",keysReplaced:"Key replaced.",keysRemoved:"Key removed.",keysEnabledNote:"{name} is now in use.",keysUnreachable:"The plugin\u2019s key route did not answer.",keysPanelFailed:"Key manager failed to render",headersTitle:"Request headers",headersHint:"Sent on every request of this route.",headersEmpty:"No extra request headers are configured.",headersAdd:"Add header",headersName:"Name",headersNamePlaceholder:"e.g. x-company",headersValue:"Value",headersEdit:"Edit",headersSave:"Save",headersCancel:"Cancel",headersClear:"Clear all",headersSaved:"Saved.",headersCleared:"Cleared \u2014 this route sends no extra request headers.",headersReadOnly:"The settings document is not writable.",headersUserAgentTitle:"User-Agent (taken over at the fetch layer)",headersUserAgentHint:"The official adapter discards a configured user-agent \u2014 the name is reserved for client attribution \u2014 so this plugin adds it at the request layer. Filling it in really does replace the outgoing User-Agent.",headersUserAgentClear:"Do not override",headersUserAgentPlaceholder:"e.g. claude-cli/2.1.161 (external, cli)",headersConflictOrigin:"Routes sharing one endpoint declare different request-header values: when the model in a request body does not identify exactly one of them, that request falls back to the first route.",headersConflictPatched:"The installed dsh-llm-pi-ai already carries a request-header patch: enter values in the headers above and this plugin need not take the request layer over.",headersConflictSiblings:"A plugin rewriting the same layer is installed: {names}. Only one user-agent rewrite should be active at a time, or the last writer on the wire wins.",headersError:"Save failed: {error}",headersNoRoute:"This route is no longer in the settings document \u2014 save the official card once first.",providerReorderAria:"Reorder {provider}",providerReorderHint:"Drag to set the provider order \u2014 the model switcher follows it.",providerToggleAria:"Enable {provider}",providerToggleHint:"A disabled provider is not listed by the model switcher.",providerRemoveDisabled:"Delete",providerRemoveLocked:"A built-in provider cannot be deleted.",modelReorderAria:"Reorder {model}",modelReorderHint:"Drag to set the order of this provider\u2019s models \u2014 the model switcher follows it."},io={reasoningEffort:"\u601D\u8003\u5F3A\u5EA6",thinkingMode:"\u601D\u8003",thinkingModeOff:"\u5DF2\u5173\u95ED\u2014\u2014\u8BE5\u6A21\u578B\u58F0\u660E\u4E3A\u4E0D\u601D\u8003\u3002",autoAdapt:"\u81EA\u52A8\u9002\u914D",autoAdaptAll:"\u81EA\u52A8\u83B7\u53D6\u601D\u8003\u7B49\u7EA7",autoAdaptWorking:"\u83B7\u53D6\u4E2D\u2026",autoAdaptDone:"\u5DF2\u9002\u914D {count} \u4E2A\xB7\u4FDD\u5B58\u540E\u5199\u5165",autoAdaptEmpty:"\u5DF2\u5168\u90E8\u914D\u7F6E",autoAdaptUnsuggested:"\u6CA1\u6709\u53EF\u7528\u5EFA\u8BAE",autoAdaptBlocked:"\u6682\u65E0\u53EF\u9002\u914D\u6A21\u578B",autoAdaptFailed:"\u83B7\u53D6\u5931\u8D25\uFF1A{message}",autoAdaptDoneHint:"\u5DF2\u6682\u5B58 {count} \u4E2A\u6A21\u578B\u7684\u9002\u914D\u7ED3\u679C\uFF1A\u70B9\u8BE5\u5361\u7247\u7684\u300C\u4FDD\u5B58\u300D\u540E\u5199\u5165\u3002",autoAdaptEmptyHint:"\u8BE5\u4F9B\u5E94\u5546\u4E0B\u6240\u6709\u6A21\u578B\u90FD\u5DF2\u58F0\u660E\u601D\u8003\u7B49\u7EA7\u3002",autoAdaptUnsuggestedHint:"\u4ECD\u9700\u58F0\u660E\u7684\u6A21\u578B\u6CA1\u6709\u77E5\u8BC6\u5E93\u5339\u914D\u2014\u2014\u8BF7\u9010\u4E2A\u6253\u5F00\u6A21\u578B\u884C\u624B\u52A8\u9002\u914D\u3002",autoAdaptBlockedHint:"\u6682\u65E0\u53EF\u9002\u914D\u5185\u5BB9\uFF1A\u8BE5\u5361\u7247\u8FD8\u6CA1\u6709\u6A21\u578B\u3001\u5C1A\u672A\u4FDD\u5B58\uFF0C\u6216\u5F53\u524D\u8BBE\u7F6E\u6587\u6863\u4E0D\u53EF\u5199\u5165\u3002",apply:"\u5E94\u7528",reset:"\u653E\u5F03\u4FEE\u6539",pendingSave:"\u5DF2\u4FEE\u6539\u2014\u2014\u70B9\u5361\u7247\u300C\u4FDD\u5B58\u300D\u65F6\u4E00\u8D77\u5199\u5165\u3002",pendingHint:"\u70B9\u300C\u53D6\u6D88\u300D\u6216\u5237\u65B0\u9875\u9762\u4F1A\u4E00\u5E76\u4E22\u5F03\uFF0C\u4E0E\u5361\u7247\u81EA\u8EAB\u7684\u5B57\u6BB5\u4E00\u81F4\u3002",appliedHint:"\u5DF2\u6309 {source} \u5E94\u7528\u5EFA\u8BAE \xB7 \u7F6E\u4FE1\u5EA6\uFF1A{confidence}",inputHintEndpoint:"\u6A21\u6001\u5EFA\u8BAE\u6765\u81EA\u7AEF\u70B9\u5217\u8868\u3002",inputHintKnowledge:"\u6A21\u6001\u5EFA\u8BAE\u6765\u81EA\u77E5\u8BC6\u5E93\u3002",inputHintHeuristic:"\u6A21\u6001\u5EFA\u8BAE\u4EC5\u6309\u547D\u540D\u63A8\u65AD\uFF08\u4F4E\u7F6E\u4FE1\u5EA6\uFF09\uFF0C\u8BF7\u6838\u5BF9\u3002",referenceTitle:"\u53C2\u8003\u5BB9\u91CF\uFF08\u4EC5\u63D0\u793A\uFF0C\u4E0D\u81EA\u52A8\u586B\u5145\uFF09",contextWindowLabel:"\u4E0A\u4E0B\u6587\u7A97\u53E3",maxTokensLabel:"\u6700\u5927\u8F93\u51FA",inputModality:"\u8F93\u5165\u6A21\u6001",modalityImage:"\u56FE\u7247\u8F93\u5165",modalityInherit:"\u672A\u58F0\u660E\u2014\u2014\u7EE7\u627F\u63D0\u4F9B\u65B9\u9ED8\u8BA4\uFF08\u901A\u5E38\u4EC5\u6587\u672C\uFF09\u3002",clearDeclaration:"\u6E05\u9664\u58F0\u660E",confidence_high:"\u9AD8",confidence_medium:"\u4E2D",confidence_low:"\u4F4E\uFF08\u5EFA\u8BAE\u6838\u5BF9\uFF09",noSuggestion:"\u6CA1\u6709\u9002\u7528\u4E8E\u8BE5\u6A21\u578B\u7684\u5EFA\u8BAE\u3002",conflict:"\u8BBE\u7F6E\u6587\u6863\u5728\u4FDD\u5B58\u671F\u95F4\u6301\u7EED\u53D8\u5316\uFF0C\u8BF7\u7A0D\u5019\u518D\u6B21\u5E94\u7528\u3002",writeError:"\u5199\u5165\u5931\u8D25\uFF1A{message}",renderFailed:"\u601D\u8003\u5F3A\u5EA6\u7F16\u8F91\u5668\u6E32\u67D3\u5931\u8D25",wirePlaceholder:"\u7EBF\u4E0A\u53D6\u503C",wireValue:"\u53D6\u503C",reasoningDisabled:"\u8BE5\u6A21\u578B\u58F0\u660E\u4E3A\u65E0 reasoning-effort \u63A7\u5236\uFF08false\uFF09\u2014\u2014\u8BF7\u52FF\u52FE\u9009\u601D\u8003\u6863\u3002",bareHint:"\u5168\u90E8\u53D6\u6D88\u5E76\u4FDD\u5B58\u5C06\u6E05\u9664\u58F0\u660E\u2014\u2014\u8BF7\u6C42\u4EE5\u88F8\u683C\u5F0F\u53D1\u51FA\uFF08\u8D70\u63D0\u4F9B\u65B9\u9ED8\u8BA4\uFF09\uFF0C\u90E8\u5206\u4E2D\u8F6C\u7AD9\u9700\u8981\u8FD9\u6837\u3002",defaultRiskDisabled:"\u65E0 off \u6863\uFF1ADefault \u4E0E\u63D0\u4F9B\u5546\u6D4B\u8BD5\u4F1A\u53D1\u9001 thinking: disabled\uFF0C\u8BE5\u6A21\u578B\u4F1A\u62A5\u9519\uFF08\u5982 1210\uFF09\u3002",defaultRiskQwen:"\u65E0 off \u6863\uFF1ADefault \u4F1A\u53D1\u9001 enable_thinking: false\u2014\u2014\u4EC5\u5728\u4E0A\u6E38\u8981\u6C42\u5F00\u542F\u601D\u8003\u65F6\u624D\u4F1A\u5931\u8D25\u3002",stagedHint:"\u5C1A\u672A\u4FDD\u5B58\u3002\u6682\u5B58\u7684\u914D\u7F6E\u5C06\u5728\u8BE5\u6A21\u578B\u4FDD\u5B58\u540E\u81EA\u52A8\u5E94\u7528\u3002",level_off:"off",level_minimal:"minimal",level_low:"low",level_medium:"medium",level_high:"high",level_xhigh:"xhigh",level_max:"max",sliderToggleTitle:"\u6A21\u578B\u4E0E\u601D\u8003\u7B49\u7EA7\u884C",sliderToggleDescription:"\u5728\u6A21\u578B\u83DC\u5355\u4E2D\u663E\u793A\u6A21\u578B\u884C\u4E0E\u601D\u8003\u7B49\u7EA7\u6807\u7B7E\uFF0C\u6863\u4F4D\u968F\u5F53\u524D\u6A21\u578B\u81EA\u52A8\u9002\u914D",sliderToggleAria:"\u542F\u7528\u6A21\u578B\u4E0E\u601D\u8003\u7B49\u7EA7\u884C",settingOn:"\u542F\u7528",settingOff:"\u505C\u7528",sliderEffortAria:"\u601D\u8003\u5F3A\u5EA6",sliderNoLevels:"\u5F53\u524D\u6A21\u578B\u672A\u63D0\u4F9B\u601D\u8003\u5F3A\u5EA6\u6863\u4F4D",triggerFallback:"\u9009\u62E9\u6A21\u578B",effortDefault:"\u9ED8\u8BA4",modelRowLabel:"\u6A21\u578B",effortRowLabel:"\u601D\u8003\u7B49\u7EA7",tagVision:"\u652F\u6301\u56FE\u7247\u8F93\u5165",tagThinking:"\u652F\u6301\u601D\u8003\u7B49\u7EA7",sliderEffortTitle:"\u601D\u8003\u5F3A\u5EA6 \xB7 {name}",sliderEffortTitleError:"\u601D\u8003\u5F3A\u5EA6\u8BBE\u7F6E\u5931\u8D25\uFF1A{error}",sliderNoCurrent:"\u5F53\u524D\u65E0\u9009\u62E9\u4E2D\u7684\u6A21\u578B\u3002",compatTitle:"\u7AEF\u70B9\u517C\u5BB9",budgetFieldLabel:"\u601D\u8003\u9884\u7B97\u5B57\u6BB5",budgetFieldHint:"\u601D\u8003 token \u9884\u7B97\u7528\u54EA\u4E2A\u53C2\u6570\u53D1\u9001\uFF1A\u90E8\u5206 vLLM\uFF0F\u81EA\u5EFA\u7AEF\u70B9\u8BFB thinking_token_budget\uFF0C\u53E6\u4E00\u4E9B\u8BFB thinking_budget \u6216 thinking_budget_tokens\u3002\u672A\u8BBE\u7F6E\u8868\u793A\u4E09\u4E2A\u90FD\u4E0D\u53D1\u9001\u3002",budgetUnset:"\u672A\u8BBE\u7F6E",defaultEffortLabel:"\u9ED8\u8BA4\u601D\u8003\u5F3A\u5EA6",defaultEffortUnset:"\u8DDF\u968F\u8BB0\u5FC6",defaultEffortHint:"\u6BCF\u4E2A\u65B0\u4F1A\u8BDD\u6253\u5F00\u8BE5\u6A21\u578B\u65F6\u4F7F\u7528\u7684\u6863\u4F4D\u2014\u2014\u4F18\u5148\u4E8E\u8BB0\u4F4F\u7684\u4E0A\u6B21\u6863\u4F4D\u3002\u4F1A\u8BDD\u5185\u624B\u52A8\u9009\u62E9\u7684\u6863\u4F4D\u59CB\u7EC8\u6700\u9AD8\u3002\u7559\u7A7A\u5219\u8DDF\u968F\u8BB0\u5FC6\u94FE\u3002",clearDefaultEffort:"\u6E05\u9664\u9009\u62E9",priorityLabel:"vLLM \u4F18\u5148\u7EA7",priorityPlaceholder:"\u4F8B\u5982 0",priorityHint:"\u4EE5 --priority \u542F\u52A8\u7684\u7AEF\u70B9\u7684\u8C03\u5EA6\u4F18\u5148\u7EA7\uFF0C\u6570\u503C\u8D8A\u5C0F\u8D8A\u5148\u6267\u884C\u3002\u7559\u7A7A\u8868\u793A\u4E0D\u53D1\u9001\u3002",priorityInvalid:"\u4F18\u5148\u7EA7\u5FC5\u987B\u662F\u6574\u6570\u2014\u2014\u4FEE\u6B63\u524D\u4E0D\u4F1A\u4FDD\u5B58\u3002",maxOutputLabel:"\u8BF7\u6C42\u4E2D\u7684 max_output_tokens",maxOutputUnset:"\u672A\u8BBE\u7F6E\u2014\u2014\u8DDF\u968F\u534F\u8BAE\u9ED8\u8BA4",maxOutputOn:"\u53D1\u9001",maxOutputOff:"\u4E0D\u53D1\u9001",maxOutputHint:'\u4EC5\u5BF9 Responses \u534F\u8BAE\u7684\u7F51\u5173\u751F\u6548\uFF0C\u4E14\u53EA\u5728\u8BF7\u6C42\u5E26\u8F93\u51FA\u4E0A\u9650\u65F6\u624D\u8D77\u4F5C\u7528\uFF1A\u90E8\u5206\u7F51\u5173\u4F1A\u62D2\u6536\u8BE5\u53C2\u6570\uFF0C\u9009"\u4E0D\u53D1\u9001"\u53EF\u8BA9\u8BF7\u6C42\u5B8C\u5168\u4E0D\u643A\u5E26\u8F93\u51FA\u4E0A\u9650\u3002\u672A\u8BBE\u7F6E\u662F\u6700\u5B89\u5168\u7684\u9009\u62E9\u3002',aliasMigrated:"\u68C0\u6D4B\u5230\u65E7\u522B\u540D\u2014\u2014\u4FDD\u5B58\u65F6\u4F1A\u5199\u5165\u663E\u5F0F\u9884\u7B97\u5B57\u6BB5\u3002",modelSearchPlaceholder:"\u641C\u7D22\u6A21\u578B\u2026",modelSearchNoMatches:"\u672A\u627E\u5230\u5339\u914D\u6A21\u578B",modelSearchClear:"\u6E05\u7A7A\u641C\u7D22",modelSearchFailed:"\u6A21\u578B\u641C\u7D22\u6E32\u67D3\u5931\u8D25",editorTabsLabel:"\u7F16\u8F91\u5668\u5206\u533A",editorTabProvider:"\u4F9B\u5E94\u5546\u914D\u7F6E",editorTabModels:"\u6A21\u578B\u914D\u7F6E",editorTabAdvanced:"\u9AD8\u7EA7\u914D\u7F6E",keyRevealShow:"\u663E\u793A\u5BC6\u94A5",keyRevealHide:"\u9690\u85CF\u5BC6\u94A5",keyRevealFailed:"\u65E0\u6CD5\u8BFB\u53D6\u5DF2\u4FDD\u5B58\u7684\u5BC6\u94A5",keysLoading:"\u6B63\u5728\u8BFB\u53D6\u5BC6\u94A5\u2026",keysAdd:"\u6DFB\u52A0\u53E6\u4E00\u4E2A\u5BC6\u94A5",keysAddConfirm:"\u6DFB\u52A0",keysEnable:"\u542F\u7528 {name}",keysEnabled:"\u542F\u7528",keysMissing:"\u672A\u5B58\u50A8",keysEdit:"\u4FEE\u6539",keysRemove:"\u5220\u9664",keysConfirmRemove:"\u786E\u8BA4\u5220\u9664",keysCancel:"\u53D6\u6D88",keysSave:"\u4FDD\u5B58",keysAlias:"\u522B\u540D",keysAliasPlaceholder:"\u540D\u79F0\uFF08\u53EF\u9009\uFF09\uFF0C\u4F8B\u5982 \u56E2\u961F",keysValue:"\u5BC6\u94A5",keysValuePlaceholder:"\u7C98\u8D34 API \u5BC6\u94A5",keysNewValuePlaceholder:"\u7C98\u8D34\u65B0\u7684 API \u5BC6\u94A5",keysAddIllegal:"\u5BC6\u94A5\u53EA\u80FD\u662F\u53EF\u6253\u5370 ASCII \u5B57\u7B26\uFF0C\u4E14\u4E0D\u80FD\u5305\u542B\u7A7A\u683C\u3002",keysAdded:"\u5DF2\u4FDD\u5B58\u5BC6\u94A5\u3002",keysRenamed:"\u5DF2\u4FDD\u5B58\u522B\u540D\u3002",keysReplaced:"\u5DF2\u66FF\u6362\u5BC6\u94A5\u3002",keysRemoved:"\u5DF2\u5220\u9664\u5BC6\u94A5\u3002",keysEnabledNote:"\u5DF2\u542F\u7528 {name}\u3002",keysUnreachable:"\u63D2\u4EF6\u7684\u5BC6\u94A5\u63A5\u53E3\u6CA1\u6709\u54CD\u5E94\u3002",keysPanelFailed:"\u5BC6\u94A5\u7BA1\u7406\u9762\u677F\u6E32\u67D3\u5931\u8D25",headersTitle:"\u8BF7\u6C42\u5934",headersHint:"\u8BE5\u8DEF\u7531\u7684\u6BCF\u4E2A\u8BF7\u6C42\u90FD\u4F1A\u643A\u5E26\u81EA\u5B9A\u4E49\u8BF7\u6C42\u5934\u3002",headersEmpty:"\u5C1A\u672A\u914D\u7F6E\u989D\u5916\u8BF7\u6C42\u5934\u3002",headersAdd:"\u6DFB\u52A0\u8BF7\u6C42\u5934",headersName:"\u540D\u79F0",headersNamePlaceholder:"\u4F8B\u5982 x-company",headersValue:"\u503C",headersEdit:"\u7F16\u8F91",headersSave:"\u4FDD\u5B58",headersCancel:"\u53D6\u6D88",headersClear:"\u5168\u90E8\u6E05\u7A7A",headersSaved:"\u5DF2\u4FDD\u5B58\u3002",headersCleared:"\u5DF2\u6E05\u7A7A\u2014\u2014\u8BE5\u8DEF\u7531\u4E0D\u518D\u643A\u5E26\u989D\u5916\u8BF7\u6C42\u5934\u3002",headersReadOnly:"\u5F53\u524D\u8BBE\u7F6E\u6587\u6863\u4E0D\u53EF\u5199\u5165\u3002",headersUserAgentTitle:"User-Agent\uFF08\u7531\u63D2\u4EF6\u5728\u8BF7\u6C42\u5C42\u63A5\u7BA1\uFF09",headersUserAgentHint:"\u5B98\u65B9\u9002\u914D\u5668\u4F1A\u4E22\u5F03\u914D\u7F6E\u7684 user-agent\uFF08\u8BE5\u540D\u79F0\u4FDD\u7559\u7ED9\u5BA2\u6237\u7AEF\u5F52\u5C5E\u6807\u8BC6\uFF09\uFF0C\u6240\u4EE5\u7531\u63D2\u4EF6\u5728\u8BF7\u6C42\u5C42\u8865\u4E0A\u3002\u586B\u4E86\u5C31\u4F1A\u771F\u6B63\u66FF\u6362\u4E0A\u884C\u8BF7\u6C42\u5934\u91CC\u7684 User-Agent\u3002",headersUserAgentClear:"\u4E0D\u8986\u76D6",headersUserAgentPlaceholder:"\u4F8B\u5982 claude-cli/2.1.161 (external, cli)",headersConflictOrigin:"\u540C\u4E00\u4E2A endpoint \u4E0A\u6709\u591A\u4E2A\u8DEF\u7531\u914D\u7F6E\u4E86\u4E0D\u540C\u7684\u8BF7\u6C42\u5934\u503C\uFF1A\u5F53\u8BF7\u6C42\u4F53\u91CC\u7684\u6A21\u578B\u65E0\u6CD5\u552F\u4E00\u5B9A\u4F4D\u5176\u4E2D\u4E00\u4E2A\u8DEF\u7531\u65F6\uFF0C\u8BE5\u8BF7\u6C42\u56DE\u9000\u5230\u7B2C\u4E00\u4E2A\u8DEF\u7531\u7684\u914D\u7F6E\u3002",headersConflictPatched:"\u68C0\u6D4B\u5230\u5B98\u65B9 dsh-llm-pi-ai \u5DF2\u5728\u8BF7\u6C42\u5C42\u5904\u7406\u8BF7\u6C42\u5934\uFF1A\u628A\u503C\u586B\u5728\u4E0A\u65B9\u8BF7\u6C42\u5934\u914D\u7F6E\u4E2D\u5373\u53EF\uFF0C\u65E0\u9700\u91CD\u590D\u63A5\u7BA1\u3002",headersConflictSiblings:"\u68C0\u6D4B\u5230\u4F1A\u6539\u5199\u540C\u4E00\u5C42\u7684\u540C\u7C7B\u63D2\u4EF6\uFF1A{names}\u3002\u540C\u4E00\u65F6\u95F4\u53EA\u5E94\u542F\u7528\u4E00\u79CD\u8BF7\u6C42\u5934\u6539\u5199\uFF0C\u5426\u5219\u7EBF\u4E0A\u751F\u6548\u7684\u662F\u6700\u540E\u5199\u5165\u8005\u3002",headersError:"\u4FDD\u5B58\u5931\u8D25\uFF1A{error}",headersNoRoute:"\u8BE5\u8DEF\u7531\u5DF2\u4E0D\u5728\u8BBE\u7F6E\u6587\u6863\u4E2D\u2014\u2014\u8BF7\u5148\u4FDD\u5B58\u4E00\u6B21\u5B98\u65B9\u5361\u7247\u3002",providerReorderAria:"\u62D6\u52A8\u6392\u5E8F\uFF1A{provider}",providerReorderHint:"\u62D6\u52A8\u8C03\u6574\u4F9B\u5E94\u5546\u987A\u5E8F\u2014\u2014\u6A21\u578B\u5207\u6362\u6309\u6B64\u987A\u5E8F\u663E\u793A\u3002",providerToggleAria:"\u542F\u7528 {provider}",providerToggleHint:"\u7981\u7528\u540E\u8BE5\u4F9B\u5E94\u5546\u4E0D\u5728\u6A21\u578B\u5207\u6362\u5217\u8868\u4E2D\u663E\u793A\u3002",providerRemoveDisabled:"\u5220\u9664",providerRemoveLocked:"\u5185\u7F6E\u4F9B\u5E94\u5546\u4E0D\u53EF\u5220\u9664\u3002",modelReorderAria:"\u62D6\u52A8\u6392\u5E8F\uFF1A{model}",modelReorderHint:"\u62D6\u52A8\u8C03\u6574\u8BE5\u4F9B\u5E94\u5546\u5185\u6A21\u578B\u987A\u5E8F\u2014\u2014\u6A21\u578B\u5207\u6362\u6309\u6B64\u987A\u5E8F\u663E\u793A\u3002"};var Wt="dsh-model-think-level.slider.enabled",Oa=["dsh-reasoning-effort.enabled","@dsh-external/dsh-reasoning-effort.enabled"],gt=_a();function _a(){try{let e=window.localStorage.getItem(Wt),t=e===null?Oa.map(n=>window.localStorage.getItem(n)).find(n=>n!==null):null;return(e??t??null)!=="false"}catch{return!0}}var Un=new Set;function so(){for(let e of[...Un])e()}function ce(){return gt}function ao(e){if(gt!==e){gt=e;try{window.localStorage.setItem(Wt,String(e))}catch{}so()}}function lo(e){gt!==e&&(gt=e,so())}function Bt(e){return Un.add(e),()=>{Un.delete(e)}}var qt="dsh-model-think-level.provider-order",uo=["deepseek-account","deepseek-official"];function nt(e){if(e===null)return[];try{let t=JSON.parse(e);return Array.isArray(t)?zn(t.filter(n=>typeof n=="string")):[]}catch{return[]}}function zn(e){let t=new Set,n=[];for(let r of e)r.length===0||t.has(r)||(t.add(r),n.push(r));return n}var tt=(()=>{try{return nt(window.localStorage.getItem(qt))}catch{return[]}})(),jn=new Set;function fo(){for(let e of[...jn])e()}function co(e,t){return e.length===t.length&&e.every((n,r)=>n===t[r])}function Gn(){return tt}function po(e){let t=zn(e);if(!co(tt,t)){tt=t;try{window.localStorage.setItem(qt,JSON.stringify(tt))}catch{}fo()}}function mo(e){let t=zn(e);co(tt,t)||(tt=t,fo())}function Ut(e){return jn.add(e),()=>{jn.delete(e)}}function $n(e){let t=n=>{let r=uo.indexOf(n);return r<0?uo.length:r};return e.map((n,r)=>({id:n,index:r,rank:t(n)})).sort((n,r)=>n.rank-r.rank||n.index-r.index).map(n=>n.id)}function rt(e,t){let n=new Map;for(let s of t)n.has(s)||n.set(s,n.size);let r=[],o=[];e.forEach((s,a)=>{n.has(s)&&(r.push(a),o.push(s))}),o.sort((s,a)=>n.get(s)-n.get(a));let i=[...e];return r.forEach((s,a)=>{i[s]=o[a]}),i}function go(e){return rt($n(e),Gn())}function Vn(e,t,n){let r=e.indexOf(t);if(r<0)return[...e];let o=[...e];o.splice(r,1);let i=Math.max(0,Math.min(o.length,n));return o.splice(i,0,t),o}var jt="dsh-model-think-level.providers.disabled",Yn=new Set,Re=Na();function Na(){try{return nt(window.localStorage.getItem(jt))}catch{return[]}}function ho(e){return nt(e)}function bo(){return Re}function zt(e){return!Re.includes(e)}function yo(e,t){let n=!Re.includes(e);t!==n&&vo(t?Re.filter(r=>r!==e):[...Re,e],!0)}function wo(e){vo(e,!1)}function Gt(e){return Yn.add(e),()=>{Yn.delete(e)}}function Ia(e,t){return e.length!==t.length?!1:e.every(n=>t.includes(n))}function vo(e,t){if(!Ia(Re,e)){if(Re=[...new Set(e)],t)try{window.localStorage.setItem(jt,JSON.stringify(Re))}catch{}for(let n of[...Yn])n()}}var $t="dsh-model-think-level.model-order";function Xn(e){if(e===null)return{};try{let t=JSON.parse(e);if(t===null||typeof t!="object"||Array.isArray(t))return{};let n={};for(let[r,o]of Object.entries(t)){if(r.length===0||!Array.isArray(o))continue;let i=xo(o.filter(s=>typeof s=="string"));i.length>0&&(n[r]=i)}return n}catch{return{}}}function xo(e){let t=new Set,n=[];for(let r of e)r.length===0||t.has(r)||(t.add(r),n.push(r));return n}var We=(()=>{try{return Xn(window.localStorage.getItem($t))}catch{return{}}})(),Jn=new Set;function ko(){for(let e of[...Jn])e()}function Da(e,t){return e.length===t.length&&e.every((n,r)=>n===t[r])}function Ca(){try{window.localStorage.setItem($t,JSON.stringify(We))}catch{}}function Eo(){return We}function To(e){return We[e]??Pa}var Pa=[];function Lo(e,t){if(e.length===0)return;let n=xo(t),r=To(e);if(Da(r,n)&&(n.length>0||!(e in We)))return;let o={...We};n.length===0?delete o[e]:o[e]=n,We=o,Ca(),ko()}function Mo(e){We=e,ko()}function Vt(e){return Jn.add(e),()=>{Jn.delete(e)}}function Fa(e,t){return rt(e,t)}function So(e,t){return rt(t,To(e))}function Ao(e,t){if(e.length===0||t.length===0)return e;let n=new Map(e.map(r=>[r.id,r]));return Fa(e.map(r=>r.id),t).map(r=>n.get(r))}var Ro=`
/* The injector's mount wrapper. It \u2014 not the editor inside it \u2014 is the item
   placed into the official row disclosure's repeat(auto-fit, minmax(160px,1fr))
   grid (context window and max tokens take two cells), so the span belongs
   here: on the editor itself it would target the wrapper's block box and be
   ignored, squeezing the block into one cell. */
.bre-effort-slot {
  grid-column: 1 / -1;
}
/* The slot wrapper is a plain column: the master thinking switch sits in it,
   directly above the card it gates. */
.bre-effort-editor {
  display: flex;
  flex-direction: column;
  gap: 8px;
  margin: 8px 0 4px;
}
/* The \u601D\u8003\u5F3A\u5EA6 card proper \u2014 rendered only while the master switch is on. */
.bre-effort-card {
  display: flex;
  flex-direction: column;
  gap: 8px;
  padding: 10px 12px;
  border: 0.5px solid var(--dsw-alias-border-l2);
  border-radius: 8px;
  background: var(--dsw-alias-bg-layer-2);
  box-sizing: border-box;
}
.bre-effort-head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 8px;
}
.bre-effort-title {
  font-size: 12px;
  font-weight: 600;
  color: var(--dsw-alias-label-secondary);
}
.bre-link-button {
  background: none;
  border: none;
  padding: 2px 6px;
  font-size: 12px;
  color: var(--dsw-alias-link);
  cursor: pointer;
  border-radius: 4px;
}
.bre-link-button:hover { text-decoration: underline; }
.bre-link-button:disabled { opacity: 0.5; cursor: default; text-decoration: none; }
.bre-auto-effort {
  /* Seated in the OFFICIAL catalogue head, among the host's own controls, so it
     wears THEIR metrics instead of the plugin's blue underlined link look
     (user request: "\u4E0D\u8981\u8D85\u94FE\u63A5\u6837\u5F0F\uFF0C\u8DDF\u53E6\u5916\u4E24\u4E2A\u4FDD\u6301\u4E00\u81F4"). These values mirror
     the host's own linkButton rule; the seat cannot simply take that class,
     because it would then answer the probe that finds the anchor it sits after.
     No extra margin: the head's own 12px gap already spaces it exactly like the
     controls beside it. */
  box-sizing: border-box;
  display: inline-flex;
  align-items: center;
  height: 28px;
  padding: 0 10px;
  border: none;
  border-radius: var(--dsw-radius-sm, 8px);
  background: none;
  color: var(--dsw-alias-label-tertiary, #6b7280);
  font: inherit;
  font-size: 12px;
  line-height: 18px;
  cursor: pointer;
  flex: none;
}
.bre-auto-effort:hover {
  background: var(--dsw-alias-interactive-bg-hover, #2631480f);
  color: var(--dsw-alias-label-secondary, #374151);
}
.bre-effort-grid {
  /* Exactly two equal columns mirroring the official capacity pair the editor
     sits under; an odd row count leaves the last cell in the left column,
     so the left side carries the extra level. */
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 4px 16px;
}
.bre-effort-row {
  display: grid;
  grid-template-columns: 20px 76px minmax(0, 1fr);
  align-items: center;
  gap: 6px;
  font-size: 12px;
}
.bre-effort-row input[type='checkbox'] {
  /* Bigger than the browser default (~13px): a tap/point target that does
     not require precision, in the theme accent when checked. */
  width: 18px;
  height: 18px;
  margin: 0;
  accent-color: var(--dsw-alias-brand-primary);
  cursor: pointer;
}
.bre-effort-level { color: var(--dsw-alias-label-tertiary); }
.bre-effort-wire {
  box-sizing: border-box;
  min-width: 0;
  height: 24px;
  padding: 0 6px;
  border: 0.5px solid var(--dsw-alias-border-l4);
  border-radius: 4px;
  background: var(--dsw-alias-bg-layer-1);
  color: var(--dsw-alias-label-primary);
  font: inherit;
  font-size: 12px;
}
.bre-effort-wire:focus {
  outline: none;
  border-color: var(--dsw-alias-brand-primary);
}
.bre-effort-empty { min-height: 24px; }
.bre-effort-actions {
  display: flex;
  gap: 8px;
  justify-content: flex-end;
}
.bre-secondary-button {
  height: 26px;
  padding: 0 12px;
  border-radius: 6px;
  font-size: 12px;
  cursor: pointer;
  border: 0.5px solid var(--dsw-alias-border-l3);
}
.bre-secondary-button:disabled { opacity: 0.5; cursor: default; }
.bre-secondary-button { background: transparent; color: inherit; }
.bre-effort-message { font-size: 12px; margin: 0; }
.bre-effort-message.bre-error { color: #c62828; }
.bre-effort-message.bre-info { color: var(--dsw-alias-link); }
.bre-effort-note { font-size: 11px; margin: 0; color: var(--dsw-alias-label-tertiary); }
/* ---- Input-modality section ---- */
.bre-modality {
  display: flex;
  flex-direction: column;
  gap: 4px;
}
.bre-modality-row {
  display: flex;
  align-items: center;
  gap: 6px;
  font-size: 12px;
}
.bre-modality-row input[type='checkbox'] {
  width: 18px;
  height: 18px;
  margin: 0;
  accent-color: var(--dsw-alias-brand-primary);
  cursor: pointer;
}
.bre-modality-clear { margin-left: auto; }
.bre-modality-note { font-size: 11px; margin: 0; color: var(--dsw-alias-label-tertiary); }
/* The master thinking switch, which lives OUTSIDE the card it gates: with it
   off that card is not rendered at all, so nothing here has to be hidden. */
.bre-thinking-switch { margin: 0; }
/* ---- Endpoint-compatibility controls ----
   Same shape as the official capacity fields the editor sits under: a caption
   above the control, the control capped at the official enum width (a field
   width dropdown reads as a text field the user is expected to fill), and a
   hint line beneath. Tokens are the official ones \u2014 the plugin's own --dsh-*
   names are defined nowhere in this app, so their light-mode literals used to
   render in both themes. */
.bre-compat {
  display: flex;
  flex-direction: column;
  gap: 10px;
}
.bre-compat-row {
  display: flex;
  flex-direction: column;
  gap: 4px;
  min-width: 0;
}
.bre-compat-field { display: flex; flex-direction: column; gap: 4px; min-width: 0; }
.bre-compat-label {
  font-size: 12px;
  line-height: 18px;
  color: var(--dsw-alias-label-tertiary);
}
.bre-compat-hint {
  font-size: 11px;
  line-height: 16px;
  color: var(--dsw-alias-label-tertiary);
}
.bre-select, .bre-text-input {
  box-sizing: border-box;
  width: 100%;
  max-width: 240px;
  height: 32px;
  padding: 0 10px;
  border: 0.5px solid var(--dsw-alias-border-l4);
  border-radius: 8px;
  background: var(--dsw-alias-bg-layer-1);
  color: var(--dsw-alias-label-primary);
  font: inherit;
  font-size: 14px;
  line-height: 22px;
}
.bre-text-input::placeholder { color: var(--dsw-alias-label-dimmed); }
.bre-select:focus, .bre-text-input:focus {
  outline: none;
  border-color: var(--dsw-alias-brand-primary);
}
.bre-select:disabled, .bre-text-input:disabled { opacity: 0.6; cursor: default; }
.bre-select {
  cursor: pointer;
  /* The OS arrow sits flush against the right edge; the official select swaps
     it for the shared 12px chevron inset on the same right pad. Data-URI SVGs
     cannot resolve CSS variables, so the stroke is the caption gray both
     themes share. */
  appearance: none;
  padding-right: 32px;
  background-image: url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='12' height='12' viewBox='0 0 12 12' fill='none'%3E%3Cpath d='M3 4.5L6 7.5L9 4.5' stroke='%2381858C' stroke-width='1.5' stroke-linecap='round' stroke-linejoin='round'/%3E%3C/svg%3E");
  background-repeat: no-repeat;
  background-position: right 12px center;
  background-size: 12px 12px;
}
.bre-error { color: var(--dsw-alias-state-error-primary); }
/* ---- Zoned suggestion display ---- */
.bre-suggestion {
  display: flex;
  flex-direction: column;
  gap: 3px;
}
.bre-reference {
  display: flex;
  flex-wrap: wrap;
  align-items: baseline;
  gap: 4px 14px;
  padding: 6px 8px;
  border: 1px dashed var(--dsw-alias-border-l3);
  border-radius: 6px;
  font-size: 11px;
  color: var(--dsw-alias-label-tertiary);
}
.bre-reference-title { font-weight: 600; }
.bre-reference-values { display: inline-flex; gap: 14px; }
/* ---- Composer model-menu slider (mounted inside the OFFICIAL menu) ----
   Visuals ported VERBATIM from HanaAyane's dsh-reasoning-effort (MIT) \u2014 the
   only deliberate difference is the chibi-runner "big fish" knob, which is
   dropped so the knob is always the white circle. Class names are re-
   prefixed bre- (the upstream's re- prefix would clash while both plugins
   are installed); every color/size/animation value stays upstream's. */
.bre-slider-body {
  /* The replicated popover body. The official menu shell carries padding: 4px
     (ModelSelect.module.css), so pull the replica flush to the box. overflow
     stays VISIBLE: an open list is laid out inside the body, so nothing ever
     has to escape it, and the rows' own hover radius needs no clipping. */
  overflow: visible;
  margin: -4px;
  padding: 8px;
  display: flex;
  flex-direction: column;
  gap: 8px;
}
/* The official menu is content-sized; while the replicated popover body is
   live, its box takes the upstream .re-model-menu width. The class is added
   by the mount and removed when the slider is switched off. */
.bre-model-menu-host {
  width: min(340px, calc(100vw - 32px));
  min-width: 0;
}
/* The official trigger keeps ownership of its model/effort children. The
   provider prefix is a pseudo-element so host React updates, focus handling and
   the click target remain untouched.

   Scoped to the composer, which owns the only button that carries this stamp.
   The settings sidebar's account button is ALSO an [aria-haspopup="menu"]
   button, so an unscoped rule paints the prefix onto the account row the
   moment a stale stamp lands there \u2014 and a stamp that escaped the composer
   must render nothing rather than relabel a host control. The seat anchor is
   listed too, so a shell that renders the trigger outside the card body still
   gets the prefix. */
[data-composer-card] button[data-bre-provider]::before,
[data-slot="conversation.input.model"] button[data-bre-provider]::before {
  content: attr(data-bre-provider) " \xB7 ";
  flex: none;
  color: var(--dsw-alias-label-secondary);
  font-weight: 400;
  white-space: nowrap;
}

/* ---- Model / reasoning-level rows ----
   Presentation follows dsh-tauri-model-config's settings rows
   (src/client/models/styles.ts: .zGbnIq_rowCard / .zGbnIq_rowHead /
   .zGbnIq_iconButton): hairline separators between rows and a list opening
   under the row it belongs to. Re-prefixed bre- and routed through the tokens
   this file already uses. */
/* Layout only \u2014 it deliberately paints NO background, border, radius or
   overflow clip. The replica is mounted inside the OFFICIAL menu, and that
   shell already draws its own surface (MenuSurface: a [data-menu-material]
   panel whose .material child paints --dsw-menu-surface-fill, i.e.
   --dsw-specific-menu, under backdrop-filter: var(--dsw-menu-backdrop-filter),
   rounded by --dsw-radius-lg and outlined by --dsw-elevation-prominent).
   A second opaque card in here shows that official surface as a grey frame
   around it \u2014 two stacked surfaces where every other menu in the app has one. */
.bre-card {
  display: flex;
  flex-direction: column;
}
.bre-row-control {
  appearance: none;
  box-sizing: border-box;
  display: flex;
  align-items: center;
  gap: 8px;
  width: 100%;
  min-height: 38px;
  padding: 0 10px;
  border: 0;
  /* Matches the official menu cells (.u91W7W_cell / .u91W7W_option use
     --dsw-radius-md, 8px here) and the .bre-option rows below, now that the
     surface behind the rows is the menu's own and hover is no longer clipped
     by a card. */
  border-radius: 8px;
  background: transparent;
  color: inherit;
  font: inherit;
  text-align: left;
  cursor: pointer;
  transition: background 120ms ease;
}
.bre-row-control:hover:not(:disabled) {
  background: var(--dsw-alias-interactive-bg-hover, rgba(120, 125, 140, .09));
}
.bre-row-control.is-open { background: var(--dsw-alias-fill-tertiary, rgba(120, 125, 140, .09)); }
.bre-row-control:disabled { cursor: default; opacity: .6; }
.bre-row-control:focus-visible {
  outline: none;
  box-shadow: inset 0 0 0 2px var(--dsw-alias-border-l3);
}
.bre-row-label {
  flex: none;
  font-size: 13px;
  line-height: 20px;
  color: var(--dsw-alias-label-secondary);
}
.bre-row-value {
  flex: 1 1 auto;
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  text-align: right;
  font-size: 13px;
  line-height: 20px;
  font-weight: 500;
  color: var(--dsw-alias-label-primary);
}
.bre-row-value.is-muted { font-weight: 400; color: var(--dsw-alias-label-tertiary); }
.bre-divider { height: 1px; margin: 0 10px; background: var(--dsw-alias-border-l4); }
.bre-panel {
  display: flex;
  flex-direction: column;
  gap: 2px;
  max-height: 220px;
  overflow-y: auto;
  padding: 2px 6px 8px;
}
/* Provider column + model column of the model list, side by side. The height is
   FIXED: switching provider must not resize the card, or every click would need
   another same-frame re-place and any missed one shows as a jump. */
.bre-panel-models {
  flex-direction: row;
  align-items: stretch;
  gap: 0;
  height: 240px;
  max-height: none;
  overflow: hidden;
  padding: 4px 6px 8px;
}
.bre-providers {
  flex: none;
  display: flex;
  flex-direction: column;
  gap: 2px;
  width: 112px;
  overflow-y: auto;
  padding-right: 2px;
}
.bre-provider-models {
  flex: 1 1 auto;
  min-width: 0;
  display: flex;
  flex-direction: column;
  gap: 2px;
  overflow-y: auto;
  margin-left: 6px;
  padding-left: 6px;
  border-left: 1px solid var(--dsw-alias-border-l4);
}
.bre-option,
.bre-provider {
  appearance: none;
  box-sizing: border-box;
  display: flex;
  align-items: center;
  gap: 8px;
  width: 100%;
  min-height: 30px;
  padding: 0 8px;
  border: 0;
  border-radius: 8px;
  background: transparent;
  color: inherit;
  font: inherit;
  font-size: 13px;
  line-height: 20px;
  text-align: left;
  cursor: pointer;
  transition: background 120ms ease, color 120ms ease;
}
/* The provider cell carries its chevron hard against the right edge. */
.bre-provider { gap: 4px; padding: 0 4px 0 8px; }
.bre-option:hover:not(:disabled),
.bre-provider:hover:not(:disabled) {
  background: var(--dsw-alias-interactive-bg-hover, rgba(120, 125, 140, .09));
}
.bre-option:disabled,
.bre-provider:disabled { cursor: default; opacity: .6; }
.bre-option:focus-visible,
.bre-provider:focus-visible {
  outline: none;
  box-shadow: inset 0 0 0 2px var(--dsw-alias-border-l3);
}
.bre-option-name {
  flex: 1 1 auto;
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.bre-option.is-active {
  color: var(--dsw-static-deepseek-500, #4d70ff);
  font-weight: 500;
  background: var(--dsw-alias-fill-tertiary, rgba(120, 125, 140, .09));
}
/* The open provider is the highlighted one; the provider of the CURRENT model
   keeps the accent so the column says where the selection lives. */
.bre-provider.is-open { background: var(--dsw-alias-fill-tertiary, rgba(120, 125, 140, .09)); }
.bre-provider.is-current .bre-option-name {
  color: var(--dsw-static-deepseek-500, #4d70ff);
  font-weight: 500;
}
.bre-provider .bre-row-chevron { width: 14px; height: 14px; font-size: 14px; }
/* Capability badges on a model row (image input / thinking). Muted so the name
   stays the brightest thing in the row; the badge's own title carries the copy. */
.bre-option-tags {
  flex: none;
  display: inline-flex;
  align-items: center;
  gap: 6px;
  color: var(--dsw-alias-label-tertiary);
}
.bre-option.is-active .bre-option-tags { color: var(--dsw-static-deepseek-500, #4d70ff); }
.bre-tag { display: inline-flex; align-items: center; }
.bre-tag-icon { display: block; width: 13px; height: 13px; }
.bre-option-check { flex: none; width: 14px; height: 14px; }
.bre-empty { padding: 6px 8px; font-size: 12px; color: var(--dsw-alias-label-tertiary); }
/* ---- Truncated-label tooltip (custom, replaces the native title) ----
   A self-drawn bubble instead of the OS tooltip, which the page cannot style
   and which reads harsh next to the menu. Fixed-positioned on <body> so the
   menu's own overflow/clip cannot cut it, aligned under the truncated span,
   capped to the viewport with wrap for very long names. */
.bre-tip {
  position: fixed;
  z-index: 2147483647;
  max-width: min(360px, calc(100vw - 24px));
  box-sizing: border-box;
  padding: 5px 9px;
  border-radius: 8px;
  background: var(--dsw-alias-bg-module-platform, #232630);
  color: var(--dsw-alias-label-primary, #f2f3f5);
  font-size: 12px;
  line-height: 18px;
  overflow-wrap: anywhere;
  white-space: normal;
  pointer-events: none;
  box-shadow: 0 4px 16px rgba(0, 0, 0, .22);
  animation: bre-tip-in 120ms ease-out;
}
body:not([data-ds-dark-theme]) .bre-tip {
  background: #ffffff;
  color: var(--dsw-alias-label-primary, #1f2329);
  box-shadow: 0 4px 16px rgba(0, 0, 0, .14), 0 0 0 .5px var(--dsw-alias-border-l4, rgba(0, 0, 0, .1));
}
@keyframes bre-tip-in {
  from { opacity: 0; transform: translateY(-2px); }
  to { opacity: 1; transform: translateY(0); }
}
@media (prefers-reduced-motion: reduce) {
  .bre-tip { animation: none; }
}
.bre-slider-advanced {
  /* upstream .re-advanced: the padded area that hosts the slider */
  padding: 14px;
}
.bre-effort {
  display: flex;
  align-items: center;
  width: 100%;
  min-width: 0;
  height: 32px;
  color: var(--dsw-alias-label-secondary);
  user-select: none;
  box-sizing: border-box;
}
.bre-effort-slider {
  --bre-progress: 50%;
  position: relative;
  width: 100%;
  height: 30px;
  flex: 1 1 auto;
  border-radius: 999px;
  isolation: isolate;
  transition: filter 180ms ease;
}
.bre-effort-track {
  position: absolute;
  inset: 0;
  overflow: hidden;
  border-radius: inherit;
  background: linear-gradient(100deg, #03040a 0%, #071126 22%, #101d4c 45%, #302262 70%, #5d35a0 100%);
  box-shadow:
    inset 0 1px 0 rgba(189, 199, 255, .15),
    inset 0 -1px 0 rgba(0, 0, 0, .55),
    0 3px 10px rgba(12, 17, 55, .34);
}
.bre-effort-track::after {
  content: "";
  position: absolute;
  inset: 0;
  background:
    radial-gradient(circle at 18% 45%, rgba(82, 130, 255, .12), transparent 24%),
    linear-gradient(90deg, rgba(0, 0, 0, .28), transparent 42%, rgba(168, 113, 255, .12));
  pointer-events: none;
}
.bre-effort-fx {
  position: absolute;
  z-index: 1;
  inset: 0;
  overflow: hidden;
  border-radius: inherit;
  pointer-events: none;
}
.bre-effort-canvas {
  position: absolute;
  z-index: 2;
  inset: 0;
  width: 100%;
  height: 100%;
  opacity: 1;
  image-rendering: pixelated;
  mix-blend-mode: screen;
  transition: filter 140ms ease;
}
.bre-effort-flare {
  position: absolute;
  z-index: 3;
  top: 50%;
  left: var(--bre-progress);
  width: 78px;
  height: 46px;
  border-radius: 50%;
  background: radial-gradient(ellipse at 100% 50%, rgba(255,255,255,.96) 0 4%, rgba(188,189,255,.8) 11%, rgba(106,87,255,.5) 28%, rgba(105,31,255,.2) 49%, transparent 74%);
  filter: blur(2px) saturate(1.25);
  mix-blend-mode: screen;
  transform: translate(-100%, -50%);
  transition: left 70ms linear, filter 140ms ease;
  pointer-events: none;
}
.bre-effort-flare::before,
.bre-effort-flare::after {
  content: "";
  position: absolute;
  inset: 50% auto auto 100%;
  border-radius: 999px;
  transform: translate(-50%, -50%);
}
.bre-effort-flare::before {
  width: 52px;
  height: 1px;
  background: linear-gradient(90deg, transparent, rgba(100,160,255,.42), #f1ecff, rgba(193,82,255,.65), transparent);
  box-shadow: 0 0 7px #9b7cff, 0 0 13px rgba(72,132,255,.64);
}
.bre-effort-flare::after {
  width: 1px;
  height: 20px;
  background: linear-gradient(180deg, transparent, rgba(196,190,255,.84), transparent);
  box-shadow: 0 0 7px #9c7cff;
}
.bre-effort-knob {
  position: absolute;
  z-index: 4;
  top: 50%;
  left: clamp(14px, var(--bre-progress), calc(100% - 14px));
  width: 28px;
  height: 28px;
  border: 1px solid rgba(255,255,255,.94);
  border-radius: 50%;
  background: #fff;
  box-shadow:
    0 0 0 2px rgba(92,105,255,.12),
    0 0 14px rgba(121,82,255,.48),
    0 2px 7px rgba(0,0,0,.3);
  transform: translate(-50%, -50%);
  transition: left 190ms cubic-bezier(.22,1,.36,1), transform 160ms ease, box-shadow 180ms ease;
  pointer-events: none;
}
.bre-effort-input {
  position: absolute;
  z-index: 5;
  inset: -5px 0;
  width: 100%;
  height: calc(100% + 10px);
  margin: 0;
  opacity: 0;
  cursor: grab;
  touch-action: none;
}
.bre-effort-input:active { cursor: grabbing; }
.bre-effort-input:focus-visible + .bre-effort-knob {
  outline: 2px solid var(--dsw-static-blue-400);
  outline-offset: 2px;
}
.bre-effort.is-dragging .bre-effort-canvas {
  filter: saturate(1.45) brightness(1.28) contrast(1.06);
}
.bre-effort.is-dragging .bre-effort-flare {
  filter: blur(1.5px) saturate(1.6) brightness(1.42);
  transition: none;
}
.bre-effort.is-dragging .bre-effort-knob {
  transform: translate(-50%, -50%) scale(1.07);
  transition: none;
  box-shadow:
    0 0 0 3px rgba(113,115,255,.25),
    0 0 20px rgba(74,145,255,.86),
    0 0 31px rgba(171,53,255,.66),
    0 3px 8px rgba(0,0,0,.32);
}
.bre-effort-slider[data-top] .bre-effort-track {
  animation: bre-effort-dark-breathe 1.9s ease-in-out infinite;
}
.bre-effort-slider[data-top] .bre-effort-knob {
  box-shadow:
    0 0 0 3px rgba(119,99,255,.18),
    0 0 22px rgba(135,78,255,.76),
    0 0 34px rgba(53,121,255,.34),
    0 3px 8px rgba(0,0,0,.3);
}
.bre-effort.is-error .bre-effort-slider {
  outline: 1px solid var(--dsw-alias-state-error-secondary);
  outline-offset: 2px;
}
.bre-effort.is-busy { opacity: .72; }
.bre-effort-sr {
  position: absolute;
  width: 1px;
  height: 1px;
  padding: 0;
  margin: -1px;
  overflow: hidden;
  clip: rect(0, 0, 0, 0);
  white-space: nowrap;
  border: 0;
}
body:not([data-ds-dark-theme]) .bre-effort-slider {
  filter: none;
}
body:not([data-ds-dark-theme]) .bre-effort-track {
  background: var(--dsw-static-blue-75, #e5f0ff);
  box-shadow:
    inset 0 1px 0 rgba(255,255,255,.9),
    inset 0 0 0 1px rgba(80,133,194,.14),
    0 3px 10px rgba(48,101,165,.13);
}
body:not([data-ds-dark-theme]) .bre-effort-track::before {
  content: "";
  position: absolute;
  z-index: 0;
  inset: 0 auto 0 0;
  width: var(--bre-progress);
  border-radius: inherit;
  background: linear-gradient(90deg, #fff 0%, #e2f0ff 20%, #a8d0fb 57%, #438fdf 100%);
  transition: width 190ms cubic-bezier(.22,1,.36,1);
}
body:not([data-ds-dark-theme]) .bre-effort-slider[data-top] .bre-effort-track::before {
  background: linear-gradient(90deg, #fff 0%, #d7eaff 18%, #75afea 54%, #0751ad 100%);
}
body:not([data-ds-dark-theme]) .bre-effort.is-dragging .bre-effort-track::before {
  transition: none;
}
body:not([data-ds-dark-theme]) .bre-effort-track::after {
  z-index: 1;
  background: linear-gradient(90deg, rgba(255,255,255,.48), transparent 34%, rgba(23,101,201,.07));
}
body:not([data-ds-dark-theme]) .bre-effort-canvas {
  opacity: .78;
  mix-blend-mode: multiply;
}
body:not([data-ds-dark-theme]) .bre-effort-flare {
  background: radial-gradient(ellipse at 100% 50%, rgba(255,255,255,.98) 0 5%, rgba(204,231,255,.88) 13%, rgba(91,162,241,.48) 31%, rgba(37,111,207,.16) 53%, transparent 75%);
  filter: blur(2px) saturate(1.12);
}
body:not([data-ds-dark-theme]) .bre-effort-flare::before {
  background: linear-gradient(90deg, transparent, rgba(116,177,244,.34), #fff, rgba(66,139,225,.58), transparent);
  box-shadow: 0 0 7px rgba(58,133,222,.5), 0 0 13px rgba(104,176,255,.38);
}
body:not([data-ds-dark-theme]) .bre-effort-flare::after {
  background: linear-gradient(180deg, transparent, rgba(255,255,255,.94), transparent);
  box-shadow: 0 0 7px rgba(64,137,224,.44);
}
body:not([data-ds-dark-theme]) .bre-effort-knob {
  border-color: rgba(126,160,197,.32);
  box-shadow:
    0 0 0 2px rgba(58,124,207,.09),
    0 0 13px rgba(48,118,207,.3),
    0 3px 8px rgba(39,77,119,.18);
}
body:not([data-ds-dark-theme]) .bre-effort-slider[data-top] .bre-effort-track {
  animation-name: bre-effort-light-breathe;
}
body:not([data-ds-dark-theme]) .bre-effort-slider[data-top] .bre-effort-knob,
body:not([data-ds-dark-theme]) .bre-effort.is-dragging .bre-effort-knob {
  box-shadow:
    0 0 0 3px rgba(36,105,192,.15),
    0 0 20px rgba(25,100,201,.45),
    0 3px 8px rgba(39,77,119,.18);
}
@keyframes bre-effort-dark-breathe {
  0%, 100% { box-shadow: inset 0 1px 0 rgba(196,204,255,.16), 0 3px 10px rgba(18,25,72,.4); }
  50% { box-shadow: inset 0 1px 0 rgba(220,214,255,.24), 0 0 21px rgba(111,66,255,.5); }
}
@keyframes bre-effort-light-breathe {
  0%, 100% { box-shadow: inset 0 1px 0 rgba(255,255,255,.9), inset 0 0 0 1px rgba(67,124,193,.16), 0 3px 10px rgba(48,101,165,.13); }
  50% { box-shadow: inset 0 1px 0 rgba(255,255,255,.96), inset 0 0 0 1px rgba(31,102,190,.22), 0 0 19px rgba(31,105,201,.24); }
}
.bre-slider-hint {
  /* upstream re-model-status */
  display: block;
  padding: 14px;
  color: var(--dsw-alias-label-tertiary, #9296a0);
  font-size: 12px;
  text-align: center;
}
/* upstream re-model-error: the directory/store error line under the row */
.bre-model-error {
  margin: 8px;
  padding: 8px 10px;
  border-radius: 8px;
  color: var(--dsw-alias-state-error-primary, #c83e4d);
  background: var(--dsw-alias-state-error-tertiary, rgba(220,55,70,.08));
  font-size: 11px;
}
/* upstream .re-menu-separator */
.bre-menu-separator {
  height: 1px;
  background: var(--dsw-alias-stroke-secondary, rgba(121,126,145,.16));
}
/* upstream .re-model-row: name \xB7 current effort \u203A (click \u2192 official model list) */
.bre-model-row {
  display: grid;
  grid-template-columns: minmax(0, 1fr) auto auto;
  align-items: center;
  gap: 8px;
  min-height: 45px;
  padding: 0 14px;
  width: 100%;
  border: 0;
  color: inherit;
  background: transparent;
  font: inherit;
  text-align: left;
  cursor: pointer;
}
.bre-model-row:hover { background: var(--dsw-alias-fill-tertiary, rgba(120,125,140,.09)); }
.bre-model-row-name { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; font-size: 13px; }
.bre-model-row-effort { color: var(--dsw-static-deepseek-500, #4d70ff); font-size: 12px; }
.bre-row-chevron {
  flex: none;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 16px;
  height: 16px;
  font-size: 18px;
  line-height: 1;
  color: var(--dsw-alias-label-tertiary);
  transform: rotate(0deg);
  transition: transform 120ms ease;
}
.bre-row-chevron.is-open { transform: rotate(90deg); }
@media (prefers-reduced-motion: reduce) {
  .bre-effort-slider[data-top] .bre-effort-track { animation: none; }
  .bre-effort-knob,
  .bre-effort-flare,
  body:not([data-ds-dark-theme]) .bre-effort-track::before { transition: none; }
}
/* ---- Models-page slider toggle (boxed setting item) ----
   Item form ported VERBATIM from upstream .re-setting-row; the surrounding
   box is the requested container (border only, transparent background). */
.bre-slider-setting {
  margin-top: 12px;
  padding: 0 14px;
  border: 1px solid var(--dsw-alias-stroke-secondary, rgba(121,126,145,.2));
  border-radius: 12px;
  background: transparent;
}
.bre-slider-setting-row {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 24px;
  padding: 16px 0;
  /* Upstream .re-setting-row carries a list bottom border because the general
     settings list held TWO rows (the slider + the big-fish toggle). This box
     holds exactly one, so no divider: the box itself is the container. */
}
.bre-slider-setting-copy { min-width: 0; }
.bre-slider-setting-title {
  color: var(--dsw-alias-label-primary, #15171b);
  font-size: 14px;
  font-weight: 400;
  line-height: 22px;
}
.bre-slider-setting-description {
  margin-top: 3px;
  color: var(--dsw-alias-label-tertiary, #9296a0);
  font-size: 12px;
  line-height: 18px;
}
.bre-slider-setting-control { display: inline-flex; align-items: center; gap: 10px; flex: none; }
.bre-slider-setting-state { color: var(--dsw-alias-label-secondary, #686c75); font-size: 13px; }
.bre-slider-setting-switch {
  position: relative;
  width: 38px;
  height: 22px;
  padding: 0;
  border: 0;
  border-radius: 999px;
  background: var(--dsw-alias-fill-quaternary, #c7cbd3);
  cursor: pointer;
  transition: background 150ms ease;
}
.bre-slider-setting-switch:hover { filter: brightness(.97); }
.bre-slider-setting-switch:disabled { cursor: not-allowed; opacity: .45; }
.bre-slider-setting-switch:focus-visible {
  outline: 2px solid var(--dsw-static-blue-400, #5d83ff);
  outline-offset: 2px;
}
.bre-slider-setting-switch.is-on { background: var(--dsw-alias-state-business-primary, #4f73ff); }
.bre-slider-setting-switch-knob {
  position: absolute;
  top: 2px;
  left: 2px;
  width: 18px;
  height: 18px;
  border-radius: 50%;
  background: #fff;
  box-shadow: 0 1px 4px rgba(0,0,0,.2);
  transition: transform 170ms cubic-bezier(.22,1,.36,1);
}
.bre-slider-setting-switch.is-on .bre-slider-setting-switch-knob { transform: translateX(16px); }

/* Model selection search box */
.bre-model-search-box {
  display: flex;
  flex-direction: column;
  padding: 6px 8px 4px;
  position: sticky;
  top: 0;
  z-index: 2;
  background: var(--dsw-specific-menu, var(--dsw-alias-bg-layer-1, #1e1f22));
}
.bre-model-search-box:has(.bre-search-empty),
.bre-model-search-box.has-empty {
  flex: 1 1 auto;
}
.bre-search-input-wrapper {
  display: flex;
  align-items: center;
  position: relative;
  width: 100%;
  height: 32px;
  padding: 0 8px;
  box-sizing: border-box;
  border-radius: 8px;
  background: var(--dsw-alias-bg-layer-2, rgba(255, 255, 255, 0.06));
  border: 0.5px solid var(--dsw-alias-border-l4, rgba(255, 255, 255, 0.12));
  color: var(--dsw-alias-label-primary);
  transition: border-color 150ms ease, box-shadow 150ms ease;
}
.bre-search-input-wrapper:focus-within {
  border-color: var(--dsw-static-deepseek-500, #4d70ff);
  box-shadow: 0 0 0 2px rgba(77, 112, 255, 0.2);
}
.bre-search-icon {
  display: flex;
  align-items: center;
  justify-content: center;
  flex: 0 0 16px;
  width: 16px;
  height: 16px;
  margin-right: 6px;
  color: var(--dsw-alias-label-tertiary, #81858c);
  pointer-events: none;
}
.bre-search-icon svg {
  width: 14px;
  height: 14px;
}
.bre-search-input {
  flex: 1 1 auto;
  min-width: 0;
  height: 100%;
  padding: 0;
  border: none;
  outline: none;
  background: transparent;
  color: inherit;
  font: inherit;
  font-size: 13px;
  line-height: 20px;
}
.bre-search-input::placeholder {
  color: var(--dsw-alias-label-tertiary, #81858c);
  opacity: 0.85;
}
.bre-search-clear {
  display: flex;
  align-items: center;
  justify-content: center;
  flex: 0 0 18px;
  width: 18px;
  height: 18px;
  margin-left: 4px;
  padding: 0;
  border: none;
  border-radius: 4px;
  background: transparent;
  color: var(--dsw-alias-label-tertiary, #81858c);
  cursor: pointer;
  transition: background 120ms ease, color 120ms ease;
}
.bre-search-clear:hover {
  background: var(--dsw-alias-interactive-bg-hover, rgba(255, 255, 255, 0.1));
  color: var(--dsw-alias-label-primary);
}
.bre-search-clear svg {
  width: 12px;
  height: 12px;
}
.bre-search-empty {
  display: flex;
  align-items: center;
  justify-content: center;
  flex: 1 1 auto;
  min-height: 180px;
  padding: 24px 16px;
  text-align: center;
  color: var(--dsw-alias-label-tertiary, #81858c);
  font-size: 13px;
  line-height: 20px;
  user-select: none;
}

/* ---- Request-header section (issue #12). Mounted through the official
   settings.models.provider-card seat, so it sits in the card's own layout
   rather than a disclosure grid.

   Every value below was MEASURED off the official Models page's own controls
   in DSH 0.1.7-rc.2 rather than guessed, and each is expressed through the same
   --dsw-alias-* token the host paints with, so a theme switch (light/dark)
   repaints this section along with the page:

     provider card   radius 20px, 1px var(--dsw-alias-settings-card-stroke)
     editor action   save = filled var(--dsw-alias-button-primary-fill), h36,
                     radius 12px, 0 14px, 14px; cancel = 1px border, same box
     row action      h28, radius 8px, 0 10px, 12px, 1px border
     text link       h21, radius 4px, 2px 6px, 12px, link-blue label
     text input      radius 12px, 0 10px, 1px var(--dsw-alias-border-l3)  ---- */
/* The provider-card slot's wrapper.
   The official slot mounts us inside a display:contents container, so our own
   root IS a flex item of the card row \u2014 and the row lays its children out with
   a 12px gap. A wrapper that stays in the flow while empty therefore adds one
   phantom gap to EVERY card in the list, which is exactly the height regression
   this rule exists to prevent. Collapsed, the wrapper leaves the flow entirely:
   the card renders as it did before the plugin.
   (Deliberately NOT display:contents here \u2014 that keeps it a gap-participating
   item, which is the bug this rule fixes.)
   Open, it becomes an ordinary block so the section below can lay itself out.
   data-edit lives HERE \u2014 the occurrence component publishes the card's state
   onto its own root, so keying the rule on .bre-headers[data-edit] instead
   would silently never match. */
.bre-headers-host {
  display: none;
}
.bre-headers-host[data-edit="1"] {
  display: block;
}
.bre-headers {
  display: flex;
  flex-direction: column;
  gap: 8px;
  /* The card lays its own children out with a 12px gap and no dividers; this
     section is an addition to that column, so it separates itself the same way
     the host separates card sections \u2014 a hairline on the card's own stroke. */
  border-top: 1px solid var(--dsw-alias-border-l2, #0000001a);
  padding-top: 12px;

  /* Present ONLY while the provider card is being edited.
     The provider list is a list of providers: a request-header row parked in
     every card, collapsed or not, is noise on a surface the user did not ask
     to configure. The card reveals its editor when the user presses its own
     Edit action, and that is the moment this section belongs on screen \u2014 the
     same gesture that opens the model list opens this.

     The visibility is decided by the component (which watches the card and
     sets data-edit on the wrapper), not by a selector: the official editor is
     NOT a sibling of this element \u2014 its container sits in the card row's own
     children, after the row head and this section's own wrapper \u2014 so no
     relative selector can reach it. The wrapper's data-edit is the one fact
     CSS can act on.

     Degradation is safe by construction: with no observer (no card ancestor to
     watch) data-edit stays "0", the section is never revealed, and the
     official page stays clean rather than leaking a row into every card. */
  display: none;
}
.bre-headers-host[data-edit="1"] .bre-headers {
  display: flex;
}
/* The collapsed heading is the section's identity while the card is being
   edited: title, configured count, and the \u203A that opens the details. */
.bre-headers-disclosure {
  display: flex;
  align-items: center;
  gap: 6px;
  width: 100%;
  padding: 0;
  border: none;
  background: transparent;
  color: inherit;
  font: inherit;
  text-align: left;
  cursor: pointer;
}
.bre-headers-disclosure:hover .bre-effort-title {
  color: var(--dsw-alias-label-secondary, #61666b);
}
.bre-headers-chevron {
  margin-left: auto;
  padding-right: 2px;
  color: var(--dsw-alias-label-tertiary, #81858c);
  font-size: 14px;
  line-height: 1;
  transition: transform 150ms ease;
}
.bre-headers[data-open="1"] .bre-headers-chevron { transform: rotate(90deg); }
/* How many entries are configured \u2014 the one fact worth showing while closed. */
.bre-headers-count {
  min-width: 16px;
  padding: 0 5px;
  border-radius: 8px;
  background: var(--dsw-alias-interactive-bg-hover, #2631480f);
  color: var(--dsw-alias-label-secondary, #61666b);
  font-size: 11px;
  line-height: 16px;
  text-align: center;
}
.bre-headers-head {
  display: flex;
  align-items: center;
  min-height: 32px;
  padding: 0 8px;
  border-radius: var(--dsw-radius-sm, 8px);
  background: var(--dsw-alias-interactive-bg-hover, #2631480f);
}
.bre-headers-head .bre-effort-title {
  color: var(--dsw-alias-label-primary, #0f1115);
  font-weight: 600;
}
.bre-headers-edit, .bre-headers-rows {
  display: flex;
  flex-direction: column;
  gap: 8px;
}
/* The titled-section rows the pane is built from: the title row names its
   section (headers first; future advanced sections each carry one), sitting
   under a hairline the way the official page's group titles do.
   The head strip above it is where the headers section draws its title now \u2014
   it is the one title the pane needs, and it is the line the hint reads under
   \u2014 so this rule is the hairline's home alone, for the sections that follow. */
.bre-headers-title-row {
  padding-bottom: 6px;
  border-bottom: 1px solid var(--dsw-alias-border-l2, #0000001a);
  margin-bottom: 2px;
}
.bre-headers-title-row .bre-effort-title {
  font-size: 13px;
  line-height: 20px;
}

.bre-headers-columns,
.bre-headers-row {
  display: grid;
  grid-template-columns: minmax(120px, 0.9fr) minmax(180px, 1.5fr) 28px;
  align-items: center;
  gap: 8px;
}
.bre-headers-columns {
  padding: 0 10px;
  color: var(--dsw-alias-label-tertiary, #81858c);
  font-size: 11px;
  line-height: 16px;
}
.bre-headers-row {
  min-height: 40px;
  padding: 4px 6px;
  border: 1px solid var(--dsw-alias-border-l2, #0000001a);
  border-radius: var(--dsw-radius-sm, 8px);
  background: var(--dsw-alias-bg-layer-1, #fff);
}
.bre-headers-add {
  align-self: flex-start;
  min-height: 30px;
  padding: 0 10px;
  border: 1px solid var(--dsw-alias-border-l2, #0000001a);
  border-radius: var(--dsw-radius-sm, 8px);
  color: var(--dsw-alias-label-primary, #0f1115);
}
.bre-headers-add:hover:not(:disabled) {
  background: var(--dsw-alias-interactive-bg-hover, #2631480f);
}
.bre-headers-remove {
  width: 28px;
  padding: 0;
  justify-self: center;
}
.bre-headers-rows .bre-headers-name {
  color: var(--dsw-alias-label-secondary, #61666b);
  font-size: 12px;
  word-break: break-all;
}
.bre-headers-masked {
  color: var(--dsw-alias-label-tertiary, #81858c);
  font-family: ui-monospace, SFMono-Regular, Menlo, monospace;
  letter-spacing: 0;
}

/* The section's commit/dismiss pair, matching the official editor's own
   actions: a filled commit and a bordered dismiss, 36px tall at 14px. */
.bre-headers-edit .bre-primary-button {
  height: 36px;
  padding: 0 14px;
  border: none;
  border-radius: var(--dsw-radius-md, 12px);
  background: var(--dsw-alias-button-primary-fill, #0f1115);
  color: var(--dsw-alias-label-primary-foreground, #fff);
  font-size: 14px;
  font-weight: 400;
  line-height: 1;
  cursor: pointer;
}
.bre-headers-edit .bre-primary-button:hover:not(:disabled) {
  background: var(--dsw-alias-button-primary-hover, #43454a);
}
.bre-headers-edit .bre-primary-button:disabled { opacity: 0.5; cursor: default; }
.bre-headers-edit .bre-secondary-button {
  height: 36px;
  padding: 0 14px;
  border: 1px solid var(--dsw-alias-border-l3, #0000001f);
  border-radius: var(--dsw-radius-md, 12px);
  background: transparent;
  color: var(--dsw-alias-label-primary, #0f1115);
  font-size: 14px;
}
.bre-headers-edit .bre-secondary-button:hover:not(:disabled) {
  background: var(--dsw-alias-interactive-bg-hover, #2631480f);
}

/* The row actions and the section's Edit affordance: the official 28px
   bordered small button, and the 21px blue text link the model rows use. */
.bre-headers-row .bre-link-button {
  height: 28px;
  padding: 2px 8px;
  border: none;
  border-radius: var(--dsw-radius-sm, 8px);
  background: transparent;
  color: var(--dsw-alias-label-secondary, #61666b);
  font-size: 12px;
  line-height: 1;
}
.bre-headers-row .bre-link-button:hover:not(:disabled) {
  background: var(--dsw-alias-interactive-bg-hover, #2631480f);
}
.bre-headers .bre-effort-head > .bre-link-button {
  height: 28px;
  padding: 0 10px;
  border: 1px solid var(--dsw-alias-border-l2, #0000001a);
  border-radius: var(--dsw-radius-sm, 8px);
  color: var(--dsw-alias-label-primary, #0f1115);
  font-size: 12px;
  text-decoration: none;
}
.bre-headers .bre-effort-head > .bre-link-button:hover:not(:disabled) {
  background: var(--dsw-alias-interactive-bg-hover, #2631480f);
  text-decoration: none;
}
.bre-headers-edit .bre-link-button {
  color: var(--dsw-alias-label-secondary, #61666b);
  font-size: 12px;
}

/* The section's own fields, on the official input box. */
.bre-headers-edit input.bre-text-input {
  height: 32px;
  padding: 0 10px;
  border: 1px solid var(--dsw-alias-border-l3, #0000001f);
  border-radius: var(--dsw-radius-md, 12px);
  background: var(--dsw-alias-bg-layer-1, #fff);
  color: var(--dsw-alias-label-primary, #0f1115);
  font-size: 13px;
  box-sizing: border-box;
}
.bre-headers-edit input.bre-text-input:focus {
  border-color: var(--dsw-alias-label-tertiary, #81858c);
  outline: none;
}
.bre-headers-edit input.bre-text-input:disabled { opacity: 0.6; cursor: default; }

/* Status copy and the coexistence warnings, on the host's own state colours. */
.bre-headers .bre-effort-note.bre-warn { color: var(--dsw-alias-state-warn-label, #dd8629); }
.bre-headers .bre-effort-message.bre-success { color: var(--dsw-alias-state-success-primary, #22c55e); }
.bre-headers .bre-effort-message.bre-error { color: var(--dsw-alias-state-error-primary, #ec1313); }

@media (max-width: 520px) {
  .bre-headers-columns { display: none; }
  .bre-headers-row {
    grid-template-columns: minmax(0, 1fr) minmax(0, 1.25fr) 28px;
    gap: 6px;
    padding: 4px;
  }
  .bre-headers-edit input.bre-text-input {
    padding: 0 8px;
    font-size: 12px;
  }
}

/* ---- Provider row reordering (Models page) ---- */

/* The whole row header is the drag handle: an 18px grip is a poor thing to
   have to hit, so a drag may start anywhere on the header that is not one of
   the card's own controls (those keep their own cursor, declared below). */
li[data-bre-row-head='1'] { cursor: grab; }
li[data-bre-row-head='1']:active { cursor: grabbing; }
li[data-bre-row-head='1'] button,
li[data-bre-row-head='1'] a,
li[data-bre-row-head='1'] input { cursor: pointer; }

/* The grip is mounted as the first child of that header, so it reads as part
   of the row rather than as a control bolted beside it. It is also the button
   that reorders by keyboard. */
.bre-drag-grip {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  flex: 0 0 auto;
  width: 14px;
  height: 20px;
  margin-right: 2px;
  border-radius: 4px;
  color: var(--dsw-alias-label-tertiary, #81858c);
  cursor: grab;
  touch-action: none;
}

.bre-drag-grip:hover {
  color: var(--dsw-alias-label-secondary, #61666b);
  background: var(--dsw-alias-interactive-bg-hover, #2631480f);
}

.bre-drag-grip:focus-visible {
  outline: 2px solid var(--dsw-alias-brand-primary);
  outline-offset: 1px;
}

.bre-drag-grip:active { cursor: grabbing; }

/* What the pointer carries: the browser's own drag image would be a screenshot
   of a whole card, so we hand it this chip with the provider name instead. */
.bre-drag-ghost {
  position: fixed;
  display: inline-flex;
  align-items: center;
  gap: 6px;
  max-width: 260px;
  padding: 5px 10px 5px 7px;
  border: 1px solid var(--dsw-alias-border-secondary, #e6e8eb);
  border-radius: 8px;
  background: var(--dsw-alias-bg-elevated, #ffffff);
  box-shadow: 0 6px 18px #0000002e;
  color: var(--dsw-alias-label-primary, #17181a);
  font-size: 13px;
  line-height: 18px;
  pointer-events: none;
  transform: translate(-50%, -50%);
  z-index: 60;
}

.bre-drag-ghost-name {
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.bre-drag-ghost svg { color: var(--dsw-alias-label-tertiary, #81858c); }

/* The row the drag is carrying: still in place, visibly the one in hand. */
li.bre-row-dragging { opacity: .5; }

/* The row the pointer would drop it on \u2014 a secondary cue; the insertion line
   below is the one that says which side. */
li.bre-row-drop-target { border-color: var(--dsw-alias-brand-primary); }

/* The insertion line. A fixed overlay on the body, never a child of the list
   React owns, so writing it cannot trigger anything in the official section.
   The layer stack matters more than it looks: the provider list lives inside the
   settings dialog, whose overlay is fixed and opaque with z-index 1000, so a
   line in the shell's own range would be drawn behind the dialog and never
   seen. It clears the dialog, and stays under the header's controls. */
.bre-drop-line {
  position: fixed;
  display: none;
  height: 2px;
  border-radius: 2px;
  background: var(--dsw-alias-brand-primary, #4d6bfe);
  box-shadow: 0 0 0 1px #ffffffb3, 0 1px 4px var(--dsw-alias-brand-primary, #4d6bfe);
  pointer-events: none;
  z-index: 1200;
}

/* The row slide (a FLIP pass driven from the script) is motion; drop it for a
   reader who asked for less. */
@media (prefers-reduced-motion: reduce) {
  li[data-bre-row-provider] { transition: none !important; }
}

@media (max-width: 520px) {
  .bre-drag-grip { width: 18px; height: 24px; }
  .bre-drag-ghost { max-width: 180px; font-size: 12px; }
}

/* ---- Model rows inside one provider's editor (Models page) ---- */

/* The official model row is a four-column grid (id, display name, two icon
   buttons). Our grip is a fifth child, so the grid needs a leading track to
   hold it \u2014 declared by our own class, because the official rule is a single
   class selector and ours has to win on specificity, not on load order.
   The name must NOT be "bre-model-row": that one is this plugin's own composer
   row (see the ".bre-model-row" block above), and lending it to the host's grid
   would hand that grid our padding, gap, min-height, pointer cursor and hover
   fill along with it. */
.bre-model-grid[class*="modelRow"] {
  grid-template-columns: auto minmax(0, 1.4fr) minmax(0, 1fr) auto auto;
}

/* A model row is a grid of inputs, so only the grip drags: the row keeps its
   text cursor and its own click behaviour. The grip takes the height of the
   row's controls, so the pointer has a real target inside a 6px-gap grid. */
.bre-model-grid > .bre-drag-grip {
  width: 18px;
  height: 24px;
  margin-right: 0;
}

/* The engine paints the carried row and the row under the pointer with the same
   classes it uses on a provider card; the official model entry carries the
   border, so the drop cue has to land there rather than on the list item. */
div.bre-row-dragging { opacity: .5; }
[class*="modelEntry"].bre-row-drop-target { border-color: var(--dsw-alias-brand-primary); }

/* The row slide (a FLIP pass driven from the script) is motion; drop it for a
   reader who asked for less. */
@media (prefers-reduced-motion: reduce) {
  [data-bre-row-model] { transition: none !important; }
}

/* The blank a shrinking model list leaves behind, appended to the panel's own
   scroll host (see holdListSlack in models-page-editor): it holds the host's
   scroll RANGE open so deleting a row cannot clamp the view down. Height is
   written inline from the script \u2014 it is the range being held, not a style \u2014
   and the element must never take layout from above or a pointer from the user. */
.bre-list-slack {
  flex: 0 0 auto;
  pointer-events: none;
}

/* ---- Provider enable switch (Models page) ---- */

/* Leads the row's own action group (which is pushed right by margin-left:auto),
   in front of the card's buttons, so the destructive one stays last. The knob is
   a pseudo element: no extra node for the official section's tree to trip over. */
.bre-provider-switch {
  position: relative;
  flex: 0 0 auto;
  width: 30px;
  height: 18px;
  padding: 0;
  border: none;
  border-radius: 9px;
  background: var(--dsw-alias-bg-tertiary, #d7dae0);
  cursor: pointer;
  transition: background 140ms ease;
}

.bre-provider-switch::after {
  content: '';
  position: absolute;
  top: 2px;
  left: 2px;
  width: 14px;
  height: 14px;
  border-radius: 50%;
  background: var(--dsw-alias-bg-elevated, #ffffff);
  box-shadow: 0 1px 2px #00000026;
  transition: transform 140ms ease;
}

.bre-provider-switch:not([aria-checked='true']):hover { background: var(--dsw-alias-bg-quaternary, #c9ccd2); }

.bre-provider-switch[aria-checked='true'] { background: var(--dsw-alias-brand-primary, #4d6bfe); }

.bre-provider-switch[aria-checked='true']:hover { background: var(--dsw-alias-brand-primary-hover, #3f5ce8); }

.bre-provider-switch[aria-checked='true']::after { transform: translateX(12px); }

.bre-provider-switch:focus-visible {
  outline: 2px solid var(--dsw-alias-brand-primary, #4d6bfe);
  outline-offset: 2px;
}

/* A provider that is switched off stays on the page \u2014 this is the only place it
   can be switched back on \u2014 but it is visibly out of play. The switch itself is
   left at full strength: it is the way back. */
li.bre-row-disabled [class*="rowIdentity"],
li.bre-row-disabled [class*="rowName"] { opacity: .5; }

@media (prefers-reduced-motion: reduce) {
  .bre-provider-switch,
  .bre-provider-switch::after { transition: none; }
}

/* ---- The reserved delete seat (Models page) ---- */

/* A provider the host will not let the user remove renders no delete button, so
   that row's action group \u2014 pushed right by margin-left:auto \u2014 starts further
   right than its neighbours' and the column of buttons lines up raggedly. This
   seat holds the place: it borrows the metrics the official button takes inside
   an action group (.rowActions button is 28px tall / 12px / 0 10px) and the
   dimmed treatment the host gives its own disabled buttons (opacity .4 with a
   default cursor). It is always disabled \u2014 it is the alignment, not an action. */
.bre-provider-delete {
  box-sizing: border-box;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  height: 28px;
  padding: 0 10px;
  border: none;
  border-radius: var(--dsw-radius-sm, 6px);
  background: 0 0;
  color: var(--dsw-alias-state-error-primary, #e5484d);
  font: inherit;
  font-size: 12px;
  line-height: 18px;
  opacity: .4;
  cursor: default;
}

/* -----------------------------------------------------------------------
   The provider editor's three tabs.

   The official editor lays a provider out as one long column \u2014 identity
   fields, then the model list, then this plugin's request-header section
   one slot up the card. The tab pass (injection/editor-tabs.ts) tags each
   region and stamps the card with the active tab; EVERY visibility decision
   lives here, so the official React tree never moves and a pass failure
   degrades to the untouched one-column editor.
   ----------------------------------------------------------------------- */

/* The segmented control. The plugin's tab-bar component renders it inside the
   request-header mount, which already holds the card's 12px gap slot \u2014 so the
   bar reaches the panes in the card's own rhythm WITHOUT this plugin ever
   inserting a node into the official child list. It stays hidden until the pass
   marks the card: a card the pass could not take over (the DeepSeek account
   editor) keeps that mount visible for its request-header section, and must not
   grow a bar that switches nothing. */
.bre-editor-tabs {
  display: none;
  gap: 2px;
  padding: 2px;
  border-radius: 10px;
  background: var(--dsw-alias-fill-tertiary, rgba(120, 125, 140, .09));
}

/* Only a taken-over card shows the bar. */
.bre-tabbed .bre-editor-tabs { display: flex; }

/* ...and while the takeover is on, the mount holding that bar MUST be visible.
   This is the one place the takeover does not delegate its reveal to the
   official-edit state: the bar lives in here, and gating it on the _editor
   class probe would make the tabs depend on a probe an official redesign can
   break \u2014 with data-edit stuck at 0 the bar would be inside a display:none
   parent and no rule of ours could reach it. The taken-over class is written by
   the pass itself, in the same frame, so it is the trustworthy half of the
   pair. The section's own visibility stays a pane decision (below). */
.bre-tabbed .bre-headers-host { display: block; }

.bre-editor-tab {
  flex: 1 1 0;
  min-width: 0;
  height: 28px;
  padding: 0 10px;
  border: none;
  border-radius: 8px;
  background: transparent;
  color: var(--dsw-alias-label-secondary, #61666b);
  font: inherit;
  font-size: 12px;
  font-weight: 500;
  line-height: 1;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
  cursor: pointer;
  transition: background 140ms ease, color 140ms ease, box-shadow 140ms ease;
}

.bre-editor-tab:hover { color: var(--dsw-alias-label-primary, #0f1115); }

/* The selected segment lifts out of the track: the page's own surface colour
   plus the card's own hairline, the same elevation the host uses for raised
   controls. Hover on a selected tab stays put \u2014 it is already where you are. */
.bre-editor-tab[aria-selected='true'],
.bre-editor-tab[aria-selected='true']:hover {
  background: var(--dsw-alias-bg-layer-1, #fff);
  color: var(--dsw-alias-label-primary, #0f1115);
  box-shadow: 0 1px 2px #0000001a, 0 0 0 1px var(--dsw-alias-border-l2, #0000001a);
}

.bre-editor-tab:focus-visible {
  outline: 2px solid var(--dsw-alias-brand-primary, #4d6bfe);
  outline-offset: 1px;
}

/* An advanced section with no headers mount (pre-first-render, feature off)
   offers an empty pane \u2014 the button steps aside until the mount exists. */
.bre-editor-tab[hidden] { display: none; }

/* Pane visibility, keyed on the card's active tab. Only the HIDING has to win
   a specificity fight (against the official sheet and the headers host's own
   reveal rule); the active pane keeps whatever display the official layout
   gave it, so showing must not declare a display at all. */
.bre-tabbed:not([data-bre-tab='provider']) [data-bre-region='provider'],
.bre-tabbed:not([data-bre-tab='models']) [data-bre-region='models'],
.bre-tabbed:not([data-bre-tab='advanced']) [data-bre-region='advanced'] {
  display: none !important;
}

/* The advanced tab: the official body \u2014 fields, model list, action row and the
   editor's own header \u2014 steps aside for the request-header section, which is a
   complete form with its own save/cancel and becomes the pane under the very
   same bar. */
.bre-tabbed[data-bre-tab='advanced'] [data-bre-editor-body] {
  display: none !important;
}

/* The advanced pane shows the section for the same reason the mount is shown:
   a pane that is already the active one has no business depending on the
   official-edit probe. The rule above still wins for every other tab, and the
   base bre-headers rule keeps a collapsed card's section hidden \u2014 a card only
   carries the taken-over class while its editor is open. */
.bre-tabbed[data-bre-tab='advanced'] .bre-headers { display: flex; }

/* The pane is a card, and the section draws it. On the advanced tab the section
   is not an appendage to the fields above it any more \u2014 it is the whole surface
   \u2014 so it takes the inset fill the official module cards use (the add and setup
   cards): the one fill in this system that stays visible on the content card's
   own white in the light theme and reads as raised in the dark one, where every
   theme layer token collapses onto the same value. The hairline goes with it: it
   divided this section from those fields, and here the bar above ends the pane.
   The 12px top margin sets the card off the tab bar above it \u2014 the same gap the
   provider and models panes put between the bar and their own cards \u2014 and the
   12px padding is the card's inner inset, not the separator. */
.bre-tabbed[data-bre-tab='advanced'] .bre-headers {
  margin-top: 12px;
  padding: 12px;
  border-top: none;
  border-radius: var(--dsw-radius-lg, 16px);
  background: var(--dsw-alias-bg-module-platform, #f5f6f7);
}

/* The pane's heading is not a fold head. The grey pill, its hover state and
   the \u203A that opens the card section have no job in a pane that is always open
   and named by the tab above it, so the title drops back to plain text. It
   keeps the title row's weight the section uses everywhere else \u2014 the head
   strip and the hint both step aside for it, which is what makes the title
   the line the hint reads under rather than an equal of it. */
.bre-tabbed[data-bre-tab='advanced'] .bre-headers-head {
  min-height: 0;
  padding: 0;
  background: none;
}
.bre-tabbed[data-bre-tab='advanced'] .bre-headers-head .bre-effort-title {
  font-size: 13px;
  line-height: 20px;
}

/* The live editor folds its identity fields and model list into one
   "Customized" disclosure. Under the tabs the grouping is the panes' job: the
   group stays expanded (the pass forces it open) and its summary row \u2014 now a
   toggle with nothing left to toggle \u2014 steps aside. */
.bre-tabbed [data-bre-editor-body] details > summary {
  display: none !important;
}

/* A region that is NOT a pane. The editor's own header repeats the card row's
   provider name and route tag, and that row is already on screen directly above
   it, so the header is hidden on every tab. No pane rule above can select this
   id, which is what keeps it hidden whichever tab is active. */
.bre-tabbed [data-bre-region='none'] {
  display: none !important;
}

/* The Models pane shows the custom model list and the catalogue, and two
   hairlines used to divide it: the "Customized" group's separator from the key
   field (which this pane hides) and the catalogue's own, drawn directly above
   its "Model catalogue" heading. Neither has anything to divide here \u2014 the tab
   bar already ends the pane above, and the divider between the two lists above
   the catalogue is the group's boundary, not a rule. Both go, with every top
   padding that held content off them (the group's 10px, its body's 12px, the
   catalogue's 12px), so the pane runs from the tab bar into the catalogue with
   only the official editor's own 14px gap between blocks. */
.bre-tabbed[data-bre-tab='models'] [data-bre-editor-body] details[class*='customized'] {
  border-top: none;
  padding-top: 0;
}

.bre-tabbed[data-bre-tab='models'] [data-bre-editor-body] details[class*='customized'] > [class*='customizedBody'] {
  padding-top: 0;
}

/* The catalogue is a section (its heading, title and meta are the divs inside
   it), so this probe hits the ruled box and nothing else. */
.bre-tabbed[data-bre-tab='models'] [data-bre-editor-body] section[class*='modelCatalog'] {
  border-top: none;
  padding-top: 0;
}

/* The catalogue heading names a box this pane has already named for the user:
   the Models tab IS the catalogue, so "\u6A21\u578B\u76EE\u5F55" says it twice, and
   "\u5DF2\u81EA\u5B9A\u4E49\u6A21\u578B\u76EE\u5F55" (the meta line beside it) says nothing at all \u2014 the rows
   below ARE the customized catalogue. Both strings are the host's own, so they
   go by class stem, and the heading takes its title and meta with it. The
   head's own controls (\u6062\u590D\u9ED8\u8BA4\u6A21\u578B / \u83B7\u53D6\u53EF\u7528\u6A21\u578B) are siblings of the heading,
   not children, so they stay \u2014 the auto-adapt seat is anchored to them. */
.bre-tabbed[data-bre-tab='models'] [data-bre-editor-body] [class*='modelCatalogHeading'] {
  display: none;
}

/* With the heading gone the head holds only controls, and they read as TWO
   ENDS: \u6062\u590D\u9ED8\u8BA4\u6A21\u578B stays at the left edge while \u83B7\u53D6\u53EF\u7528\u6A21\u578B keeps the
   auto-adapt seat beside it at the far right \u2014 the seat belongs to that link's
   group, it is never a column of its own. The official space-between cannot
   express that once a third child exists: it spreads the three evenly, which
   strands the fetch link in the middle of the card. So the free space is handed
   to the fetch link's own leading auto margin instead \u2014 an auto margin absorbs
   the space BEFORE justify-content is consulted, whatever the official rule
   says. The fetch link is the button the seat sits after, which is also the
   only control present when the provider is not overridden: the pair then
   simply holds the right edge. align-items centres the taller host links
   against the seat. */
.bre-tabbed[data-bre-tab='models'] [data-bre-editor-body] [class*='modelListHead'] {
  align-items: center;
}
.bre-tabbed[data-bre-tab='models'] [data-bre-editor-body] [class*='modelListHead'] > button:has(+ .bre-auto-effort) {
  margin-left: auto;
}

/* The click's answer, as a bubble at the top of the window that takes itself
   away again. The control is left alone on purpose: its label is what the user
   aimed at, and a button that rewrites itself is a button that moved. The
   bubble is a fixed overlay on the body \u2014 not a child of the head, which is the
   host's flex row and would take a fourth item \u2014 and it clears the settings
   dialog's opaque overlay for the same reason the drop line does. It follows
   the host's own toast in placement and tone, but not in z-index: the settings
   dialog's overlay outranks the toast layer, and this bubble is raised from
   inside that dialog. Pointer-events none keeps it out of the way, the phase
   colours the headline so the outcome reads before the words do, and the
   hold/fade pair is timed by --bre-note-hold, which the script sets from the
   same constant it uses for the dismissal. The fade is counted INSIDE that
   hold, so the bubble is gone when the clock says it is, rather than fading
   after it. */
.bre-auto-effort-note {
  position: fixed;
  top: 40px;
  left: 50%;
  display: flex;
  flex-direction: column;
  gap: 2px;
  width: max-content;
  max-width: min(640px, calc(100vw - 48px));
  padding: 10px 14px;
  border-radius: 10px;
  background: var(--dsw-alias-toast-bg, #2b2f36);
  color: var(--dsw-alias-toast-label, #f9fafb);
  box-shadow: var(--dsw-shadow-lv3, 0 6px 24px #00000029);
  font-size: 13px;
  line-height: 20px;
  pointer-events: none;
  transform: translateX(-50%);
  animation: bre-note-in 160ms ease-out, bre-note-out 400ms ease calc(var(--bre-note-hold, 3000ms) - 400ms) forwards;
  z-index: 1200;
}
/* A pass in flight has no lifetime of its own: it is replaced by its verdict,
   which restarts both animations because the phase changes the rule. */
.bre-auto-effort-note[data-bre-auto-effort-phase='working'] {
  animation: bre-note-in 160ms ease-out;
}
@keyframes bre-note-in {
  from { opacity: 0; transform: translate(-50%, -6px); }
  to { opacity: 1; transform: translate(-50%, 0); }
}
@keyframes bre-note-out {
  to { opacity: 0; visibility: hidden; }
}
@media (prefers-reduced-motion: reduce) {
  .bre-auto-effort-note {
    animation: bre-note-out 400ms ease calc(var(--bre-note-hold, 3000ms) - 400ms) forwards;
  }
  .bre-auto-effort-note[data-bre-auto-effort-phase='working'] { animation: none; }
}
.bre-auto-effort-note-text { font-weight: 500; }
.bre-auto-effort-note-detail { opacity: .72; }
/* The attribute is the visibility switch, so it must beat the flex column above. */
.bre-auto-effort-note-detail[hidden] { display: none; }
.bre-auto-effort-note[data-bre-auto-effort-phase='working'] .bre-auto-effort-note-text {
  color: var(--dsw-alias-state-business-primary, #6ea8fe);
}
.bre-auto-effort-note[data-bre-auto-effort-phase='done'] .bre-auto-effort-note-text {
  color: var(--dsw-alias-state-success-primary, #22c55e);
}
.bre-auto-effort-note[data-bre-auto-effort-phase='failed'] .bre-auto-effort-note-text {
  color: var(--dsw-alias-state-error-secondary, #ff8a80);
}

/* The API-key eye. The official key field is a plain flex column whose input is
   its last in-flow child, so the button hangs on the field's own box and is
   measured against the input's 32px row \u2014 the official markup offers no
   wrapper, and introducing one would mean moving DOM the host owns. The input
   keeps the room the button needs. */
.bre-key-field { position: relative; }

.bre-key-field > input { padding-right: 34px; }

/* A field the plugin's key list manages hands its input over: the list below
   says the same thing once per key and keeps the pick, the alias and the value
   in one place, so an official box that writes the provider's single key would
   be a second, conflicting way to do it. The input stays in the DOM \u2014 the
   host's form still owns it and the reveal pass still finds it \u2014 so unmanaging
   the field brings the official box back. The marker is what the reveal pass
   stamps on that input; the direct-child form covers the pass that has not run
   yet, and the eye is the button the same pass hangs on the field. */
.bre-key-managed [data-bre-key-input],
.bre-key-managed > input,
.bre-key-managed .bre-key-eye { display: none; }

/* A field that failed validation grows a message line under the input; the eye
   rides above it so it stays on the input it belongs to (18px line + 6px gap). */
.bre-key-field:has(> p) .bre-key-eye { bottom: 24px; }

.bre-key-eye {
  position: absolute;
  right: 4px;
  bottom: 0;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 28px;
  height: 32px;
  padding: 0;
  border: 0;
  border-radius: 8px;
  background: transparent;
  color: var(--dsw-alias-label-secondary, #6b7280);
  cursor: pointer;
  -webkit-appearance: none;
  appearance: none;
  transition: background 140ms ease, color 140ms ease;
}

.bre-key-eye:hover {
  color: var(--dsw-alias-label-primary, #0f1115);
  background: var(--dsw-alias-interactive-bg-hover);
}

.bre-key-eye:focus-visible {
  outline: none;
  box-shadow: inset 0 0 0 2px var(--dsw-alias-border-l3);
}

/* Resolving a stored key is a same-origin round trip, so the button can be
   busy: it stays in place and dims rather than changing size or disappearing. */
.bre-key-eye[aria-busy='true'] {
  opacity: 0.55;
  cursor: progress;
}

.bre-key-eye[hidden] { display: none; }

/* One glyph at a time. The state lives on the button's own attribute, so a
   click swaps the icon without the host re-rendering anything. */
.bre-key-eye svg[data-bre-icon] { display: none; }

.bre-key-eye[aria-pressed='false'] svg[data-bre-icon='eye'],
.bre-key-eye[aria-pressed='true'] svg[data-bre-icon='eye-off'] { display: block; }

/* The key list. The plugin mounts it into its own host, a sibling placed right
   after the official key field, so the list sits under the input without
   changing the field's own box: the reveal eye is measured against that box
   (bottom: 0), and a list inside the field would drag the eye down onto the
   list's last row. The margin only covers the case where the card spaces its
   fields with margins instead of a gap. */
.bre-keys-host {
  display: block;
  min-width: 0;
  margin-top: 4px;
}

.bre-keys { display: flex; flex-direction: column; gap: 8px; }

/* While the key list is still reading, the panel renders NOTHING (the component
   returns an empty .bre-keys). An empty ruled box \u2014 or a placeholder line that
   then swaps to the list \u2014 would paint one frame of a panel that then visibly
   changes: the "the key section flashes when you press Edit" report. :empty
   takes the panel out of the layout until the first answer lands, so the list
   is the first thing the key area ever paints, and nothing under it moves. */
.bre-keys:empty { display: none; }

/* One ruled container holding the keys and the add entry, the way a settings
   list reads: a single hairline box, and hairlines between rows only. */
.bre-keys-list {
  display: flex;
  flex-direction: column;
  margin: 0;
  padding: 0;
  border: 0.5px solid var(--dsw-alias-border-l2, #d5d7dd);
  border-radius: 8px;
  list-style: none;
  overflow: hidden;
}

.bre-keys-list > li + li { border-top: 0.5px solid var(--dsw-alias-border-l2, #d5d7dd); }

.bre-keys-row {
  display: flex;
  align-items: center;
  gap: 8px;
  min-width: 0;
  padding: 9px 10px;
}

/* The enable choice closes the row. The radio stays the real input \u2014 so the
   keys of one provider are one group, choosing one clears the rest, and the
   pick is keyboard-reachable \u2014 and the circle is its face; the word beside it
   names the action instead of a state to hunt for. */
.bre-keys-enable {
  display: inline-flex;
  flex: 0 0 auto;
  align-items: center;
  gap: 6px;
  cursor: pointer;
}

.bre-keys-enable-text {
  font-size: 11px;
  line-height: 1.5;
  color: var(--dsw-alias-label-secondary, #6b7280);
}

.bre-keys-enable:has(.bre-keys-enabled:checked) .bre-keys-enable-text {
  color: var(--dsw-alias-label-primary, #0f1115);
}

.bre-keys-enabled {
  position: absolute;
  width: 1px;
  height: 1px;
  margin: -1px;
  padding: 0;
  border: 0;
  overflow: hidden;
  white-space: nowrap;
  clip-path: inset(50%);
}

.bre-keys-mark {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 16px;
  height: 16px;
  box-sizing: border-box;
  border: 1px solid var(--dsw-alias-border-l3, #9aa0aa);
  border-radius: 50%;
  color: var(--dsw-alias-bg-layer-1, #ffffff);
  transition: background 120ms ease, border-color 120ms ease;
}

.bre-keys-mark > svg { width: 12px; height: 12px; }

.bre-keys-enabled:checked + .bre-keys-mark {
  border-color: var(--dsw-alias-label-primary, #0f1115);
  background: var(--dsw-alias-label-primary, #0f1115);
}

.bre-keys-enabled:focus-visible + .bre-keys-mark {
  outline: none;
  box-shadow: 0 0 0 2px var(--dsw-alias-brand-primary, #3b82f6);
}

/* With an alias the alias is the row's name and the masked key follows it as a
   quiet code pill; without one the masked key is the name and takes the row's
   measure, so a key is always readable as itself. */
.bre-keys-alias {
  flex: 0 1 auto;
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  font-size: 12px;
  font-weight: 500;
  color: var(--dsw-alias-label-primary, #0f1115);
}

.bre-keys-mask {
  flex: 0 1 auto;
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  padding: 1px 6px;
  border-radius: 4px;
  background: var(--dsw-alias-interactive-bg-hover, rgba(127, 127, 127, 0.08));
  color: var(--dsw-alias-label-secondary, #6b7280);
  font-family: ui-monospace, SFMono-Regular, Menlo, Consolas, monospace;
  font-size: 11px;
}

.bre-keys-mask-plain {
  flex: 1 1 auto;
  padding: 0;
  background: transparent;
  color: var(--dsw-alias-label-primary, #0f1115);
  font-family: inherit;
  font-size: 12px;
}

/* The row's three actions, revealed on hover or keyboard focus rather than
   removed, so the row keeps its width and nothing shifts under the pointer.
   Revealing is opacity alone; a pointer that cannot hover simply always sees
   them, because a hidden action there would be an unreachable one. */
.bre-keys-actions {
  display: inline-flex;
  flex: 0 0 auto;
  align-items: center;
  gap: 10px;
  margin-left: auto;
  opacity: 0;
  pointer-events: none;
  transition: opacity 120ms ease;
}

.bre-keys-row:hover .bre-keys-actions,
.bre-keys-row:focus-within .bre-keys-actions {
  opacity: 1;
  pointer-events: auto;
}

@media (hover: none) {
  .bre-keys-actions { opacity: 1; pointer-events: auto; }
}

.bre-keys-danger { color: var(--dsw-alias-state-error-primary, #c62828); }

/* The one inline form. It opens under the row it edits, or \u2014 for a new key \u2014 as
   the list's own last item, which is what keeps adding a key in place instead
   of in a dialog that has to be found and dismissed. */
.bre-keys-form-row { padding: 10px; }

.bre-keys-form { display: flex; flex-direction: column; gap: 8px; }

.bre-keys-form-fields {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 8px;
}

/* One field means the whole row: the value form holds only the secret, and it
   must not sit in half a row beside an empty half. */
.bre-keys-form-fields > :only-child { grid-column: 1 / -1; }

/* The shared input caps itself at 240px for the panels it was written for; here
   the field is the measure. */
.bre-keys-form-fields .bre-text-input { max-width: none; }

.bre-keys-form-actions {
  display: flex;
  align-items: center;
  justify-content: flex-end;
  gap: 8px;
}

/* The shared primary button is styled inside the headers editor, which is not
   where this form lives, so the key list carries its own compact copy. */
.bre-keys-form-actions .bre-primary-button {
  height: 28px;
  padding: 0 12px;
  border: 0;
  border-radius: var(--dsw-radius-md, 8px);
  background: var(--dsw-alias-button-primary-fill, #0f1115);
  color: var(--dsw-alias-label-primary-foreground, #ffffff);
  font: inherit;
  font-size: 12px;
  cursor: pointer;
  -webkit-appearance: none;
  appearance: none;
}

.bre-keys-form-actions .bre-primary-button:hover {
  background: var(--dsw-alias-button-primary-hover, #43454a);
}

.bre-keys-form-actions .bre-primary-button:disabled { opacity: 0.5; cursor: default; }

.bre-keys-form-actions .bre-primary-button:focus-visible {
  outline: none;
  box-shadow: 0 0 0 2px var(--dsw-alias-brand-primary, #3b82f6);
}

/* The add entry is the list's own last row \u2014 full width, the same shape as the
   keys it adds to \u2014 so the way in and the thing it makes read as one list. */
.bre-keys-add-row { padding: 0; }

.bre-keys-add {
  display: flex;
  align-items: center;
  gap: 8px;
  width: 100%;
  padding: 9px 10px;
  box-sizing: border-box;
  border: 0;
  background: transparent;
  color: var(--dsw-alias-label-secondary, #6b7280);
  font: inherit;
  font-size: 12px;
  text-align: left;
  cursor: pointer;
  -webkit-appearance: none;
  appearance: none;
  transition: background 120ms ease, color 120ms ease;
}

.bre-keys-add:hover {
  background: var(--dsw-alias-interactive-bg-hover, rgba(127, 127, 127, 0.08));
  color: var(--dsw-alias-label-primary, #0f1115);
}

.bre-keys-add:focus-visible {
  outline: none;
  box-shadow: inset 0 0 0 2px var(--dsw-alias-brand-primary, #3b82f6);
}

.bre-keys-add:disabled { opacity: 0.55; cursor: default; }

.bre-keys-add-mark {
  display: inline-flex;
  flex: 0 0 auto;
  align-items: center;
  justify-content: center;
  width: 16px;
  height: 16px;
}

.bre-keys .bre-effort-message { font-size: 11px; }

@media (prefers-reduced-motion: reduce) {
  .bre-editor-tab { transition: none; }
  .bre-key-eye { transition: none; }
  .bre-keys-mark, .bre-keys-actions, .bre-keys-add { transition: none; }
}
`;var wt=require("react"),Xo=require("react-dom");var T=require("react"),ar=require("react-dom"),qo=require("react-dom");var No=["off","minimal","low","medium","high","xhigh","max"],Ka=["text","image"];var Wa=[{id:"deepseek-v4-vision",patterns:["deepseek-v4-flash-vision","deepseek-v4-vision"],efforts:{off:"none",low:"low",high:"high",max:"max"},defaultEffort:"high",compat:{thinkingFormat:"deepseek",supportsReasoningEffort:!0},input:["text","image"],contextWindow:1048576,maxTokens:384e3,note:"DeepSeek \u89C6\u89C9\u5B9E\u9A8C\u7248 id\uFF08deepseek-v4-flash-vision-exp\uFF09\u3002\u5B98\u65B9\u76EE\u5F55\u5DF2\u6807\u6CE8\u8BE5\u6A21\u578B\u9000\u5F79\uFF0C\u540D\u5B57\u4ECD\u88AB\u63A5\u53D7\u3001\u7531\u73B0\u884C deepseek-flash \u63D0\u4F9B\u670D\u52A1\u2014\u2014\u56FE\u7247\u8F93\u5165\u73B0\u5DF2\u7531 deepseek-flash \u539F\u751F\u63D0\u4F9B\u3002"},{id:"deepseek-v4-1-flash",patterns:["deepseek-v4.1-flash","deepseek-flash"],efforts:{off:"none",low:"low",high:"high",max:"max"},defaultEffort:"high",compat:{thinkingFormat:"deepseek",supportsReasoningEffort:!0},input:["text","image"],contextWindow:1048576,maxTokens:384e3,note:'DeepSeek-V4.1-Flash\uFF082026-09-10 \u53D1\u5E03\u7684\u73B0\u884C\u5B98\u65B9\u6A21\u578B\uFF0C\u5B98\u65B9 id \u4E3A deepseek-flash\uFF1B25 \u4E07\u5E76\u53D1\u3001**\u539F\u751F\u56FE\u7247\u8F93\u5165**\uFF09\u3002V4.1 \u7684\u5404\u5199\u6CD5\uFF08deepseek-flash\u3001deepseek-v4.1-flash\u3001deepseek-v4-1-flash\uFF0C\u4EE5\u53CA\u5E26\u65E5\u671F\u540E\u7F00\u7684\u7B2C\u4E09\u65B9\u53D8\u4F53\uFF09\u90FD\u5F52\u6B64\u6761\u2014\u2014\u7EAF\u6587\u672C\u7684 deepseek-v4 \u4E3B\u5E72\u4E0D\u518D\u541E\u6389\u5B83\u4EEC\u3002\u5B98\u65B9\u679A\u4E3E\u540C V4 \u7CFB\uFF1AOff\uFF08thinking:"disabled"\uFF09/ Low / High / Max\uFF0C\u9ED8\u8BA4 High\uFF1B\u5BB9\u91CF 1,048,576 \u4E0A\u4E0B\u6587 / \u6700\u5927\u8F93\u51FA 384K\u3002'},{id:"deepseek-v4",patterns:["deepseek-v4"],efforts:{off:"none",low:"low",high:"high",max:"max"},defaultEffort:"high",compat:{thinkingFormat:"deepseek",supportsReasoningEffort:!0},input:["text"],contextWindow:1048576,maxTokens:384e3,note:'DeepSeek \u5B98\u65B9\u679A\u4E3E Low / High / Max\uFF08\u9ED8\u8BA4 High\uFF1Bminimal\u3001medium\u3001xhigh \u517C\u5BB9\u6620\u5C04\uFF0Cultra\u2192max\uFF09\uFF0COff \u5373 thinking:"disabled"\uFF08Responses API \u4E0B off \u4EE5 reasoning.effort:"none" \u8868\u793A\uFF09\u3002\u672C\u6761\u76EE\u662F V4 \u5BB6\u65CF\u7684**\u7EAF\u6587\u672C**\u6210\u5458\uFF1Adeepseek-v4-pro\uFF08= DeepSeek-V4-Pro-0813\uFF0C\u5B98\u65B9\u4E0D\u652F\u6301\u56FE\u7247\uFF09\u4E0E\u5DF2\u9000\u5F79\u6A21\u578B\u7684\u517C\u5BB9\u522B\u540D deepseek-v4-flash\uFF08deepseek-v4-flash-vision-exp \u53E6\u6709\u89C6\u89C9\u6761\u76EE\uFF09\u3002**\u6536\u56FE\u7684 V4.1-Flash\uFF08\u5B98\u65B9 id deepseek-flash\uFF09\u53E6\u6709\u4E13\u95E8\u6761\u76EE**\uFF0C\u5176 input \u542B image\u3002\u5BB9\u91CF\uFF1A1,048,576 \u4E0A\u4E0B\u6587 / \u6700\u5927\u8F93\u51FA 384K\uFF08393,216\uFF1B\u9ED8\u8BA4\u975E\u601D\u8003 8K\u3001\u601D\u8003 64K\u3001effort=max \u65F6 128K\uFF09\u3002'},{id:"deepseek-v3",patterns:["deepseek-v3","deepseek-chat"],efforts:{off:"none",high:"high",max:"max"},compat:{thinkingFormat:"deepseek",supportsReasoningEffort:!0},input:["text"],contextWindow:163840,maxTokens:65536,note:"DeepSeek V3 \u6863\u4F4D\uFF1AOff / High / Max\u3002\u5B98\u65B9\u5DF2\u505C\u552E V3 \u4EE3\uFF08\u5B9A\u4EF7\u9875\u4EC5\u5269 V4 \u4E09\u578B\uFF09\uFF0C\u5BB9\u91CF\u53D6\u76EE\u5F55\u73B0\u5F79\u503C\u3002"},{id:"deepseek-r1",patterns:["deepseek-r1","deepseek-reasoner"],efforts:{high:"high"},defaultEffort:"high",compat:{thinkingFormat:"deepseek",supportsReasoningEffort:!0},input:["text"],contextWindow:163840,maxTokens:32768,note:"DeepSeek-R1 \u4E3A\u63A8\u7406\u6A21\u578B\uFF0C\u4EC5\u63D0\u4F9B High\u3002\u5B98\u65B9\u5DF2\u4E0B\u67B6 R1 \u4EE3\uFF0C\u5BB9\u91CF\u53D6\u76EE\u5F55 r1-0528 \u503C\u3002"},{id:"openai-gpt-5-2",patterns:["gpt-5.2"],efforts:{off:"none",low:"low",medium:"medium",high:"high",xhigh:"xhigh"},defaultEffort:"off",compat:{thinkingFormat:"openai",supportsReasoningEffort:!0},input:["text","image"],contextWindow:4e5,maxTokens:128e3,note:"GPT-5.2 \u6863\u4F4D\uFF1ANone / Low / Medium / High / XHigh\uFF08\u9ED8\u8BA4 None\uFF09\u3002\u5B98\u65B9\u53E6\u652F\u6301 PDF \u8F93\u5165\uFF08\u6838\u5FC3\u8BCD\u8868\u6682\u4E0D\u542B\uFF09\u3002gpt-5.2-pro \u5B98\u65B9\u9875\u672A\u5355\u5217\u6863\u4F4D\u884C\uFF0C\u6309\u672C\u6761\u76EE\u540C\u6863\u5904\u7406\uFF1Bgpt-5.2-codex \u89C1\u5355\u72EC\u6761\u76EE\u3002"},{id:"openai-gpt-5-2-codex",patterns:["gpt-5.2-codex"],efforts:{low:"low",medium:"medium",high:"high",xhigh:"xhigh"},defaultEffort:"medium",compat:{thinkingFormat:"openai",supportsReasoningEffort:!0},input:["text","image"],contextWindow:4e5,maxTokens:128e3,note:"GPT-5.2-Codex \u6863\u4F4D\uFF1ALow / Medium / High / XHigh\uFF08\u65E0 None \u6863\uFF0C\u52FF\u52FE Off\uFF09\uFF0C\u5E26\u56FE\u8F93\u5165\u3001400K\u3002"},{id:"openai-gpt-5-6",patterns:["gpt-5.6"],efforts:{off:"none",low:"low",medium:"medium",high:"high",xhigh:"xhigh",max:"max"},defaultEffort:"medium",compat:{thinkingFormat:"openai",supportsReasoningEffort:!0},input:["text","image"],contextWindow:105e4,maxTokens:128e3,note:"GPT-5.6\uFF08\u522B\u540D\u5373 sol\uFF09\u6863\u4F4D\uFF1ANone / Low / Medium(\u9ED8\u8BA4) / High / XHigh / Max\uFF1Bsol/luna/terra \u540C\u6863\uFF0C\u5E26\u56FE\u8F93\u5165\u3002"},{id:"openai-gpt-5-5",patterns:["gpt-5.5"],efforts:{off:"none",low:"low",medium:"medium",high:"high",xhigh:"xhigh"},defaultEffort:"medium",compat:{thinkingFormat:"openai",supportsReasoningEffort:!0},input:["text","image"],contextWindow:105e4,maxTokens:128e3,note:"GPT-5.5 \u6863\u4F4D\uFF1ANone / Low / Medium(\u9ED8\u8BA4) / High / XHigh\uFF0C\u5E26\u56FE\u8F93\u5165\u3002pro \u53D8\u4F53\u4EC5 Medium / High(\u9ED8\u8BA4) / XHigh \u4E14\u4EC5 Responses API\u3002"},{id:"openai-gpt-5-4",patterns:["gpt-5.4"],efforts:{off:"none",low:"low",medium:"medium",high:"high",xhigh:"xhigh"},defaultEffort:"off",compat:{thinkingFormat:"openai",supportsReasoningEffort:!0},input:["text","image"],contextWindow:105e4,maxTokens:128e3,note:"GPT-5.4 \u6863\u4F4D\uFF1ANone(\u9ED8\u8BA4) / Low / Medium / High / XHigh\uFF0C\u5E26\u56FE\u8F93\u5165\u3002pro \u53D8\u4F53\u4EC5 Medium/High/XHigh\uFF1Bmini/nano \u4E3A 400K \u4E0A\u4E0B\u6587\u3002"},{id:"openai-gpt-5-3",patterns:["gpt-5.3"],efforts:{low:"low",medium:"medium",high:"high",xhigh:"xhigh"},defaultEffort:"medium",compat:{thinkingFormat:"openai",supportsReasoningEffort:!0},input:["text","image"],contextWindow:4e5,maxTokens:128e3,note:"GPT-5.3-Codex \u6863\u4F4D\uFF1ALow / Medium / High / XHigh\uFF08\u65E0 None \u6863\uFF09\uFF0C\u5E26\u56FE\u8F93\u5165\u3001400K\uFF1Bgpt-5.3-chat \u4E3A\u975E\u63A8\u7406\u804A\u5929\u6A21\u578B\uFF08\u89C1 chat \u6761\u76EE\uFF09\u3002"},{id:"openai-gpt-5-1",patterns:["gpt-5.1"],efforts:{off:"none",low:"low",medium:"medium",high:"high"},defaultEffort:"off",compat:{thinkingFormat:"openai",supportsReasoningEffort:!0},input:["text","image"],contextWindow:4e5,maxTokens:128e3,note:"GPT-5.1 \u6863\u4F4D\uFF1ANone / Low / Medium / High\uFF08\u9ED8\u8BA4 None\uFF09\u3002"},{id:"openai-gpt-5-1-codex",patterns:["gpt-5.1-codex"],efforts:{low:"low",medium:"medium",high:"high"},compat:{thinkingFormat:"openai",supportsReasoningEffort:!0},input:["text","image"],contextWindow:4e5,maxTokens:128e3,note:"GPT-5.1-Codex \u7CFB\u5217\uFF1A\u5B98\u65B9\u6A21\u578B\u9875\u672A\u5355\u5217 effort \u503C\u57DF\uFF0C\u6309\u540C\u4EE3\u4FDD\u5B88\u6863 Low / Medium / High\uFF08\u65E0 None\uFF1Bxhigh \u672A\u8BC1\u5B9E\uFF09\u3002\u5982\u7AEF\u70B9\u652F\u6301 xhigh/none \u53EF\u624B\u8C03\u3002"},{id:"openai-gpt-5",patterns:["gpt-5"],efforts:{minimal:"minimal",low:"low",medium:"medium",high:"high"},defaultEffort:"medium",compat:{thinkingFormat:"openai",supportsReasoningEffort:!0},input:["text","image"],contextWindow:4e5,maxTokens:128e3,note:"GPT-5 \u521D\u4EE3\u6863\u4F4D\uFF1AMinimal / Low / Medium / High\uFF0C\u65E0\u5173\u95ED\u6863\u3002"},{id:"openai-chat",patterns:["gpt-5.1-chat-latest","gpt-5.2-chat-latest","gpt-5.3-chat-latest","gpt-5-chat-latest","gpt-chat-latest","gpt-5-chat","gpt-5.1-chat","gpt-5.2-chat","gpt-5.3-chat"],efforts:!1,input:["text","image"],contextWindow:128e3,maxTokens:16384,note:"-chat \u7CFB\u5217\uFF08\u5B98\u65B9 id \u4E3A gpt-5.x-chat-latest\uFF09\u4E3A\u975E\u63A8\u7406\u804A\u5929\u6A21\u578B\uFF0C\u4E0D\u652F\u6301 effort \u53C2\u6570\uFF08\u52FF\u52FE\u601D\u8003\u6863\uFF09\uFF1B\u5B98\u65B9\u652F\u6301\u56FE\u7247\u8F93\u5165\uFF0C128K / 16,384 \u8F93\u51FA\u3002gpt-5-chat-latest \u5DF2\u4E8E 2026-07-23 \u4E0B\u67B6\u3001gpt-chat-latest \u5DF2\u65E0\u5B98\u65B9\u9875\u9762\uFF08\u4FDD\u7559\u6A21\u5F0F\u4F9B\u7F51\u5173\uFF09\u3002"},{id:"openai-o",patterns:["o1","o3","o4"],efforts:{low:"low",medium:"medium",high:"high"},defaultEffort:"medium",compat:{thinkingFormat:"openai",supportsReasoningEffort:!0},input:["text","image"],contextWindow:2e5,maxTokens:1e5,note:"OpenAI o \u7CFB\u6863\u4F4D\uFF1ALow / Medium / High\u3002\u5B98\u65B9\u5DF2\u4E8E 2026-06 \u516C\u544A\u9000\u5F79\uFF08o1/o1-pro/o3-mini/o4-mini 2026-10-23 \u79FB\u9664\u3001o3/o3-pro 2026-12-11\uFF09\uFF0C\u7F51\u5173\u6B8B\u7559\u4ECD\u53EF\u547D\u4E2D\uFF1B\u591A\u6570 o \u7CFB\u7AEF\u70B9\u6536\u56FE\uFF08o3-mini \u4F8B\u5916\uFF09\u3002"},{id:"openai-gpt-oss",patterns:["gpt-oss"],efforts:{low:"low",medium:"medium",high:"high"},defaultEffort:"low",compat:{thinkingFormat:"openai",supportsReasoningEffort:!0},input:["text"],contextWindow:131072,maxTokens:131072,note:"GPT-OSS \u5F00\u6E90\u6743\u91CD\uFF08Ollama/vLLM \u5E38\u89C1\uFF09\uFF1Areasoning effort Low / Medium / High\uFF0C\u7EAF\u6587\u672C\uFF0C131K \u4E0A\u4E0B\u6587 / 131K \u8F93\u51FA\u30022026-09 \u590D\u6838\uFF1A\u5B98\u65B9\u6A21\u578B\u9875\u73B0\u5728\u5199 Chat Completions = Not supported\u3001\u65E0\u56FE\u7247\u8F93\u5165\uFF08\u9ED8\u8BA4 Low \u6765\u81EA\u5B98\u65B9 CLI\uFF0C\u4E0D\u662F API \u9875\uFF09\uFF0C\u56E0\u6B64\u8FD9\u91CC\u4E0D\u518D\u58F0\u660E Off\u3002"},{id:"openai-gpt-6-astra",patterns:["gpt-6-astra","gpt-6"],efforts:{low:"low",medium:"medium",high:"high",xhigh:"xhigh",max:"max"},compat:{thinkingFormat:"openai",supportsReasoningEffort:!0},input:["text","image"],contextWindow:105e4,maxTokens:128e3,note:"GPT-6 Astra \u6863\u4F4D\uFF1ALow / Medium / High / XHigh / Max\u2014\u2014**\u6CA1\u6709 None \u6863**\uFF08\u5B98\u65B9\u539F\u6587\uFF1A\u8BBE\u4E3A none \u8FD4\u56DE HTTP 400\uFF09\uFF0C\u56E0\u6B64\u672C\u6761\u76EE\u4E0D\u58F0\u660E Off\u3002\u5E26\u56FE\u8F93\u5165\uFF0C1,050,000 \u4E0A\u4E0B\u6587 / 128,000 \u8F93\u51FA\uFF1BAI \u5B98\u65B9\u9ED8\u8BA4\u6863\u4F4D\u672A\u516C\u5E03\uFF0C\u6545\u4E0D\u586B\u3002\u5DE5\u5177\u8C03\u7528\u9700\u8D70 Responses API\u3002"},{id:"openai-gpt-5-6-cyber",patterns:["gpt-5.6-cyber"],efforts:{low:"low",medium:"medium",high:"high",xhigh:"xhigh"},compat:{thinkingFormat:"openai",supportsReasoningEffort:!0},input:["text","image"],contextWindow:4e5,maxTokens:128e3,note:"GPT-5.6-Cyber\uFF1A\u5B98\u65B9\u6A21\u578B\u9875\u672A\u5355\u5217 effort \u503C\u57DF\uFF08\u4E0D\u7B49\u4E8E\u4E0D\u652F\u6301\uFF09\uFF0C\u6545\u6309\u540C\u4EE3\u4FDD\u5B88\u6863 Low / Medium / High / XHigh\uFF1B\u8BE5\u578B\u53F7\u4EC5 Responses API\uFF0C\u5E26\u56FE\u8F93\u5165\u3001400K \u4E0A\u4E0B\u6587\u3002\u5B98\u65B9\u652F\u6301\u7684\u5176\u4ED6\u6863\u4F4D\u53EF\u624B\u8C03\u540E\u5E94\u7528\u3002"},{id:"openai-gpt-4o",patterns:["gpt-4o"],efforts:!1,input:["text","image"],contextWindow:128e3,maxTokens:16384,note:"GPT-4o \u4EE3\u9645\uFF1A\u975E\u63A8\u7406\u6A21\u578B\uFF0C\u4E0D\u652F\u6301 effort \u53C2\u6570\uFF08\u52FF\u52FE\u601D\u8003\u6863\uFF09\uFF1B\u56FE\u7247\u8F93\u5165\u5168\u7CFB\u6807\u914D\uFF0C128K / 16,384 \u8F93\u51FA\u3002"},{id:"openai-gpt-4-1",patterns:["gpt-4.1"],efforts:!1,input:["text","image"],contextWindow:1047576,maxTokens:32768,note:"GPT-4.1 \u5168\u7CFB\uFF08\u542B mini/nano\uFF09\uFF1A\u975E\u63A8\u7406\u6A21\u578B\uFF0C\u4E0D\u652F\u6301 effort \u53C2\u6570\uFF1B\u5B98\u65B9 1,047,576 \u4E0A\u4E0B\u6587 / 32,768 \u8F93\u51FA\uFF0C\u5168\u7CFB\u5E26\u56FE\u8F93\u5165\u3002"},{id:"openai-gpt-4-turbo-preview",patterns:["gpt-4-turbo-preview"],efforts:!1,input:["text"],contextWindow:128e3,maxTokens:4096,note:"GPT-4 Turbo Preview\uFF1A\u975E\u63A8\u7406\u6A21\u578B\uFF0C\u7EAF\u6587\u672C\u8F93\u5165\uFF08\u6B63\u5F0F turbo \u5FEB\u7167\u652F\u6301\u56FE\u7247\uFF0C\u89C1\u4E0B\u6761\uFF09\uFF0C128K\u3002"},{id:"openai-gpt-4-turbo",patterns:["gpt-4-turbo"],efforts:!1,input:["text","image"],contextWindow:128e3,maxTokens:4096,note:"GPT-4 Turbo\uFF1A\u975E\u63A8\u7406\u6A21\u578B\uFF0C\u5B98\u65B9\u652F\u6301\u56FE\u7247\u8F93\u5165\uFF0C128K / 4,096 \u8F93\u51FA\u3002"},{id:"openai-gpt",patterns:["gpt-4","gpt-3.5"],efforts:!1,input:["text"],note:"GPT-4/3.5 \u4EE3\u9645\uFF1A\u975E\u63A8\u7406\u6A21\u578B\uFF0C\u4E0D\u652F\u6301 effort \u53C2\u6570\uFF08\u52FF\u52FE\u601D\u8003\u6863\uFF09\u3002gpt-4-turbo/4.1 \u8D77\u652F\u6301\u56FE\u7247\uFF0C\u89C1\u5355\u72EC\u6761\u76EE\uFF1B\u65B0\u4EE3\u8BF7\u7528 GPT-5 \u7CFB\uFF08\u89C1 openai-chat/gpt-5.x \u6761\u76EE\uFF09\u3002"},{id:"anthropic-claude-5",patterns:["claude-fable-5","claude-mythos-5","claude-opus-5","claude-sonnet-5"],efforts:{low:"low",medium:"medium",high:"high",xhigh:"xhigh",max:"max"},defaultEffort:"high",compat:{supportsReasoningEffort:!0},anthropicAdaptive:!0,input:["text","image"],contextWindow:1e6,maxTokens:128e3,note:"Claude 5 \u4EE3\uFF08Fable 5 / Mythos 5 / Opus 5 / Sonnet 5\uFF09\u6863\u4F4D\uFF1ALow / Medium / High(\u9ED8\u8BA4) / XHigh / Max\uFF1BFable 5.1 \u4E0E Mythos 5.1 \u89C1\u5355\u72EC\u6761\u76EE\uFF0CMythos Preview \u4EC5\u81F3 Max\u30021M \u4E0A\u4E0B\u6587 / 128K \u8F93\u51FA\uFF08Batch 300K\uFF09\u3002\u5B98\u65B9\u652F\u6301 PDF \u8F93\u5165\u3002\u6CE8\u610F\uFF1AAnthropic \u5B98\u65B9 OpenAI \u517C\u5BB9\u5C42\u4F1A\u5FFD\u7565 effort \u53C2\u6570\uFF0C\u58F0\u660E\u5728\u7B2C\u4E09\u65B9\u7F51\u5173\u6620\u5C04\u65F6\u751F\u6548\u3002"},{id:"anthropic-claude-5-1",patterns:["claude-fable-5-1","claude-mythos-5-1"],efforts:{low:"low",medium:"medium",high:"high",xhigh:"xhigh",max:"max"},defaultEffort:"high",compat:{supportsReasoningEffort:!0},anthropicAdaptive:!0,input:["text","image"],contextWindow:1e6,maxTokens:128e3,note:"Claude Fable 5.1 / Mythos 5.1\uFF1A\u5B98\u65B9\u6863\u4F4D Low / Medium / High(\u9ED8\u8BA4) / XHigh / Max\uFF0C\u81EA\u9002\u5E94\u601D\u8003\u5E38\u5F00\uFF08\u4E0D\u63A5\u53D7 enabled/disabled\uFF09\u30021M \u4E0A\u4E0B\u6587 / 128K \u8F93\u51FA\uFF1B\u8FD9\u4E24\u578B\u4E5F\u662F\u5B98\u65B9\u552F\u4E00\u5141\u8BB8\u4F1A\u8BDD\u4E2D\u9014\u6539\u6863\u7684\uFF08\u9700 beta header\uFF0C\u672C\u63D2\u4EF6\u4E0D\u6D89\u53CA\uFF09\u3002"},{id:"anthropic-claude-mythos-preview",patterns:["claude-mythos-preview"],efforts:{low:"low",medium:"medium",high:"high",max:"max"},defaultEffort:"high",compat:{supportsReasoningEffort:!0},anthropicAdaptive:!0,input:["text","image"],contextWindow:1e6,maxTokens:128e3,note:"Claude Mythos Preview\uFF1A\u5B98\u65B9\u6863\u4F4D Low / Medium / High / Max\uFF08\u65E0 XHigh\uFF09\uFF0C1M \u4E0A\u4E0B\u6587\u3002"},{id:"anthropic-claude-opus-4-high",patterns:["claude-opus-4-8","claude-opus-4-7"],efforts:{low:"low",medium:"medium",high:"high",xhigh:"xhigh",max:"max"},defaultEffort:"high",compat:{supportsReasoningEffort:!0},anthropicAdaptive:!0,input:["text","image"],contextWindow:1e6,maxTokens:128e3,note:"Claude Opus 4.7/4.8 \u6863\u4F4D\uFF1ALow / Medium / High(\u9ED8\u8BA4) / XHigh / Max\uFF1Bxhigh \u4E3A\u5B98\u65B9\u63A8\u8350\u7684\u7F16\u7801\u8D77\u6B65\u6863\u30021M \u4E0A\u4E0B\u6587\u3002"},{id:"anthropic-claude-4-6",patterns:["claude-opus-4-6","claude-sonnet-4-6"],efforts:{low:"low",medium:"medium",high:"high",max:"max"},defaultEffort:"high",compat:{supportsReasoningEffort:!0},anthropicAdaptive:!0,input:["text","image"],contextWindow:1e6,maxTokens:128e3,note:"Claude 4.6 \u4EE3\u6863\u4F4D\uFF1ALow / Medium / High / Max\uFF08\u65E0 XHigh\u2014\u2014\u5B98\u65B9\u660E\u8A00\u300C\u652F\u6301 max \u7684\u90E8\u5206\u578B\u53F7\u4E0D\u652F\u6301 xhigh\u300D\uFF09\u30021M \u4E0A\u4E0B\u6587\u3002"},{id:"anthropic-claude-opus-4-5",patterns:["claude-opus-4-5"],efforts:{low:"low",medium:"medium",high:"high"},defaultEffort:"high",compat:{supportsReasoningEffort:!0},input:["text","image"],contextWindow:2e5,maxTokens:64e3,note:"Claude Opus 4.5\uFF1A\u5B98\u65B9 effort \u652F\u6301\u5217\u8868\uFF0820251101 \u5FEB\u7167\uFF09\uFF0C\u6863\u4F4D Low / Medium / High\uFF08\u65E0 XHigh/Max\uFF09\uFF0C\u53EF\u4E0E budget_tokens \u5E76\u7528\uFF1B200K / 64K\u3002"},{id:"anthropic-claude",patterns:["claude"],efforts:!1,input:["text","image"],contextWindow:2e5,maxTokens:64e3,note:"Claude 3.x \u4E0E Sonnet 4.5 / Haiku 4.5\uFF1A\u5B98\u65B9 effort \u53C2\u6570\u4E0D\u652F\u6301\uFF08\u4EC5 Fable/Mythos 5\u3001Opus 5/4.6-4.8\u3001Sonnet 5/4.6\u3001Opus 4.5 \u652F\u6301\uFF09\uFF0C\u601D\u8003\u7531 thinking.type \u63A7\u5236\u2014\u2014\u52FF\u52FE\u601D\u8003\u6863\u3002\u53C2\u8003\u5BB9\u91CF 200K / 64K\uFF08Haiku 3.5 \u4E3A\u7EAF\u6587\u672C\uFF0C\u6309\u9700\u53D6\u6D88\u56FE\u7247\uFF09\u3002"},{id:"google-gemini",patterns:["gemini"],efforts:{low:"low",medium:"medium",high:"high"},compat:{thinkingFormat:"openai",supportsReasoningEffort:!0},input:["text","image"],contextWindow:1048576,maxTokens:65536,note:"Gemini \u901A\u7528\u5B89\u5168\u6863\uFF1ALow / Medium / High\uFF08\u5B98\u65B9 OpenAI \u517C\u5BB9\u6620\u5C04\u8868\u53E6\u6536 minimal\uFF1A2.5 \u7CFB\u6620\u5C04\u4E3A 1,024 \u9884\u7B97\u30013.1 Flash-Lite/3 Flash \u539F\u751F minimal\u30013.1 Pro \u843D low\uFF09\u3002none \u4EC5\u80FD\u5173 2.5 \u975E Pro\uFF1B2.5 Pro \u4E0E 3 \u4EE3\u4E0D\u53EF\u5173\uFF1B\u5404\u578B\u9ED8\u8BA4\u4E0D\u4E00\uFF08flash-lite \u9ED8\u8BA4\u5173\uFF09\u3002\u5B98\u65B9\u53E6\u6536\u97F3\u9891/\u89C6\u9891/PDF\u3002"},{id:"xai-grok-4-7",patterns:["grok-4.7"],efforts:{low:"low",medium:"medium",high:"high",xhigh:"xhigh"},compat:{thinkingFormat:"openai",supportsReasoningEffort:!0},input:["text","image"],contextWindow:5e5,note:'Grok 4.7\uFF08\u4E0A\u6E38\u5FEB\u7167 grok-4.7-20260916\uFF09\uFF1A\u6863\u4F4D Low / Medium / High / XHigh\u2014\u2014**\u53D6\u81EA\u516C\u5F00\u76EE\u5F55**\uFF08OpenRouter \u7684 supported_parameters\u3001models.dev \u5BF9 docs.x.ai \u7684\u8F6C\u8FF0\uFF09\uFF0C\u672C\u6B21 xAI \u5B98\u65B9\u6587\u6863\u7AD9\u4E0D\u53EF\u8FBE\u3001\u672A\u80FD\u4E00\u624B\u8BC1\u5B9E\uFF1B\u9ED8\u8BA4\u6863\u4F4D\u4E0E"\u80FD\u5426\u5173\u95ED\u601D\u8003"\u540C\u6837\u672A\u8BC1\u5B9E\uFF0C\u6545\u4E0D\u58F0\u660E Off\uFF0C\u4E5F\u4E0D\u5199\u9ED8\u8BA4\u6863\u3002\u5E26\u56FE\u8F93\u5165\uFF08\u76EE\u5F55\u8BB0 text+image+file\uFF0CPDF \u5B58\u7591\uFF09\uFF0C500K \u4E0A\u4E0B\u6587\uFF1B\u6700\u5927\u8F93\u51FA\u5404\u76EE\u5F55\u7ED9\u51FA 450K \u4E0E 500K \u4E24\u79CD\u503C\uFF0C\u6309"\u5206\u6B67\u5373\u4E0D\u5199"\u5904\u7406\u30022026-08 \u90A3\u6B21"grok-4.7 \u4E0D\u5B58\u5728\uFF08\u5B98\u65B9 404\uFF09"\u7684\u7ED3\u8BBA\u5DF2\u968F\u53D1\u5E03\u4F5C\u5E9F\u3002'},{id:"xai-grok-high",patterns:["grok-4.6"],efforts:{low:"low",medium:"medium",high:"high",xhigh:"xhigh"},defaultEffort:"high",compat:{thinkingFormat:"openai",supportsReasoningEffort:!0},input:["text","image"],contextWindow:5e5,note:'Grok 4.6 \u6863\u4F4D\uFF1ALow / Medium / High(\u9ED8\u8BA4) / XHigh\uFF0C\u601D\u8003\u4E0D\u53EF\u5173\u95ED\uFF1B\u5E26\u56FE\u8F93\u5165\u3001500K \u4E0A\u4E0B\u6587\u3002Grok 4.7 \u89C1\u4E0A\u4E00\u6761\uFF08\u6B64\u524D\u8BB0\u4E3A"\u4E0D\u5B58\u5728"\uFF0C\u5DF2\u968F\u53D1\u5E03\u4F5C\u5E9F\uFF09\u3002'},{id:"xai-grok-4-5",patterns:["grok-4.5"],efforts:{low:"low",medium:"medium",high:"high"},defaultEffort:"high",compat:{thinkingFormat:"openai",supportsReasoningEffort:!0},input:["text","image"],contextWindow:5e5,note:"Grok 4.5 \u6863\u4F4D\uFF1ALow / Medium / High(\u9ED8\u8BA4)\uFF0C\u601D\u8003\u4E0D\u53EF\u5173\u95ED\uFF1B\u5E26\u56FE\u8F93\u5165\u3002\u4F20\u5165 xhigh \u4F1A\u88AB\u5B98\u65B9\u9759\u9ED8\u6309 High \u5904\u7406\u3002"},{id:"xai-grok-4-3",patterns:["grok-4.3"],efforts:{off:"none",low:"low",medium:"medium",high:"high",xhigh:"xhigh"},defaultEffort:"low",compat:{thinkingFormat:"openai",supportsReasoningEffort:!0},input:["text","image"],contextWindow:1e6,note:"Grok 4.3\uFF1A\u5B98\u65B9\u56DB\u7EA7 reasoning effort\uFF08None / Low / Medium / High\uFF09\uFF0C1M \u4E0A\u4E0B\u6587\u3001\u5E26\u56FE\u8F93\u5165\uFF1Bgrok-4-fast \u7B49\u65E7 slug 2026-05-15 \u8D77\u81EA\u52A8\u91CD\u5B9A\u5411\u5230\u672C\u578B\u53F7\u3002"},{id:"xai-grok",patterns:["grok"],efforts:{low:"low",medium:"medium",high:"high"},compat:{thinkingFormat:"openai",supportsReasoningEffort:!0},input:["text"],note:"Grok \u901A\u7528\u6863\u4F4D\uFF1ALow / Medium / High\u3002\u521D\u4EE3 grok-4\u3001grok-4.20 \u4E0E grok-build-0.1 \u4E0D\u63A5\u53D7\u8BE5\u53C2\u6570\uFF08grok-4 \u7CFB\u4E0E grok-3 \u5DF2\u4E8E 2026-05-15 \u9000\u5F79\u5E76\u91CD\u5B9A\u5411\u81F3 4.3\uFF09\uFF1Bgrok-4.20-multi-agent \u7684\u56DB\u6863\u63A7\u5236\u7684\u662F agent \u6570\u91CF\u800C\u975E\u601D\u8003\u6DF1\u5EA6\u3002\u65B0\u65E7\u4EE3\u9645\u8BF7\u4F18\u5148\u9009 4.5/4.6/4.3\uFF1B\u591A\u6A21\u6001\u53D8\u4F53\u6309\u9700\u52FE\u9009\u56FE\u7247\u3002"},{id:"mistral-magistral",patterns:["magistral"],efforts:!1,input:["text"],contextWindow:32768,maxTokens:32768,note:"Magistral \u539F\u751F\u601D\u8003\u7EBF\uFF08\u65E0 effort \u53C2\u6570\uFF0C\u4E3A prompt_mode \u8BED\u4E49\uFF09\uFF0C\u5B98\u65B9\u5DF2\u4E8E 2026-07-28 \u58F0\u660E\u5F03\u7528\u3001\u9010\u6B65\u64A4\u51FA\uFF1B\u73B0\u5F79\u63A8\u7406\u8D70 mistral-small-2603 / mistral-medium-3-5 \u7684 reasoning_effort\uFF08\u89C1\u4E0B\u6761\uFF09\u3002"},{id:"mistral-medium-3",patterns:["mistral-medium-3.5","mistral-small-latest","mistral-small-2603"],efforts:{off:"none",high:"high"},defaultEffort:"off",compat:{thinkingFormat:"openai",supportsReasoningEffort:!0},input:["text","image"],note:"Mistral \u73B0\u5F79\u63A8\u7406\u6863\uFF1ANone / High\u2014\u2014\u5B98\u65B9 reasoning_effort \u679A\u4E3E\uFF08mistral-common \u534F\u8BAE\u5E93\uFF09\u5373 none/high\uFF1Bmistral-small-2603\uFF08Small 4\uFF09\u4E0E mistral-medium-3-5 \u7ECF\u5B83\u63A7\u5236\uFF0CMedium 3.5 \u5E26\u89C6\u89C9\u3002\u5BB9\u91CF\u672A\u5728\u5B98\u65B9\u76EE\u5F55\u9875\u5355\u5217\uFF0C\u4E0D\u63D0\u4F9B\u3002"},{id:"qwen-vision",patterns:["qwen-vl","qwen2-vl","qwen2-5-vl","qwen3-vl","qvq"],efforts:{off:null,high:"high"},defaultEffort:"high",compat:{thinkingFormat:"qwen"},input:["text","image"],contextWindow:131072,maxTokens:8192,note:"\u901A\u4E49\u89C6\u89C9\u7EBF\uFF08Qwen-VL/QvQ\uFF09\uFF1Aenable_thinking \u5F00\u5173\uFF08\u5F00=High\uFF09\uFF0C\u6536\u56FE\u3002qwen3-vl \u5BB9\u91CF\u66F4\u5927\uFF0C\u6309\u9700\u4E0A\u8C03\u3002"},{id:"qwen-3-8",patterns:["qwen3.8"],efforts:{off:null,low:"low",medium:"medium",xhigh:"xhigh"},defaultEffort:"xhigh",compat:{thinkingFormat:"qwen",supportsReasoningEffort:!0},input:["text","image"],contextWindow:1e6,note:"Qwen 3.8 \u7CFB\uFF1A\u5B98\u65B9 reasoning_effort \u6863\u4F4D XHigh(\u9ED8\u8BA4) / Medium / Low\uFF0Cthinking \u9ED8\u8BA4\u5F00\u3001\u53EF\u6309\u8BF7\u6C42\u5173\u95ED\uFF1B\u539F\u751F\u591A\u6A21\u6001\uFF08qwen3.8-max \u56FE\u50CF/\u89C6\u9891\u7406\u89E3\uFF0C\u89C6\u9891\u672A\u5165\u6838\u5FC3\u8BCD\u8868\uFF09\u30021M \u6863\u4E0A\u4E0B\u6587\u300227B \u4E0E Flash-Next \u5F00\u6E90\u6B3E\u89C1\u5355\u72EC\u6761\u76EE\u3002"},{id:"qwen-3-8-27b",patterns:["qwen3.8-27b"],efforts:{off:null,low:"low",medium:"medium",xhigh:"xhigh"},defaultEffort:"xhigh",compat:{thinkingFormat:"qwen",supportsReasoningEffort:!0},input:["text","image"],contextWindow:262144,note:"Qwen3.8-27B\uFF08dense\uFF0C2026-08-14 \u5F00\u6E90\uFF09\uFF1A\u5B98\u65B9 reasoning_effort \u6863\u4F4D XHigh(\u9ED8\u8BA4) / Medium / Low\uFF0Cthinking \u9ED8\u8BA4\u5F00\u3001\u53EF\u6309\u8BF7\u6C42\u5173\uFF1B\u539F\u751F\u56FE\u50CF+\u89C6\u9891\u7406\u89E3\uFF08\u89C6\u9891\u672A\u5165\u6838\u5FC3\u8BCD\u8868\uFF09\u3002262,144 \u539F\u751F\u4E0A\u4E0B\u6587\u3001\u5B98\u65B9\u58F0\u660E\u53EF\u6269\u81F3 1M\u3002\u6765\u6E90\uFF1AHF Qwen/Qwen3.8-27B \u6A21\u578B\u5361\u3002"},{id:"qwen-3-8-flash-next",patterns:["qwen3.8-flash-next"],efforts:{off:null,low:"low",medium:"medium",xhigh:"xhigh"},defaultEffort:"xhigh",compat:{thinkingFormat:"qwen",supportsReasoningEffort:!0},input:["text","image"],contextWindow:262144,note:"Qwen3.8-Flash-Next\uFF08125B-A6B \u5B9E\u9A8C\u67B6\u6784\uFF0CQwen4 \u524D\u8EAB\uFF09\uFF1A\u5B98\u65B9 reasoning_effort \u6863\u4F4D XHigh(\u9ED8\u8BA4) / Medium / Low + enable_thinking \u5F00\u5173\uFF1B\u539F\u751F\u89C6\u89C9\uFF08Vision Encoder\uFF09\u3002262,144 \u539F\u751F\u4E0A\u4E0B\u6587\u3001\u53EF\u6269\u81F3 1M\u3002\u6765\u6E90\uFF1AHF \u6A21\u578B\u5361\u4E0E qwen.ai \u5B98\u65B9\u535A\u5BA2\u3002"},{id:"qwen",patterns:["qwen","qwq"],efforts:{off:null,high:"high"},defaultEffort:"high",compat:{thinkingFormat:"qwen"},input:["text"],contextWindow:1e6,maxTokens:65536,note:"\u901A\u4E49\u5343\u95EE\uFF1Aenable_thinking \u5F00\u5173\uFF08\u65E0 effort \u6863\uFF09\uFF0C\u5F00=High\uFF1B\u73B0\u5F79\u65D7\u8230\u4E3A qwen3.8 \u7CFB\uFF081M \u6863\u4E0A\u4E0B\u6587\uFF0C\u89C1 qwen-3-8 \u6761\u76EE\uFF09\u30023.6/3.7 \u4EE3\u7684 Plus/Flash \u4EA6\u9ED8\u8BA4\u591A\u6A21\u6001\uFF08\u56FE\u7247/\u89C6\u9891\uFF09\uFF0C\u5982\u63A5\u5165\u8BF7\u6309\u9700\u52FE\u9009\u56FE\u7247\uFF1B\u89C6\u89C9\u7EBF\u89C1 qwen-vision \u6761\u76EE\u3002"},{id:"glm-vision",patterns:["glm-4v","glm-4-6v","glm-4-5v","glm-5v"],efforts:{off:null,high:"high"},defaultEffort:"high",compat:{thinkingFormat:"zai"},input:["text","image"],contextWindow:131072,maxTokens:32768,note:"\u667A\u8C31\u89C6\u89C9\u7EBF\uFF08GLM-4V/4.5V/4.6V/5V\uFF09\uFF1Athinking \u5F00\u5173\uFF08\u5F00=High\uFF09\uFF0C\u6536\u56FE\u3002GLM-4.5V \u4E3A\u5F3A\u5236\u601D\u8003\uFF08\u4F20 disabled \u62A5\u9519\uFF0C\u8BF7\u624B\u52A8\u5220 Off \u6863\uFF09\u3002"},{id:"glm-5-3-flash",patterns:["glm-5.3-flash"],efforts:{low:"low",high:"high",max:"max"},defaultEffort:"max",compat:{thinkingFormat:"zai",supportsReasoningEffort:!0},input:["text","image"],contextWindow:1048576,maxTokens:131072,note:"GLM-5.3-Flash\uFF08320B\uFF0C\u5B98\u65B9\u6587\u6863 vlm \u5206\u7C7B\uFF09\uFF1A\u5F3A\u5236\u601D\u8003\uFF08thinking.type \u4EC5 enabled\uFF0C\u4E0D\u652F\u6301\u5173\u95ED\uFF09\uFF0C\u6587\u672C\u53C2\u6570\u4E0E GLM-5.3 \u4E00\u81F4\u2014\u2014\u6863\u4F4D Low / High / Max\u3002\u8F93\u5165\u6A21\u6001\uFF1A\u89C6\u9891\u3001\u56FE\u50CF\u3001\u6587\u672C\u3001\u6587\u4EF6\uFF08\u89C6\u9891/\u6587\u4EF6\u672A\u5165\u6838\u5FC3\u8BCD\u8868\uFF0C\u56FE\u7247\u53EF\u52FE\uFF09\u3002\u5B98\u65B9 1M \u4E0A\u4E0B\u6587 / 128K \u6700\u5927\u8F93\u51FA\u3002\u6765\u6E90\uFF1Adocs.bigmodel.cn \u6A21\u578B\u9875\u3002"},{id:"glm-5-3",patterns:["glm-5.3"],efforts:{low:"low",high:"high",max:"max"},defaultEffort:"max",compat:{thinkingFormat:"zai",supportsReasoningEffort:!0},input:["text"],contextWindow:1048576,maxTokens:131072,note:"GLM-5.3 \u6863\u4F4D\uFF1ALow / High / Max\uFF08\u5F3A\u5236\u601D\u8003\uFF0C\u5176\u4F59\u503C\u62A5\u9519\uFF09\u3002\u5B98\u65B9\u5BB9\u91CF 1M / 128K\u3002"},{id:"glm-5-2",patterns:["glm-5.2"],efforts:{off:"none",minimal:"minimal",low:"low",medium:"medium",high:"high",xhigh:"xhigh",max:"max"},defaultEffort:"max",compat:{thinkingFormat:"zai",supportsReasoningEffort:!0},input:["text"],contextWindow:1048576,maxTokens:131072,note:"GLM-5.2 \u6863\u4F4D\uFF1ANone / Minimal / Low / Medium / High / XHigh / Max\uFF08\u5B98\u65B9\u6620\u5C04\uFF1ALow\xB7Medium\u2192High\u3001XHigh\u2192Max\u3001None\xB7Minimal=\u505C\u6B62\u601D\u8003\uFF09\u3002\u89C6\u89C9\u7EBF\u89C1 glm-vision \u6761\u76EE\u3002"},{id:"glm",patterns:["glm","zhipu","chatglm"],efforts:{off:null,high:"high"},defaultEffort:"high",compat:{thinkingFormat:"zai"},input:["text"],note:"GLM \u901A\u7528\uFF1Athinking \u5F00\u5173\uFF08\u65E0 effort \u6863\uFF09\uFF0C\u5F00=High\uFF1Beffort \u9636\u68AF\u4EC5 GLM-5.2+ \u652F\u6301\uFF08\u89C1\u4E0A\u4E24\u6761\u76EE\uFF09\u3002\u6CE8\u610F GLM-4.7/GLM-4.5V \u4E3A\u5F3A\u5236\u601D\u8003\uFF0C\u4F20 disabled \u4F1A\u62A5\u9519\uFF08\u8BF7\u624B\u52A8\u5220 Off \u6863\uFF09\u3002\u89C6\u89C9\u7EBF\u89C1 glm-vision \u6761\u76EE\u3002"},{id:"kimi-k3",patterns:["kimi-k3"],efforts:{low:"low",high:"high",max:"max"},defaultEffort:"max",compat:{thinkingFormat:"openai",supportsReasoningEffort:!0},input:["text","image"],contextWindow:1048576,note:"Kimi K3 \u6863\u4F4D\uFF1ALow / High / Max(\u9ED8\u8BA4 Max)\uFF0C\u8D70\u9876\u5C42 reasoning_effort\uFF1B\u59CB\u7EC8\u63A8\u7406\u3001\u52FF\u4F20 thinking \u5BF9\u8C61\u3002\u539F\u751F\u89C6\u89C9\u7406\u89E3\uFF0C1M \u4E0A\u4E0B\u6587\uFF08\u6700\u5927\u8F93\u51FA\u5B98\u65B9\u672A\u5355\u72EC\u5217\uFF0C\u4E0D\u63D0\u4F9B\uFF09\u3002"},{id:"kimi-k2-vision",patterns:["kimi-k2.6","kimi-k2.5"],efforts:{off:null,high:"high"},defaultEffort:"high",compat:{thinkingFormat:"deepseek"},input:["text","image"],contextWindow:262144,note:"Kimi K2.5/K2.6 \u89C6\u89C9\u4EE3\uFF1Athinking.type \u5F00\u5173\uFF08\u9ED8\u8BA4\u5F00\u3001\u53EF\u5173\uFF09\uFF0C\u5F00=High\uFF1B\u5E26\u89C6\u89C9\uFF0C256K\u3002K2.7 Code \u59CB\u7EC8\u601D\u8003\uFF0C\u89C1\u5355\u72EC\u6761\u76EE\u3002"},{id:"kimi-k27-code",patterns:["kimi-k2.7"],efforts:{high:"high"},defaultEffort:"high",compat:{thinkingFormat:"deepseek"},input:["text","image"],contextWindow:262144,note:"Kimi K2.7 Code\uFF08\u542B\u9AD8\u901F\u7248\uFF09\uFF1A\u59CB\u7EC8\u601D\u8003\u2014\u2014thinking.type \u4EC5\u63A5\u53D7 enabled\uFF08\u4F20 disabled \u62A5\u9519\uFF09\uFF0C\u65E0 Off \u6863\uFF1B\u5E26\u89C6\u89C9\uFF0C256K\u3002"},{id:"kimi-moonshot-v1-vision",patterns:["moonshot-v1-8k-vision","moonshot-v1-32k-vision","moonshot-v1-128k-vision"],efforts:!1,input:["text","image"],note:"Moonshot V1 \u89C6\u89C9\u65E7\u4EE3\uFF088k/32k/128k \u5404\u4E00\uFF09\uFF1A\u65E0\u601D\u8003\u63A7\u4EF6\uFF08\u751F\u6210\u6A21\u578B\uFF09\u3001\u652F\u6301\u56FE\u7247\u8F93\u5165\uFF1B\u8BE5\u7EBF\u5DF2\u505C\u6B62\u5BF9\u65B0\u7528\u6237\u5F00\u653E\uFF082026-08-31 \u5168\u91CF\u4E0B\u7EBF\uFF0C\u7F51\u5173\u6B8B\u7559\u4ECD\u53EF\u547D\u4E2D\uFF09\u3002"},{id:"kimi",patterns:["kimi","moonshot"],efforts:{off:null,high:"high"},compat:{thinkingFormat:"deepseek"},input:["text"],contextWindow:262144,note:"Kimi \u901A\u7528\uFF1Athinking \u5F00\u5173\uFF08\u65E0 effort \u6863\uFF09\uFF0C\u5F00=High\u3002k2 \u7CFB\u5217 2026-05-25 \u4E0B\u7EBF\u3001kimi-latest 2026-01-28 \u4E0B\u7EBF\u3001moonshot-v1 \u7CFB 2026-08-31 \u5168\u91CF\u4E0B\u7EBF\uFF08\u7F51\u5173\u6B8B\u7559\u4ECD\u53EF\u547D\u4E2D\uFF1Bmoonshot-v1 \u672C\u8EAB\u975E\u601D\u8003\u6A21\u578B\uFF09\u3002\u89C6\u89C9\u4EE3\u4E0E K2.7 Code \u89C1\u5355\u72EC\u6761\u76EE\u3002"},{id:"hunyuan-hy3",patterns:["hy3"],efforts:{low:"low",high:"high"},compat:{thinkingFormat:"openai",supportsReasoningEffort:!0},input:["text"],contextWindow:262144,note:"\u6DF7\u5143 hy3\uFF1A\u5F00\u6E90\u5951\u7EA6\u7ECF chat_template_kwargs.reasoning_effort = no_think(\u9ED8\u8BA4)/low/high\uFF1B\u5B98\u65B9\u6A21\u578B\u5361 256K \u4E0A\u4E0B\u6587\uFF08295B MoE\uFF0C2026 \u5F00\u6E90\uFF09\u3002"},{id:"hunyuan-hy4",patterns:["hy4-preview","hy-4-preview"],efforts:{off:"no_think",high:"high"},defaultEffort:"high",compat:{thinkingFormat:"openai",supportsReasoningEffort:!0},contextWindow:1e6,note:"\u6DF7\u5143 Hy4 preview\uFF1A\u5B98\u65B9 README\u2014\u2014reasoning \u9ED8\u8BA4 high\uFF08\u6DF1\u5EA6\u601D\u8003\uFF09\uFF0C\u5173\u95ED\u7ECF chat_template_kwargs.reasoning_effort=no_think\uFF1B\u5B98\u65B9\u89C4\u683C\u8868 1M \u4E0A\u4E0B\u6587\uFF08770B-A49B MoE\uFF0CGated DSA\uFF09\u3002low \u6863\u5B98\u65B9\u672A\u5217\uFF0C\u5982\u6709\u8BF7\u624B\u8C03\uFF1B\u89C6\u89C9\u672A\u58F0\u660E\uFF0C\u6309\u9700\u624B\u52FE\u3002\u6765\u6E90\uFF1ATencent-Hunyuan/Hy4-preview \u5B98\u65B9 README\u3002"},{id:"step-5-preview",patterns:["step-5"],efforts:{low:"low",medium:"medium",high:"high"},defaultEffort:"medium",compat:{thinkingFormat:"openai",supportsReasoningEffort:!0},input:["text","image"],contextWindow:1e6,maxTokens:65536,note:'\u9636\u8DC3 Step-5-Preview\uFF08\u5B98\u65B9 id \u5373 step-5-preview\uFF0C\u65E0\u88F8 step-5\uFF1Bpattern \u53D6\u5BB6\u65CF\u4E3B\u5E72\u4EE5\u517C\u5BB9\u7F51\u5173\u5199\u6CD5\uFF09\uFF1A\u6863\u4F4D Low / Medium(\u5B98\u65B9\u6807"\u9ED8\u8BA4\u63A8\u8350") / High\uFF0C\u601D\u8003\u4E0D\u53EF\u5173\u95ED\uFF1B\u539F\u751F\u56FE\u7247 + \u89C6\u9891\u8F93\u5165\uFF1B1M \u4E0A\u4E0B\u6587\u300164K \u6700\u5927\u8F93\u51FA\uFF08\u5B98\u65B9\u53E6\u6CE8 max_tokens \u9ED8\u8BA4 INF\u3001\u4E0E 64K \u4E0A\u9650\u5E76\u5B58\uFF0C\u4EE5\u7AEF\u70B9\u5B9E\u6D4B\u4E3A\u51C6\uFF09\u3002'},{id:"step-3-7",patterns:["step-3.7","step-3.6"],efforts:{low:"low",medium:"medium",high:"high"},defaultEffort:"medium",compat:{thinkingFormat:"openai",supportsReasoningEffort:!0},input:["text","image"],contextWindow:262144,note:"\u9636\u8DC3 Step-3.6/3.7 \u6863\u4F4D\uFF1ALow / Medium(\u9ED8\u8BA4\u63A8\u8350) / High\uFF0C\u539F\u751F\u56FE\u7247+\u89C6\u9891\u7406\u89E3\u3002\u4E0A\u4E0B\u6587\u4E3A\u8F93\u5165+\u8F93\u51FA\u603B\u548C\u4E0A\u9650\u3002"},{id:"step-3-5",patterns:["step-3.5"],efforts:{low:"low",high:"high"},compat:{thinkingFormat:"openai",supportsReasoningEffort:!0},input:["text"],contextWindow:262144,note:"\u9636\u8DC3 Step-3.5 Flash \u6863\u4F4D\uFF1ALow / High\uFF08\u7EAF\u6587\u672C\u63A8\u7406\u65D7\u8230\uFF09\u3002\u4E0A\u4E0B\u6587\u4E3A\u8F93\u5165+\u8F93\u51FA\u603B\u548C\u4E0A\u9650\u3002"},{id:"step",patterns:["step-3","step-2"],efforts:{low:"low",medium:"medium",high:"high"},defaultEffort:"medium",compat:{thinkingFormat:"openai",supportsReasoningEffort:!0},input:["text"],note:"\u9636\u8DC3 Step \u6863\u4F4D\uFF1ALow / Medium / High\uFF08\u9ED8\u8BA4 Medium\uFF0C\u4E0D\u53EF\u5173\u95ED\uFF09\u30023.6/3.7 \u89C6\u89C9\u4EE3\u89C1\u5355\u72EC\u6761\u76EE\u3002"},{id:"doubao",patterns:["doubao","seed"],efforts:{off:null,low:"low",medium:"medium",high:"high"},compat:{thinkingFormat:"openai",supportsReasoningEffort:!0},input:["text","image"],note:"\u8C46\u5305\u6863\u4F4D\uFF1AOff / Low / Medium / High\u2014\u2014effort \u9636\u68AF\u4ECD\u662F\u793E\u533A\u8BC1\u636E\u3001\u5B98\u65B9 Ark \u6587\u6863\u660E\u5217\u7684\u4E3A thinking.type \u5F00\u5173\uFF082026-08-24 \u590D\u6838\u4ECD\u672A\u89C1\u5230 effort \u5B98\u65B9\u660E\u6587\uFF09\u3002seed \u4EE3\u6536\u56FE\uFF081.5-pro \u4F8B\u5916\uFF09\u3002"},{id:"minimax-m3",patterns:["minimax-m3"],efforts:{off:null,high:"high"},compat:{thinkingFormat:"deepseek"},input:["text","image"],contextWindow:1048576,note:"MiniMax-M3\uFF1A\u5B98\u65B9 thinking \u53C2\u6570 enabled/adaptive/disabled\uFF08\u65E0 effort \u6863\uFF09\uFF0C\u5F00=High\u3001\u5173=disabled\uFF1B\u539F\u751F\u591A\u6A21\u6001\uFF08\u56FE/\u89C6\u9891\uFF0C\u6838\u5FC3\u8BCD\u8868\u4EC5\u542B\u56FE\uFF09\uFF0C1M \u4E0A\u4E0B\u6587\u3002"},{id:"mimo-v2-6",patterns:["mimo-v2.6","mimo-v2.5"],efforts:{off:"none",low:"low",medium:"medium",high:"high"},compat:{thinkingFormat:"openai",supportsReasoningEffort:!0},input:["text","image"],contextWindow:1048576,maxTokens:131072,note:"\u5C0F\u7C73 MiMo v2.6 \u7CFB\u5217\uFF08mimo-v2.6-pro / -flash / -pro-ultraspeed\uFF1B1M \u4E0A\u4E0B\u6587 / 128K \u6700\u5927\u8F93\u51FA\u3001\u539F\u751F\u5168\u6A21\u6001\uFF09\u4E0E\u5176\u524D\u4EE3 mimo-v2.5\u3002\u5B98\u65B9\u6587\u6863\uFF1Athinking.type\uFF08enabled/disabled\uFF0C\u9ED8\u8BA4 enabled\uFF09+ reasoning.effort\uFF08none \u5173\u95ED\uFF1B\u5176\u4F59\u5408\u6CD5\u503C\u5747\u5F00\u542F\uFF0C\u4E14**\u73B0\u9636\u6BB5\u6682\u672A\u533A\u5206\u63A8\u7406\u5F3A\u5EA6**\u2014\u2014minimal \u5F52\u4E00\u4E3A low\u3001xhigh/max/ultra \u5F52\u4E00\u4E3A high\uFF09\uFF0C\u56E0\u6B64\u8FD9\u91CC\u58F0\u660E\u7684\u662F\u7AEF\u70B9**\u63A5\u53D7**\u7684\u6863\u4F4D Off / Low / Medium / High\uFF08xhigh\u3001max \u4E0D\u58F0\u660E\uFF0C\u7AEF\u70B9\u53EA\u4F1A\u6298\u53E0\u4E3A high\uFF09\u3002\u601D\u8003\u6A21\u5F0F\u4E0B temperature / top_p \u4E0D\u53EF\u81EA\u5B9A\u4E49\uFF08\u5F3A\u5236 1.0 / 0.95\uFF09\uFF1B\u5E26\u5DE5\u5177\u8C03\u7528\u7684\u5386\u53F2\u8F6E\u5FC5\u987B\u5B8C\u6574\u56DE\u4F20 reasoning_content\uFF0C\u5426\u5219 400\u3002mimo-v2.5 \u4E0E v2.5-pro \u5B98\u65B9\u5B9A\u4E8E 2026-10-21 \u4E0B\u7EBF\u3002"},{id:"mimo-v2-5-pro",patterns:["mimo-v2.5-pro"],efforts:{off:"none",low:"low",medium:"medium",high:"high"},compat:{thinkingFormat:"openai",supportsReasoningEffort:!0},input:["text"],contextWindow:1048576,maxTokens:131072,note:"\u5C0F\u7C73 MiMo v2.5-Pro\uFF1A\u8BE5\u5BB6\u65CF\u552F\u4E00\u7684**\u7EAF\u6587\u672C**\u6210\u5458\uFF08\u5B98\u65B9\u80FD\u529B\u8868\u672A\u5217\u5168\u6A21\u6001\u7406\u89E3\uFF09\uFF0C1M \u4E0A\u4E0B\u6587 / 128K \u6700\u5927\u8F93\u51FA\uFF0C\u63A8\u7406\u5951\u7EA6\u4E0E v2.6 \u7CFB\u5217\u76F8\u540C\uFF08thinking.type + reasoning.effort\uFF0Cnone \u5173\u95ED\u3001\u5176\u4F59\u6863\u4F4D\u6682\u4E0D\u533A\u5206\u5F3A\u5EA6\uFF09\u3002\u5B98\u65B9\u5B9A\u4E8E 2026-10-21 \u4E0B\u7EBF\u3002"},{id:"baidu-ernie",patterns:["ernie"],efforts:!1,input:["text"],contextWindow:131072,note:"\u767E\u5EA6\u5343\u5E06 ERNIE \u7CFB\uFF1A\u5B98\u65B9 OpenAI \u517C\u5BB9\u63A5\u53E3\u65E0 reasoning_effort \u53C2\u6570\u2014\u2014\u601D\u8003\u7531\u6A21\u578B\u53D8\u4F53\u51B3\u5B9A\uFF08-Thinking \u7CFB\u5217\u59CB\u7EC8\u601D\u8003\u3001\u666E\u901A\u7CFB\u5217\u4E0D\u601D\u8003\uFF09\uFF0C\u52FF\u52FE\u601D\u8003\u6863\u3002ERNIE 4.5 Turbo VL \u652F\u6301\u56FE\u7247\uFF0C\u6309\u9700\u624B\u52FE\uFF1B\u53C2\u8003\u5BB9\u91CF\u53D6 Turbo 128K \u6863\u3002"}],Qn={off:null,low:"low",medium:"medium",high:"high"},Ba={"openai-completions":Qn,"openai-responses":Qn,"anthropic-messages":Qn,deepseek:{off:"none",low:"low",high:"high",max:"max"}},qa={low:"low",medium:"medium",high:"high"};function bt(e){return(e??"").toLowerCase().trim()}function Ho(e){return e!==void 0&&/[a-z0-9]/.test(e)}function ht(e){return e.toLowerCase().trim().replace(/[^a-z0-9]+/g," ")}function Io(e,t,n){let r=t===0?void 0:e[t-1],o=e[t+n];return!Ho(r)&&!Ho(o)}function er(e,t){let n=ht(e)+" "+ht(t??""),r;for(let o of Wa)for(let i of o.patterns){let s=ht(i),a=n.indexOf(s);for(;a>=0;){if(Io(n,a,s.length)){(r===void 0||s.length>r.length)&&(r={entry:o,length:s.length});break}a=n.indexOf(s,a+1)}}return r?.entry}var Ua={"deepseek.com":"deepseek","anthropic.com":"anthropic-messages"};function ja(e){let t=bt(e.api);if(t.length>0)return t;let n=e.baseURL;if(n!==void 0&&n.length>0)try{let o=new URL(n).hostname.toLowerCase().split(".");if(o.length>=2){let i=Ua[o.slice(-2).join(".")];if(i!==void 0)return i}}catch{}return"openai-completions"}var Yt="openai-completions",Do="anthropic-messages";function Zn(e){if(e===void 0||e.length===0)return!1;let t="";try{t=new URL(e).hostname.toLowerCase()}catch{return!1}return t==="localhost"||t==="::1"||t.endsWith(".local")||t.endsWith(".internal")||/^(127\.|10\.|192\.168\.)/.test(t)||/^172\.(1[6-9]|2[0-9]|3[01])\./.test(t)?!0:t.includes(":")}function za(e,t){let n=bt(t),r={...e};if(delete r.supportsMidConvoEffort,delete r.allowedFallbackModels,n===Do){for(let o of["thinkingFormat","supportsReasoningEffort","thinkingTokenBudgetField","supportsThinkingTokenBudget","vllmPriority","supportsMaxOutputTokens"])delete r[o];return r.forceAdaptiveThinking===void 0?void 0:{forceAdaptiveThinking:r.forceAdaptiveThinking}}if(n==="openai-responses"){for(let o of["thinkingFormat","supportsReasoningEffort","thinkingTokenBudgetField","supportsThinkingTokenBudget","vllmPriority"])delete r[o];return r.supportsMaxOutputTokens===void 0?void 0:{supportsMaxOutputTokens:r.supportsMaxOutputTokens}}if(n===Yt)return delete r.forceAdaptiveThinking,delete r.supportsMaxOutputTokens,Object.keys(r).length===0?void 0:r}function Ga(e,t){let n=bt(t.api);if(n===Yt){let r=e.compat;return r!==void 0&&(r=za(r,n)??void 0),r===void 0&&!Zn(t.baseURL)?void 0:r===void 0?{thinkingTokenBudgetField:"thinking_token_budget"}:r.thinkingTokenBudgetField===void 0&&r.supportsThinkingTokenBudget!==!0&&Zn(t.baseURL)?{...r,thinkingTokenBudgetField:"thinking_token_budget"}:r}if(n===Do&&e.anthropicAdaptive===!0)return{forceAdaptiveThinking:!0}}var $a=["openai.com","openai.azure.com","deepseek.com","openrouter.ai","z.ai","bigmodel.cn","moonshot.ai","moonshot.cn","aliyuncs.com","anthropic.com","x.ai","together.ai","together.xyz","nvidia.com","cerebras.ai","cloudflare.com","chutes.ai","opencode.ai","ant-ling.com"];function tr(e){if(bt(e.api)!==Yt)return!1;let t=e.baseURL;if(t===void 0||t.length===0)return!1;try{let n=new URL(t).hostname.toLowerCase();return n.includes(".")?!$a.some(r=>n===r||n.endsWith("."+r)):!1}catch{return!1}}function Oo(e,t,n){return e===void 0||!n||e.supportsDeveloperRole!==void 0||!tr(t)?e:{...e,supportsDeveloperRole:!1}}var _o={off:null,low:"low",medium:"medium",high:"high"},Va=["vl","vision","omni","4o","pixtral","internvl"];function nr(e){let t=ht(e);for(let n of Va){let r=ht(n),o=t.indexOf(r);for(;o>=0;){if(Io(t,o,r.length))return["text","image"];o=t.indexOf(r,o+1)}}}function Ya(e){if(e===void 0)return;let t=e.map(n=>n.toLowerCase());if(t.some(n=>Ka.includes(n)))return t.includes("image")?["text","image"]:["text"]}function be(e,t,n){let r=er(e,t.displayName),o,i,s,a;r?.input!==void 0&&(o=r.input,i="knowledge"),r?.contextWindow!==void 0&&(s=r.contextWindow),r?.maxTokens!==void 0&&(a=r.maxTokens);let d=Ya(n?.input);if(d!==void 0&&(o=d,i="endpoint"),n?.contextLength!==void 0&&Number.isFinite(n.contextLength)&&n.contextLength>0&&(s=n.contextLength),o===void 0){let w=nr(e);w!==void 0&&(o=w,i="heuristic")}let u={...o===void 0?{}:{input:o},...i===void 0?{}:{inputSource:i},...s===void 0?{}:{contextWindow:s},...a===void 0?{}:{maxTokens:a}},p=n===void 0?{}:{endpoint:{reasoning:n.reasoning,source:n.source}};if(n?.reasoning===!1)return{efforts:!1,matched:!1,source:"endpoint:"+(n.source??"listing"),confidence:"high",...p,...u};if(r!==void 0){let w=Oo(Ga(r,t),t,r.efforts!==!1);return{efforts:r.efforts,...r.efforts!==!1&&r.defaultEffort!==void 0&&r.efforts[r.defaultEffort]!==void 0?{defaultEffort:r.defaultEffort}:{},...w===void 0?{}:{compat:w},matched:!0,entryId:r.id,source:r.id,confidence:"high",...p,...u}}let m=ja(t),g=Ba[m]??qa,l=bt(t.api)===Yt?{thinkingFormat:"openai",supportsReasoningEffort:!0}:void 0,c=l!==void 0&&Zn(t.baseURL)?{...l,thinkingTokenBudgetField:"thinking_token_budget"}:l,f=Oo(c,t,!0);return n?.reasoning===!0?{efforts:{..._o},..._o.medium!==void 0?{defaultEffort:"medium"}:{},...f===void 0?{}:{compat:f},matched:!1,source:"endpoint:"+(n.source??"listing"),confidence:"medium",...p,...u}:{efforts:g,...g.medium!==void 0?{defaultEffort:"medium"}:{},...f===void 0?{}:{compat:f},matched:!1,source:"protocol:"+m,confidence:"low",...p,...u}}var Po="dsh-model-think-level.slider.efforts",rr="breSelectWired";function or(e){return typeof e=="object"&&e!==null&&e.ok===!1}function ir(e){if(!or(e))return;let t=e.error,n=typeof t?.code=="string"?t.code:"settings/rejected",r=typeof t?.message=="string"?t.message:"";return r.length>0?`${n}: ${r}`:n}function Be(e,t){return`${e}/${t}`}function Fo(){try{let e=window.localStorage.getItem(Po);if(e===null)return{};let t=JSON.parse(e);if(typeof t!="object"||t===null||Array.isArray(t))return{};let n={};for(let[r,o]of Object.entries(t))r.length>0&&typeof o=="string"&&o.trim().length>0&&(n[r]=o);return n}catch{return{}}}function Ja(e){try{window.localStorage.setItem(Po,JSON.stringify(e))}catch{}}function Xa(e,t,n){let r=Fo();r[Be(e,t)]=n,Ja(r)}function Qa(e,t){return Fo()[Be(e,t)]}function Jt(e,t,n){let o=e.groups.find(i=>i.id===t)?.models.find(i=>i.id===n)?.reasoning?.efforts;return o===void 0?[]:o.map(i=>i.id)}function Za(e,t,n){return e.groups.find(o=>o.id===t)?.models.find(o=>o.id===n)?.reasoning?.defaultEffort}function ed(e){if(!(e.length<2))return e[Math.floor((e.length-1)/2)]}function td(e,t){return e===null||e.provider!==t.provider||e.model!==t.model}async function Co(e,t,n,r,o){let i=Jt(e,t,n);if(i.length===0)return;let s=Be(t,n),a=r.get(s);if(a!==void 0&&i.includes(a))return a;let d=await o?.configuredEffort?.(t,n);if(d!==void 0&&i.includes(d))return d;let u=Qa(t,n);if(u!==void 0&&i.includes(u))return u;let p=be(n,{}).defaultEffort;if(p!==void 0&&i.includes(p))return p;let m=Za(e,t,n);return m!==void 0&&i.includes(m)?m:ed(i)}function Ko(e,t){let n=e;if(n[rr]===!0)return()=>{};let r=Object.prototype.hasOwnProperty.call(n,"select"),o=e.select,i=new Map,s=new Set,a=new Map,d=3,u=0,p=async l=>{let c=++u;if(l.reasoningEffort!==void 0){let v=await o.call(e,l);return!or(v)&&ce()&&(i.set(Be(l.provider,l.model),l.reasoningEffort),Xa(l.provider,l.model,l.reasoningEffort)),v}let f=e.store.getSnapshot();if(!td(f.current,l)){if(ce()){let v=Be(l.provider,l.model);i.delete(v),s.add(v)}return o.call(e,l)}if(!ce())return o.call(e,l);let w=await Co(f,l.provider,l.model,i,t),y=e.store.getSnapshot();if(!(u!==c||((v,M)=>v===null||M===null?v!==M:v.provider!==M.provider||v.model!==M.model||v.reasoningEffort!==M.reasoningEffort)(y.current,f.current)))return!ce()||w===void 0||!Jt(y,l.provider,l.model).includes(w)?o.call(e,l):o.call(e,{...l,reasoningEffort:w})},m=()=>{let l=e.store.getSnapshot(),c=l.current;if(c===null||c.reasoningEffort!==void 0||!ce())return;let f=Be(c.provider,c.model);if(s.has(f))return;if(Jt(l,c.provider,c.model).length===0){s.add(f);return}s.add(f);let w=u;Co(l,c.provider,c.model,i,t).then(async y=>{if(y===void 0){s.delete(f);return}if(!ce()){s.delete(f);return}let h=e.store.getSnapshot(),v=h.current;if(u!==w||v===null||v.reasoningEffort!==void 0||Be(v.provider,v.model)!==f||!Jt(h,v.provider,v.model).includes(y))return;let M=await o.call(e,{provider:v.provider,model:v.model,reasoningEffort:y});if(or(M))throw M}).catch(()=>{let y=(a.get(f)??0)+1;a.set(f,y),y<d&&(s.delete(f),m())})},g=e.store.subscribe(m);return m(),n[rr]=!0,e.select=p,()=>{delete n[rr],g(),r?e.select=o:delete n.select}}function nd(e){if(e.current===null)return[];let r=e.groups.find(o=>o.id===e.current?.provider)?.models.find(o=>o.id===e.current?.model)?.reasoning?.efforts;return r!==void 0&&r.length>=2?r:[]}function rd(e){return e.current}function od(e,t){let n=rd(t),r=e.findIndex(a=>a.id===n?.reasoningEffort);if(r>=0)return r;let i=t.groups.find(a=>a.id===n?.provider)?.models.find(a=>a.id===n?.model)?.reasoning?.defaultEffort,s=i===void 0?-1:e.findIndex(a=>a.id===i);return s>=0?s:Math.floor((e.length-1)/2)}function Wo(e){return e.models??[]}function ot(e){let t=e;return t.name??t.label??t.title??e.id}function sr(e){return(0,T.createElement)("span",{className:"bre-row-chevron"+(e?" is-open":""),"aria-hidden":!0},"\u203A")}function id(){let[e,t]=(0,T.useState)(null),n=(0,T.useRef)(0);(0,T.useEffect)(()=>()=>{window.clearTimeout(n.current)},[]);let r=(0,T.useCallback)(()=>{window.clearTimeout(n.current),t(null)},[]),o=(0,T.useCallback)((i,s)=>{window.clearTimeout(n.current);let a=i.currentTarget;a.scrollWidth<=a.clientWidth+1||(n.current=window.setTimeout(()=>{t({target:a,text:s})},300))},[]);return{tip:e,onEnter:o,onLeave:r}}function sd({state:e}){if(typeof document>"u")return null;let t=e.target.getBoundingClientRect(),n=Math.max(12,Math.min(t.right,window.innerWidth-12));return(0,qo.createPortal)((0,T.createElement)("div",{className:"bre-tip",role:"tooltip",style:{top:Math.min(t.bottom+6,window.innerHeight-40),right:Math.max(12,window.innerWidth-n)}},e.text),document.body)}function ad(){return(0,T.createElement)("svg",{className:"bre-option-check",width:14,height:14,viewBox:"0 0 16 16",fill:"none","aria-hidden":!0},(0,T.createElement)("path",{d:"M3.5 8.5l3 3 6-7",stroke:"currentColor",strokeWidth:1.6,strokeLinecap:"round",strokeLinejoin:"round"}))}var Bo=new Map;function dd(e){if(Array.isArray(e.input))return e.input.includes("image");let t=Bo.get(e.id);if(t!==void 0)return t;let n=er(e.id,e.name)?.input,r=n!==void 0?n.includes("image"):(nr(e.id)??[]).includes("image");return Bo.set(e.id,r),r}function ld(e){let t=e.reasoning?.efforts;return Array.isArray(t)&&t.length>0}function ud(e){return(0,T.createElement)("svg",{className:"bre-tag-icon",width:13,height:13,viewBox:"0 0 16 16",fill:"none",role:"img","aria-label":e},(0,T.createElement)("path",{d:"M1.8 8s2.4-4.2 6.2-4.2S14.2 8 14.2 8s-2.4 4.2-6.2 4.2S1.8 8 1.8 8z",stroke:"currentColor",strokeWidth:1.3,strokeLinejoin:"round"}),(0,T.createElement)("circle",{cx:8,cy:8,r:1.8,fill:"currentColor"}))}function fd(e){return(0,T.createElement)("svg",{className:"bre-tag-icon",width:13,height:13,viewBox:"0 0 16 16",fill:"none",role:"img","aria-label":e},(0,T.createElement)("path",{d:"M8 1.9l1.35 3.75L13.1 7l-3.75 1.35L8 12.1 6.65 8.35 2.9 7l3.75-1.35z",fill:"currentColor"}))}function cd(e,t){let n=[];return dd(e)&&n.push((0,T.createElement)("span",{key:"vision",className:"bre-tag",title:t("tagVision")},ud(t("tagVision")))),ld(e)&&n.push((0,T.createElement)("span",{key:"thinking",className:"bre-tag",title:t("tagThinking")},fd(t("tagThinking")))),n.length===0?null:(0,T.createElement)("span",{className:"bre-option-tags"},...n)}function Uo(e){let{directory:t,t:n}=e,r=e.onLayoutChange,o=(0,T.useSyncExternalStore)(E=>t.store.subscribe(E),()=>t.store.getSnapshot()),i=nd(o),[s,a]=(0,T.useState)(""),[d,u]=(0,T.useState)(null),[p,m]=(0,T.useState)(null),[g,l]=(0,T.useState)(!1),[c,f]=(0,T.useState)(null),w=(0,T.useRef)(null),y=(0,T.useRef)(""),h=(0,T.useRef)(!1),v=o.current!==null&&i.length>=2,M=g||o.status==="selecting",x=c??o.error,L=t.select;(0,T.useEffect)(()=>{if(h.current)return;let E=od(i,o),J=i[E]?.id??"";y.current=J,a(J),f(null)},[v,i,o]),(0,T.useEffect)(()=>{t.load().catch(()=>{})},[t]);let R=o.current,C=o.groups.find(E=>E.id===R?.provider),I=C?.models.find(E=>E.id===R?.model)?.name??(R===null?n("triggerFallback"):R.model),D=R===null?I:ot(C??{id:R.provider})+" \xB7 "+I,A=i.find(E=>E.id===s)?.name??n("effortDefault"),P=(0,T.useSyncExternalStore)(Ut,Gn),q=(0,T.useSyncExternalStore)(Gt,bo),F=(0,T.useSyncExternalStore)(Vt,Eo),z=o.groups.filter(E=>Wo(E).length>0&&!q.includes(E.id)).map(E=>E.id),Y=rt($n(z),P),U=p!==null&&Y.includes(p)?p:R!==null&&Y.includes(R.provider)?R.provider:Y[0]??null,S=U===null?[]:Ao(Wo(o.groups.find(E=>E.id===U)),F[U]??[]),K=R===null?"":R.provider+"/"+R.model,N=(0,T.useCallback)(E=>{d!==E&&((0,ar.flushSync)(()=>{u(E)}),r?.())},[r,d]),te=(0,T.useCallback)(()=>{d!==null&&((0,ar.flushSync)(()=>{u(null)}),r?.())},[r,d]),ie=(0,T.useCallback)(()=>{let E=w.current?.closest('[role="menu"]');E!=null&&(E.tabIndex=-1,E.focus({preventScroll:!0}))},[]),Pe=(0,T.useCallback)(async(E,J)=>{if(h.current)return;let V=t.store.getSnapshot().current;if(te(),!(V!==null&&V.provider===E&&V.model===J)){h.current=!0,ie(),l(!0),f(null);try{let se=await L({provider:E,model:J}),Se=ir(se);if(Se!==void 0)throw new Error(Se)}catch(se){f(se instanceof Error?se.message:String(se))}finally{h.current=!1,l(!1)}}},[te,t,ie,L]),Qe=(0,T.useCallback)(async E=>{if(h.current||(te(),E===o.current?.reasoningEffort&&o.status!=="error"))return;h.current=!0;let J=y.current;ie(),l(!0),f(null),a(E);try{let V=o.current;if(V===null)throw new Error(n("sliderNoCurrent"));let se=await L({provider:V.provider,model:V.model,reasoningEffort:E}),Se=ir(se);if(Se!==void 0)throw new Error(Se);let Dt=t.store.getSnapshot(),pt=i.find(Ct=>Ct.id===Dt.current?.reasoningEffort)?.id??E;y.current=pt,a(pt)}catch(V){y.current=J,a(J),f(V instanceof Error?V.message:String(V))}finally{h.current=!1,l(!1)}},[te,t,ie,i,L,o.current,o.status,n]),{tip:Me,onEnter:Fe,onLeave:Ke}=id(),It=[(0,T.createElement)("button",{key:"row:model",type:"button",role:"menuitem",className:"bre-row-control"+(d==="model"?" is-open":""),disabled:M,"aria-expanded":d==="model",onMouseLeave:Ke,onClick:()=>{N(d==="model"?null:"model")}},(0,T.createElement)("span",{className:"bre-row-label"},n("modelRowLabel")),(0,T.createElement)("span",{className:"bre-row-value","aria-label":D,onMouseEnter:E=>{Fe(E,D)}},D),sr(d==="model")),d==="model"?(0,T.createElement)("div",{key:"panel:model",className:"bre-panel bre-panel-models"},(0,T.createElement)("div",{className:"bre-providers",role:"group","aria-label":n("modelRowLabel")},...Y.map(E=>(0,T.createElement)("button",{key:E,type:"button",className:"bre-provider"+(E===U?" is-open":"")+(E===R?.provider?" is-current":""),disabled:M,"aria-expanded":E===U,onMouseLeave:Ke,onClick:()=>{m(E)}},(0,T.createElement)("span",{className:"bre-option-name","aria-label":ot(o.groups.find(J=>J.id===E)),onMouseEnter:J=>{Fe(J,ot(o.groups.find(V=>V.id===E)))}},ot(o.groups.find(J=>J.id===E))),sr(E===U))),...Y.length===0?[(0,T.createElement)("div",{key:"no-providers",className:"bre-empty"},n("sliderNoCurrent"))]:[]),(0,T.createElement)("div",{className:"bre-provider-models",role:"group","aria-label":n("modelRowLabel")},...S.length===0?[(0,T.createElement)("div",{key:"no-models",className:"bre-empty"},n("sliderNoCurrent"))]:S.map(E=>{let J=U+"/"+E.id,V=J===K;return(0,T.createElement)("button",{key:J,type:"button",className:"bre-option"+(V?" is-active":""),disabled:M,"aria-pressed":V,onMouseLeave:Ke,onClick:()=>{Pe(U,E.id)}},(0,T.createElement)("span",{className:"bre-option-name","aria-label":E.name??E.id,onMouseEnter:se=>{Fe(se,E.name??E.id)}},E.name??E.id),cd(E,n))}))):null,(0,T.createElement)("div",{key:"divider",className:"bre-divider","aria-hidden":!0}),(0,T.createElement)("button",{key:"row:effort",type:"button",role:"menuitem",className:"bre-row-control"+(d==="effort"?" is-open":""),disabled:M||!v,"aria-expanded":v?d==="effort":void 0,onClick:()=>{N(d==="effort"?null:"effort")}},(0,T.createElement)("span",{className:"bre-row-label"},n("effortRowLabel")),(0,T.createElement)("span",{className:"bre-row-value"+(v?"":" is-muted")},v?A:n("sliderNoLevels")),v?sr(d==="effort"):null),d==="effort"&&v?(0,T.createElement)("div",{key:"panel:effort",className:"bre-panel",role:"group","aria-label":n("effortRowLabel")},...i.map(E=>(0,T.createElement)("button",{key:E.id,type:"button",className:"bre-option"+(E.id===s?" is-active":""),disabled:M,"aria-pressed":E.id===s,onClick:()=>{Qe(E.id)}},(0,T.createElement)("span",{className:"bre-option-name"},E.name),E.id===s?ad():null))):null];return(0,T.createElement)("div",{className:"bre-slider-body",ref:w},(0,T.createElement)("div",{className:"bre-card"},...It),x===null?null:(0,T.createElement)("div",{className:"bre-model-error",role:"status"},x),Me===null?null:(0,T.createElement)(sd,{key:"tip",state:Me}))}var G=require("react"),zo='section[role="group"]',lr='button[role="menuitemradio"]';function Go(e){return e.querySelector(zo)!==null}function dr(e){return Array.from(e.querySelectorAll(lr)).filter(t=>!t.disabled&&t.style.display!=="none")}function pd(e){let t=e.getAttribute("aria-labelledby");return(t===null?null:e.ownerDocument.getElementById(t))?.textContent?.toLowerCase()??""}function jo(e,t,n=new Map){let r=d=>{n.has(d)||n.set(d,d.style.display),d.style.display="none"},o=d=>{let u=n.get(d);u!==void 0&&(d.style.display=u,n.delete(d))};for(let d of[...n.keys()])d.isConnected||n.delete(d);let i=t.trim().toLowerCase().split(/\s+/).filter(Boolean),s=Array.from(e.querySelectorAll(zo)),a=0;if(i.length===0){for(let d of[...n.keys()])o(d);for(let d of s)a+=d.querySelectorAll(lr).length;return a}for(let d of s){let u=pd(d),p=Array.from(d.querySelectorAll(lr)),m=0;for(let g of p){let l=(g.getAttribute("title")??"").toLowerCase(),c=(g.textContent??"").toLowerCase(),f=`${u} ${l} ${c}`;i.every(w=>f.includes(w))?(o(g),m+=1):r(g)}m>0?(o(d),a+=m):r(d)}return a}function $o({menu:e,t}){let[n,r]=(0,G.useState)(""),[o,i]=(0,G.useState)(0),s=(0,G.useRef)(null),a=(0,G.useRef)(""),d=(0,G.useRef)(new Map),u=(0,G.useCallback)(l=>{a.current=l;let c=jo(e,l,d.current);i(c)},[e]);(0,G.useEffect)(()=>()=>{jo(e,"",d.current)},[e]),(0,G.useEffect)(()=>{let l=new MutationObserver(()=>{a.current.trim().length!==0&&u(a.current)});return l.observe(e,{childList:!0,subtree:!0}),()=>{l.disconnect()}},[e,u]),(0,G.useEffect)(()=>{let l=c=>{if(a.current.trim().length===0)return;let f=c.key;if(!(f==="ArrowDown"||f==="ArrowUp")&&!(f==="Home"||f==="End"||f==="PageUp"||f==="PageDown")||c.target===s.current||c.target instanceof Node&&!e.contains(c.target))return;let h=dr(e);if(h.length===0)return;let v=h.findIndex(x=>x===document.activeElement),M;f==="Home"||f==="PageUp"?M=0:f==="End"||f==="PageDown"?M=h.length-1:f==="ArrowDown"?M=v===-1?0:(v+1)%h.length:M=v===-1?h.length-1:(v-1+h.length)%h.length,c.preventDefault(),c.stopPropagation(),h[M]?.focus()};return e.addEventListener("keydown",l,!0),()=>{e.removeEventListener("keydown",l,!0)}},[e]);let p=l=>{let c=l.key;if(c==="ArrowDown"){l.preventDefault(),l.stopPropagation(),dr(e)[0]?.focus();return}if(n.trim().length>0&&(c==="ArrowUp"||c==="Home"||c==="PageUp"||c==="End"||c==="PageDown")){let f=dr(e);f.length>0&&(l.preventDefault(),l.stopPropagation(),f[c==="ArrowUp"||c==="End"||c==="PageDown"?f.length-1:0]?.focus());return}c==="Escape"&&n.length>0&&(l.preventDefault(),l.stopPropagation(),r(""),u(""))},m=()=>{r(""),u(""),s.current?.focus({preventScroll:!0})},g=o===0&&n.trim().length>0;return(0,G.createElement)("div",{className:"bre-model-search-box"+(g?" has-empty":""),"data-bre-search":"1"},(0,G.createElement)("div",{className:"bre-search-input-wrapper"},(0,G.createElement)("span",{className:"bre-search-icon","aria-hidden":"true"},(0,G.createElement)("svg",{viewBox:"0 0 16 16",fill:"none",stroke:"currentColor",strokeWidth:"1.5"},(0,G.createElement)("circle",{cx:"7",cy:"7",r:"4.5"}),(0,G.createElement)("path",{d:"M10.5 10.5L14 14",strokeLinecap:"round"}))),(0,G.createElement)("input",{ref:s,type:"text",className:"bre-search-input",role:"searchbox",placeholder:t("modelSearchPlaceholder"),"aria-label":t("modelSearchPlaceholder"),value:n,spellCheck:!1,autoComplete:"off",onChange:l=>{let c=l.currentTarget.value;r(c),u(c)},onKeyDown:p}),n.length>0?(0,G.createElement)("button",{type:"button",className:"bre-search-clear",title:t("modelSearchClear"),"aria-label":t("modelSearchClear"),onClick:m},(0,G.createElement)("svg",{viewBox:"0 0 16 16",fill:"none",stroke:"currentColor",strokeWidth:"1.5"},(0,G.createElement)("path",{d:"M4 4L12 12M12 4L4 12",strokeLinecap:"round"}))):null),g?(0,G.createElement)("div",{className:"bre-search-empty",role:"status"},t("modelSearchNoMatches")):null)}var Xt=require("react"),Vo=require("react-dom"),Yo=require("react-dom/client");function le(){return document.body}function yt(e,t,n){let r=(0,Yo.createRoot)(e);return n?.sync===!0?(0,Vo.flushSync)(()=>{r.render(t)}):r.render(t),{wrapper:e,root:r}}function qe(e){e!==void 0&&(e.root.unmount(),e.wrapper.remove())}var xe=class extends Xt.Component{constructor(){super(...arguments);Qr(this,"state",{error:null})}static getDerivedStateFromError(n){return{error:n instanceof Error?n.message:String(n)}}componentDidCatch(n,r){console.error("[bre] editor render failed:",n,r.componentStack)}render(){return this.state.error!==null?(0,Xt.createElement)("div",{style:{color:"#c00",fontSize:"11px",whiteSpace:"pre-wrap",padding:"6px"}},`${this.props.fallbackText}: ${this.state.error}`):this.props.children}};var Jo=()=>{(0,Xo.flushSync)(()=>{window.dispatchEvent(new Event("resize"))})};function Qo(e){let{menuOf:t,triggerOf:n,t:r,refreshed:o,sliderEnabled:i,directory:s}=e,a,d,u,p,m,g,l=()=>{g?.removeAttribute("data-bre-provider"),g=void 0},c=()=>{let x=n();g!==void 0&&g!==x&&l();let L=p?.store.getSnapshot(),R=L?.current;if(x===void 0||R===null||R===void 0){x===g&&l();return}let C=L?.groups.find(I=>I.id===R.provider),j=C===void 0?R.provider:ot(C);if(j.trim()===""){x===g&&l();return}x.dataset.breProvider=j,g=x},f=()=>{let x=s();x!==p&&(m?.(),m=void 0,p=x,x!==void 0&&(m=x.store.subscribe(c))),c()},w=()=>{qe(d),d=void 0},y=x=>{let L=x.querySelector('section[role="group"]'),R=L?.parentElement,C=R!=null&&R.parentElement===x?R:L;if(d===void 0){let j=document.createElement("div");j.dataset.plugin=Q,j.dataset.breSearch="1",x.insertBefore(j,C),d=yt(j,(0,wt.createElement)(xe,{fallbackText:r("modelSearchFailed"),children:o(()=>(0,wt.createElement)($o,{menu:x,t:r}))}),{sync:!0});return}if(d.wrapper.parentElement!==x){x.insertBefore(d.wrapper,C);return}C!==null&&d.wrapper.nextSibling!==C&&x.insertBefore(d.wrapper,C)},h=x=>{if(!i()){qe(a),a=void 0,x.classList.remove("bre-model-menu-host");for(let I of Array.from(x.children))I.getAttribute("role")==="menuitem"&&(I.style.display="");return}let L=s();if(L===void 0)return;if(a===void 0){let I=document.createElement("div");I.dataset.plugin=Q,I.dataset.breSlider="1",x.insertBefore(I,x.firstChild),a=yt(I,(0,wt.createElement)(xe,{fallbackText:r("renderFailed"),children:o(()=>(0,wt.createElement)(Uo,{directory:L,t:r,onLayoutChange:Jo}))}),{sync:!0})}else(a.wrapper.parentElement!==x||x.firstChild!==a.wrapper)&&x.insertBefore(a.wrapper,x.firstChild);x.classList.add("bre-model-menu-host");let R=Array.from(x.children).filter(I=>I.getAttribute("role")==="menuitem"),C=a.wrapper;if(Array.from(x.querySelectorAll('[role="menuitemradio"]')).some(I=>!C.contains(I)))a.wrapper.contains(document.activeElement)&&(x.tabIndex=-1,x.focus({preventScroll:!0})),a.wrapper.style.display="none";else{a.wrapper.style.display="";for(let I of R)I.style.display="none"}};return{reconcile:()=>{f();let x=t();if(x===void 0){qe(a),a=void 0,w(),u=void 0;return}let L=Go(x);L?y(x):w(),h(x),L!==u&&(u=L,(L||i())&&Jo())},dispose:()=>{m?.(),m=void 0,p=void 0,l(),qe(a),a=void 0,w(),u=void 0}}}var O=e=>typeof e=="object"&&e!==null&&!Array.isArray(e);function Zo(e){let t=e.toLowerCase();return t.includes("compat")||t.includes("thinkingtokenbudget")||t.includes("vllmpriority")||t.includes("supportsmaxoutput")}function Qt(e,t){if(!O(e))return[];let n=e[t];return!O(n)||!Array.isArray(n.models)?[]:n.models.filter(O)}function Ue(e,t){if(!O(e))return{};let n=e[t];if(!O(n))return{};let r=typeof n.api=="string"?n.api:void 0,o=typeof n.baseURL=="string"?n.baseURL:void 0,i=typeof n.displayName=="string"?n.displayName:void 0;return{api:r,baseURL:o,displayName:i}}var He=(e,t)=>typeof e[t]=="boolean";function md(e,t){if(Array.isArray(e)){for(let n of e)if(O(n)&&n.id===t)return n}}function gd(e){if(!O(e))return{reasoning:"unknown",source:null};let t=e.supported_features;if(Array.isArray(t)&&t.includes("reasoning"))return{...ye(e),reasoning:!0,source:"supported_features"};let n=e.supported_parameters;if(Array.isArray(n)&&(n.includes("reasoning")||n.includes("include_reasoning")||n.includes("reasoning_effort")))return{...ye(e),reasoning:!0,source:"supported_parameters"};if(He(e,"supports_reasoning"))return{...ye(e),reasoning:e.supports_reasoning,source:"supports_reasoning"};if(He(e,"supportsReasoning"))return{...ye(e),reasoning:e.supportsReasoning,source:"supportsReasoning"};if(He(e,"can_reason"))return{...ye(e),reasoning:e.can_reason,source:"can_reason"};if(He(e,"reasoning"))return{...ye(e),reasoning:e.reasoning,source:"reasoning"};let r=e.reasoning_effort;if(r!=null&&!(typeof r=="string"&&r.trim().length===0)||e.supports_reasoning_effort===!0)return{...ye(e),reasoning:!0,source:"reasoning_effort"};let o=O(e.capabilities)?e.capabilities:void 0;if(o!==void 0){let i=o.thinking;if(O(i)&&typeof i.supported=="boolean")return{...ye(e),reasoning:i.supported,source:"capabilities.thinking.supported"};let s=o.effort;if(O(s)&&typeof s.supported=="boolean")return{...ye(e),reasoning:s.supported,source:"capabilities.effort.supported"}}return{...ye(e),reasoning:"unknown",source:null}}function ye(e){let t={},n=s=>{if(!Array.isArray(s))return;let a=s.filter(d=>typeof d=="string");return a.length>0?a.map(d=>d.toLowerCase()):[]},r=O(e.architecture)?e.architecture:void 0,o=n(r?.input_modalities);if(o===void 0&&(o=n(e.input_modalities)),o===void 0){let s=O(e.modalities)?e.modalities:void 0;o=n(s?.input)}if(o===void 0){let s=e.capabilities,a=d=>Array.isArray(d)&&d.some(u=>typeof u=="string"&&u.toLowerCase()==="vision");if(a(e.supported_features)||a(s))o=["image"];else if(O(s)){let d=[];for(let u of["image_input","video_input","pdf_input","file_input"]){let p=O(s[u])?s[u]:void 0;if(p===void 0||typeof p.supported!="boolean")continue;let m=u.replace(/_input$/,"");p.supported===!0?d.push(m):d.length===0&&d.push("text")}d.length>0&&(o=d)}}o===void 0&&(He(e,"supports_vision")?o=e.supports_vision===!0?["image"]:[]:He(e,"supportsVision")?o=e.supportsVision===!0?["image"]:[]:(He(e,"supports_images")||He(e,"supportsImages"))&&(o=e.supports_images===!0||e.supportsImages===!0?["image"]:[])),o!==void 0&&(t.input=o.length===0?["text"]:o);let i=e.context_length;if(typeof i=="number"&&Number.isFinite(i)&&i>0)t.contextLength=i;else{let a=(O(e.top_provider)?e.top_provider:void 0)?.context_length;if(typeof a=="number"&&Number.isFinite(a)&&a>0)t.contextLength=a;else{let d=e.max_input_tokens;if(typeof d=="number"&&Number.isFinite(d)&&d>0)t.contextLength=d;else{let p=(O(e.limit)?e.limit:void 0)?.context;typeof p=="number"&&Number.isFinite(p)&&p>0&&(t.contextLength=p)}}}return t}function ei(e,t){let n=md(e,t);return n===void 0?{found:!1,signal:{reasoning:"unknown",source:null}}:{found:!0,signal:gd(n)}}function we(e){let n=e?.value?.providers;return typeof n!="object"||n===null||Array.isArray(n)?{}:Object.fromEntries(Object.entries(n).filter(([,r])=>typeof r=="object"&&r!==null&&!Array.isArray(r)))}function Zt(e){if(!O(e))return;let t=e.providers;return O(t)?t:void 0}function ti(e,t){for(let n of[e?.user,e?.base]){let r=Zt(n)?.[t];if(O(r)&&r.models!==void 0)return r.models}}function ur(e){return Zt(e?.user)}function en(e,t){let n=e.find(o=>o.id===t);if(n===void 0)return;let r=n.reasoningEfforts;if(r===!1)return!1;if(typeof r=="object"&&r!==null&&!Array.isArray(r))return r}function tn(e,t){let r=e.find(i=>i.id===t)?.input;if(!Array.isArray(r))return;let o=r.filter(i=>typeof i=="string");return o.length>0?o:void 0}function nn(e,t){let r=e.find(o=>o.id===t)?.compat;if(O(r))return{...r}}function rn(e,t){let r=e.find(o=>o.id===t)?.name;return typeof r=="string"&&r.length>0?r:void 0}function on(e,t){let r=e.find(o=>o.id===t)?.[et];return typeof r=="string"&&r.length>0?r:void 0}async function hd(e,t){try{let n=await fetch(`${Zr}?route=${encodeURIComponent(e)}`,{method:"GET"});if(!n.ok)return{reasoning:"unknown",source:null};let r=await n.json();return r?.ok?ei(r.data,t).signal:{reasoning:"unknown",source:null}}catch{return{reasoning:"unknown",source:null}}}function sn(e,t=()=>ne(e),n,r,o,i){return{async suggest(s,a,d,u){let p=we((await t()).namespace),m=Ue(p,s),g={api:m.api??u?.api,baseURL:m.baseURL??u?.baseURL,displayName:d??m.displayName},l=p[s]===void 0?void 0:await hd(s,a),c=be(a,g,l);return c.efforts===void 0?{ok:!1,error:"no-suggestion"}:{ok:!0,suggestion:{efforts:c.efforts,...c.compat===void 0?{}:{compat:c.compat},...c.defaultEffort===void 0?{}:{defaultEffort:c.defaultEffort},...c.defaultEffort===void 0?{}:{defaultEffort:c.defaultEffort},...c.input===void 0?{}:{input:c.input},...c.inputSource===void 0?{}:{inputSource:c.inputSource},...c.contextWindow===void 0?{}:{contextWindow:c.contextWindow},...c.maxTokens===void 0?{}:{maxTokens:c.maxTokens},matched:c.matched,source:c.source,confidence:c.confidence,...c.endpoint===void 0?{}:{endpoint:c.endpoint}}}},commit(s,a,d){if(i?.()===!0){n?.(s,a,d.efforts,d.compat,d.input,d.defaultEffort);return}r?.(s,a,{efforts:d.efforts,...d.compat===void 0?{}:{compat:d.compat},...d.input===void 0?{}:{input:d.input},...d.clearCompatKeys===void 0?{}:{clearCompatKeys:d.clearCompatKeys},...d.defaultEffort===void 0?{}:{defaultEffort:d.defaultEffort}})},withdraw(s,a){o?.(s,a)},stageEfforts(s,a,d,u,p,m){n?.(s,a,d,u,p,m)},async writeEfforts(s,a,d,u,p,m,g){if(r!==void 0)return r(s,a,{efforts:d,...u===void 0?{}:{compat:u},...p===void 0?{}:{input:p},...m===void 0?{}:{clearCompatKeys:m},...g===void 0?{}:{defaultEffort:g}}),{ok:!0,staged:!0};let c=(await vt(e,s,[{modelId:a,efforts:d,...u===void 0?{}:{compat:u},...p===void 0?{}:{input:p},...m===void 0?{}:{clearCompatKeys:m},...g===void 0?{}:{defaultEffort:g}}],t))[0]??{ok:!1,error:"no-result"};return c.ok?{ok:!0}:c.modelNotFound===!0?{ok:!1,error:"model-not-found"}:{ok:!1,error:c.error??"conflict"}}}}async function vt(e,t,n,r=()=>ne(e),o){if(n.length===0)return[];let i=!1;for(let s=0;s<3;s++)try{let a=s===0?await r():await ne(e,{fresh:!0});if(a.namespace===void 0)return n.map(()=>({ok:!1,error:"no-namespace"}));let d=ti(a.namespace,t);if(!Array.isArray(d))return n.map(()=>({ok:!1,modelNotFound:!0}));if(!d.every(O))return n.map(()=>({ok:!1,error:"invalid-models"}));let p=d.map(l=>l),m=[];for(let l of n){let c=p.findIndex(f=>f.id===l.modelId);if(c<0){m.push(l.modelId);continue}p[c]=bd(p[c],l,i?void 0:l.compat)}if(m.length>0)return n.map(l=>m.includes(l.modelId)?{ok:!1,modelNotFound:!0}:{ok:!1,error:"model-not-found"});if(o?.()===!0)return n.map(()=>({ok:!1,aborted:!0}));let g=await e.settings.mutate(oe,[{op:"set",path:["providers",t,"models"],value:p}],a.namespace.revision);if(!g.ok){if(s===0&&g.error.code==="settings/conflict")continue;let l=g.error.code==="settings/rejected"&&Zo(g.error.message);if(!i&&l&&n.some(c=>c.compat!==void 0)){i=!0;continue}return n.map(()=>({ok:!1,error:g.error.message}))}return n.map(()=>({ok:!0}))}catch(a){return n.map(()=>({ok:!1,error:a instanceof Error?a.message:String(a)}))}return n.map(()=>({ok:!1,error:"conflict"}))}function bd(e,t,n){let r={...e},o=t.efforts!=="keep",i=t.efforts==="keep"?void 0:t.efforts;if(o)if(i===void 0)delete r.reasoningEfforts,r[de]=!0;else if(delete r[de],delete r[Ze],i===!1)r.reasoningEfforts=!1;else{r.reasoningEfforts={...i};let s=O(e.compat)?e.compat:{},a={...s,...n??{}};for(let d of t.clearCompatKeys??[])delete a[d];(Object.keys(s).length>0||Object.keys(a).length>0)&&(Object.keys(a).length===0?delete r.compat:r.compat=a)}return t.input!==void 0&&(t.input===null?(delete r.input,r[Ae]=!0):(delete r[Ae],r.input=[...t.input])),t.defaultEffort!==void 0&&(t.defaultEffort===null?delete r[et]:r[et]=t.defaultEffort),r}function fr(e,t){for(let n of[e?.user,e?.base]){let r=Zt(n)?.[t];if(!O(r))continue;let o=r.headers;if(o===void 0)continue;if(!O(o))return;let i={};for(let[s,a]of Object.entries(o))typeof a=="string"&&(i[s]=a);return i}}async function cr(e,t,n){if(typeof t!="string"||t.length===0)return{ok:!1,error:"no-route"};for(let r=0;r<2;r+=1)try{let o=r===0?await ne(e):await ne(e,{fresh:!0});if(o.namespace===void 0)return{ok:!1,error:"no-namespace"};if(o.writable!==!0)return{ok:!1,error:"read-only"};if(!yd(o.namespace,t))return{ok:!1,error:"no-route"};let i=await e.settings.mutate(oe,[{op:"set",path:["providers",t,"headers"],value:{...n}}],o.namespace.revision);if(!i.ok){if(r===0&&i.error.code==="settings/conflict")continue;return{ok:!1,error:i.error.message}}return{ok:!0}}catch(o){return{ok:!1,error:o instanceof Error?o.message:String(o)}}return{ok:!1,error:"conflict"}}function yd(e,t){for(let n of[e?.user,e?.base]){let r=Zt(n);if(r!==void 0&&Object.prototype.hasOwnProperty.call(r,t))return!0}return!1}async function ne(e,t={}){let n=t.fresh===!0?void 0:wd(e);if(n!==void 0)return n;let r=await e.settings.describe();return r.ok?{namespace:r.value.namespaces.find(i=>i.ns===oe),writable:r.value.writable}:{namespace:void 0,writable:!1}}function wd(e){let t=e.scope?.getSnapshot();if(!(t===void 0||t.status!=="ready")&&typeof t.revision=="number")return{namespace:{ns:oe,schema:{},value:t.value,user:t.user,base:t.base,revision:t.revision,applies:"live",secrets:[]},writable:t.writable===!0}}function ni(e){let t,n,r=0,o=()=>{if(t!==void 0)return Promise.resolve();let a=r;return n??(n=ne(e.api).then(d=>{if(d.namespace===void 0){n=void 0;return}let u=new Map;for(let[p,m]of Object.entries(we(d.namespace))){let g=Array.isArray(m.models)?m.models:[];for(let l of g){if(typeof l!="object"||l===null||Array.isArray(l))continue;let c=l.id,f=l[et];typeof c=="string"&&typeof f=="string"&&f.length>0&&u.set(`${p}/${c}`,f)}}a===r?t=u:n=void 0}).catch(()=>{a===r&&(n=void 0)})),n};return{of:async(a,d)=>(await o(),t?.get(`${a}/${d}`)),invalidate:()=>{r+=1,t=void 0,n=void 0}}}function vd(e){let t=e.input;return Array.isArray(t)&&t.length>0}function ri(e,t=()=>!0,n={},r=0){let o=n.efforts!==!1,i=n.modalities!==!1;if(!O(e))return;let s={};for(let a of Object.keys(e)){if(!t(a))continue;let d=e[a],u=O(d)&&Array.isArray(d.models)?d.models:void 0;if(u===void 0||u.length===0||!u.every(O))continue;let p=u,m=[],g=!1;for(let l of p){let c=l.reasoningEfforts!==void 0||l[de]===!0,f=vd(l)||l[Ae]===!0;if((c||!o)&&(f||!i)){let L=xd(l,e,a);L!==void 0?(g=!0,m.push(L)):m.push(l);continue}let w=typeof l.id=="string"?l.id:"";if(w.length===0){m.push(l);continue}let y=Ue(e,a),h=typeof l.name=="string"?l.name:void 0,v=be(w,{...y,displayName:h??y.displayName});if(v.efforts===void 0){m.push(l);continue}let M={...l},x=!1;if(!c&&o&&(x=!0,M.reasoningEfforts=v.efforts,M[Ze]=r,v.compat!==void 0)){let L=O(l.compat)?l.compat:{};M.compat={...L,...v.compat}}if(!f&&i&&v.input!==void 0&&(x=!0,M.input=[...v.input]),!x){m.push(l);continue}g=!0,m.push(M)}g&&(s[a]={models:m})}return Object.keys(s).length===0?void 0:{providers:s}}function xd(e,t,n){if(!O(e.reasoningEfforts)||e[de]===!0)return;let r=e.compat,o=O(r)?{...r}:{};if(o.supportsDeveloperRole===void 0&&tr(Ue(t,n)))return{...e,compat:{...o,supportsDeveloperRole:!1}}}function oi(e){let t,n=()=>(t??(t=(async()=>{let o={autofill:!0,modalityAutofill:!0};try{let i=await fetch(to,{method:"GET"});if(!i.ok)return o;let s=await i.json();return s?.ok!==!0?o:{autofill:s.data?.autofill!==!1,modalityAutofill:s.data?.modalityAutofill!==!1}}catch{return o}})()),t),r=async()=>{try{let o=await n();if(!o.autofill)return;let i=await ne(e.api,{fresh:!0}),s=i.namespace;if(s===void 0||i.writable!==!0)return;let a=ur(s);if(a===void 0)return;let d=ri(a,()=>!0,{modalities:o.modalityAutofill},s.revision);if(d===void 0)return;let u=d.providers,p=Object.entries(u).map(([g,l])=>({op:"set",path:["providers",g,"models"],value:l.models})),m=await e.api.settings.mutate(oe,p,s.revision);m.ok||console.error(`[bre] idle autofill refused: ${m.error.message}`)}catch(o){console.error(`[bre] idle autofill failed: ${o instanceof Error?o.message:String(o)}`)}};return{run:()=>{r()}}}var Br=require("react"),$s=require("react-dom/client");var W=require("react");var je=No;function ze(e){let t={};for(let n of je){if(e===void 0){t[n]={on:!1,wire:""};continue}if(e===!1){t[n]=n==="off"?{on:!0,wire:""}:{on:!1,wire:""};continue}let r=e[n];t[n]={on:r!==void 0,wire:r===null?"":typeof r=="string"?r:""}}return t}function it(e){let t=!1,n=!1,r={};for(let o of je){let i=e[o];if(!i.on)continue;if(o==="off"){t=!0;let a=i.wire.trim();r.off=a.length===0?null:a;continue}n=!0;let s=i.wire.trim();r[o]=s.length===0?o:s}return n?r:t?!1:void 0}function xt(e,t){if(e===t)return!0;if(e===!1||e===void 0||t===!1||t===void 0)return!1;let n=je.filter(o=>e[o]!==void 0),r=je.filter(o=>t[o]!==void 0);return n.length!==r.length?!1:n.every(o=>e[o]===t[o])}function ii(e,t){if(!(e===void 0||e===!1)&&!("off"in e)){if(t==="zai"||t==="deepseek")return"thinking-disabled";if(t==="qwen")return"enable-thinking-false"}}var pr="bre:auto-effort",si=Promise.resolve();function ai(e){si=si.then(e,e).then(()=>{},()=>{})}function di(e,t=document){t.dispatchEvent(new CustomEvent(pr,{detail:{route:e}}))}function li(e,t=document){let n=r=>{let o=r.detail;typeof o?.route!="string"||o.route.length===0||e(o.route)};return t.addEventListener(pr,n),()=>{t.removeEventListener(pr,n)}}var k=require("react/jsx-runtime"),ui=new Intl.NumberFormat("en-US");function Ge(e){return e===void 0||e.length===0?{declared:!1,image:!1}:{declared:!0,image:e.includes("image")}}function mr(e){return e.declared?e.image?["text","image"]:["text"]:null}var kd={"openai-completions":["thinkingTokenBudgetField","supportsThinkingTokenBudget","vllmPriority"],"openai-responses":["supportsMaxOutputTokens"]};function Ed(e){return kd[(e??"").toLowerCase()]??[]}function fi(e,t){let n=Ed(e);if(n.length===0)return[];let r=new Set(t===void 0?[]:Object.keys(t));return n.filter(o=>!r.has(o))}function Td(e,t){if(t!==void 0)return{clearCompatKeys:fi(e,t)};let n=fi(e,void 0);return n.length===0?{}:{clearCompatKeys:n}}function an(e,t){return e.declared?t===void 0?!1:e.image?t.includes("image"):!t.includes("image"):t===void 0}function gr(e,t,n){let r=e?t:!1;return e&&r===void 0&&n===void 0?"keep":r}function ci(e){let t={},n=e?.thinkingTokenBudgetField??"";n!==""&&(t.thinkingTokenBudgetField=n);let o=(e?.vllmPriority===void 0?"":String(e.vllmPriority)).trim();o!==""&&/^-?\d+$/.test(o)&&(t.vllmPriority=Number.parseInt(o,10));let i=e?.supportsMaxOutputTokens===void 0?"":String(e.supportsMaxOutputTokens);return i==="true"?t.supportsMaxOutputTokens=!0:i==="false"&&(t.supportsMaxOutputTokens=!1),Object.keys(t).length===0?void 0:t}function hr(e){let t=e.appliedCompat,n=e.manualCompat,r=t!==void 0?{...t,...n??{}}:n;return e.initialCompat?.supportsThinkingTokenBudget===!0&&e.initialCompat?.thinkingTokenBudgetField===void 0&&r?.thinkingTokenBudgetField===void 0&&(e.routeApi??"").toLowerCase()==="openai-completions"&&(r={...r??{},thinkingTokenBudgetField:"thinking_token_budget"}),{efforts:e.efforts,...r===void 0?{}:{compat:r},...e.input===void 0?{}:{input:e.input},...Td(e.routeApi,r),...e.defaultEffort===void 0?{}:{defaultEffort:e.defaultEffort}}}function dn({route:e,routeApi:t,routeBaseURL:n,modelId:r,modelName:o,efforts:i,effortsUnset:s=!1,input:a,compat:d,defaultEffort:u,index:p,staged:m=!1,officialInputTypes:g=!1,api:l,readOnly:c,t:f}){let[w,y]=(0,W.useState)(()=>ze(i)),[h,v]=(0,W.useState)(()=>Ge(a)),[M,x]=(0,W.useState)(()=>i!==!1),[L,R]=(0,W.useState)(()=>u??""),[C,j]=(0,W.useState)(!1),[I,D]=(0,W.useState)(void 0),[A,P]=(0,W.useState)(void 0),[q,F]=(0,W.useState)(""),[z,Y]=(0,W.useState)("low"),U=(0,W.useRef)(void 0),[S,K]=(0,W.useState)(()=>d?.thinkingTokenBudgetField??""),[N,te]=(0,W.useState)(()=>d?.vllmPriority===void 0?"":String(d.vllmPriority)),[ie,Pe]=(0,W.useState)(()=>d?.supportsMaxOutputTokens===void 0?"":String(d.supportsMaxOutputTokens)),Qe=(0,W.useRef)(d),[Me,Fe]=(0,W.useState)(void 0),[Ke,It]=(0,W.useState)(void 0),[E,J]=(0,W.useState)(void 0),V=(0,W.useRef)(!1),se=(0,W.useRef)(i),Se=(0,W.useRef)(a),Dt=(0,W.useRef)(u),Kn=(0,W.useRef)(void 0),pt=(0,W.useRef)(i);pt.current=i;let Ct=(0,W.useRef)(s);Ct.current=s,(0,W.useEffect)(()=>li(b=>{if(b!==e||pt.current!==void 0||Ct.current)return;let B=Kn.current;B!==void 0&&ai(B)}),[e]),(0,W.useEffect)(()=>{xt(se.current,i)||(se.current=i,V.current||(y(ze(i)),x(i!==!1))),Se.current!==a&&(Se.current=a,V.current||v(Ge(a))),Dt.current!==u&&(Dt.current=u,V.current||R(u??"")),JSON.stringify(Qe.current??null)!==JSON.stringify(d??null)&&(Qe.current=d,V.current||(K(d?.thinkingTokenBudgetField??""),te(d?.vllmPriority===void 0?"":String(d.vllmPriority)),Pe(d?.supportsMaxOutputTokens===void 0?"":String(d.supportsMaxOutputTokens))))},[i,a,d,u]);let Gr=()=>{let b={};S!==""&&(b.thinkingTokenBudgetField=S);let B=N.trim();return B!==""&&/^-?\d+$/.test(B)&&(b.vllmPriority=Number.parseInt(B,10)),ie==="true"?b.supportsMaxOutputTokens=!0:ie==="false"&&(b.supportsMaxOutputTokens=!1),Object.keys(b).length===0?void 0:b},la=()=>{let b=Gr();return JSON.stringify(b??null)!==JSON.stringify({...d?.thinkingTokenBudgetField===void 0?{}:{thinkingTokenBudgetField:d.thinkingTokenBudgetField},...d?.vllmPriority===void 0?{}:{vllmPriority:d.vllmPriority},...d?.supportsMaxOutputTokens===void 0?{}:{supportsMaxOutputTokens:d.supportsMaxOutputTokens}})},Pt=je.filter(b=>w[b].on),ua=L===(u??"")?void 0:L===""?null:L,fa=M?it(w):!1,Wn=!xt(fa,i)||!an(h,a)||la()||ua!==void 0,Bn=(0,W.useRef)(void 0),me=()=>{V.current=!0,P(void 0),F(""),Y("low"),Fe(void 0)},ge=(b,B,ee,he=M)=>{let fe=gr(he,it(b),i),Ea=an(B,a)?void 0:mr(B),Jr=hr({efforts:fe,input:Ea,defaultEffort:ee===(u??"")?void 0:ee===""?null:ee,manualCompat:Gr(),appliedCompat:U.current,routeApi:t,initialCompat:d}),Xr=JSON.stringify(Jr);Bn.current!==Xr&&(Bn.current=Xr,l.commit(e,r,Jr))},ca=(b,B)=>{me();let ee=!B&&L===b?"":L;ee!==L&&R(ee),y(he=>{let fe={...he,[b]:{...he[b],on:B}};return B&&b!=="off"&&fe[b].wire.trim().length===0&&(fe[b]={...fe[b],wire:b}),ge(fe,h,ee),fe}),D(void 0)},pa=b=>{me(),x(b);let B=b?L:"";B!==L&&R(B),ge(w,h,B,b),D(void 0)},ma=(b,B)=>{me(),y(ee=>{let he={...ee,[b]:{...ee[b],wire:B}};return ge(he,h,L),he}),D(void 0)},ga=b=>{me();let B={declared:!0,image:b};v(B),ge(w,B,L),D(void 0)},ha=()=>{me();let b={declared:!1,image:!1};v(b),ge(w,b,L),D(void 0)},ba=b=>{me(),K(b),ge(w,h,L),D(void 0)},ya=b=>{me(),te(b),ge(w,h,L),D(void 0)},wa=b=>{me(),Pe(b),ge(w,h,L),D(void 0)},$r=b=>{me(),R(b),ge(w,h,b),D(void 0)},va=b=>{me();let B=b.efforts!==!1;x(B);let ee=ze(b.efforts);y(ee);let he=b.input===void 0?h:Ge(b.input);b.input!==void 0&&v(he);let fe=L===""&&b.defaultEffort!==void 0?b.defaultEffort:L;fe!==L&&R(fe),P(b.efforts),F(b.source),Y(b.confidence),U.current=b.compat,Fe(b.inputSource),It(b.contextWindow),J(b.maxTokens),D({kind:"info",text:f("appliedHint",{source:b.source,confidence:f("confidence_"+b.confidence)})}),ge(ee,he,fe,B)},Vr=async()=>{if(!(c||C)){j(!0),D(void 0);try{let b=m?await l.suggest(e,r,o,{...t===void 0?{}:{api:t},...n===void 0?{}:{baseURL:n}}):await l.suggest(e,r,o);if(!b.ok){D({kind:"error",text:b.error==="no-suggestion"?f("noSuggestion"):b.error});return}va(b.suggestion)}catch(b){D({kind:"error",text:f("writeError",{message:String(b)})})}finally{j(!1)}}};(0,W.useEffect)(()=>{Kn.current=Vr});let xa=()=>{V.current=!1,l.withdraw(e,r),y(ze(i)),x(i!==!1),v(Ge(a)),R(u??""),K(d?.thinkingTokenBudgetField??""),te(d?.vllmPriority===void 0?"":String(d.vllmPriority)),Pe(d?.supportsMaxOutputTokens===void 0?"":String(d.supportsMaxOutputTokens)),P(void 0),F(""),Y("low"),U.current=void 0,Fe(void 0),It(void 0),J(void 0),D(void 0),Bn.current=void 0},ka=U.current?.thinkingFormat??be(r,{...t===void 0?{}:{api:t},...n===void 0?{}:{baseURL:n}}).compat?.thinkingFormat,Yr=ii(i,ka),ae=c||C;return(0,k.jsxs)("div",{className:"bre-effort-editor","data-plugin":Q,children:[(0,k.jsxs)("label",{className:"bre-modality-row bre-thinking-switch",children:[(0,k.jsx)("input",{type:"checkbox",checked:M,disabled:ae,"aria-label":f("thinkingMode")+" "+String(p+1),onChange:b=>{pa(b.target.checked)}}),(0,k.jsx)("span",{className:"bre-effort-level",children:f("thinkingMode")}),M?null:(0,k.jsx)("span",{className:"bre-effort-note",children:f("thinkingModeOff")})]}),M?(0,k.jsxs)("div",{className:"bre-effort-card",children:[(0,k.jsxs)("div",{className:"bre-effort-head",children:[(0,k.jsx)("span",{className:"bre-effort-title",children:f("reasoningEffort")}),(0,k.jsx)("button",{type:"button",className:"bre-link-button",disabled:ae,onClick:()=>{Vr()},children:f("autoAdapt")})]}),(0,k.jsx)("div",{className:"bre-effort-grid",children:je.map(b=>{let B=w[b];return(0,k.jsxs)("label",{className:"bre-effort-row",children:[(0,k.jsx)("input",{type:"checkbox",checked:B.on,disabled:ae,"aria-label":f("level_"+b)+" "+String(p+1),onChange:ee=>{ca(b,ee.target.checked)}}),(0,k.jsx)("span",{className:"bre-effort-level",children:f("level_"+b)}),B.on?(0,k.jsx)("input",{type:"text",className:"bre-effort-wire",value:B.wire,disabled:ae,placeholder:f("wirePlaceholder"),"aria-label":f("level_"+b)+" "+f("wireValue"),onChange:ee=>{ma(b,ee.target.value)}}):(0,k.jsx)("span",{className:"bre-effort-empty"})]},b)})}),Pt.length>0?(0,k.jsxs)("div",{className:"bre-modality",children:[(0,k.jsx)("span",{className:"bre-effort-title",children:f("defaultEffortLabel")}),(0,k.jsxs)("label",{className:"bre-modality-row",children:[(0,k.jsxs)("select",{className:"bre-select",disabled:ae,"aria-label":f("defaultEffortLabel")+" "+String(p+1),value:L,onChange:b=>{$r(b.target.value)},children:[(0,k.jsx)("option",{value:"",children:f("defaultEffortUnset")}),(L!==""&&!Pt.includes(L)?[...Pt,L]:Pt).map(b=>(0,k.jsx)("option",{value:b,children:f("level_"+b)},b))]}),L!==""?(0,k.jsx)("button",{type:"button",className:"bre-link-button bre-modality-clear",disabled:ae,onClick:()=>{$r("")},children:f("clearDefaultEffort")}):null]}),(0,k.jsx)("p",{className:"bre-modality-note",children:f("defaultEffortHint")})]}):null,g?null:(0,k.jsxs)("div",{className:"bre-modality",children:[(0,k.jsx)("span",{className:"bre-effort-title",children:f("inputModality")}),(0,k.jsxs)("label",{className:"bre-modality-row",children:[(0,k.jsx)("input",{type:"checkbox",checked:h.declared&&h.image,disabled:ae,"aria-label":f("modalityImage")+" "+String(p+1),onChange:b=>{ga(b.target.checked)}}),(0,k.jsx)("span",{className:"bre-effort-level",children:f("modalityImage")}),h.declared?(0,k.jsx)("button",{type:"button",className:"bre-link-button bre-modality-clear",disabled:ae,onClick:ha,children:f("clearDeclaration")}):null]}),h.declared?null:(0,k.jsx)("p",{className:"bre-modality-note",children:f("modalityInherit")})]}),(t??"").toLowerCase()==="openai-completions"?(0,k.jsxs)("div",{className:"bre-compat",children:[(0,k.jsx)("span",{className:"bre-effort-title",children:f("compatTitle")}),(0,k.jsxs)("label",{className:"bre-compat-row",children:[(0,k.jsx)("span",{className:"bre-compat-label",children:f("budgetFieldLabel")}),(0,k.jsxs)("select",{className:"bre-select",disabled:ae,"aria-label":f("budgetFieldLabel")+" "+String(p+1),value:S,onChange:b=>{ba(b.target.value)},children:[(0,k.jsx)("option",{value:"",children:f("budgetUnset")}),(0,k.jsx)("option",{value:"thinking_token_budget",children:"thinking_token_budget"}),(0,k.jsx)("option",{value:"thinking_budget",children:"thinking_budget"}),(0,k.jsx)("option",{value:"thinking_budget_tokens",children:"thinking_budget_tokens"})]}),(0,k.jsx)("span",{className:"bre-compat-hint",children:f("budgetFieldHint")})]}),(0,k.jsxs)("div",{className:"bre-compat-row",children:[(0,k.jsxs)("label",{className:"bre-compat-field",children:[(0,k.jsx)("span",{className:"bre-compat-label",children:f("priorityLabel")}),(0,k.jsx)("input",{type:"text",inputMode:"numeric",className:"bre-text-input",value:N,disabled:ae,placeholder:f("priorityPlaceholder"),"aria-label":f("priorityLabel")+" "+String(p+1),onChange:b=>{ya(b.target.value)}})]}),(0,k.jsx)("span",{className:"bre-compat-hint",children:f("priorityHint")}),N.trim()!==""&&!/^-?\d+$/.test(N.trim())?(0,k.jsx)("p",{className:"bre-effort-note bre-error",children:f("priorityInvalid")}):null]}),d?.supportsThinkingTokenBudget===!0&&d?.thinkingTokenBudgetField===void 0?(0,k.jsx)("p",{className:"bre-effort-note",children:f("aliasMigrated")}):null]}):null,(t??"").toLowerCase()==="openai-responses"?(0,k.jsxs)("div",{className:"bre-compat",children:[(0,k.jsx)("span",{className:"bre-effort-title",children:f("compatTitle")}),(0,k.jsxs)("label",{className:"bre-compat-row",children:[(0,k.jsx)("span",{className:"bre-compat-label",children:f("maxOutputLabel")}),(0,k.jsxs)("select",{className:"bre-select",disabled:ae,"aria-label":f("maxOutputLabel")+" "+String(p+1),value:ie,onChange:b=>{wa(b.target.value)},children:[(0,k.jsx)("option",{value:"",children:f("maxOutputUnset")}),(0,k.jsx)("option",{value:"true",children:f("maxOutputOn")}),(0,k.jsx)("option",{value:"false",children:f("maxOutputOff")})]}),(0,k.jsx)("span",{className:"bre-compat-hint",children:f("maxOutputHint")})]})]}):null,m?(0,k.jsx)("p",{className:"bre-effort-note",children:f("stagedHint")}):null,i===!1?(0,k.jsx)("p",{className:"bre-effort-note",children:f("reasoningDisabled")}):null,Yr===void 0?null:(0,k.jsx)("p",{className:"bre-effort-note",children:f(Yr==="thinking-disabled"?"defaultRiskDisabled":"defaultRiskQwen")}),it(w)===void 0&&i!==void 0?(0,k.jsx)("p",{className:"bre-effort-note",children:f("bareHint")}):null,A!==void 0?(0,k.jsxs)("div",{className:"bre-suggestion",children:[(0,k.jsx)("p",{className:"bre-effort-note",children:f("appliedHint",{source:q,confidence:f("confidence_"+z)})}),Me===void 0?null:(0,k.jsx)("p",{className:"bre-effort-note",children:f(Me==="endpoint"?"inputHintEndpoint":Me==="knowledge"?"inputHintKnowledge":"inputHintHeuristic")}),Ke===void 0&&E===void 0?null:(0,k.jsxs)("div",{className:"bre-reference",children:[(0,k.jsx)("span",{className:"bre-reference-title",children:f("referenceTitle")}),(0,k.jsxs)("span",{className:"bre-reference-values",children:[Ke===void 0?null:(0,k.jsxs)("span",{children:[f("contextWindowLabel")," ",(0,k.jsx)("b",{children:ui.format(Ke)})]}),E===void 0?null:(0,k.jsxs)("span",{children:[f("maxTokensLabel")," ",(0,k.jsx)("b",{children:ui.format(E)})]})]})]})]}):null,I===void 0?null:(0,k.jsx)("p",{className:"bre-effort-message bre-"+I.kind,role:I.kind==="error"?"alert":"status",children:I.text}),Wn?(0,k.jsx)("p",{className:"bre-effort-message bre-info",role:"status",children:f("pendingSave")}):null,Wn?(0,k.jsx)("p",{className:"bre-effort-note",children:f("pendingHint")}):null,(0,k.jsx)("div",{className:"bre-effort-actions",children:(0,k.jsx)("button",{type:"button",className:"bre-secondary-button",disabled:ae||!Wn,onClick:xa,children:f("reset")})})]}):null]})}var Oe="data-bre-auto-effort",br='[class*="modelCatalog"]',Ld='[class*="modelListHead"]',Md='button[class*="linkButton"]',Sd="bre-auto-effort",Ad="bre-auto-effort-note",Rd="data-bre-auto-effort-phase",mi="bre-auto-effort-note-text",gi="bre-auto-effort-note-detail",Hd=3e3;function Od(e){return e.blocked==="busy"?null:e.failed!==void 0?{phase:"failed",count:0,missed:0,detail:e.failed}:e.blocked!==void 0?{phase:"blocked",count:0,missed:0,detail:""}:e.held>0?{phase:"done",count:e.held,missed:e.unsuggested,detail:""}:e.unsuggested>0?{phase:"unsuggested",count:0,missed:e.unsuggested,detail:""}:{phase:"empty",count:0,missed:0,detail:""}}function yr(e){return Array.from(e.querySelectorAll(br)).filter(t=>(t.parentElement?.closest(br)??null)===null)}function ln(e,t,n){let r=new Map;for(let a of t)a.route.length!==0&&a.catalogue.isConnected&&r.set(a.catalogue,a.route);let o=n.t("autoAdaptAll");for(let[a,d]of r){let u=a.querySelector(Ld)??a,p=u.querySelector(`[${Oe}]`)??Nd(n),m=_d(u);m!==null?m.nextElementSibling!==p&&m.after(p):u.lastElementChild!==p&&u.append(p),Pd(p,d,o)}let i=new Set,s=new Set(r.values());for(let a of Array.from(e.querySelectorAll(`[${Oe}]`))){let d=a.closest(br),u=a.getAttribute(Oe)??"";if(d===null||!r.has(d)||i.has(d)){a.remove(),u.length>0&&!s.has(u)&&wr(u);continue}i.add(d)}}function wr(e){let t=$e.get(e);t!==void 0&&(t.timer!==null&&clearTimeout(t.timer),t.note.remove(),$e.delete(e))}function hi(){for(let e of Array.from(document.querySelectorAll(`[${Oe}]`)))e.remove();for(let e of $e.values())e.timer!==null&&clearTimeout(e.timer),e.note.remove();$e.clear()}function _d(e){let t=Array.from(e.querySelectorAll(Md));return t.length===0?null:t[t.length-1]}function Nd(e){let t=document.createElement("button");return t.className=Sd,t.setAttribute("type","button"),t.setAttribute(Oe,""),t.addEventListener("click",()=>{let n=t.getAttribute(Oe)??"";n.length!==0&&(di(n),Id(n,e))}),t}async function Id(e,t){if(t.onRequest===void 0)return;pi(e,{phase:"working",count:0,missed:0,detail:""},t,0);let n;try{n=await t.onRequest(e)}catch(o){n={held:0,unsuggested:0,failed:String(o)}}if(n===void 0){wr(e);return}let r=Od(n);r!==null&&pi(e,r,t,Hd)}function pi(e,t,n,r){let o=$e.get(e);o!==void 0&&!o.note.isConnected&&(o.timer!==null&&clearTimeout(o.timer),$e.delete(e),o=void 0),o!==void 0&&o.timer!==null&&clearTimeout(o.timer);let i=o?.note??Dd();i.setAttribute(Rd,t.phase);let s=i.querySelector(`.${mi}`),a=i.querySelector(`.${gi}`),d=Cd(t,n);s.textContent!==d.text&&(s.textContent=d.text),a.textContent!==d.detail&&(a.textContent=d.detail),a.hidden=d.detail.length===0,o===void 0&&document.body.append(i);let u=r>0?setTimeout(()=>{wr(e)},r):null;i.style.setProperty("--bre-note-hold",`${r}ms`),$e.set(e,{note:i,timer:u})}function Dd(){let e=document.createElement("div");return e.className=Ad,e.setAttribute("role","status"),e.setAttribute("aria-live","polite"),e.innerHTML=`<span class="${mi}"></span><span class="${gi}"></span>`,e}var $e=new Map;function Cd(e,t){switch(e.phase){case"working":return{text:t.t("autoAdaptWorking"),detail:""};case"done":return{text:t.t("autoAdaptDone",{count:e.count}),detail:e.missed>0?`${t.t("autoAdaptDoneHint",{count:e.count})} ${t.t("autoAdaptUnsuggestedHint")}`:t.t("autoAdaptDoneHint",{count:e.count})};case"empty":return{text:t.t("autoAdaptEmpty"),detail:t.t("autoAdaptEmptyHint")};case"unsuggested":return{text:t.t("autoAdaptUnsuggested"),detail:t.t("autoAdaptUnsuggestedHint")};case"blocked":return{text:t.t("autoAdaptBlocked"),detail:t.t("autoAdaptBlockedHint")};case"failed":return{text:t.t("autoAdaptFailed",{message:e.detail}),detail:e.detail}}}function Pd(e,t,n){e.getAttribute(Oe)!==t&&e.setAttribute(Oe,t),e.textContent!==n&&(e.textContent=n),e.getAttribute("title")!==null&&e.removeAttribute("title")}var kt="data-bre-drag-handle",vr="data-bre-row-head",xr="data-bre-drop-side",un="bre-row-dragging",fn="bre-row-drop-target",ki="bre-drag-ghost",Ei="bre-drop-line",bi="http://www.w3.org/2000/svg",yi=8,wi=28,vi=12,Fd="transform 180ms cubic-bezier(0.2, 0.7, 0.3, 1)",Kd='button, a, input, textarea, select, [contenteditable], [role="button"], [role="switch"], [role="checkbox"], [role="textbox"], [role="combobox"]';function cn(){return{sources:new WeakSet,lists:new WeakSet,line:void 0,sighted:new WeakMap,drag:void 0}}function re(e){return Array.from(e.children).filter(t=>t instanceof HTMLElement)}function Wd(e,t){let n=e.style.order;if(n==="")return t;let r=Number.parseInt(n,10);return Number.isNaN(r)?t:r}function Ve(e){return re(e).map((t,n)=>({row:t,key:Wd(t,n),index:n})).sort((t,n)=>t.key-n.key||t.index-n.index).map(t=>t.row)}function Ti(e,t){let n=e.filter(s=>t.includes(s)),r=n.map(s=>e.indexOf(s)),o=t.filter(s=>n.includes(s)),i=new Map;e.forEach((s,a)=>i.set(s,a)),r.forEach((s,a)=>{let d=o[a];d!==void 0&&i.set(d,s)});for(let[s,a]of i){let d=String(a);s.style.order!==d&&(s.style.order=d)}}function pn(e,t){Ti(Ve(e),t)}function kr(e,t){let n=re(e),r=n.map(o=>o.offsetTop);t(),n.forEach((o,i)=>{let s=r[i]-o.offsetTop;s!==0&&(o.style.transition="none",o.style.transform=`translateY(${s}px)`,o.offsetHeight,o.style.transition=Fd,o.style.transform="")})}function Et(e,t){return Ve(e).map(n=>t(n)).filter(n=>n!==void 0)}function Bd(e,t,n){let r=Et(e,t);if(n===void 0||!qd(e,n))return r;let o=new Map;return n.ids.forEach((i,s)=>{o.has(i)||o.set(i,s)}),r.map((i,s)=>({id:i,key:o.get(i)??n.ids.length+s})).sort((i,s)=>i.key-s.key).map(i=>i.id)}function qd(e,t){return t.rows.some(n=>!e.contains(n))}function Ud(e,t){let n=[];for(let o of Ve(e)){let i=t(o);i!==void 0&&n.push(i)}let r=[];for(let o of re(e))t(o)!==void 0&&r.push(o);return{ids:n,rows:r}}function Li(e,t,n){let r=new Map;for(let[a,d]of t.entries())r.has(d)||r.set(d,a);let o=re(e),s=[...o.filter(a=>n(a)!==void 0)].sort((a,d)=>{let u=r.get(n(a))??Number.MAX_SAFE_INTEGER,p=r.get(n(d))??Number.MAX_SAFE_INTEGER;return u-p});Ti(o,s)}function mn(e){for(let t of e)t.style.order="",t.style.transition="",t.style.transform=""}function Mi(e,t,n,r){let i=e.filter(s=>s!==t).indexOf(n);return i<0?Math.max(0,e.indexOf(t)):r?i+1:i}function Si(e,t){let n,r=Number.POSITIVE_INFINITY;for(let o of e){let i=o.getBoundingClientRect(),s=t<i.top?i.top-t:t>i.bottom?t-i.bottom:0;s<r&&(r=s,n=o)}return n}function jd(e,t){let n=e.getBoundingClientRect();return n.height<=0?!0:t>n.top+n.height/2}function Ai(e,t){let n=e.getBoundingClientRect();return t?n.bottom+yi/2-1:n.top-yi/2-1}function Ri(){let e=document.createElementNS(bi,"svg");e.setAttribute("width","10"),e.setAttribute("height","14"),e.setAttribute("viewBox","0 0 10 14"),e.setAttribute("fill","none"),e.setAttribute("aria-hidden","true");let t=[[2.5,3],[7.5,3],[2.5,7],[7.5,7],[2.5,11],[7.5,11]];for(let[n,r]of t){let o=document.createElementNS(bi,"circle");o.setAttribute("cx",String(n)),o.setAttribute("cy",String(r)),o.setAttribute("r","1.2"),o.setAttribute("fill","currentColor"),e.appendChild(o)}return e}function Hi(e,t){let n=document.createElement("div");n.className=ki,n.setAttribute("aria-hidden","true"),n.appendChild(Ri());let r=document.createElement("span");r.className="bre-drag-ghost-name";let o=t??e.querySelector('[class*="rowName"]')?.textContent?.trim();return r.textContent=o===void 0?"":o,n.appendChild(r),n}function zd(e){return!(e instanceof Element)||e.closest(`[${kt}]`)!==null?!1:e.closest(Kd)!==null}function Oi(e){return e.parentElement??void 0}function _i(e){for(let t of re(e))t.classList.remove(fn),t.removeAttribute(xr)}function Ye(e){let t=e.parentElement;for(;t!==null;){if(Gd(t))return t;t=t.parentElement}let n=document.scrollingElement;return n instanceof HTMLElement&&n.scrollHeight>n.clientHeight?n:void 0}function Gd(e){if(e.scrollHeight<=e.clientHeight)return!1;let t=e.style.overflowY,n=t.length>0?t:window.getComputedStyle(e).overflowY;return n==="auto"||n==="scroll"||n==="overlay"}function Ni(e,t){let n=e.getBoundingClientRect();return n.height<=0?0:t<n.top+wi?-vi:t>n.bottom-wi?vi:0}function Ii(e,t,n){if(t.scrollStep===n)return;if(t.scrollStep=n,n===0){t.frame!==void 0&&(window.cancelAnimationFrame(t.frame),t.frame=void 0);return}let r=t.scroller;if(r===void 0||t.frame!==void 0)return;let o=()=>{t.frame=void 0,!(e.drag!==t||t.scrollStep===0)&&(r.scrollTop+=t.scrollStep,t.frame=window.requestAnimationFrame(o))};t.frame=window.requestAnimationFrame(o)}function $d(e){let t=e.line;if(t!==void 0&&t.isConnected)return t;let n=document.createElement("div");return n.className=Ei,n.setAttribute("aria-hidden","true"),document.body.appendChild(n),e.line=n,n}function Vd(e,t,n){let r=$d(e),o=t.getBoundingClientRect();r.style.top=`${Ai(t,n)}px`,r.style.left=`${o.left}px`,r.style.width=`${o.width}px`,r.style.display="block",r.setAttribute(xr,n?"after":"before")}function Yd(e){e.line!==void 0&&(e.line.style.display="none")}function Jd(e){let t=e.drag;e.drag=void 0,t!==void 0&&(Ii(e,t,0),Yd(e),t.row.classList.remove(un),_i(t.list),t.dropped||kr(t.list,()=>{pn(t.list,t.before)}))}function Xd(e,t,n,r){if(zd(t.target)){t.preventDefault();return}let o=Oi(e),i=n.idOf(e);if(o===void 0||i===void 0){t.preventDefault();return}let s={row:e,list:o,before:Ve(o),scroller:Ye(o),adapter:n,scrollStep:0,frame:void 0,dropped:!1};r.drag=s,e.classList.add(un);let a=Hi(e,n.labelOf(e));Number.isFinite(t.clientX)&&Number.isFinite(t.clientY)&&(a.style.left=`${t.clientX}px`,a.style.top=`${t.clientY}px`),document.body.appendChild(a);let d=t.dataTransfer;if(d!=null)try{d.effectAllowed="move",d.setData("text/plain",i),d.setDragImage(a,Math.round(a.offsetWidth/2),Math.round(a.offsetHeight/2))}catch{}window.setTimeout(()=>{a.remove()},0)}function Qd(e,t,n){let r=n.drag;if(r===void 0||r.list!==e)return;let o=t.target,i=o instanceof Element?r.adapter.rowOf(o,e):void 0,s=Ve(e),a=i!==void 0&&s.includes(i)?i:Si(s,t.clientY);if(a===void 0)return;t.preventDefault();let d=t.dataTransfer;d!=null&&(d.dropEffect="move");let u=jd(a,t.clientY),p=Mi(s,r.row,a,u);p!==s.indexOf(r.row)&&kr(e,()=>{pn(e,Vn(s,r.row,p))}),_i(e),a.classList.add(fn),a.setAttribute(xr,u?"after":"before"),Vd(n,a,u),Ii(n,r,r.scroller===void 0?0:Ni(r.scroller,t.clientY))}function Zd(e,t){t.lists.has(e)||(t.lists.add(e),e.addEventListener("dragover",n=>{Qd(e,n,t)}),e.addEventListener("drop",n=>{let r=t.drag;r===void 0||r.list!==e||(n.preventDefault(),r.dropped=!0,r.adapter.commit(e))}))}function el(e,t,n,r){r.sources.has(e)||(r.sources.add(e),n.seatDrags&&(e.setAttribute(vr,"1"),e.setAttribute("draggable","true")),e.addEventListener("dragstart",o=>{Xd(t,o,n,r)}),e.addEventListener("dragend",()=>{Jd(r)}))}function tl(e,t,n,r){e.addEventListener("click",o=>{o.preventDefault(),o.stopPropagation()}),e.addEventListener("keydown",o=>{if(o.key!=="ArrowUp"&&o.key!=="ArrowDown")return;let i=Oi(t);if(i===void 0)return;let s=Ve(i),a=s.indexOf(t);if(a<0)return;let d=a+(o.key==="ArrowUp"?-1:1);d<0||d>=s.length||(o.preventDefault(),kr(i,()=>{pn(i,Vn(s,t,d))}),n.commit(i),e.focus())})}function xi(e,t,n,r){let o=r.gripLabel(t,n),i=r.gripHint();e.getAttribute(kt)!==n&&e.setAttribute(kt,n),e.getAttribute("aria-label")!==o&&e.setAttribute("aria-label",o),e.getAttribute("title")!==i&&e.setAttribute("title",i)}function nl(e,t,n,r,o){let i=t.querySelector(`[${kt}]`);if(i!==null){xi(i,e,n,r);return}r.decorate?.(e,t);let s=document.createElement("span");s.className="bre-drag-grip",s.setAttribute("role","button"),s.setAttribute("tabindex","0"),s.setAttribute("draggable","true"),s.appendChild(Ri()),xi(s,e,n,r),tl(s,e,r,o),el(r.seatDrags?t:s,e,r,o),t.insertBefore(s,t.firstChild)}function gn(e,t,n,r){if(!e.isConnected)return;Zd(t,r);for(let i of re(t)){let s=n.idOf(i);if(s===void 0)continue;let a=n.seatOf(i);a!==void 0&&nl(i,a,s,n,r)}if(r.drag!==void 0)return;let o=Bd(t,n.idOf,r.sighted.get(t));Li(t,n.order(o),n.idOf),r.sighted.set(t,Ud(t,n.idOf))}function hn(e){e.drag=void 0;for(let t of Array.from(document.querySelectorAll(`[${kt}]`)))t.remove();for(let t of Array.from(document.querySelectorAll(`[${vr}]`)))t.removeAttribute(vr),t.removeAttribute("draggable");for(let t of Array.from(document.querySelectorAll(`.${un}, .${fn}`)))t.classList.remove(un,fn);for(let t of Array.from(document.querySelectorAll(`.${Ei}`)))t.remove();for(let t of Array.from(document.querySelectorAll(`.${ki}`)))t.remove();e.line=void 0}function st(e,t){return Object.prototype.hasOwnProperty.call(e,t)}var Er="__breLedgerDocument";function Wi(){let e=globalThis;return e[Er]??(e[Er]=`${Date.now().toString(36)}-${Math.random().toString(36).slice(2)}`)}var bn="bre:held-writes:v1";function Lr(){try{return typeof sessionStorage>"u"?void 0:sessionStorage}catch{return}}function ve(e){let t=Lr();if(t!==void 0)try{if(e.pending.size===0&&e.queued.size===0){t.removeItem(bn);return}let n={document:Wi(),committed:[...e.committing].filter(r=>e.queued.has(r)),pending:[...e.pending].map(([r,o])=>[r,[...o]]),queued:[...e.queued].map(([r,o])=>[r,[...o]])};t.setItem(bn,JSON.stringify(n))}catch{}}function Di(e,t){if(!Array.isArray(e))return;let n=[];for(let r of e){if(!Array.isArray(r)||r.length!==2)return;let[o,i]=r;if(typeof o!="string"||!Array.isArray(i))return;let s=[];for(let a of i){if(!Array.isArray(a)||a.length!==2)return;let[d,u]=a;if(typeof d!="string"||!O(u)||t!==void 0&&!t(u))return;s.push([d,u])}n.push([o,s])}return n}function rl(e){let t=Lr();if(t!==void 0)try{let n=t.getItem(bn);if(n===null)return;let r=JSON.parse(n);if(r.document!==Wi())return;let o=Di(r.pending),i=Di(r.queued,pl);if(o===void 0||i===void 0)return;let s=Array.isArray(r.committed)?r.committed.filter(a=>typeof a=="string"):[];for(let[a,d]of o)e.pending.set(a,new Map(d));for(let[a,d]of i)s.includes(a)&&(e.queued.set(a,new Map(d)),e.committing.add(a))}catch{}}function Bi(e,t){(async()=>{try{await Mr(t,e),await Sr(t,e)}catch(n){console.error(`[bre] teardown flush failed: ${n instanceof Error?n.message:String(n)}`)}})()}function qi(e,t){(async()=>{try{await Mr(t,e,!0),await Sr(t,e,!0)}catch(n){console.error(`[bre] unload flush failed: ${n instanceof Error?n.message:String(n)}`)}finally{try{Lr()?.removeItem(bn)}catch{}}})()}function Ui(){let e={mounted:new Map,describePromise:void 0,pending:new Map,missedScans:new Map,queued:new Map,editing:void 0,flushing:!1,flushFailures:0,nextFlushAt:0,committing:new Set,adapting:new Set,signalsUnavailable:!1,submitWired:new WeakSet,cancelWired:new WeakSet,disclosureWired:new WeakSet,editWired:new WeakSet};return rl(e),e}async function ol(e,t){if(!t.flushing){t.flushing=!0;try{let n=await Mr(e,t),r=await Sr(e,t);n||r?Ci(e,t):(t.flushFailures=0,t.nextFlushAt=0)}catch(n){Ci(e,t),console.error(`[bre] idle flush failed: ${n instanceof Error?n.message:String(n)}`)}finally{t.flushing=!1}try{e.onIdle?.()}catch(n){console.error(`[bre] idle hook failed: ${n instanceof Error?n.message:String(n)}`)}}}function Ci(e,t){t.flushFailures+=1;let n=Math.min(2**t.flushFailures*500,3e4);t.nextFlushAt=Date.now()+n,e.onBackoff?.(n)}function il(e){return e.queued.size>0||e.pending.size>0}function yn(e,t,n,r,o,i,s){try{let a=e.pending.get(t);if(r===void 0){if(a===void 0)return;a.delete(n),a.size===0&&e.pending.delete(t);return}e.pending.set(t,(a??new Map).set(n,{efforts:r,...o===void 0?{}:{compat:o},...i===void 0?{}:{input:i},...s===void 0?{}:{defaultEffort:s}}))}finally{ve(e)}}function ji(e,t,n,r){e.queued.set(t,(e.queued.get(t)??new Map).set(n,r)),ve(e)}function sl(e,t,n){let r=e.pending.get(t);r!==void 0&&(r.delete(n),r.size===0&&e.pending.delete(t),ve(e))}function al(e,t,n){let r=e.queued.get(t);r!==void 0&&(r.delete(n),r.size===0&&e.queued.delete(t),ve(e))}function dl(e,t,n){sl(e,t,n),al(e,t,n)}function ll(e,t){e.queued.delete(t),e.pending.delete(t),e.missedScans.delete(t),e.committing.delete(t),ve(e)}function ul(e,t,n){if(t===void 0)return null;let i=t[de]!==!0&&t.reasoningEfforts!==void 0&&typeof t[Ze]=="number"||t[de]!==!0&&n?.efforts!==void 0&&fl(t.reasoningEfforts,n.efforts)?!1:t.reasoningEfforts!==void 0||t[de]===!0||e.efforts==="keep",a=t[Ae]!==!0&&n?.input!==void 0&&cl(t.input,n.input)?!1:Array.isArray(t.input)&&t.input.length>0||t[Ae]===!0,d=i?"keep":e.efforts,u=a?void 0:e.input,p=e.defaultEffort;return d==="keep"&&u===void 0&&p===void 0?null:{efforts:d,...e.compat===void 0?{}:{compat:e.compat},...u===void 0?{}:{input:u},...p===void 0?{}:{defaultEffort:p}}}function fl(e,t){if(e===t)return!0;if(!O(e)||!O(t))return!1;let n=Object.keys(t);if(Object.keys(e).length!==n.length)return!1;let r=t;return n.every(o=>e[o]===r[o])}function cl(e,t){if(!Array.isArray(e)||e.length!==t.length)return!1;let n=new Set(t);return e.every(r=>typeof r=="string"&&n.has(r))}function pl(e){if(!O(e))return!1;let t=e.efforts;if(t!==!1&&t!=="keep"&&!O(t))return!1;let n=e.clearCompatKeys;return n===void 0||Array.isArray(n)&&n.every(r=>typeof r=="string")}async function ml(e,t,n,r,o=!1){let i=await e.describeNamespace(),s=we(i.namespace),a=[];for(let[m,g]of[...r]){let l=Qt(s,n).find(h=>h.id===m);if(l===void 0||t.pending.get(n)?.get(m)!==g)continue;let c=Ue(s,n),f=typeof l.name=="string"?l.name:void 0,w=be(m,f===void 0?c:{...c,displayName:f}),y=ul(g,l,{...w.efforts===void 0?{}:{efforts:w.efforts},...w.input===void 0?{}:{input:w.input}});if(y===null){yn(t,n,m,void 0);continue}a.push({modelId:m,efforts:y.efforts,...y.compat===void 0?{}:{compat:y.compat},...y.input===void 0?{}:{input:y.input},...y.defaultEffort===void 0?{}:{defaultEffort:y.defaultEffort}})}if(a.length===0)return!1;let d=!1,u=await vt(e.api,n,a,()=>d?e.describeNamespace():(d=!0,Promise.resolve(i)),o?void 0:es),p=!1;return a.forEach((m,g)=>{let l=u[g];if(l?.aborted!==!0){if(l?.ok===!0||l?.modelNotFound===!0){yn(t,n,m.modelId,void 0);return}p=!0,console.error(`[bre] staged flush write failed for "${n}"/"${m.modelId}": ${l?.error??"unknown"}`)}}),p}async function Mr(e,t,n=!1){for(let s of[...t.committing])t.queued.has(s)||t.committing.delete(s);if(![...t.queued.keys()].some(s=>t.committing.has(s)||t.signalsUnavailable)||(await e.describeNamespace()).writable!==!0)return ve(t),!1;let i=!1;for(let[s,a]of[...t.queued]){if(!t.committing.has(s)&&!t.signalsUnavailable)continue;let u=[...a].map(([g,l])=>({modelId:g,efforts:l.efforts,...l.compat===void 0?{}:{compat:l.compat},...l.input===void 0?{}:{input:l.input},...l.clearCompatKeys===void 0?{}:{clearCompatKeys:l.clearCompatKeys},...l.defaultEffort===void 0?{}:{defaultEffort:l.defaultEffort}})),p=await vt(e.api,s,u,void 0,n?void 0:es),m=!1;u.forEach((g,l)=>{let c=p[l];if(c?.aborted===!0){m=!0;return}if(c?.ok===!0||c?.modelNotFound===!0){a.delete(g.modelId);return}console.error(`[bre] held write failed for "${s}"/"${g.modelId}": ${c?.error??"unknown"}`)}),a.size===0?(t.queued.delete(s),t.committing.delete(s)):m||(i=!0)}return ve(t),i}async function Sr(e,t,n=!1){if(t.pending.size===0)return!1;let r=await e.describeNamespace();if(r.writable!==!0)return!1;let o=we(r.namespace),i=!1;for(let[s,a]of[...t.pending]){if(a.size===0){t.pending.delete(s);continue}st(o,s)&&await ml(e,t,s,a,n)&&(i=!0)}return ve(t),i}function Ee(e,t){for(let n of t){let r=Array.from(e.querySelectorAll("input[aria-label], select[aria-label]")).find(o=>(o.getAttribute("aria-label")??"").startsWith(n));if(r!==void 0&&r.value.trim().length>0)return r.value.trim()}return""}function wn(e){return e.closest('[class*="editor"], [class*="rowCard"], [class*="addCard"]')??void 0}function gl(e){let t=e.closest('[class*="modelEntry"]');if(t===null){let r=wn(e);if(r===void 0)return;let o=Array.from(r.querySelectorAll('[class*="modelAdvanced"]'));return o.find(i=>i.offsetParent!==null)??o[0]}let n=Array.from(t.querySelectorAll('[class*="modelAdvanced"]'));return n.find(r=>r.offsetParent!==null)??n[0]}function hl(e){return e.querySelector('[class*="modelInputTypes"]')!==null}function bl(e,t,n,r,o){!e.isConnected||Rr(e)===void 0||Array.from(e.querySelectorAll("button[aria-label]")).some(s=>o.capacity.some(a=>(s.getAttribute("aria-label")??"").startsWith(a)))||ln(e,yl(e,we(r.namespace),o),{t:t.t,onRequest:s=>zi(n,t,s)})}function yl(e,t,n){let r=[];for(let o of yr(e)){let i=wn(o);if(i===void 0)continue;let s=ke(i,t,n);s===void 0||s.staged||r.push({catalogue:o,route:s.route})}return r}function wl(e,t,n){let r=[],o=new Set;for(let i of e){if(o.has(i.card))continue;o.add(i.card);let s=ke(i.card,t,n);if(s===void 0)continue;let[a]=yr(i.card);a!==void 0&&r.push({catalogue:a,route:s.route})}return r}function vl(e,t,n,r){let o=[],i=new Set;for(let s of e)s.modelId.length===0||i.has(s.modelId)||ke(s.card,n,r)?.route===t&&(i.add(s.modelId),o.push({id:s.modelId,name:Ee(s.row,r.modelName)}));return o}async function zi(e,t,n,r=[]){if(n.length===0)return{held:0,unsuggested:0,blocked:"unknown-route"};if(e.adapting.has(n))return{held:0,unsuggested:0,blocked:"busy"};e.adapting.add(n);let o=0,i=0;try{let s,a=()=>s??(s=t.describeNamespace()),d=await a(),u=we(d.namespace);if(d.writable!==!0)return{held:0,unsuggested:0,blocked:"unwritable"};if(!st(u,n))return{held:0,unsuggested:0,blocked:"unknown-route"};let p=Qt(u,n),m=new Set;for(let y of p){let h=typeof y.id=="string"?y.id:"";h.length>0&&m.add(h)}let g=p.slice();for(let y of r)y.id.length===0||m.has(y.id)||g.push({id:y.id,name:y.name});if(g.length===0)return{held:0,unsuggested:0,blocked:"no-models"};let l=u[n]??{},c=typeof l.api=="string"?l.api:void 0,f=new Set;for(let y of e.mounted.values())y.props.route===n&&y.props.efforts!==void 0&&f.add(y.props.modelId);let w=sn(t.api,a,void 0,(y,h,v)=>{ji(e,y,h,v)});for(let y of g){let h=typeof y.id=="string"?y.id:"";if(h.length===0||f.has(h))continue;let v=en(g,h);if(v!==void 0||y[de]===!0)continue;let M=tn(g,h),x=nn(g,h),L=on(g,h)??"",R=await w.suggest(n,h,rn(g,h));if(!R.ok){i+=1;continue}let C=R.suggestion,j=C.efforts!==!1,I=C.input===void 0?Ge(M):Ge(C.input),D=C.defaultEffort??L,A=D===L?void 0:D===""?null:D;w.commit(n,h,hr({efforts:gr(j,it(ze(C.efforts)),v),input:an(I,M)?void 0:mr(I),defaultEffort:A,manualCompat:ci(x),appliedCompat:C.compat,routeApi:c,initialCompat:x})),o+=1}return{held:o,unsuggested:i}}catch(s){return console.warn("[bre] provider-wide adapt failed:",s),{held:o,unsuggested:i,failed:s instanceof Error?s.message:String(s)}}finally{e.adapting.delete(n)}}function xl(e){return e.querySelector(`[data-plugin="${Q}"]`)!==null}function kl(e,t){return e.route===t.route&&e.routeDisplayName===t.routeDisplayName&&e.routeApi===t.routeApi&&e.routeBaseURL===t.routeBaseURL&&e.modelId===t.modelId&&e.modelName===t.modelName&&e.index===t.index&&e.readOnly===t.readOnly&&e.defaultEffort===t.defaultEffort&&e.staged===t.staged&&e.officialInputTypes===t.officialInputTypes&&e.effortsUnset===t.effortsUnset&&xt(e.efforts,t.efforts)&&Tl(e.input,t.input)&&El(e.compat,t.compat)}function El(e,t){return e===t?!0:e===void 0||t===void 0?!1:JSON.stringify({...e},Object.keys({...e,...t}).sort())===JSON.stringify({...t},Object.keys({...e,...t}).sort())}function Tl(e,t){if(e===t)return!0;if(e===void 0||t===void 0)return!1;let n=new Set(e);return e.length===t.length&&t.every(r=>n.has(r))}function Ll(e,t){return Array.from(e.querySelectorAll("input[aria-label], select[aria-label]")).some(n=>t.some(r=>(n.getAttribute("aria-label")??"").startsWith(r)))}function ke(e,t,n){let r=e.querySelector('[class*="editorRoute"]')?.textContent?.trim();if(r!==void 0&&r.length>0&&st(t,r))return{route:r,staged:!1};if(Ll(e,n.routeId)){let s=Ee(e,n.routeId);return s.length>0&&!st(t,s)?{route:s,staged:!0}:void 0}let o=e.querySelector('[class*="editorTitle"], [class*="rowName"]')?.textContent?.trim();if(o===void 0||o.length===0)return;let i=Object.entries(t).find(([,s])=>s.displayName===o);if(i!==void 0)return{route:i[0],staged:!1};if(st(t,o))return{route:o,staged:!1}}function Ml(e,t){let n=e.querySelector('[class*="editorActions"]');if(n===null)return;let r=Array.from(n.querySelectorAll("button"));if(r.length<2)return;let o=(m,g)=>(m.textContent??"").trim()===g,i=n.querySelector('[class*="primaryButton"]'),s=n.querySelector('[class*="secondaryButton"]');if(i!==null&&s!==null)return{submit:i,cancel:s};let a=[...r].reverse().find(m=>t.apply.some(g=>o(m,g))),d=[...r].reverse().find(m=>t.cancel.some(g=>o(m,g)));if(a!==void 0&&d!==void 0)return{submit:a,cancel:d};let u=r[r.length-1],p=r[r.length-2];if(!(u===void 0||p===void 0))return{submit:u,cancel:p}}function vn(e,t,n){t.has(e)||(t.add(e),e.addEventListener("click",n,{capture:!0}))}var Tr=new WeakMap,Ar=420,Sl=320,Al=160,Pi=2e3,Rl=150,Gi=new Set(["PageUp","PageDown","Home","End","ArrowUp","ArrowDown"," "]);function kn(e,t){let n=Ye(e);if(n===void 0||!e.isConnected)return;let r=performance.now(),o=Tr.get(n);if(o!==void 0){o.deadline=Math.min(Math.max(o.deadline,r+t),o.startedAt+Pi);return}let i=e.getBoundingClientRect(),s=i.top,a=i.height,d=n.scrollTop;n.style.overflowAnchor="none";let u={deadline:r+t,startedAt:r,frame:void 0,release:()=>{}},p=()=>{u.frame!==void 0&&(window.cancelAnimationFrame(u.frame),u.frame=void 0),n.style.overflowAnchor="",Tr.delete(n),document.removeEventListener("wheel",m,!0),document.removeEventListener("touchstart",m,!0),document.removeEventListener("pointerdown",m,!0),document.removeEventListener("keydown",g,!0)};function m(){p()}function g(f){Gi.has(f.key)&&p()}u.release=p,Tr.set(n,u),document.addEventListener("wheel",m,{capture:!0,passive:!0}),document.addEventListener("touchstart",m,{capture:!0,passive:!0}),document.addEventListener("pointerdown",m,{capture:!0}),document.addEventListener("keydown",g,{capture:!0});let l=0,c=()=>{if(u.frame=void 0,l+=1,!e.isConnected||l>=Rl){p();return}let f=e.getBoundingClientRect(),w=Math.abs(f.height-a)>.5;if(!w&&n.scrollTop!==d){p();return}let y=f.top-s;y!==0&&(n.scrollTop+=y,d=n.scrollTop);let h=performance.now();if(w&&(a=f.height,u.deadline=Math.min(Math.max(u.deadline,h+Al),u.startedAt+Pi)),h>=u.deadline){p();return}u.frame=window.requestAnimationFrame(c)};u.frame=window.requestAnimationFrame(c)}var $i='[class*="modelList"]',Hl="bre-list-slack",Ol=3e3,En,at=new WeakMap,Je=new Set;function Vi(e){if(!(e instanceof Element))return;let t=e.closest($i);if(t===null)return;let n=Ye(t);n===void 0||n===document.scrollingElement||!n.contains(t)||(En={host:n,top:n.scrollTop,at:performance.now()})}function Te(){En=void 0}function Yi(e){Vi(e.target)}function Ji(e){if(Gi.has(e.key)){Te();return}Vi(e.target)}var Tt=0;function Xi(){Tt+=1,!(Tt>1)&&(document.addEventListener("click",Yi,!0),document.addEventListener("keydown",Ji,!0),document.addEventListener("focusin",Te,!0),document.addEventListener("pointerdown",Te,!0),document.addEventListener("wheel",Te,{capture:!0,passive:!0}),document.addEventListener("touchstart",Te,{capture:!0,passive:!0}))}function xn(e){let t=at.get(e);t!==void 0&&(at.delete(e),Je.delete(t.spacer),e.removeEventListener("scroll",t.onScroll),t.spacer.remove())}function _l(){if(Je.size!==0)for(let e of Array.from(Je)){let t=e.parentElement,n=t===null?void 0:at.get(t);if(t===null||n===void 0){Je.delete(e),e.remove();continue}t.scrollTop<=t.scrollHeight-t.clientHeight-n.height&&xn(t)}}function Fi(e,t){return e.scrollTop>e.scrollHeight-e.clientHeight-t}function Nl(e=performance.now()){let t=En;if(t===void 0||e-t.at>Ol)return;let n=t.host;if(!n.isConnected)return;let r=at.get(n),o=r===void 0?0:r.height,i=n.scrollHeight-n.clientHeight-o,s=t.top-i;if(s<=0){r!==void 0&&!Fi(n,r.height)&&xn(n);return}let a=r;if(a===void 0){let d=document.createElement("div");d.className=Hl,d.dataset.plugin=Q,d.setAttribute("aria-hidden","true"),d.style.height="0px",n.appendChild(d);let u=()=>{let p=at.get(n);p!==void 0&&!Fi(n,p.height)&&xn(n)};a={spacer:d,height:0,onScroll:u},at.set(n,a),Je.add(d),n.addEventListener("scroll",u,{passive:!0})}a.height!==s&&(a.height=s,a.spacer.style.height=`${s}px`),n.scrollTop!==t.top&&(n.scrollTop=t.top)}function Qi(){if(Tt=Math.max(0,Tt-1),!(Tt>0)){document.removeEventListener("click",Yi,!0),document.removeEventListener("keydown",Ji,!0),document.removeEventListener("focusin",Te,!0),document.removeEventListener("pointerdown",Te,!0),document.removeEventListener("wheel",Te,!0),document.removeEventListener("touchstart",Te,!0),En=void 0;for(let e of Array.from(Je)){let t=e.parentElement;if(t===null){Je.delete(e),e.remove();continue}xn(t)}}}function Zi(e,t=Ar){Nl(),_l();let n=new Set;for(let r of Array.from(e.querySelectorAll($i))){let o=r.closest('[class*="rowCard"], [class*="setupCard"], [class*="addCard"]');o===null||n.has(o)||(n.add(o),kn(o,t))}}function Il(e,t){vn(e,t,()=>{let n=e.closest('[class*="modelEntry"]')??e.closest('[class*="rowCard"]');n!==null&&kn(e.closest('[class*="rowCard"]')??n,Ar)})}var Ki="{provider}";function Dl(e,t){let n=t.editProvider.map(o=>{let i=o.indexOf(Ki);return i<0?void 0:{prefix:o.slice(0,i),suffix:o.slice(i+Ki.length)}}).filter(o=>o!==void 0);if(n.length===0)return[];let r=[];for(let o of Array.from(e.querySelectorAll("button[aria-label]"))){let i=o.getAttribute("aria-label")??"";n.some(s=>i.length>s.prefix.length+s.suffix.length&&i.startsWith(s.prefix)&&i.endsWith(s.suffix))&&o.closest("[data-plugin]")===null&&r.push(o)}return r}function Cl(e,t){vn(e,t,()=>{let n=e.closest('[class*="rowCard"], [class*="setupCard"], [class*="addCard"]');n!==null&&kn(n,Ar)})}function Rr(e){return e.querySelector('[class*="editorActions"]')??e.querySelector('[class*="modelEntry"]')??void 0}function es(){return Rr(le())!==void 0}function ts(e,t,n){if(!e.isConnected)return;let r=t.labels(),o=Rr(e)!==void 0;for(let a of Array.from(e.querySelectorAll('[class*="rowCard"], [class*="setupCard"]')))for(let d of Dl(a,r))Cl(d,n.editWired);let i=Array.from(e.querySelectorAll("button[aria-label]")).some(a=>r.capacity.some(d=>(a.getAttribute("aria-label")??"").startsWith(d)));if(!o){if(ln(e,[],{t:t.t}),n.mounted.size>0){for(let[,d]of n.mounted)d.editor.unmount();n.mounted.clear()}let a=n.editing;n.editing=!1,(a!==!1||il(n)&&Date.now()>=n.nextFlushAt)&&ol(t,n).catch(d=>{console.error(`[bre] idle pass failed: ${d instanceof Error?d.message:String(d)}`)});return}if(n.editing=!0,!i){for(let[,d]of n.mounted)d.editor.unmount();n.mounted.clear(),n.describePromise??(n.describePromise=t.describeNamespace());let a=r;n.describePromise.then(d=>{bl(e,t,n,d,a)}).catch(d=>{console.error(`[bre] empty-catalog seat failed: ${d instanceof Error?d.message:String(d)}`)});return}for(let a of r.capacity)for(let d of Array.from(e.querySelectorAll("button[aria-label]")))(d.getAttribute("aria-label")??"").startsWith(a)&&Il(d,n.disclosureWired);n.describePromise??(n.describePromise=t.describeNamespace());let s=a=>{if(!e.isConnected)return;let d=a.namespace,u=we(d),p=[];for(let g of r.capacity){let l=Array.from(e.querySelectorAll("button[aria-label]")).filter(c=>(c.getAttribute("aria-label")??"").startsWith(g));for(let c of l){let f=wn(c);if(f===void 0)continue;let w=c.closest('[class*="modelEntry"]')??f,y=Ee(w,r.modelId);y.length!==0&&p.push({container:gl(c),row:w,modelId:y,card:f})}}ln(e,wl(p,u,r),{t:t.t,onRequest:g=>zi(n,t,g,vl(p,g,u,r))});for(let[g,l]of n.mounted)p.some(c=>c.container===g)||(l.editor.unmount(),n.mounted.delete(g));if(n.pending.size>0){let g=new Map;for(let c of p){let f=ke(c.card,u,r);if(f===void 0)continue;let w=g.get(f.route);w===void 0&&g.set(f.route,w=new Set),w.add(c.modelId)}let l=new Map;for(let[c,f]of n.pending){if(!st(u,c))continue;let w=g.get(c),y=[...f.keys()].filter(h=>!w?.has(h));y.length>0&&l.set(c,new Set(y))}for(let[c,f]of l){let w=n.missedScans.get(c);if(w!==void 0)for(let y of f)w.has(y)&&(yn(n,c,y,void 0),w.delete(y))}n.missedScans=l}let m=new Set(p.map(g=>g.card));for(let g of m){let l=ke(g,u,r);if(l===void 0)continue;let c=l.route,f=Ml(g,r);f===void 0?n.signalsUnavailable=!0:(n.signalsUnavailable=!1,vn(f.submit,n.submitWired,()=>{let w=ke(g,u,r)?.route??c;n.committing.add(w),ve(n)}),vn(f.cancel,n.cancelWired,()=>{let w=ke(g,u,r)?.route??c;ll(n,w)}))}p.forEach((g,l)=>{let c=g.container;if(c===void 0)return;let f=ke(g.card,u,r);if(f===void 0)return;let{route:w,staged:y}=f,h=u[w]??{},v=Qt(u,w),M=new Set(v.map(N=>N.id)),x=y||!M.has(g.modelId),L=x?n.pending.get(w)?.get(g.modelId)?.efforts:void 0,R=x?L==="keep"?void 0:L:en(v,g.modelId),C=!x&&v.some(N=>N.id===g.modelId&&N[de]===!0),j=x?n.pending.get(w)?.get(g.modelId)?.input:tn(v,g.modelId),I=x?n.pending.get(w)?.get(g.modelId)?.compat:nn(v,g.modelId),D=x?n.pending.get(w)?.get(g.modelId)?.defaultEffort??void 0:on(v,g.modelId),A=x?Ee(g.row,r.modelName):"",P=x?A.length>0?A:void 0:rn(v,g.modelId),q=y?Ee(g.card,r.apiProtocol):"",F=y?Ee(g.card,r.baseUrl):"",z=y&&q.length>0?q:typeof h.api=="string"?h.api:void 0,Y=y&&F.length>0?F:typeof h.baseURL=="string"?h.baseURL:void 0,U={route:w,routeDisplayName:y?w:typeof h.displayName=="string"?h.displayName:w,...z===void 0?{}:{routeApi:z},...Y===void 0?{}:{routeBaseURL:Y},modelId:g.modelId,...P===void 0?{}:{modelName:P},...R===void 0?{}:{efforts:R},...C?{effortsUnset:C}:{},...j===void 0?{}:{input:j},...I===void 0?{}:{compat:I},...D===void 0?{}:{defaultEffort:D},index:l,staged:x,officialInputTypes:hl(c),api:sn(t.api,void 0,(N,te,ie,Pe,Qe,Me)=>{yn(n,N,te,ie,Pe,Qe,Me)},(N,te,ie)=>{ji(n,N,te,ie)},N=>{dl(n,N,g.modelId)},()=>(ke(g.card,u,r)?.staged??y)||!M.has(g.modelId)),readOnly:a.writable!==!0,t:t.t},S=n.mounted.get(c);if(S!==void 0){kl(S.props,U)||(S.props=U,S.editor.render(U));return}if(xl(c))return;kn(wn(c)??g.card,Sl);let K=t.mount(c,U);n.mounted.set(c,{editor:K,props:U})})};n.describePromise.then(s,()=>{n.describePromise=void 0})}function $(e,t,n){e.getAttribute(t)!==n&&e.setAttribute(t,n)}function Lt(e,t){e!==void 0&&e.hidden!==t&&(e.hidden=t)}function _e(e,t,n){e.classList.contains(t)!==n&&(n?e.classList.add(t):e.classList.remove(t))}function Tn(e,t){e!==void 0&&e.textContent!==t&&(e.textContent=t)}var Hr=require("react");var Z=require("react");function ns(e){if(typeof e!="string")return;let t="";for(let n of e){let r=n.codePointAt(0)??0;r<32||r===127||(t+=n)}if(t=t.trim(),t.length!==0)return t.slice(0,40)}function Ln(e){return typeof e=="string"&&/^[\x21-\x7E]+$/.test(e)}function Pl(e){for(let t of["error","message"]){let n=e[t];if(typeof n=="string"&&n.length>0)return n}}function Fl(e){if(!O(e))return;let t=e.ref;if(typeof t!="string"||t.length===0)return;let n=e.alias,r=e.configured,o=e.masked;return{ref:t,...typeof n=="string"&&n.length>0?{alias:n}:{},enabled:e.enabled===!0,configured:typeof r=="boolean"?r:null,...typeof o=="string"&&o.length>0?{masked:o}:{}}}function Kl(e){let t=e.entries;if(!Array.isArray(t))return;let n=[];for(let i of t){let s=Fl(i);s!==void 0&&n.push(s)}let r=e.enabledRef,o=e.route;return{ok:!0,route:typeof o=="string"?o:"",enabledRef:typeof r=="string"&&r.length>0?r:null,entries:n}}async function Wl(e){let t;try{t=await e.json()}catch{t=void 0}if(!O(t))return{ok:!1};if(t.ok===!0){let r=Kl(t);if(r!==void 0)return r}let n=Pl(t);return n===void 0?{ok:!1}:{ok:!1,error:n}}async function dt(e,t){let n=`${eo}?route=${encodeURIComponent(e)}`;try{let r=await fetch(n,t===void 0?{method:"GET",cache:"no-store",credentials:"same-origin"}:{method:"POST",cache:"no-store",credentials:"same-origin",headers:{"content-type":"application/json"},body:JSON.stringify(t)});return await Wl(r)}catch{return{ok:!1}}}var rs={list:e=>dt(e),add:(e,t,n)=>dt(e,{op:"add",value:t,...n===void 0?{}:{alias:n}}),enable:(e,t)=>dt(e,{op:"enable",ref:t}),rename:(e,t,n)=>dt(e,{op:"rename",ref:t,...n===void 0?{}:{alias:n}}),remove:(e,t)=>dt(e,{op:"remove",ref:t}),replace:(e,t,n)=>dt(e,{op:"value",ref:t,value:n}),async reveal(e,t){try{let n=await fetch(`${Kt}?route=${encodeURIComponent(e)}&ref=${encodeURIComponent(t)}`,{method:"GET",cache:"no-store",credentials:"same-origin"});if(!n.ok)return;let r=await n.json();if(!O(r)||r.ok!==!0)return;let o=r.key;return typeof o=="string"&&o.length>0?o:void 0}catch{return}}};var H=require("react/jsx-runtime"),Bl="M3.9 8.35 6.6 11.05 12.1 5.5",ql=["M8 3.9v8.2","M3.9 8h8.2"];function os({paths:e}){return(0,H.jsx)("svg",{viewBox:"0 0 16 16",width:16,height:16,fill:"none",stroke:"currentColor",strokeWidth:1.5,strokeLinecap:"round",strokeLinejoin:"round","aria-hidden":"true",focusable:"false",children:e.map(t=>(0,H.jsx)("path",{d:t},t))})}function Ul(e,t){return e.masked!==void 0?e.masked:e.configured===!1?t("keysMissing"):"\u2022\u2022\u2022\u2022\u2022\u2022\u2022\u2022"}function jl(e){return e.alias??e.masked??e.ref}function is(e){let{route:t,t:n}=e,r=e.client??rs,o=(0,Z.useId)(),[i,s]=(0,Z.useState)(void 0),[a,d]=(0,Z.useState)(null),[u,p]=(0,Z.useState)(void 0),[m,g]=(0,Z.useState)(!1),[l,c]=(0,Z.useState)(void 0),[f,w]=(0,Z.useState)(""),[y,h]=(0,Z.useState)(""),[v,M]=(0,Z.useState)(void 0),x=(0,Z.useCallback)((A,P)=>{if(!A.ok){p({kind:"error",text:A.error??n("keysUnreachable")});return}s(A.entries),d(A.enabledRef),p(P===void 0?void 0:{kind:"status",text:P})},[n]);(0,Z.useEffect)(()=>{let A=!0;return(async()=>{let P=await r.list(t);A&&x(P,void 0)})(),()=>{A=!1}},[x,r,t]);let L=(0,Z.useCallback)(async(A,P)=>{g(!0),M(void 0),c(void 0);try{x(await A(),P)}finally{g(!1)}},[x]),R=()=>{c(void 0),w(""),h("")},C=(A,P)=>{c({kind:A,ref:P.ref}),w(A==="alias"?P.alias??"":""),h(""),M(void 0)},j=()=>{if(m||l===void 0)return;let A=l.kind,P=l.ref;if(A!=="alias"&&!Ln(y))return;let q=ns(f);g(!0),(async()=>{try{if(A==="add"){let z=await r.add(t,y,q);x(z,n("keysAdded")),z.ok&&R();return}if(P===void 0)return;let F=A==="alias"?await r.rename(t,P,q):await r.replace(t,P,y);x(F,n(A==="alias"?"keysRenamed":"keysReplaced")),F.ok&&R()}finally{g(!1)}})()},I=()=>{if(l===void 0)return null;let A=l.kind,P=A!=="alias",q=P&&y.length>0&&!Ln(y);return(0,H.jsxs)("div",{className:"bre-keys-form",children:[(0,H.jsxs)("div",{className:"bre-keys-form-fields",children:[A==="value"?null:(0,H.jsx)("input",{className:"bre-text-input bre-keys-name",type:"text",value:f,placeholder:n("keysAliasPlaceholder"),"aria-label":n("keysAlias"),disabled:m,autoFocus:A==="alias",onChange:F=>w(F.target.value)}),P?(0,H.jsx)("input",{className:"bre-text-input bre-keys-secret",type:"password",autoComplete:"new-password",spellCheck:!1,value:y,placeholder:n(A==="add"?"keysValuePlaceholder":"keysNewValuePlaceholder"),"aria-label":n("keysValue"),"aria-invalid":q,disabled:m,autoFocus:!0,onChange:F=>h(F.target.value)}):null]}),q?(0,H.jsx)("p",{className:"bre-effort-message bre-error",role:"alert",children:n("keysAddIllegal")}):null,(0,H.jsxs)("div",{className:"bre-keys-form-actions",children:[(0,H.jsx)("button",{type:"button",className:"bre-link-button",disabled:m,onClick:R,children:n("keysCancel")}),(0,H.jsx)("button",{type:"button",className:"bre-primary-button",disabled:m||P&&!Ln(y),onClick:j,children:n(A==="add"?"keysAddConfirm":"keysSave")})]})]})},D=()=>l?.kind==="add"?(0,H.jsx)("li",{className:"bre-keys-form-row",children:I()}):(0,H.jsx)("li",{className:"bre-keys-add-row",children:(0,H.jsxs)("button",{type:"button",className:"bre-keys-add",disabled:m,onClick:()=>{c({kind:"add"}),w(""),h(""),M(void 0)},children:[(0,H.jsx)("span",{className:"bre-keys-add-mark","aria-hidden":"true",children:(0,H.jsx)(os,{paths:ql})}),n("keysAdd")]})});return i===void 0?u===void 0?(0,H.jsx)("div",{className:"bre-keys"}):(0,H.jsxs)("div",{className:"bre-keys",children:[(0,H.jsx)("p",{className:"bre-effort-message bre-"+u.kind,role:u.kind==="error"?"alert":"status",children:u.text}),(0,H.jsx)("ul",{className:"bre-keys-list",children:D()})]}):(0,H.jsxs)("div",{className:"bre-keys",children:[(0,H.jsxs)("ul",{className:"bre-keys-list",children:[i.map(A=>{let P=jl(A);return(0,H.jsxs)(Z.Fragment,{children:[(0,H.jsxs)("li",{className:"bre-keys-row","data-state":A.configured===!1?"missing":"ready",children:[A.alias===void 0?null:(0,H.jsx)("span",{className:"bre-keys-alias",children:A.alias}),(0,H.jsx)("span",{className:A.alias===void 0?"bre-keys-mask bre-keys-mask-plain":"bre-keys-mask",children:Ul(A,n)}),(0,H.jsx)("span",{className:"bre-keys-actions",children:v===A.ref?(0,H.jsxs)(H.Fragment,{children:[(0,H.jsx)("button",{type:"button",className:"bre-link-button bre-keys-danger",disabled:m,onClick:()=>{L(()=>r.remove(t,A.ref),n("keysRemoved"))},children:n("keysConfirmRemove")}),(0,H.jsx)("button",{type:"button",className:"bre-link-button",disabled:m,onClick:()=>M(void 0),children:n("keysCancel")})]}):(0,H.jsxs)(H.Fragment,{children:[(0,H.jsx)("button",{type:"button",className:"bre-link-button",disabled:m,onClick:()=>{M(A.ref),c(void 0)},children:n("keysRemove")}),(0,H.jsx)("button",{type:"button",className:"bre-link-button",disabled:m,onClick:()=>C("alias",A),children:n("keysAlias")}),(0,H.jsx)("button",{type:"button",className:"bre-link-button",disabled:m,onClick:()=>C("value",A),children:n("keysEdit")})]})}),(0,H.jsxs)("label",{className:"bre-keys-enable",title:n("keysEnable",{name:P}),children:[(0,H.jsx)("input",{type:"radio",name:o,className:"bre-keys-enabled",checked:A.enabled,disabled:m,"aria-label":n("keysEnable",{name:P}),onChange:()=>{L(()=>r.enable(t,A.ref),n("keysEnabledNote",{name:P}))}}),(0,H.jsx)("span",{className:"bre-keys-mark","aria-hidden":"true",children:A.enabled?(0,H.jsx)(os,{paths:[Bl]}):null}),(0,H.jsx)("span",{className:"bre-keys-enable-text",children:n("keysEnabled")})]})]}),l!==void 0&&l.ref===A.ref?(0,H.jsx)("li",{className:"bre-keys-form-row",children:I()}):null]},A.ref)}),D()]}),u===void 0?null:(0,H.jsx)("p",{className:"bre-effort-message bre-"+u.kind,role:u.kind==="error"?"alert":"status",children:u.text})]})}var Sn="bre-key-managed",zl="bre-keys-host",Or="data-bre-key-host",Gl="data-bre-key-input",Mn="data-bre-region",Ne=new WeakMap;function $l(e){let t=e.querySelector(`input[${Gl}]`);if(t instanceof HTMLInputElement)return t;let n=e.querySelector('input[type="password"]');return n instanceof HTMLInputElement?n:void 0}function ss(e){let t=Ne.get(e)?.host;if(t!==void 0&&t.isConnected)return t;let n=e.nextElementSibling;return n instanceof HTMLElement&&n.hasAttribute(Or)?n:void 0}function as(e,t){let n=t.route;if(n===void 0||n.length===0||$l(e)===void 0||e.parentElement===null)return;_e(e,Sn,!0);let r=Ne.get(e),o=ss(e);o===void 0&&(r!==void 0&&ds(e,r),o=e.ownerDocument.createElement("div"),o.className=zl,e.after(o)),$(o,Or,n);let i=e.getAttribute(Mn);i===null?o.hasAttribute(Mn)&&o.removeAttribute(Mn):$(o,Mn,i);let s=()=>(0,Hr.createElement)(xe,{fallbackText:t.t("keysPanelFailed")},(0,Hr.createElement)(is,{route:n,t:t.t,client:t.client})),a=Ne.get(e);if(a!==void 0&&a.route===n){(a.t!==t.t||a.client!==t.client)&&(a.t=t.t,a.client=t.client,a.mount.root.render(s()));return}a!==void 0&&(Ne.delete(e),a.mount.root.unmount()),Ne.set(e,{route:n,host:o,mount:yt(o,s(),{sync:!0}),t:t.t,client:t.client})}function ds(e,t){Ne.delete(e),qe(t.mount)}function An(e){_e(e,Sn,!1);let t=Ne.get(e);t!==void 0&&ds(e,t),ss(e)?.remove()}function ls(){for(let e of Array.from(document.querySelectorAll(`[${Or}]`))){let t=e.previousElementSibling;t instanceof HTMLElement&&Ne.has(t)?An(t):e.remove()}}var us="http://www.w3.org/2000/svg",Vl="data-bre-icon";function Yl(e){let t=document.createElementNS(us,"path");return t.setAttribute("d",e),t}function fs(e,t){let n=document.createElementNS(us,"svg");return n.setAttribute("viewBox","0 0 16 16"),n.setAttribute("width","16"),n.setAttribute("height","16"),n.setAttribute("fill","none"),n.setAttribute("stroke","currentColor"),n.setAttribute("stroke-width","1.5"),n.setAttribute("stroke-linecap","round"),n.setAttribute("stroke-linejoin","round"),n.setAttribute("aria-hidden","true"),n.setAttribute("focusable","false"),n.setAttribute(Vl,e),n.append(...t.map(Yl)),n}var Hn="bre-key-field",gs="bre-key-eye",Rn="data-bre-key-input",hs="data-bre-eye-show",bs="data-bre-eye-hide",cs=["M1.5 8S4 3.75 8 3.75 14.5 8 14.5 8 12 12.25 8 12.25 1.5 8 1.5 8Z","M6.2 8a1.8 1.8 0 1 0 3.6 0 1.8 1.8 0 0 0-3.6 0Z"],Ir=new WeakMap;function _r(e){let t=e.querySelector(`input[${Rn}]`);if(t instanceof HTMLInputElement)return t;let n=e.querySelector('input[type="password"]');return n instanceof HTMLInputElement?n:void 0}function ys(e){for(let t of Array.from(e.children))if(t instanceof HTMLButtonElement&&t.classList.contains(gs))return t}function ws(e,t){let n=_r(e);if(n===void 0){On(e);return}Ir.set(e,t),$(n,Rn,""),_e(e,Hn,!0);let r=ys(e)??Xl(e);$(r,hs,t.t("keyRevealShow")),$(r,bs,t.t("keyRevealHide")),Nr(r,n)}function On(e){let t=ys(e);t!==void 0&&t.remove(),Ir.delete(e),_e(e,Hn,!1);let n=e.querySelector(`input[${Rn}]`);n instanceof HTMLInputElement&&(n.removeAttribute(Rn),n.type="password")}async function Jl(e){try{let t=await fetch(`${Kt}?route=${encodeURIComponent(e)}`,{method:"GET",cache:"no-store",credentials:"same-origin"});if(!t.ok)return;let n=await t.json();return n===null||typeof n!="object"||n.ok!==!0?void 0:typeof n.key=="string"&&n.key.length>0?n.key:void 0}catch{return}}function Nr(e,t){let n=t.type!=="password";$(e,"aria-pressed",n?"true":"false");let r=e.getAttribute(n?bs:hs);r!==null&&($(e,"aria-label",r),$(e,"title",r)),Lt(e,t.disabled)}function ps(e,t){let n=Object.getOwnPropertyDescriptor(HTMLInputElement.prototype,"value");n?.set===void 0?e.value=t:n.set.call(e,t),e.dispatchEvent(new Event("input",{bubbles:!0}))}function Xl(e){let t=document.createElement("button");t.type="button",t.className=gs,t.append(ms("eye"),ms("eye-off"));let n,r=async()=>{let o=_r(e),i=Ir.get(e);if(o===void 0||i===void 0)return;if(o.type!=="password"){n!==void 0&&o.value===n&&ps(o,""),n=void 0,o.type="password",Nr(t,o);return}let s=i.route;if(s!==void 0&&n===void 0&&o.value.length===0){$(t,"aria-busy","true");let a;try{a=await(i.loadKey??Jl)(s)}catch{a=void 0}if(t.hasAttribute("aria-busy")&&t.removeAttribute("aria-busy"),a===void 0){let d=i.t("keyRevealFailed");$(t,"aria-label",d),$(t,"title",d);return}_r(e)===o&&o.value.length===0&&(n=a,ps(o,a))}o.type="text",Nr(t,o)};return t.addEventListener("click",o=>{o.preventDefault(),o.stopPropagation(),r()}),e.append(t),t}function ms(e){let t=e==="eye-off"?[...cs,"M2.5 13.5 13.5 2.5"]:cs;return fs(e,t)}var Dr="bre-editor-tabs",Ql="bre-editor-tab",_n="data-bre-tab-id",At="bre-tabbed",De="data-bre-tab",vs="data-bre-provider",pe="data-bre-region",St="data-bre-editor-body",Rt="data-bre-details";var Zl=".bre-headers",Ie="provider",lt="models",ut="advanced",eu=[Ie,lt,ut],tu="none",xs=eu,ks=Dr,Es=Ql,Ts=_n,Nn='[class*="editorActions"], [class*="modelList"], [class*="modelCatalog"], [class*="modelEntry"]',nu='[class*="modelCatalog"], [class*="modelList"], [class*="modelEntry"]',Ls='[class*="rowCard"], [class*="addCard"], li';function Ms(){return{warned:new WeakSet}}function Dn(e){return e===null?null:e.closest(Ls)}function Ss(e,t){let n=Ye(e),r=e.getBoundingClientRect().top,o=n?.scrollTop??0;n!==void 0&&(n.style.overflowAnchor="none"),$(e,De,t),Hs(e),n!==void 0&&requestAnimationFrame(()=>{if(n.style.overflowAnchor="",n.scrollTop!==o)return;let i=e.getBoundingClientRect().top-r;i!==0&&(n.scrollTop+=i)})}function Cr(e,t,n){if(!e.isConnected)return;let r=new Set;for(let o of Array.from(e.querySelectorAll(Nn))){let i=o.closest(Ls);i!==null&&r.add(i)}for(let o of Array.from(e.querySelectorAll(`.${At}`)))r.has(o)||In(o);for(let o of r)try{au(o,t)}catch(i){n.warned.has(o)||(n.warned.add(o),console.warn("[bre] editor tabs: rolled a provider card back to the official layout:",i)),In(o)}}function As(){for(let e of Array.from(document.querySelectorAll(`.${At}`))){e.classList.remove(At),e.removeAttribute(De),e.removeAttribute(St);for(let t of Array.from(e.querySelectorAll(`[${pe}]`)))t.removeAttribute(pe)}for(let e of Array.from(document.querySelectorAll(`[${De}]`)))e.removeAttribute(De);for(let e of Array.from(document.querySelectorAll(`[${pe}]`)))e.removeAttribute(pe);for(let e of Array.from(document.querySelectorAll(`[${St}]`)))e.removeAttribute(St);for(let e of Array.from(document.querySelectorAll(`details[${Rt}]`)))e.removeAttribute("open"),e.removeAttribute(Rt);for(let e of Array.from(document.querySelectorAll(`.${Hn}`)))On(e);for(let e of Array.from(document.querySelectorAll(`.${Sn}`)))An(e);ls()}function ru(e){for(let n of Array.from(e.children))if(n instanceof HTMLElement&&!n.matches('[class*="editorHeader"], [class*="editorTitle"], [class*="editorActions"], [class*="editorRoute"]')&&n.matches('[class*="editor"]')&&(n.querySelector(Nn)!==null||n.querySelector("input, select")!==null))return n;let t=e.querySelector(Nn);for(;t!==null&&t.parentElement!==e;)t=t.parentElement;return t!==null&&t!==e?t:void 0}function ou(e){let t={header:void 0,models:void 0,actions:void 0,fields:[]};Rs(e,t,0);let{actions:n,fields:r,header:o,models:i}=t;if(!(n===void 0||r.length===0)&&r.some(s=>s.querySelector("input, select, textarea")!==null))return{header:o,models:i,actions:n,fields:r}}var iu=4;function Rs(e,t,n){if(!(n>iu)){for(let r of Array.from(e.children))if(r instanceof HTMLElement&&!r.matches('[class*="bre-"], [data-plugin]')){if(t.header===void 0&&r.matches('[class*="editorHeader"], [class*="editorTitle"]')){t.header=r;continue}if(r.matches('[class*="editorActions"]')){t.actions??(t.actions=r);continue}if(r.matches(nu)){t.models??(t.models=r);continue}if(r.querySelector(Nn)!==null){Rs(r,t,n+1);continue}if(r.querySelector('[class*="editorActions"]')!==null){t.actions??(t.actions=r);continue}r.querySelector("input, select, textarea")!==null&&t.fields.push(r)}}}function su(e){let n=e.querySelector(`[${vs}]`)?.getAttribute(vs);return n==null||n===""?void 0:n}function au(e,t){let n=ru(e);if(n===void 0){In(e);return}let r=ou(n);if(r===void 0){In(e);return}let o=e.querySelector(Zl),i=su(e);for(let d of r.fields)$(d,pe,Ie),ws(d,{t:t.t,route:i}),as(d,{t:t.t,route:i});r.header!==void 0&&$(r.header,pe,tu),r.models!==void 0&&$(r.models,pe,lt),$(n,St,""),o!==null&&$(o,pe,ut),lu(n);let s=new Set([Ie]);r.models!==void 0&&s.add(lt),o!==null&&s.add(ut);let a=e.getAttribute(De)??Ie;$(e,De,s.has(a)?a:Ie),_e(e,At,!0),du(e,t,s)}function du(e,t,n){let r=e.querySelector(`.${Dr}`);r!==null&&($(r,"aria-label",t.t("editorTabsLabel")),Tn(Mt(r,Ie),t.t("editorTabProvider")),Tn(Mt(r,lt),t.t("editorTabModels")),Tn(Mt(r,ut),t.t("editorTabAdvanced")),Lt(Mt(r,lt),!n.has(lt)),Lt(Mt(r,ut),!n.has(ut)),Hs(e,r))}function Hs(e,t){let n=t??e.querySelector(`.${Dr}`);if(n===null)return;let r=e.getAttribute(De)??Ie;for(let o of Array.from(n.querySelectorAll(`[${_n}]`)))$(o,"aria-selected",o.getAttribute(_n)===r?"true":"false")}function Mt(e,t){for(let n of Array.from(e.children))if(n instanceof HTMLElement&&n.getAttribute(_n)===t)return n}function In(e){e.classList.remove(At),e.removeAttribute(De),e.removeAttribute(St);for(let t of Array.from(e.querySelectorAll(`[${pe}]`)))t.getAttribute(pe)===Ie&&(On(t),An(t)),t.removeAttribute(pe);uu(e)}function lu(e){for(let t of Array.from(e.querySelectorAll("details")))t.hasAttribute("open")||($(t,Rt,"closed"),$(t,"open",""))}function uu(e){for(let t of Array.from(e.querySelectorAll(`details[${Rt}]`)))t.removeAttribute("open"),t.removeAttribute(Rt)}var Ht="data-bre-row-provider",Os="{provider}",fu=["rowCard","setupCard"];function _s(){return cn()}function Ot(e){for(let t of fu)for(let n of Array.from(e.querySelectorAll(`[class*="${t}"]`))){let r=n.parentElement;if(!(r===null||r.tagName!=="UL")&&re(r).length!==0)return r}}function _t(e){return e.querySelector('[class*="rowHead"]')??void 0}function ft(e){let t=e.querySelector('[class*="rowName"]')?.textContent?.trim();return t!==void 0&&t.length>0?t:void 0}function cu(e){let t=e.indexOf(Os);if(!(t<0))return{prefix:e.slice(0,t),suffix:e.slice(t+Os.length)}}function pu(e){let t=e.trim();if(t.length===0)return;let n=/^(.*) \(([^()]*)\)$/.exec(t);if(n!==null){let r=n[2];return r.length===0?void 0:r}return/\s/.test(t)?void 0:t}var mu='[class*="rowCard"], [class*="setupCard"], [class*="addCard"]';function gu(e){let t=e.closest(mu);for(let n=e;n!==null&&n!==t;n=n.parentElement)if(n.matches('[data-plugin], [class*="bre-"]'))return!0;return!1}function Xe(e,t){let n=e.querySelector("[data-bre-provider]")?.getAttribute("data-bre-provider");if(typeof n=="string"&&n.length>0)return n;for(let r of t.editProvider){let o=cu(r);if(o!==void 0)for(let i of Array.from(e.querySelectorAll("button[aria-label]"))){if(gu(i))continue;let s=i.getAttribute("aria-label")??"";if(s.length<=o.prefix.length+o.suffix.length||!s.startsWith(o.prefix)||!s.endsWith(o.suffix))continue;let a=pu(s.slice(o.prefix.length,s.length-o.suffix.length));if(a!==void 0)return a}}}function Pr(e){let t=e.getAttribute(Ht);return t===null||t.length===0?void 0:t}function hu(e){return Et(e,Pr)}function Ns(e,t,n){if(!e.isConnected)return;let r=Ot(e);if(r===void 0)return;let o=t.labels();for(let i of re(r)){let s=Xe(i,o);if(s===void 0){i.removeAttribute(Ht);continue}Pr(i)!==s&&i.setAttribute(Ht,s)}gn(e,r,bu(t),n)}function bu(e){return{rowOf:t=>{let n=t.closest("li");return n instanceof HTMLElement?n:void 0},idOf:Pr,labelOf:ft,order:t=>go(t),commit:t=>{po(hu(t))},seatOf:_t,seatDrags:!0,gripLabel:(t,n)=>e.t("providerReorderAria",{provider:ft(t)??n}),gripHint:()=>e.t("providerReorderHint")}}function Is(e){hn(e);let t=Array.from(document.querySelectorAll(`[${Ht}]`));mn(t);for(let n of t)n.removeAttribute(Ht)}var ct="data-bre-provider-switch",Cn="bre-row-disabled";function Cs(){return{switches:new WeakSet}}function Ps(e,t,n){if(!e.isConnected)return;let r=Ot(e);if(r===void 0)return;let o=t.labels();for(let i of Array.from(r.children)){if(!(i instanceof HTMLElement))continue;let s=Xe(i,o);if(s===void 0)continue;let a=_t(i);a!==void 0&&(yu(i,a,s,t,n),i.classList.toggle(Cn,!zt(s)))}}function Fs(){for(let e of Array.from(document.querySelectorAll(`[${ct}]`)))e.remove();for(let e of Array.from(document.querySelectorAll(`.${Cn}`)))e.classList.remove(Cn)}function yu(e,t,n,r,o){let i=t.querySelector(`[${ct}]`);if(i!==null){Ds(i,e,n,r);return}let s=document.createElement("button");s.className="bre-provider-switch",s.setAttribute("type","button"),s.setAttribute("role","switch"),s.setAttribute(ct,n),Ds(s,e,n,r),wu(s,e,o);let a=t.querySelector('[class*="rowActions"]');a===null?t.appendChild(s):a.insertBefore(s,a.firstChild)}function Ds(e,t,n,r){let o=r.t("providerToggleAria",{provider:ft(t)??n}),i=r.t("providerToggleHint"),s=zt(n)?"true":"false";e.getAttribute(ct)!==n&&e.setAttribute(ct,n),e.getAttribute("aria-checked")!==s&&e.setAttribute("aria-checked",s),e.getAttribute("aria-label")!==o&&e.setAttribute("aria-label",o),e.getAttribute("title")!==i&&e.setAttribute("title",i)}function wu(e,t,n){n.switches.has(e)||(n.switches.add(e),e.addEventListener("click",r=>{r.preventDefault(),r.stopPropagation();let o=e.getAttribute(ct);if(o===null)return;let i=!zt(o);yo(o,i),e.setAttribute("aria-checked",i?"true":"false"),t.classList.toggle(Cn,!i)}))}var Pn="data-bre-provider-delete",Ks='[class*="rowActions"]',Ws='[class*="dangerButton"]',vu="bre-provider-delete";function Bs(e,t){if(!e.isConnected)return;let n=Ot(e);if(n===void 0)return;let r=t.labels(),o=xu(n)??t.t("providerRemoveDisabled");for(let i of Array.from(n.children)){if(!(i instanceof HTMLElement))continue;let s=Xe(i,r);if(s===void 0)continue;let a=_t(i);if(a===void 0)continue;let d=a.querySelector(Ks);if(d===null)continue;let u=d.querySelector(`[${Pn}]`);if(d.querySelector(Ws)!==null){u!==null&&u.remove();continue}let p=u??ku();d.lastElementChild!==p&&d.appendChild(p),Eu(p,s,o,t.t("providerRemoveLocked",{provider:ft(i)??s}))}}function qs(){for(let e of Array.from(document.querySelectorAll(`[${Pn}]`)))e.remove()}function xu(e){let n=e.querySelector(`${Ks} ${Ws}`)?.textContent?.trim()??"";return n.length>0?n:void 0}function ku(){let e=document.createElement("button");return e.className=vu,e.setAttribute("type","button"),e.setAttribute("disabled",""),e}function Eu(e,t,n,r){e.getAttribute(Pn)!==t&&e.setAttribute(Pn,t),e.textContent!==n&&(e.textContent=n),e.getAttribute("aria-label")!==r&&e.setAttribute("aria-label",r),e.getAttribute("title")!==r&&e.setAttribute("title",r)}var Nt="data-bre-row-model",Fr="bre-model-grid";function js(){return cn()}function Tu(e){let t=[];for(let n of Array.from(e.querySelectorAll('[class*="modelList"]')))re(n).filter(o=>o.matches('[class*="modelEntry"]')).length!==0&&t.push(n);return t}function zs(e){for(let t of e){if(t.type!=="childList")continue;let n=t.target;if(n instanceof HTMLElement&&n.matches('[class*="modelList"]')&&re(n).some(r=>r.matches('[class*="modelEntry"]')))return!0;for(let r of[t.addedNodes,t.removedNodes])for(let o of Array.from(r))if(o instanceof HTMLElement&&o.matches('[class*="modelEntry"]'))return!0}return!1}function Fn(e){let t=e.getAttribute(Nt);return t===null||t.length===0?void 0:t}function Kr(e,t){let n=e.closest("li");if(n!==null)return Xe(n,t.labels())}function Us(e,t){let n=Ee(e,t.labels().modelName);return n.length>0?n:Fn(e)}function Lu(e,t){return{rowOf:n=>{let r=n.closest('[class*="modelEntry"]');return r instanceof HTMLElement?r:void 0},idOf:Fn,labelOf:n=>Us(n,t),order:n=>{let r=Kr(e,t);return r===void 0?n:So(r,n)},commit:n=>{let r=Kr(n,t);r!==void 0&&Lo(r,Et(n,Fn))},seatOf:n=>n.querySelector('[class*="modelRow"]')??void 0,seatDrags:!1,gripLabel:(n,r)=>t.t("modelReorderAria",{model:Us(n,t)??r}),gripHint:()=>t.t("modelReorderHint"),decorate:(n,r)=>{r.classList.add(Fr)}}}function Wr(e,t,n){if(!e.isConnected)return;let r=t.labels();for(let o of Tu(e))if(Kr(o,t)!==void 0){for(let i of re(o)){let s=Ee(i,r.modelId);if(s.length===0){i.removeAttribute(Nt);continue}Fn(i)!==s&&i.setAttribute(Nt,s)}gn(e,o,Lu(o,t),n)}}function Gs(e){hn(e);for(let n of Array.from(document.querySelectorAll(`.${Fr}`)))n.classList.remove(Fr);let t=Array.from(document.querySelectorAll(`[${Nt}]`));mn(t);for(let n of t)n.removeAttribute(Nt)}var Mu="settings.models",Le={capacity:["modelAdvanced","Model options","Capacities"],modelId:["modelId","Model ID"],modelName:["modelName","Display name"],routeId:["customRoute","Provider ID"],baseUrl:["baseUrl","Base URL"],apiProtocol:["customApi","API protocol"],apply:["apply","Apply"],cancel:["cancel","Cancel"],editProvider:["editProvider","Edit {provider}"]};function Vs(e){let{ctx:t,api:n,t:r,onIdle:o,refreshed:i}=e,s=()=>{let q=t.locale.bind(Mu),F=([z,...Y])=>{let U=q(z);return U===z||U.trim()===""?Y:[U,...Y]};return{capacity:F(Le.capacity),modelId:F(Le.modelId),modelName:F(Le.modelName),routeId:F(Le.routeId),baseUrl:F(Le.baseUrl),apiProtocol:F(Le.apiProtocol),apply:F(Le.apply),cancel:F(Le.cancel),editProvider:F(Le.editProvider)}},a=120,d=Ui(),u=_s(),p={t:r,labels:s},m=Cs(),g={t:r,labels:s},l={t:r,labels:s},c=js(),f={t:r,labels:s},w=Ms(),y={t:r},h,v,M,x,L=!1,R={api:n,describeNamespace:()=>ne(n),t:r,labels:s,onIdle:o,onBackoff:q=>{C(q)},mount(q,F){let z=document.createElement("div");z.className="bre-effort-slot",z.dataset.plugin=Q,q.appendChild(z);let Y=(0,$s.createRoot)(z),U=S=>{Y.render((0,Br.createElement)(xe,{fallbackText:r("renderFailed"),children:i(()=>(0,Br.createElement)(dn,S))}))};return U(F),{unmount:()=>{Y.unmount()},render:U}}};function C(q){L||v!==void 0||(v=window.setTimeout(()=>{v=void 0,j()},q))}function j(){L||h!==void 0||(h=window.setTimeout(()=>{h=void 0,x?.(),ts(le(),R,d),Cr(le(),y,w),Ns(le(),p,u),Ps(le(),g,m),Bs(le(),l),Wr(le(),f,c)},a))}let I=q=>{L||M!==void 0||(x=q,q(),Xi(),M=new MutationObserver(F=>{q(),Cr(le(),y,w),zs(F)&&(Wr(le(),f,c),Zi(le())),j()}),M.observe(document.body,{childList:!0,subtree:!0}),j())},D=()=>{L=!0,h!==void 0&&(window.clearTimeout(h),h=void 0),v!==void 0&&(window.clearTimeout(v),v=void 0),M?.disconnect(),M=void 0};return{state:d,labels:s,start:I,stopObserver:D,teardown:()=>{D(),Bi(d,R);for(let[,q]of d.mounted)q.editor.unmount();d.mounted.clear(),Is(u),Fs(),qs(),hi(),Gs(c),As(),Qi()},flushOnUnload:()=>{qi(d,R)},schedule:j}}function Su(e,t){let n=e?.list?.getSnapshot(),r=n?.current;if(typeof r=="string"&&r.length>0)return r;let o=t?.adapter?.current?.getSnapshot?.()?.key;if(typeof o=="string"&&o.length>0)return o;for(let[i,s]of Object.entries(n?.byId??{}))if(!(s===void 0||(s.retainedBy?.mainView??0)<=0))return typeof s.id=="string"&&s.id.length>0?s.id:i}function Ys(e){let t,n=new Map,r=(s,a)=>{for(let[d,u]of n){if(d===a)continue;let p;try{p=s.directoryFor(u.sessionId)===d}catch{p=!1}p||(u.restore(),n.delete(d))}};return{ensure:()=>{let s=e.ctx,a=s.get?.("sessions"),d=s.get?.("uiSession"),u=s.get?.("modelDirectories"),p=Su(a,d);if(!(p===void 0||u===void 0))try{let m=u.directoryFor(p);return r(u,m),t!==void 0&&t.sessionId===p&&t.directory===m||(n.has(m)||n.set(m,{sessionId:p,restore:Ko(m,{configuredEffort:e.configuredEffort})}),t={sessionId:p,directory:m}),m}catch{t=void 0;return}},dispose:()=>{for(let[,s]of n)s.restore();n.clear()}}}var Au="conversation.input.model";function Js(e){return e.querySelector("[data-composer-card]")??void 0}function qr(e){return e.querySelector(`[data-slot="${Au}"]`)??void 0}function Xs(e){let t=qr(e)??e;return Array.from(t.querySelectorAll('button[aria-haspopup="menu"]'))}function Qs(e,t){let n=e.getAttribute("aria-controls");if(n===null||n.length===0)return;let r=t.getElementById(n);if(r!==null)return r.getAttribute("role")==="menu"?r:void 0}function Ur(e=document){let t=Js(e);if(t===void 0)return;for(let r of Xs(t)){let o=Qs(r,e);if(o!==void 0)return o}let n=qr(t)??t;for(let r of Array.from(n.querySelectorAll('[role="menu"]')))if(r.previousElementSibling?.matches('button[aria-haspopup="menu"]'))return r}function jr(e=document){let t=Js(e);if(t===void 0)return;let n=qr(t),r=Xs(t),o=r[0];if(o!==void 0){for(let i of r)if(Qs(i,e)!==void 0)return i;for(let i of r)if(i.nextElementSibling?.matches('[role="menu"]'))return i;return n===void 0?r.at(-1):o}}function Zs(){return Ur()}function ea(){return jr()}var Ce=require("react");var X=require("react");var _=require("react/jsx-runtime"),Ru=["claude-cli/2.1.161 (external, cli)","claude-code/1.0.0","Kilo-Code/1.0"];function ta(e){let t=0,n=Object.entries(e??{}).map(([r,o])=>({id:t+=1,name:r,value:o}));return n.length===0&&n.push({id:t+=1,name:"",value:""}),{rows:n}}function Hu(e){let t={},n=!1;for(let o of e.rows){let i=o.name.trim();i.length!==0&&(t[i]=o.value,i.toLowerCase()==="user-agent"&&(n=!0))}let r=e.userAgent?.trim();return!n&&r!==void 0&&r.length>0&&(t["user-agent"]=r),t}function na({route:e,api:t,t:n}){let r=(0,X.useId)(),[o,i]=(0,X.useState)(void 0),[s,a]=(0,X.useState)({rows:[]}),[d,u]=(0,X.useState)(!1),[p,m]=(0,X.useState)(!1),[g,l]=(0,X.useState)(!0),[c,f]=(0,X.useState)(!1),[w,y]=(0,X.useState)(!1),[h,v]=(0,X.useState)(void 0),[M,x]=(0,X.useState)(void 0),[L,R]=(0,X.useState)(!1),C=(0,X.useRef)(1),j=(0,X.useRef)(null);(0,X.useEffect)(()=>{let S=!0;return(async()=>{try{let K=await ne(t);if(!S)return;let N=fr(K.namespace,e);i(N),a(ta(N)),y(K.writable!==!0)}catch{S&&y(!0)}finally{S&&l(!1)}})(),()=>{S=!1}},[t,e]),(0,X.useEffect)(()=>{let S=!0;return(async()=>{try{let N=await(await fetch(no,{method:"GET"})).json();S&&N.ok===!0&&N.data!==void 0&&x(N.data)}catch{}})(),()=>{S=!1}},[]),(0,X.useEffect)(()=>{let S=j.current;if(S===null)return;let K=()=>{R(S.dataset.breRegion==="advanced")};K();let N=new MutationObserver(K);return N.observe(S,{attributes:!0,attributeFilter:["data-bre-region"]}),()=>{N.disconnect()}},[]);let I=()=>{a(S=>({...S,rows:[...S.rows,{id:C.current+=1,name:"",value:""}]})),v(void 0)},D=(S,K)=>{a(N=>({...N,rows:N.rows.map(te=>te.id===S?{...te,...K}:te)})),v(void 0)},A=S=>{a(K=>({...K,rows:K.rows.filter(N=>N.id!==S)})),v(void 0)},P=()=>{a(ta(o)),m(!1),v(void 0)},q=async S=>{f(!0),v(void 0);let K;try{K=await cr(t,e,S)}catch(N){K={ok:!1,error:N instanceof Error?N.message:String(N)}}if(f(!1),!K.ok){v({kind:"error",text:K.error==="no-route"?n("headersNoRoute"):K.error==="read-only"?n("headersReadOnly"):n("headersError",{error:K.error})});return}i(S),m(!1),v({kind:"success",text:Object.keys(S).length===0?n("headersCleared"):n("headersSaved")})},F=Object.entries(o??{}),z=w||c,Y=F.length,U=L;return(0,_.jsxs)("div",{className:"bre-headers",ref:j,"data-plugin":Q,"data-open":d?"1":"0",children:[(0,_.jsx)("div",{className:"bre-headers-head",children:p||L?(0,_.jsx)("span",{className:"bre-effort-title",children:n("headersTitle")}):(0,_.jsxs)("button",{type:"button",className:"bre-headers-disclosure","aria-expanded":d,"aria-label":`${n("headersTitle")} ${e}`,onClick:()=>{u(!d),v(void 0)},children:[(0,_.jsx)("span",{className:"bre-effort-title",children:n("headersTitle")}),g||Y===0?null:(0,_.jsx)("span",{className:"bre-headers-count",children:Y}),(0,_.jsx)("span",{className:"bre-headers-chevron","aria-hidden":"true",children:"\u203A"})]})}),!d&&!p&&!L?null:(0,_.jsxs)(_.Fragment,{children:[(0,_.jsx)("p",{className:"bre-effort-note",children:n("headersHint")}),M===void 0?null:(0,_.jsxs)(_.Fragment,{children:[M.environment.preferOfficialLayer?(0,_.jsx)("p",{className:"bre-effort-note bre-warn",children:n("headersConflictPatched")}):null,M.conflicts.length===0&&(M.headerConflicts?.length??0)===0?null:(0,_.jsx)("p",{className:"bre-effort-note bre-warn",children:n("headersConflictOrigin")}),M.environment.siblings.length===0?null:(0,_.jsx)("p",{className:"bre-effort-note bre-warn",children:n("headersConflictSiblings",{names:M.environment.siblings.map(S=>S.name).join(", ")})})]}),g?null:p||U?(0,_.jsxs)("div",{className:"bre-headers-edit",children:[(0,_.jsxs)("div",{className:"bre-headers-columns","aria-hidden":"true",children:[(0,_.jsx)("span",{children:n("headersName")}),(0,_.jsx)("span",{children:n("headersValue")}),(0,_.jsx)("span",{})]}),s.rows.map(S=>(0,_.jsxs)("div",{className:"bre-headers-row",children:[(0,_.jsx)("input",{type:"text",className:"bre-text-input bre-headers-name",value:S.name,disabled:z,placeholder:n("headersNamePlaceholder"),"aria-label":n("headersName"),onChange:K=>{D(S.id,{name:K.target.value})}}),(0,_.jsx)("input",{type:"text",className:"bre-text-input bre-headers-value",value:S.value,disabled:z,list:S.name.trim().toLowerCase()==="user-agent"?r:void 0,placeholder:n("headersValue"),"aria-label":n("headersValue"),onChange:K=>{D(S.id,{value:K.target.value})}}),(0,_.jsx)("button",{type:"button",className:"bre-link-button bre-headers-remove",disabled:z,"aria-label":`${n("headersClear")} ${S.name}`,onClick:()=>{A(S.id)},children:"\xD7"})]},S.id)),(0,_.jsx)("button",{type:"button",className:"bre-link-button bre-headers-add",disabled:z,onClick:I,children:n("headersAdd")}),!1,(0,_.jsx)("datalist",{id:r,children:Ru.map(S=>(0,_.jsx)("option",{value:S},S))}),(0,_.jsx)("p",{className:"bre-effort-note bre-headers-legacy",hidden:!0,children:n("headersUserAgentHint")}),(0,_.jsxs)("div",{className:"bre-effort-actions",children:[(0,_.jsx)("button",{type:"button",className:"bre-primary-button",disabled:z,onClick:()=>{q(Hu(s))},children:n("headersSave")}),(0,_.jsx)("button",{type:"button",className:"bre-secondary-button",disabled:z,onClick:P,children:n("headersCancel")})]})]}):(0,_.jsxs)("div",{className:"bre-headers-rows",children:[F.length===0?(0,_.jsx)("p",{className:"bre-effort-note",children:n("headersEmpty")}):F.map(([S,K])=>(0,_.jsxs)("div",{className:"bre-headers-row",children:[(0,_.jsx)("span",{className:"bre-headers-name",children:S}),(0,_.jsx)("span",{className:"bre-headers-value bre-headers-masked",children:"\u2022".repeat(Math.min(K.length,24))})]},S)),w?null:(0,_.jsx)("div",{className:"bre-effort-actions",children:(0,_.jsx)("button",{type:"button",className:"bre-secondary-button",disabled:z,onClick:()=>{m(!0),v(void 0)},children:n("headersEdit")})})]})]}),h===void 0?null:(0,_.jsx)("p",{className:"bre-effort-message bre-"+h.kind,role:h.kind==="error"?"alert":"status",children:h.text})]})}var zr=require("react");var Ou={provider:"editorTabProvider",models:"editorTabModels",advanced:"editorTabAdvanced"};function ra({host:e,t}){return(0,zr.createElement)("div",{className:ks,role:"tablist","aria-label":t("editorTabsLabel")},...xs.map(n=>(0,zr.createElement)("button",{key:n,type:"button",role:"tab",className:Es,[Ts]:n,onClick:r=>{r.preventDefault(),r.stopPropagation();let o=Dn(e.current);o!==null&&Ss(o,n)}},t(Ou[n]))))}var oa="settings.models.provider-card";function _u({provider:e,api:t,t:n}){let r=(0,Ce.useRef)(null);(0,Ce.useEffect)(()=>{let i=r.current,s=Dn(i);if(i===null||s===null)return;let a=s,d=()=>s.querySelector('[class*="_editor"]')!==null,u=()=>{let m=d()?"1":"0";i.dataset.edit!==m&&(i.dataset.edit=m)};u();let p=new MutationObserver(u);return p.observe(a,{childList:!0,subtree:!0}),()=>{p.disconnect()}},[]);let o=e?.provider;return typeof o!="string"||o.length===0?null:(0,Ce.createElement)("div",{ref:r,className:"bre-headers-host","data-bre-provider":o},(0,Ce.createElement)(ra,{host:r,t:n}),(0,Ce.createElement)(na,{route:o,api:t,t:n}))}function ia(e,t,n){let r=e,o=r.slots?.inject(oa,()=>{r.slots?.register({name:oa,key:oe,inject:()=>({api:t,t:n})},_u)});return typeof o=="function"?o:()=>{}}var ue=require("react");function sa(e){let{t}=e,n=(0,ue.useSyncExternalStore)(Bt,ce),r=()=>{ao(!n)};return(0,ue.createElement)("div",{className:"bre-slider-setting"},(0,ue.createElement)("div",{className:"bre-slider-setting-row"},(0,ue.createElement)("div",{className:"bre-slider-setting-copy"},(0,ue.createElement)("div",{className:"bre-slider-setting-title"},t("sliderToggleTitle")),(0,ue.createElement)("div",{className:"bre-slider-setting-description"},t("sliderToggleDescription"))),(0,ue.createElement)("div",{className:"bre-slider-setting-control"},(0,ue.createElement)("span",{className:"bre-slider-setting-state"},t(n?"settingOn":"settingOff")),(0,ue.createElement)("button",{type:"button",role:"switch","aria-label":t("sliderToggleAria"),"aria-checked":n,className:"bre-slider-setting-switch"+(n?" is-on":""),onClick:r},(0,ue.createElement)("span",{className:"bre-slider-setting-switch-knob","aria-hidden":!0})))))}function aa(e,t){let n=e,r=n.slots?.inject("settings.models.footer",()=>{n.slots?.register({name:"settings.models.footer",id:Q+"-slider-toggle",order:15,inject:()=>({t})},sa)});return typeof r=="function"?r:()=>{}}var Nu=Q,Iu=["slots","locale","connection","remote","remote.settings"];function Du(e){e.effect(()=>e.locale.register(qn,{zh:io,en:oo}),"dsh-model-think-level: dictionaries");let t=document.createElement("style");t.dataset.plugin=Q,t.dataset.pluginStyles=Q,t.textContent=Ro,document.head.appendChild(t),e.effect(()=>()=>t.remove(),"dsh-model-think-level: stylesheet");let n=(()=>{try{let l=e.get?.("configForms");try{let f=l?.get?.(oe);if(f!==void 0)return f}catch{}return e.get?.("settingsScope")?.bind?.({namespace:oe})}catch{return}})(),r=n===void 0?{settings:e.remote.settings}:{settings:e.remote.settings,scope:n},o=e.locale.bind(qn),i=()=>{let l=e.locale;return typeof l.subscribe=="function"&&typeof l.getSnapshot=="function"?l:void 0},s=l=>{let c=i();return c===void 0?l():(0,da.createElement)(ro,{locale:c,children:l})},a=ni({api:r}),d=Ys({ctx:e,configuredEffort:a.of}),u=Qo({menuOf:Zs,triggerOf:ea,t:o,refreshed:s,sliderEnabled:ce,directory:d.ensure}),p=oi({api:r}),m=Vs({ctx:e,api:r,t:o,onIdle:p.run,refreshed:s}),g=()=>{d.ensure(),u.reconcile()};e.effect(()=>(m.start(g),()=>{m.teardown(),u.dispose(),d.dispose()}),"dsh-model-think-level: DOM injector"),e.effect(()=>{let l=()=>{m.flushOnUnload()};return window.addEventListener("pagehide",l),()=>{window.removeEventListener("pagehide",l)}},"dsh-model-think-level: ledger flush on unload"),e.effect(()=>{let l=()=>{m.state.describePromise=void 0,a.invalidate(),m.schedule()},c=[e.remote.$on("settings/document-updated",f=>{f===oe&&l()}),e.on("connection/reset",l)];return()=>{for(let f of c)f()}},"dsh-model-think-level: pushed invalidations"),e.effect(()=>{let l=h=>{h.key===Wt?lo(h.newValue!=="false"):h.key===qt?mo(nt(h.newValue)):h.key===jt?wo(ho(h.newValue)):h.key===$t&&Mo(Xn(h.newValue))};window.addEventListener("storage",l);let c=Bt(()=>{m.schedule()}),f=Ut(()=>{m.schedule()}),w=Gt(()=>{m.schedule()}),y=Vt(()=>{m.schedule()});return()=>{window.removeEventListener("storage",l),c(),f(),w(),y()}},"dsh-model-think-level: client preferences"),e.effect(()=>aa(e,o),"dsh-model-think-level: footer slot activation"),e.effect(()=>ia(e,r,o),"dsh-model-think-level: provider-card slot activation")}

		return module.exports;
	}
});

//# sourceMappingURL=client.js.map
