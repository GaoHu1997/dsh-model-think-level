window.__ModuleLoader__.load({
	id: "dsh-model-think-level",
	factory: (require) => {
		var module = { exports: {} };
		var exports = module.exports;

"use strict";var Wt=Object.defineProperty;var Na=Object.getOwnPropertyDescriptor;var Da=Object.getOwnPropertyNames;var Ia=Object.prototype.hasOwnProperty;var Pa=(e,t,n)=>t in e?Wt(e,t,{enumerable:!0,configurable:!0,writable:!0,value:n}):e[t]=n;var Ca=(e,t)=>{for(var n in t)Wt(e,n,{get:t[n],enumerable:!0})},Fa=(e,t,n,r)=>{if(t&&typeof t=="object"||typeof t=="function")for(let o of Da(t))!Ia.call(e,o)&&o!==n&&Wt(e,o,{get:()=>t[o],enumerable:!(r=Na(t,o))||r.enumerable});return e};var Ka=e=>Fa(Wt({},"__esModule",{value:!0}),e);var to=(e,t,n)=>Pa(e,typeof t!="symbol"?t+"":t,n);var $u={};Ca($u,{EffortEditor:()=>ln,apply:()=>zu,baselineModelsOf:()=>oi,compatOf:()=>rn,createEditorApi:()=>an,defaultEffortOf:()=>sn,describeNamespace:()=>ne,effortsOf:()=>tn,findModelMenu:()=>zr,findModelTrigger:()=>$r,inject:()=>Gu,inputOf:()=>nn,name:()=>ju,nameOf:()=>on,providerHeadersOf:()=>cr,providersOf:()=>we,userProvidersOf:()=>fr,writeModelRows:()=>kt,writeProviderHeaders:()=>pr});module.exports=Ka($u);var ba=require("react");var X="dsh-model-think-level",no="/dsh-model-think-level/raw-models";var qt="/dsh-model-think-level/provider-key",ro="/dsh-model-think-level/key-index",oo="/dsh-model-think-level/autofill-config",io="/dsh-model-think-level/headers-config",oe="llm-pi-ai",le="reasoningEffortsUnset",Re="inputUnset",et="reasoningEffortsAutofilled",tt="defaultEffort",Un=X;var ht=require("react");function so(e){let{locale:t}=e,n=(0,ht.useCallback)(o=>t.subscribe(o),[t]),r=(0,ht.useCallback)(()=>t.getSnapshot().revision??0,[t]);return(0,ht.useSyncExternalStore)(n,r),e.children()}var ao={reasoningEffort:"Reasoning effort",thinkingMode:"Thinking",thinkingModeOff:"Off \u2014 this model is declared as not reasoning.",autoAdapt:"Auto-adapt",autoAdaptAll:"Auto-detect thinking levels",autoAdaptWorking:"Detecting\u2026",autoAdaptDone:"Adapted {count} \xB7 save to write",autoAdaptEmpty:"All already configured",autoAdaptUnsuggested:"No suggestion available",autoAdaptBlocked:"No models to adapt yet",autoAdaptFailed:"Detection failed: {message}",autoAdaptDoneHint:"Held for {count} model(s): they land when this card is saved.",autoAdaptEmptyHint:"Every model of this provider already declares its thinking levels.",autoAdaptUnsuggestedHint:"The models that still need a declaration have no knowledge-base match \u2014 adapt them one by one.",autoAdaptBlockedHint:"Nothing to adapt yet: the card has no models, is not saved, or the settings document is read-only.",apply:"Apply",reset:"Reset",pendingSave:"Modified \u2014 it will be written when you save this card.",pendingHint:"Cancel or reload discards it, exactly like the card's own fields.",appliedHint:"Applied suggestion from {source} \xB7 confidence: {confidence}",inputHintEndpoint:"Modality advice comes from the endpoint listing.",inputHintKnowledge:"Modality advice comes from the knowledge base.",inputHintHeuristic:"Modality guessed from the name alone (low confidence) \u2014 verify.",referenceTitle:"Reference capacities (hints only, never auto-filled)",contextWindowLabel:"Context window",maxTokensLabel:"Max output",inputModality:"Input modalities",modalityImage:"Image input",modalityInherit:"Not declared \u2014 the provider default applies (usually text-only).",clearDeclaration:"Clear declaration",confidence_high:"high",confidence_medium:"medium",confidence_low:"low \u2014 verify before relying on it",noSuggestion:"No suggestion is available for this model.",conflict:"The settings document kept changing under this edit. Wait a moment, then apply again.",writeError:"Failed: {message}",renderFailed:"Reasoning-effort editor failed to render",wirePlaceholder:"Wire value",wireValue:"value",reasoningDisabled:"No reasoning-effort control declared for this model (false) \u2014 do not arm thinking levels.",bareHint:"Clearing every level removes the declaration \u2014 requests go out bare (provider default), which some relays require.",defaultRiskDisabled:"No off level: Default and provider tests send thinking: disabled, which this model rejects (e.g. 1210).",defaultRiskQwen:"No off level: Default sends enable_thinking: false \u2014 only fails where the upstream requires thinking on.",stagedHint:"Not saved yet. Staged settings are applied automatically once the model is saved.",level_off:"off",level_minimal:"minimal",level_low:"low",level_medium:"medium",level_high:"high",level_xhigh:"xhigh",level_max:"max",sliderToggleTitle:"Model and reasoning-effort rows",sliderToggleDescription:"Show the model row and the reasoning-level chips in the model menu; the levels follow the current model.",sliderToggleAria:"Enable the model and reasoning-effort rows",settingOn:"On",settingOff:"Off",sliderEffortAria:"Reasoning effort",sliderNoLevels:"The current model exposes no reasoning-effort levels.",triggerFallback:"Select model",effortDefault:"Default",modelRowLabel:"Model",effortRowLabel:"Reasoning level",tagVision:"Image input",tagThinking:"Sends thinking levels",sliderEffortTitle:"Reasoning effort \xB7 {name}",sliderEffortTitleError:"Reasoning effort failed: {error}",sliderNoCurrent:"No model selected.",compatTitle:"Endpoint compatibility",budgetFieldLabel:"Thinking budget field",budgetFieldHint:"Which parameter carries the thinking-token budget: some vLLM and self-hosted endpoints read thinking_token_budget, others thinking_budget or thinking_budget_tokens. Unset sends none of them.",budgetUnset:"Not set",defaultEffortLabel:"Default effort",defaultEffortUnset:"Follow memory",defaultEffortHint:"The level every new session starts this model at \u2014 it outranks the remembered levels. Within a session, a level you pick by hand always wins. Empty follows the memory chain.",clearDefaultEffort:"Clear pick",priorityLabel:"vLLM priority",priorityPlaceholder:"e.g. 0",priorityHint:"Scheduler priority for endpoints started with --priority, where lower runs first. Leave empty to send nothing.",priorityInvalid:"Priority must be an integer \u2014 it is not saved until fixed.",maxOutputLabel:"max_output_tokens in requests",maxOutputUnset:"Unset \u2014 follow the protocol default",maxOutputOn:"Send it",maxOutputOff:"Omit it",maxOutputHint:'For Responses-protocol gateways only, and only when a request carries an output cap: some of them reject the parameter, so "Omit it" keeps the cap out of the request entirely. Unset is the safe choice.',aliasMigrated:"Legacy alias detected \u2014 saving writes the explicit budget field.",modelSearchPlaceholder:"Search models\u2026",modelSearchNoMatches:"No matching models",modelSearchClear:"Clear search",modelSearchFailed:"Model search failed to render",editorTabsLabel:"Editor sections",editorTabProvider:"Provider",editorTabModels:"Models",editorTabAdvanced:"Advanced",keyRevealShow:"Show key",keyRevealHide:"Hide key",keyRevealFailed:"Stored key unavailable",keysLoading:"Loading keys\u2026",keysAdd:"Add another key",keysAddConfirm:"Add",keysEnable:"Use {name}",keysEnabled:"Enabled",keysMissing:"Not stored",keysEdit:"Edit",keysRemove:"Delete",keysConfirmRemove:"Confirm delete",keysCancel:"Cancel",keysSave:"Save",keysAlias:"Label",keysAliasPlaceholder:"Name (optional), e.g. Team",keysValue:"Key",keysValuePlaceholder:"Paste the API key",keysNewValuePlaceholder:"Paste the new API key",keysAddIllegal:"A key is printable ASCII without spaces.",keysAdded:"Key stored.",keysRenamed:"Label saved.",keysReplaced:"Key replaced.",keysRemoved:"Key removed.",keysEnabledNote:"{name} is now in use.",keysUnreachable:"The plugin\u2019s key route did not answer.",keysPanelFailed:"Key manager failed to render",headersTitle:"Request headers",headersHint:"Sent on every request of this route.",headersEmpty:"No extra request headers are configured.",headersAdd:"Add header",headersName:"Name",headersNamePlaceholder:"e.g. x-company",headersValue:"Value",headersEdit:"Edit",headersSave:"Save",headersCancel:"Cancel",headersClear:"Clear all",headersSaved:"Saved.",headersCleared:"Cleared \u2014 this route sends no extra request headers.",headersReadOnly:"The settings document is not writable.",headersUserAgentTitle:"User-Agent (taken over at the fetch layer)",headersUserAgentHint:"The official adapter discards a configured user-agent \u2014 the name is reserved for client attribution \u2014 so this plugin adds it at the request layer. Filling it in really does replace the outgoing User-Agent.",headersUserAgentClear:"Do not override",headersUserAgentPlaceholder:"e.g. claude-cli/2.1.161 (external, cli)",headersConflictOrigin:"Routes sharing one endpoint declare different request-header values: when the model in a request body does not identify exactly one of them, that request falls back to the first route.",headersConflictPatched:"The installed dsh-llm-pi-ai already carries a request-header patch: enter values in the headers above and this plugin need not take the request layer over.",headersConflictSiblings:"A plugin rewriting the same layer is installed: {names}. Only one user-agent rewrite should be active at a time, or the last writer on the wire wins.",headersError:"Save failed: {error}",headersNoRoute:"This route is no longer in the settings document \u2014 save the official card once first.",providerReorderAria:"Reorder {provider}",providerReorderHint:"Drag to set the provider order \u2014 the model switcher follows it.",providerToggleAria:"Enable {provider}",providerToggleHint:"A disabled provider is not listed by the model switcher.",providerDisabledGroupShow:"Show {count} switched-off provider(s)",providerDisabledGroupHide:"Hide {count} switched-off provider(s)",providerDisabledGroupHint:"A switched-off provider keeps its configuration and folds away here \u2014 unfold it to switch it back on.",providerRemoveDisabled:"Delete",providerRemoveLocked:"A built-in provider cannot be deleted.",modelReorderAria:"Reorder {model}",modelReorderHint:"Drag to set the order of this provider\u2019s models \u2014 the model switcher follows it."},lo={reasoningEffort:"\u601D\u8003\u5F3A\u5EA6",thinkingMode:"\u601D\u8003",thinkingModeOff:"\u5DF2\u5173\u95ED\u2014\u2014\u8BE5\u6A21\u578B\u58F0\u660E\u4E3A\u4E0D\u601D\u8003\u3002",autoAdapt:"\u81EA\u52A8\u9002\u914D",autoAdaptAll:"\u81EA\u52A8\u83B7\u53D6\u601D\u8003\u7B49\u7EA7",autoAdaptWorking:"\u83B7\u53D6\u4E2D\u2026",autoAdaptDone:"\u5DF2\u9002\u914D {count} \u4E2A\xB7\u4FDD\u5B58\u540E\u5199\u5165",autoAdaptEmpty:"\u5DF2\u5168\u90E8\u914D\u7F6E",autoAdaptUnsuggested:"\u6CA1\u6709\u53EF\u7528\u5EFA\u8BAE",autoAdaptBlocked:"\u6682\u65E0\u53EF\u9002\u914D\u6A21\u578B",autoAdaptFailed:"\u83B7\u53D6\u5931\u8D25\uFF1A{message}",autoAdaptDoneHint:"\u5DF2\u6682\u5B58 {count} \u4E2A\u6A21\u578B\u7684\u9002\u914D\u7ED3\u679C\uFF1A\u70B9\u8BE5\u5361\u7247\u7684\u300C\u4FDD\u5B58\u300D\u540E\u5199\u5165\u3002",autoAdaptEmptyHint:"\u8BE5\u4F9B\u5E94\u5546\u4E0B\u6240\u6709\u6A21\u578B\u90FD\u5DF2\u58F0\u660E\u601D\u8003\u7B49\u7EA7\u3002",autoAdaptUnsuggestedHint:"\u4ECD\u9700\u58F0\u660E\u7684\u6A21\u578B\u6CA1\u6709\u77E5\u8BC6\u5E93\u5339\u914D\u2014\u2014\u8BF7\u9010\u4E2A\u6253\u5F00\u6A21\u578B\u884C\u624B\u52A8\u9002\u914D\u3002",autoAdaptBlockedHint:"\u6682\u65E0\u53EF\u9002\u914D\u5185\u5BB9\uFF1A\u8BE5\u5361\u7247\u8FD8\u6CA1\u6709\u6A21\u578B\u3001\u5C1A\u672A\u4FDD\u5B58\uFF0C\u6216\u5F53\u524D\u8BBE\u7F6E\u6587\u6863\u4E0D\u53EF\u5199\u5165\u3002",apply:"\u5E94\u7528",reset:"\u653E\u5F03\u4FEE\u6539",pendingSave:"\u5DF2\u4FEE\u6539\u2014\u2014\u70B9\u5361\u7247\u300C\u4FDD\u5B58\u300D\u65F6\u4E00\u8D77\u5199\u5165\u3002",pendingHint:"\u70B9\u300C\u53D6\u6D88\u300D\u6216\u5237\u65B0\u9875\u9762\u4F1A\u4E00\u5E76\u4E22\u5F03\uFF0C\u4E0E\u5361\u7247\u81EA\u8EAB\u7684\u5B57\u6BB5\u4E00\u81F4\u3002",appliedHint:"\u5DF2\u6309 {source} \u5E94\u7528\u5EFA\u8BAE \xB7 \u7F6E\u4FE1\u5EA6\uFF1A{confidence}",inputHintEndpoint:"\u6A21\u6001\u5EFA\u8BAE\u6765\u81EA\u7AEF\u70B9\u5217\u8868\u3002",inputHintKnowledge:"\u6A21\u6001\u5EFA\u8BAE\u6765\u81EA\u77E5\u8BC6\u5E93\u3002",inputHintHeuristic:"\u6A21\u6001\u5EFA\u8BAE\u4EC5\u6309\u547D\u540D\u63A8\u65AD\uFF08\u4F4E\u7F6E\u4FE1\u5EA6\uFF09\uFF0C\u8BF7\u6838\u5BF9\u3002",referenceTitle:"\u53C2\u8003\u5BB9\u91CF\uFF08\u4EC5\u63D0\u793A\uFF0C\u4E0D\u81EA\u52A8\u586B\u5145\uFF09",contextWindowLabel:"\u4E0A\u4E0B\u6587\u7A97\u53E3",maxTokensLabel:"\u6700\u5927\u8F93\u51FA",inputModality:"\u8F93\u5165\u6A21\u6001",modalityImage:"\u56FE\u7247\u8F93\u5165",modalityInherit:"\u672A\u58F0\u660E\u2014\u2014\u7EE7\u627F\u63D0\u4F9B\u65B9\u9ED8\u8BA4\uFF08\u901A\u5E38\u4EC5\u6587\u672C\uFF09\u3002",clearDeclaration:"\u6E05\u9664\u58F0\u660E",confidence_high:"\u9AD8",confidence_medium:"\u4E2D",confidence_low:"\u4F4E\uFF08\u5EFA\u8BAE\u6838\u5BF9\uFF09",noSuggestion:"\u6CA1\u6709\u9002\u7528\u4E8E\u8BE5\u6A21\u578B\u7684\u5EFA\u8BAE\u3002",conflict:"\u8BBE\u7F6E\u6587\u6863\u5728\u4FDD\u5B58\u671F\u95F4\u6301\u7EED\u53D8\u5316\uFF0C\u8BF7\u7A0D\u5019\u518D\u6B21\u5E94\u7528\u3002",writeError:"\u5199\u5165\u5931\u8D25\uFF1A{message}",renderFailed:"\u601D\u8003\u5F3A\u5EA6\u7F16\u8F91\u5668\u6E32\u67D3\u5931\u8D25",wirePlaceholder:"\u7EBF\u4E0A\u53D6\u503C",wireValue:"\u53D6\u503C",reasoningDisabled:"\u8BE5\u6A21\u578B\u58F0\u660E\u4E3A\u65E0 reasoning-effort \u63A7\u5236\uFF08false\uFF09\u2014\u2014\u8BF7\u52FF\u52FE\u9009\u601D\u8003\u6863\u3002",bareHint:"\u5168\u90E8\u53D6\u6D88\u5E76\u4FDD\u5B58\u5C06\u6E05\u9664\u58F0\u660E\u2014\u2014\u8BF7\u6C42\u4EE5\u88F8\u683C\u5F0F\u53D1\u51FA\uFF08\u8D70\u63D0\u4F9B\u65B9\u9ED8\u8BA4\uFF09\uFF0C\u90E8\u5206\u4E2D\u8F6C\u7AD9\u9700\u8981\u8FD9\u6837\u3002",defaultRiskDisabled:"\u65E0 off \u6863\uFF1ADefault \u4E0E\u63D0\u4F9B\u5546\u6D4B\u8BD5\u4F1A\u53D1\u9001 thinking: disabled\uFF0C\u8BE5\u6A21\u578B\u4F1A\u62A5\u9519\uFF08\u5982 1210\uFF09\u3002",defaultRiskQwen:"\u65E0 off \u6863\uFF1ADefault \u4F1A\u53D1\u9001 enable_thinking: false\u2014\u2014\u4EC5\u5728\u4E0A\u6E38\u8981\u6C42\u5F00\u542F\u601D\u8003\u65F6\u624D\u4F1A\u5931\u8D25\u3002",stagedHint:"\u5C1A\u672A\u4FDD\u5B58\u3002\u6682\u5B58\u7684\u914D\u7F6E\u5C06\u5728\u8BE5\u6A21\u578B\u4FDD\u5B58\u540E\u81EA\u52A8\u5E94\u7528\u3002",level_off:"off",level_minimal:"minimal",level_low:"low",level_medium:"medium",level_high:"high",level_xhigh:"xhigh",level_max:"max",sliderToggleTitle:"\u6A21\u578B\u4E0E\u601D\u8003\u7B49\u7EA7\u884C",sliderToggleDescription:"\u5728\u6A21\u578B\u83DC\u5355\u4E2D\u663E\u793A\u6A21\u578B\u884C\u4E0E\u601D\u8003\u7B49\u7EA7\u6807\u7B7E\uFF0C\u6863\u4F4D\u968F\u5F53\u524D\u6A21\u578B\u81EA\u52A8\u9002\u914D",sliderToggleAria:"\u542F\u7528\u6A21\u578B\u4E0E\u601D\u8003\u7B49\u7EA7\u884C",settingOn:"\u542F\u7528",settingOff:"\u505C\u7528",sliderEffortAria:"\u601D\u8003\u5F3A\u5EA6",sliderNoLevels:"\u5F53\u524D\u6A21\u578B\u672A\u63D0\u4F9B\u601D\u8003\u5F3A\u5EA6\u6863\u4F4D",triggerFallback:"\u9009\u62E9\u6A21\u578B",effortDefault:"\u9ED8\u8BA4",modelRowLabel:"\u6A21\u578B",effortRowLabel:"\u601D\u8003\u7B49\u7EA7",tagVision:"\u652F\u6301\u56FE\u7247\u8F93\u5165",tagThinking:"\u652F\u6301\u601D\u8003\u7B49\u7EA7",sliderEffortTitle:"\u601D\u8003\u5F3A\u5EA6 \xB7 {name}",sliderEffortTitleError:"\u601D\u8003\u5F3A\u5EA6\u8BBE\u7F6E\u5931\u8D25\uFF1A{error}",sliderNoCurrent:"\u5F53\u524D\u65E0\u9009\u62E9\u4E2D\u7684\u6A21\u578B\u3002",compatTitle:"\u7AEF\u70B9\u517C\u5BB9",budgetFieldLabel:"\u601D\u8003\u9884\u7B97\u5B57\u6BB5",budgetFieldHint:"\u601D\u8003 token \u9884\u7B97\u7528\u54EA\u4E2A\u53C2\u6570\u53D1\u9001\uFF1A\u90E8\u5206 vLLM\uFF0F\u81EA\u5EFA\u7AEF\u70B9\u8BFB thinking_token_budget\uFF0C\u53E6\u4E00\u4E9B\u8BFB thinking_budget \u6216 thinking_budget_tokens\u3002\u672A\u8BBE\u7F6E\u8868\u793A\u4E09\u4E2A\u90FD\u4E0D\u53D1\u9001\u3002",budgetUnset:"\u672A\u8BBE\u7F6E",defaultEffortLabel:"\u9ED8\u8BA4\u601D\u8003\u5F3A\u5EA6",defaultEffortUnset:"\u8DDF\u968F\u8BB0\u5FC6",defaultEffortHint:"\u6BCF\u4E2A\u65B0\u4F1A\u8BDD\u6253\u5F00\u8BE5\u6A21\u578B\u65F6\u4F7F\u7528\u7684\u6863\u4F4D\u2014\u2014\u4F18\u5148\u4E8E\u8BB0\u4F4F\u7684\u4E0A\u6B21\u6863\u4F4D\u3002\u4F1A\u8BDD\u5185\u624B\u52A8\u9009\u62E9\u7684\u6863\u4F4D\u59CB\u7EC8\u6700\u9AD8\u3002\u7559\u7A7A\u5219\u8DDF\u968F\u8BB0\u5FC6\u94FE\u3002",clearDefaultEffort:"\u6E05\u9664\u9009\u62E9",priorityLabel:"vLLM \u4F18\u5148\u7EA7",priorityPlaceholder:"\u4F8B\u5982 0",priorityHint:"\u4EE5 --priority \u542F\u52A8\u7684\u7AEF\u70B9\u7684\u8C03\u5EA6\u4F18\u5148\u7EA7\uFF0C\u6570\u503C\u8D8A\u5C0F\u8D8A\u5148\u6267\u884C\u3002\u7559\u7A7A\u8868\u793A\u4E0D\u53D1\u9001\u3002",priorityInvalid:"\u4F18\u5148\u7EA7\u5FC5\u987B\u662F\u6574\u6570\u2014\u2014\u4FEE\u6B63\u524D\u4E0D\u4F1A\u4FDD\u5B58\u3002",maxOutputLabel:"\u8BF7\u6C42\u4E2D\u7684 max_output_tokens",maxOutputUnset:"\u672A\u8BBE\u7F6E\u2014\u2014\u8DDF\u968F\u534F\u8BAE\u9ED8\u8BA4",maxOutputOn:"\u53D1\u9001",maxOutputOff:"\u4E0D\u53D1\u9001",maxOutputHint:'\u4EC5\u5BF9 Responses \u534F\u8BAE\u7684\u7F51\u5173\u751F\u6548\uFF0C\u4E14\u53EA\u5728\u8BF7\u6C42\u5E26\u8F93\u51FA\u4E0A\u9650\u65F6\u624D\u8D77\u4F5C\u7528\uFF1A\u90E8\u5206\u7F51\u5173\u4F1A\u62D2\u6536\u8BE5\u53C2\u6570\uFF0C\u9009"\u4E0D\u53D1\u9001"\u53EF\u8BA9\u8BF7\u6C42\u5B8C\u5168\u4E0D\u643A\u5E26\u8F93\u51FA\u4E0A\u9650\u3002\u672A\u8BBE\u7F6E\u662F\u6700\u5B89\u5168\u7684\u9009\u62E9\u3002',aliasMigrated:"\u68C0\u6D4B\u5230\u65E7\u522B\u540D\u2014\u2014\u4FDD\u5B58\u65F6\u4F1A\u5199\u5165\u663E\u5F0F\u9884\u7B97\u5B57\u6BB5\u3002",modelSearchPlaceholder:"\u641C\u7D22\u6A21\u578B\u2026",modelSearchNoMatches:"\u672A\u627E\u5230\u5339\u914D\u6A21\u578B",modelSearchClear:"\u6E05\u7A7A\u641C\u7D22",modelSearchFailed:"\u6A21\u578B\u641C\u7D22\u6E32\u67D3\u5931\u8D25",editorTabsLabel:"\u7F16\u8F91\u5668\u5206\u533A",editorTabProvider:"\u4F9B\u5E94\u5546\u914D\u7F6E",editorTabModels:"\u6A21\u578B\u914D\u7F6E",editorTabAdvanced:"\u9AD8\u7EA7\u914D\u7F6E",keyRevealShow:"\u663E\u793A\u5BC6\u94A5",keyRevealHide:"\u9690\u85CF\u5BC6\u94A5",keyRevealFailed:"\u65E0\u6CD5\u8BFB\u53D6\u5DF2\u4FDD\u5B58\u7684\u5BC6\u94A5",keysLoading:"\u6B63\u5728\u8BFB\u53D6\u5BC6\u94A5\u2026",keysAdd:"\u6DFB\u52A0\u53E6\u4E00\u4E2A\u5BC6\u94A5",keysAddConfirm:"\u6DFB\u52A0",keysEnable:"\u542F\u7528 {name}",keysEnabled:"\u542F\u7528",keysMissing:"\u672A\u5B58\u50A8",keysEdit:"\u4FEE\u6539",keysRemove:"\u5220\u9664",keysConfirmRemove:"\u786E\u8BA4\u5220\u9664",keysCancel:"\u53D6\u6D88",keysSave:"\u4FDD\u5B58",keysAlias:"\u522B\u540D",keysAliasPlaceholder:"\u540D\u79F0\uFF08\u53EF\u9009\uFF09\uFF0C\u4F8B\u5982 \u56E2\u961F",keysValue:"\u5BC6\u94A5",keysValuePlaceholder:"\u7C98\u8D34 API \u5BC6\u94A5",keysNewValuePlaceholder:"\u7C98\u8D34\u65B0\u7684 API \u5BC6\u94A5",keysAddIllegal:"\u5BC6\u94A5\u53EA\u80FD\u662F\u53EF\u6253\u5370 ASCII \u5B57\u7B26\uFF0C\u4E14\u4E0D\u80FD\u5305\u542B\u7A7A\u683C\u3002",keysAdded:"\u5DF2\u4FDD\u5B58\u5BC6\u94A5\u3002",keysRenamed:"\u5DF2\u4FDD\u5B58\u522B\u540D\u3002",keysReplaced:"\u5DF2\u66FF\u6362\u5BC6\u94A5\u3002",keysRemoved:"\u5DF2\u5220\u9664\u5BC6\u94A5\u3002",keysEnabledNote:"\u5DF2\u542F\u7528 {name}\u3002",keysUnreachable:"\u63D2\u4EF6\u7684\u5BC6\u94A5\u63A5\u53E3\u6CA1\u6709\u54CD\u5E94\u3002",keysPanelFailed:"\u5BC6\u94A5\u7BA1\u7406\u9762\u677F\u6E32\u67D3\u5931\u8D25",headersTitle:"\u8BF7\u6C42\u5934",headersHint:"\u8BE5\u8DEF\u7531\u7684\u6BCF\u4E2A\u8BF7\u6C42\u90FD\u4F1A\u643A\u5E26\u81EA\u5B9A\u4E49\u8BF7\u6C42\u5934\u3002",headersEmpty:"\u5C1A\u672A\u914D\u7F6E\u989D\u5916\u8BF7\u6C42\u5934\u3002",headersAdd:"\u6DFB\u52A0\u8BF7\u6C42\u5934",headersName:"\u540D\u79F0",headersNamePlaceholder:"\u4F8B\u5982 x-company",headersValue:"\u503C",headersEdit:"\u7F16\u8F91",headersSave:"\u4FDD\u5B58",headersCancel:"\u53D6\u6D88",headersClear:"\u5168\u90E8\u6E05\u7A7A",headersSaved:"\u5DF2\u4FDD\u5B58\u3002",headersCleared:"\u5DF2\u6E05\u7A7A\u2014\u2014\u8BE5\u8DEF\u7531\u4E0D\u518D\u643A\u5E26\u989D\u5916\u8BF7\u6C42\u5934\u3002",headersReadOnly:"\u5F53\u524D\u8BBE\u7F6E\u6587\u6863\u4E0D\u53EF\u5199\u5165\u3002",headersUserAgentTitle:"User-Agent\uFF08\u7531\u63D2\u4EF6\u5728\u8BF7\u6C42\u5C42\u63A5\u7BA1\uFF09",headersUserAgentHint:"\u5B98\u65B9\u9002\u914D\u5668\u4F1A\u4E22\u5F03\u914D\u7F6E\u7684 user-agent\uFF08\u8BE5\u540D\u79F0\u4FDD\u7559\u7ED9\u5BA2\u6237\u7AEF\u5F52\u5C5E\u6807\u8BC6\uFF09\uFF0C\u6240\u4EE5\u7531\u63D2\u4EF6\u5728\u8BF7\u6C42\u5C42\u8865\u4E0A\u3002\u586B\u4E86\u5C31\u4F1A\u771F\u6B63\u66FF\u6362\u4E0A\u884C\u8BF7\u6C42\u5934\u91CC\u7684 User-Agent\u3002",headersUserAgentClear:"\u4E0D\u8986\u76D6",headersUserAgentPlaceholder:"\u4F8B\u5982 claude-cli/2.1.161 (external, cli)",headersConflictOrigin:"\u540C\u4E00\u4E2A endpoint \u4E0A\u6709\u591A\u4E2A\u8DEF\u7531\u914D\u7F6E\u4E86\u4E0D\u540C\u7684\u8BF7\u6C42\u5934\u503C\uFF1A\u5F53\u8BF7\u6C42\u4F53\u91CC\u7684\u6A21\u578B\u65E0\u6CD5\u552F\u4E00\u5B9A\u4F4D\u5176\u4E2D\u4E00\u4E2A\u8DEF\u7531\u65F6\uFF0C\u8BE5\u8BF7\u6C42\u56DE\u9000\u5230\u7B2C\u4E00\u4E2A\u8DEF\u7531\u7684\u914D\u7F6E\u3002",headersConflictPatched:"\u68C0\u6D4B\u5230\u5B98\u65B9 dsh-llm-pi-ai \u5DF2\u5728\u8BF7\u6C42\u5C42\u5904\u7406\u8BF7\u6C42\u5934\uFF1A\u628A\u503C\u586B\u5728\u4E0A\u65B9\u8BF7\u6C42\u5934\u914D\u7F6E\u4E2D\u5373\u53EF\uFF0C\u65E0\u9700\u91CD\u590D\u63A5\u7BA1\u3002",headersConflictSiblings:"\u68C0\u6D4B\u5230\u4F1A\u6539\u5199\u540C\u4E00\u5C42\u7684\u540C\u7C7B\u63D2\u4EF6\uFF1A{names}\u3002\u540C\u4E00\u65F6\u95F4\u53EA\u5E94\u542F\u7528\u4E00\u79CD\u8BF7\u6C42\u5934\u6539\u5199\uFF0C\u5426\u5219\u7EBF\u4E0A\u751F\u6548\u7684\u662F\u6700\u540E\u5199\u5165\u8005\u3002",headersError:"\u4FDD\u5B58\u5931\u8D25\uFF1A{error}",headersNoRoute:"\u8BE5\u8DEF\u7531\u5DF2\u4E0D\u5728\u8BBE\u7F6E\u6587\u6863\u4E2D\u2014\u2014\u8BF7\u5148\u4FDD\u5B58\u4E00\u6B21\u5B98\u65B9\u5361\u7247\u3002",providerReorderAria:"\u62D6\u52A8\u6392\u5E8F\uFF1A{provider}",providerReorderHint:"\u62D6\u52A8\u8C03\u6574\u4F9B\u5E94\u5546\u987A\u5E8F\u2014\u2014\u6A21\u578B\u5207\u6362\u6309\u6B64\u987A\u5E8F\u663E\u793A\u3002",providerToggleAria:"\u542F\u7528 {provider}",providerToggleHint:"\u7981\u7528\u540E\u8BE5\u4F9B\u5E94\u5546\u4E0D\u5728\u6A21\u578B\u5207\u6362\u5217\u8868\u4E2D\u663E\u793A\u3002",providerDisabledGroupShow:"\u5C55\u5F00 {count} \u4E2A\u5DF2\u7981\u7528\u7684\u4F9B\u5E94\u5546",providerDisabledGroupHide:"\u6536\u8D77 {count} \u4E2A\u5DF2\u7981\u7528\u7684\u4F9B\u5E94\u5546",providerDisabledGroupHint:"\u5DF2\u7981\u7528\u7684\u4F9B\u5E94\u5546\u914D\u7F6E\u4ECD\u5728\uFF0C\u53EA\u662F\u6298\u53E0\u5728\u8FD9\u91CC\u2014\u2014\u5C55\u5F00\u540E\u53EF\u4EE5\u91CD\u65B0\u542F\u7528\u3002",providerRemoveDisabled:"\u5220\u9664",providerRemoveLocked:"\u5185\u7F6E\u4F9B\u5E94\u5546\u4E0D\u53EF\u5220\u9664\u3002",modelReorderAria:"\u62D6\u52A8\u6392\u5E8F\uFF1A{model}",modelReorderHint:"\u62D6\u52A8\u8C03\u6574\u8BE5\u4F9B\u5E94\u5546\u5185\u6A21\u578B\u987A\u5E8F\u2014\u2014\u6A21\u578B\u5207\u6362\u6309\u6B64\u987A\u5E8F\u663E\u793A\u3002"};var Bt="dsh-model-think-level.slider.enabled",Wa=["dsh-reasoning-effort.enabled","@dsh-external/dsh-reasoning-effort.enabled"],bt=qa();function qa(){try{let e=window.localStorage.getItem(Bt),t=e===null?Wa.map(n=>window.localStorage.getItem(n)).find(n=>n!==null):null;return(e??t??null)!=="false"}catch{return!0}}var jn=new Set;function uo(){for(let e of[...jn])e()}function ce(){return bt}function fo(e){if(bt!==e){bt=e;try{window.localStorage.setItem(Bt,String(e))}catch{}uo()}}function co(e){bt!==e&&(bt=e,uo())}function Ut(e){return jn.add(e),()=>{jn.delete(e)}}var jt="dsh-model-think-level.provider-order",po=["deepseek-account","deepseek-official"];function rt(e){if(e===null)return[];try{let t=JSON.parse(e);return Array.isArray(t)?zn(t.filter(n=>typeof n=="string")):[]}catch{return[]}}function zn(e){let t=new Set,n=[];for(let r of e)r.length===0||t.has(r)||(t.add(r),n.push(r));return n}var nt=(()=>{try{return rt(window.localStorage.getItem(jt))}catch{return[]}})(),Gn=new Set;function mo(){for(let e of[...Gn])e()}function go(e,t){return e.length===t.length&&e.every((n,r)=>n===t[r])}function $n(){return nt}function ho(e){let t=zn(e);if(!go(nt,t)){nt=t;try{window.localStorage.setItem(jt,JSON.stringify(nt))}catch{}mo()}}function bo(e){let t=zn(e);go(nt,t)||(nt=t,mo())}function Gt(e){return Gn.add(e),()=>{Gn.delete(e)}}function Vn(e){let t=n=>{let r=po.indexOf(n);return r<0?po.length:r};return e.map((n,r)=>({id:n,index:r,rank:t(n)})).sort((n,r)=>n.rank-r.rank||n.index-r.index).map(n=>n.id)}function ot(e,t){let n=new Map;for(let s of t)n.has(s)||n.set(s,n.size);let r=[],o=[];e.forEach((s,a)=>{n.has(s)&&(r.push(a),o.push(s))}),o.sort((s,a)=>n.get(s)-n.get(a));let i=[...e];return r.forEach((s,a)=>{i[s]=o[a]}),i}function yo(e){return ot(Vn(e),$n())}function Yn(e,t,n){let r=e.indexOf(t);if(r<0)return[...e];let o=[...e];o.splice(r,1);let i=Math.max(0,Math.min(o.length,n));return o.splice(i,0,t),o}var zt="dsh-model-think-level.providers.disabled",Jn=new Set,He=Ba();function Ba(){try{return rt(window.localStorage.getItem(zt))}catch{return[]}}function wo(e){return rt(e)}function vo(){return He}function it(e){return!He.includes(e)}function xo(e,t){let n=!He.includes(e);t!==n&&Eo(t?He.filter(r=>r!==e):[...He,e],!0)}function ko(e){Eo(e,!1)}function $t(e){return Jn.add(e),()=>{Jn.delete(e)}}function Ua(e,t){return e.length!==t.length?!1:e.every(n=>t.includes(n))}function Eo(e,t){if(!Ua(He,e)){if(He=[...new Set(e)],t)try{window.localStorage.setItem(zt,JSON.stringify(He))}catch{}for(let n of[...Jn])n()}}var Vt="dsh-model-think-level.model-order";function Qn(e){if(e===null)return{};try{let t=JSON.parse(e);if(t===null||typeof t!="object"||Array.isArray(t))return{};let n={};for(let[r,o]of Object.entries(t)){if(r.length===0||!Array.isArray(o))continue;let i=To(o.filter(s=>typeof s=="string"));i.length>0&&(n[r]=i)}return n}catch{return{}}}function To(e){let t=new Set,n=[];for(let r of e)r.length===0||t.has(r)||(t.add(r),n.push(r));return n}var qe=(()=>{try{return Qn(window.localStorage.getItem(Vt))}catch{return{}}})(),Xn=new Set;function Lo(){for(let e of[...Xn])e()}function ja(e,t){return e.length===t.length&&e.every((n,r)=>n===t[r])}function Ga(){try{window.localStorage.setItem(Vt,JSON.stringify(qe))}catch{}}function Mo(){return qe}function So(e){return qe[e]??za}var za=[];function Ao(e,t){if(e.length===0)return;let n=To(t),r=So(e);if(ja(r,n)&&(n.length>0||!(e in qe)))return;let o={...qe};n.length===0?delete o[e]:o[e]=n,qe=o,Ga(),Lo()}function Ro(e){qe=e,Lo()}function Yt(e){return Xn.add(e),()=>{Xn.delete(e)}}function $a(e,t){return ot(e,t)}function Ho(e,t){return ot(t,So(e))}function Oo(e,t){if(e.length===0||t.length===0)return e;let n=new Map(e.map(r=>[r.id,r]));return $a(e.map(r=>r.id),t).map(r=>n.get(r))}var _o=`
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

/* ---- The folded group of switched-off providers (Models page) ---- */

/* A switched-off provider keeps its row \u2014 that is where it is switched back on \u2014
   but it does not have to stay in the list the user reads. The row keeps its DOM
   slot (the drag pass reads its slots back out of there) and is only hidden; the
   control that unfolds it sits right after the list, as a list-level action with
   no card of its own, wearing the quiet end of the host's text scale. */
.bre-provider-disabled-group {
  box-sizing: border-box;
  display: block;
  width: 100%;
  margin: 4px 0 0;
  padding: 4px 2px;
  border: none;
  background: 0 0;
  color: var(--dsw-alias-label-tertiary, #81858c);
  font: inherit;
  font-size: 12px;
  line-height: 18px;
  text-align: left;
  cursor: pointer;
}

.bre-provider-disabled-group:hover { color: var(--dsw-alias-label-secondary, #61666b); }

.bre-provider-disabled-group:focus-visible {
  outline: 2px solid var(--dsw-alias-brand-primary, #4d6bfe);
  outline-offset: 2px;
}

/* The folded row itself. !important because the official card class decides its
   own display, and this stylesheet's order against the host's is not ours to
   rely on. */
.bre-row-hidden { display: none !important; }

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
`;var xt=require("react"),ei=require("react-dom");var L=require("react"),dr=require("react-dom"),Go=require("react-dom");var Po=["off","minimal","low","medium","high","xhigh","max"],Va=["text","image"];var Ya=[{id:"deepseek-v4-vision",patterns:["deepseek-v4-flash-vision","deepseek-v4-vision"],efforts:{off:"none",low:"low",high:"high",max:"max"},defaultEffort:"high",compat:{thinkingFormat:"deepseek",supportsReasoningEffort:!0},input:["text","image"],contextWindow:1048576,maxTokens:384e3,note:"DeepSeek \u89C6\u89C9\u5B9E\u9A8C\u7248 id\uFF08deepseek-v4-flash-vision-exp\uFF09\u3002\u5B98\u65B9\u76EE\u5F55\u5DF2\u6807\u6CE8\u8BE5\u6A21\u578B\u9000\u5F79\uFF0C\u540D\u5B57\u4ECD\u88AB\u63A5\u53D7\u3001\u7531\u73B0\u884C deepseek-flash \u63D0\u4F9B\u670D\u52A1\u2014\u2014\u56FE\u7247\u8F93\u5165\u73B0\u5DF2\u7531 deepseek-flash \u539F\u751F\u63D0\u4F9B\u3002"},{id:"deepseek-v4-1-flash",patterns:["deepseek-v4.1-flash","deepseek-flash"],efforts:{off:"none",low:"low",high:"high",max:"max"},defaultEffort:"high",compat:{thinkingFormat:"deepseek",supportsReasoningEffort:!0},input:["text","image"],contextWindow:1048576,maxTokens:384e3,note:'DeepSeek-V4.1-Flash\uFF082026-09-10 \u53D1\u5E03\u7684\u73B0\u884C\u5B98\u65B9\u6A21\u578B\uFF0C\u5B98\u65B9 id \u4E3A deepseek-flash\uFF1B25 \u4E07\u5E76\u53D1\u3001**\u539F\u751F\u56FE\u7247\u8F93\u5165**\uFF09\u3002V4.1 \u7684\u5404\u5199\u6CD5\uFF08deepseek-flash\u3001deepseek-v4.1-flash\u3001deepseek-v4-1-flash\uFF0C\u4EE5\u53CA\u5E26\u65E5\u671F\u540E\u7F00\u7684\u7B2C\u4E09\u65B9\u53D8\u4F53\uFF09\u90FD\u5F52\u6B64\u6761\u2014\u2014\u7EAF\u6587\u672C\u7684 deepseek-v4 \u4E3B\u5E72\u4E0D\u518D\u541E\u6389\u5B83\u4EEC\u3002\u5B98\u65B9\u679A\u4E3E\u540C V4 \u7CFB\uFF1AOff\uFF08thinking:"disabled"\uFF09/ Low / High / Max\uFF0C\u9ED8\u8BA4 High\uFF1B\u5BB9\u91CF 1,048,576 \u4E0A\u4E0B\u6587 / \u6700\u5927\u8F93\u51FA 384K\u3002'},{id:"deepseek-v4",patterns:["deepseek-v4"],efforts:{off:"none",low:"low",high:"high",max:"max"},defaultEffort:"high",compat:{thinkingFormat:"deepseek",supportsReasoningEffort:!0},input:["text"],contextWindow:1048576,maxTokens:384e3,note:'DeepSeek \u5B98\u65B9\u679A\u4E3E Low / High / Max\uFF08\u9ED8\u8BA4 High\uFF1Bminimal\u3001medium\u3001xhigh \u517C\u5BB9\u6620\u5C04\uFF0Cultra\u2192max\uFF09\uFF0COff \u5373 thinking:"disabled"\uFF08Responses API \u4E0B off \u4EE5 reasoning.effort:"none" \u8868\u793A\uFF09\u3002\u672C\u6761\u76EE\u662F V4 \u5BB6\u65CF\u7684**\u7EAF\u6587\u672C**\u6210\u5458\uFF1Adeepseek-v4-pro\uFF08= DeepSeek-V4-Pro-0813\uFF0C\u5B98\u65B9\u4E0D\u652F\u6301\u56FE\u7247\uFF09\u4E0E\u5DF2\u9000\u5F79\u6A21\u578B\u7684\u517C\u5BB9\u522B\u540D deepseek-v4-flash\uFF08deepseek-v4-flash-vision-exp \u53E6\u6709\u89C6\u89C9\u6761\u76EE\uFF09\u3002**\u6536\u56FE\u7684 V4.1-Flash\uFF08\u5B98\u65B9 id deepseek-flash\uFF09\u53E6\u6709\u4E13\u95E8\u6761\u76EE**\uFF0C\u5176 input \u542B image\u3002\u5BB9\u91CF\uFF1A1,048,576 \u4E0A\u4E0B\u6587 / \u6700\u5927\u8F93\u51FA 384K\uFF08393,216\uFF1B\u9ED8\u8BA4\u975E\u601D\u8003 8K\u3001\u601D\u8003 64K\u3001effort=max \u65F6 128K\uFF09\u3002'},{id:"deepseek-v3",patterns:["deepseek-v3","deepseek-chat"],efforts:{off:"none",high:"high",max:"max"},compat:{thinkingFormat:"deepseek",supportsReasoningEffort:!0},input:["text"],contextWindow:163840,maxTokens:65536,note:"DeepSeek V3 \u6863\u4F4D\uFF1AOff / High / Max\u3002\u5B98\u65B9\u5DF2\u505C\u552E V3 \u4EE3\uFF08\u5B9A\u4EF7\u9875\u4EC5\u5269 V4 \u4E09\u578B\uFF09\uFF0C\u5BB9\u91CF\u53D6\u76EE\u5F55\u73B0\u5F79\u503C\u3002"},{id:"deepseek-r1",patterns:["deepseek-r1","deepseek-reasoner"],efforts:{high:"high"},defaultEffort:"high",compat:{thinkingFormat:"deepseek",supportsReasoningEffort:!0},input:["text"],contextWindow:163840,maxTokens:32768,note:"DeepSeek-R1 \u4E3A\u63A8\u7406\u6A21\u578B\uFF0C\u4EC5\u63D0\u4F9B High\u3002\u5B98\u65B9\u5DF2\u4E0B\u67B6 R1 \u4EE3\uFF0C\u5BB9\u91CF\u53D6\u76EE\u5F55 r1-0528 \u503C\u3002"},{id:"openai-gpt-5-2",patterns:["gpt-5.2"],efforts:{off:"none",low:"low",medium:"medium",high:"high",xhigh:"xhigh"},defaultEffort:"off",compat:{thinkingFormat:"openai",supportsReasoningEffort:!0},input:["text","image"],contextWindow:4e5,maxTokens:128e3,note:"GPT-5.2 \u6863\u4F4D\uFF1ANone / Low / Medium / High / XHigh\uFF08\u9ED8\u8BA4 None\uFF09\u3002\u5B98\u65B9\u53E6\u652F\u6301 PDF \u8F93\u5165\uFF08\u6838\u5FC3\u8BCD\u8868\u6682\u4E0D\u542B\uFF09\u3002gpt-5.2-pro \u5B98\u65B9\u9875\u672A\u5355\u5217\u6863\u4F4D\u884C\uFF0C\u6309\u672C\u6761\u76EE\u540C\u6863\u5904\u7406\uFF1Bgpt-5.2-codex \u89C1\u5355\u72EC\u6761\u76EE\u3002"},{id:"openai-gpt-5-2-codex",patterns:["gpt-5.2-codex"],efforts:{low:"low",medium:"medium",high:"high",xhigh:"xhigh"},defaultEffort:"medium",compat:{thinkingFormat:"openai",supportsReasoningEffort:!0},input:["text","image"],contextWindow:4e5,maxTokens:128e3,note:"GPT-5.2-Codex \u6863\u4F4D\uFF1ALow / Medium / High / XHigh\uFF08\u65E0 None \u6863\uFF0C\u52FF\u52FE Off\uFF09\uFF0C\u5E26\u56FE\u8F93\u5165\u3001400K\u3002"},{id:"openai-gpt-5-6",patterns:["gpt-5.6"],efforts:{off:"none",low:"low",medium:"medium",high:"high",xhigh:"xhigh",max:"max"},defaultEffort:"medium",compat:{thinkingFormat:"openai",supportsReasoningEffort:!0},input:["text","image"],contextWindow:105e4,maxTokens:128e3,note:"GPT-5.6\uFF08\u522B\u540D\u5373 sol\uFF09\u6863\u4F4D\uFF1ANone / Low / Medium(\u9ED8\u8BA4) / High / XHigh / Max\uFF1Bsol/luna/terra \u540C\u6863\uFF0C\u5E26\u56FE\u8F93\u5165\u3002"},{id:"openai-gpt-5-5",patterns:["gpt-5.5"],efforts:{off:"none",low:"low",medium:"medium",high:"high",xhigh:"xhigh"},defaultEffort:"medium",compat:{thinkingFormat:"openai",supportsReasoningEffort:!0},input:["text","image"],contextWindow:105e4,maxTokens:128e3,note:"GPT-5.5 \u6863\u4F4D\uFF1ANone / Low / Medium(\u9ED8\u8BA4) / High / XHigh\uFF0C\u5E26\u56FE\u8F93\u5165\u3002pro \u53D8\u4F53\u4EC5 Medium / High(\u9ED8\u8BA4) / XHigh \u4E14\u4EC5 Responses API\u3002"},{id:"openai-gpt-5-4",patterns:["gpt-5.4"],efforts:{off:"none",low:"low",medium:"medium",high:"high",xhigh:"xhigh"},defaultEffort:"off",compat:{thinkingFormat:"openai",supportsReasoningEffort:!0},input:["text","image"],contextWindow:105e4,maxTokens:128e3,note:"GPT-5.4 \u6863\u4F4D\uFF1ANone(\u9ED8\u8BA4) / Low / Medium / High / XHigh\uFF0C\u5E26\u56FE\u8F93\u5165\u3002pro \u53D8\u4F53\u4EC5 Medium/High/XHigh\uFF1Bmini/nano \u4E3A 400K \u4E0A\u4E0B\u6587\u3002"},{id:"openai-gpt-5-3",patterns:["gpt-5.3"],efforts:{low:"low",medium:"medium",high:"high",xhigh:"xhigh"},defaultEffort:"medium",compat:{thinkingFormat:"openai",supportsReasoningEffort:!0},input:["text","image"],contextWindow:4e5,maxTokens:128e3,note:"GPT-5.3-Codex \u6863\u4F4D\uFF1ALow / Medium / High / XHigh\uFF08\u65E0 None \u6863\uFF09\uFF0C\u5E26\u56FE\u8F93\u5165\u3001400K\uFF1Bgpt-5.3-chat \u4E3A\u975E\u63A8\u7406\u804A\u5929\u6A21\u578B\uFF08\u89C1 chat \u6761\u76EE\uFF09\u3002"},{id:"openai-gpt-5-1",patterns:["gpt-5.1"],efforts:{off:"none",low:"low",medium:"medium",high:"high"},defaultEffort:"off",compat:{thinkingFormat:"openai",supportsReasoningEffort:!0},input:["text","image"],contextWindow:4e5,maxTokens:128e3,note:"GPT-5.1 \u6863\u4F4D\uFF1ANone / Low / Medium / High\uFF08\u9ED8\u8BA4 None\uFF09\u3002"},{id:"openai-gpt-5-1-codex",patterns:["gpt-5.1-codex"],efforts:{low:"low",medium:"medium",high:"high"},compat:{thinkingFormat:"openai",supportsReasoningEffort:!0},input:["text","image"],contextWindow:4e5,maxTokens:128e3,note:"GPT-5.1-Codex \u7CFB\u5217\uFF1A\u5B98\u65B9\u6A21\u578B\u9875\u672A\u5355\u5217 effort \u503C\u57DF\uFF0C\u6309\u540C\u4EE3\u4FDD\u5B88\u6863 Low / Medium / High\uFF08\u65E0 None\uFF1Bxhigh \u672A\u8BC1\u5B9E\uFF09\u3002\u5982\u7AEF\u70B9\u652F\u6301 xhigh/none \u53EF\u624B\u8C03\u3002"},{id:"openai-gpt-5",patterns:["gpt-5"],efforts:{minimal:"minimal",low:"low",medium:"medium",high:"high"},defaultEffort:"medium",compat:{thinkingFormat:"openai",supportsReasoningEffort:!0},input:["text","image"],contextWindow:4e5,maxTokens:128e3,note:"GPT-5 \u521D\u4EE3\u6863\u4F4D\uFF1AMinimal / Low / Medium / High\uFF0C\u65E0\u5173\u95ED\u6863\u3002"},{id:"openai-chat",patterns:["gpt-5.1-chat-latest","gpt-5.2-chat-latest","gpt-5.3-chat-latest","gpt-5-chat-latest","gpt-chat-latest","gpt-5-chat","gpt-5.1-chat","gpt-5.2-chat","gpt-5.3-chat"],efforts:!1,input:["text","image"],contextWindow:128e3,maxTokens:16384,note:"-chat \u7CFB\u5217\uFF08\u5B98\u65B9 id \u4E3A gpt-5.x-chat-latest\uFF09\u4E3A\u975E\u63A8\u7406\u804A\u5929\u6A21\u578B\uFF0C\u4E0D\u652F\u6301 effort \u53C2\u6570\uFF08\u52FF\u52FE\u601D\u8003\u6863\uFF09\uFF1B\u5B98\u65B9\u652F\u6301\u56FE\u7247\u8F93\u5165\uFF0C128K / 16,384 \u8F93\u51FA\u3002gpt-5-chat-latest \u5DF2\u4E8E 2026-07-23 \u4E0B\u67B6\u3001gpt-chat-latest \u5DF2\u65E0\u5B98\u65B9\u9875\u9762\uFF08\u4FDD\u7559\u6A21\u5F0F\u4F9B\u7F51\u5173\uFF09\u3002"},{id:"openai-o",patterns:["o1","o3","o4"],efforts:{low:"low",medium:"medium",high:"high"},defaultEffort:"medium",compat:{thinkingFormat:"openai",supportsReasoningEffort:!0},input:["text","image"],contextWindow:2e5,maxTokens:1e5,note:"OpenAI o \u7CFB\u6863\u4F4D\uFF1ALow / Medium / High\u3002\u5B98\u65B9\u5DF2\u4E8E 2026-06 \u516C\u544A\u9000\u5F79\uFF08o1/o1-pro/o3-mini/o4-mini 2026-10-23 \u79FB\u9664\u3001o3/o3-pro 2026-12-11\uFF09\uFF0C\u7F51\u5173\u6B8B\u7559\u4ECD\u53EF\u547D\u4E2D\uFF1B\u591A\u6570 o \u7CFB\u7AEF\u70B9\u6536\u56FE\uFF08o3-mini \u4F8B\u5916\uFF09\u3002"},{id:"openai-gpt-oss",patterns:["gpt-oss"],efforts:{low:"low",medium:"medium",high:"high"},defaultEffort:"low",compat:{thinkingFormat:"openai",supportsReasoningEffort:!0},input:["text"],contextWindow:131072,maxTokens:131072,note:"GPT-OSS \u5F00\u6E90\u6743\u91CD\uFF08Ollama/vLLM \u5E38\u89C1\uFF09\uFF1Areasoning effort Low / Medium / High\uFF0C\u7EAF\u6587\u672C\uFF0C131K \u4E0A\u4E0B\u6587 / 131K \u8F93\u51FA\u30022026-09 \u590D\u6838\uFF1A\u5B98\u65B9\u6A21\u578B\u9875\u73B0\u5728\u5199 Chat Completions = Not supported\u3001\u65E0\u56FE\u7247\u8F93\u5165\uFF08\u9ED8\u8BA4 Low \u6765\u81EA\u5B98\u65B9 CLI\uFF0C\u4E0D\u662F API \u9875\uFF09\uFF0C\u56E0\u6B64\u8FD9\u91CC\u4E0D\u518D\u58F0\u660E Off\u3002"},{id:"openai-gpt-6-astra",patterns:["gpt-6-astra","gpt-6"],efforts:{low:"low",medium:"medium",high:"high",xhigh:"xhigh",max:"max"},compat:{thinkingFormat:"openai",supportsReasoningEffort:!0},input:["text","image"],contextWindow:105e4,maxTokens:128e3,note:"GPT-6 Astra \u6863\u4F4D\uFF1ALow / Medium / High / XHigh / Max\u2014\u2014**\u6CA1\u6709 None \u6863**\uFF08\u5B98\u65B9\u539F\u6587\uFF1A\u8BBE\u4E3A none \u8FD4\u56DE HTTP 400\uFF09\uFF0C\u56E0\u6B64\u672C\u6761\u76EE\u4E0D\u58F0\u660E Off\u3002\u5E26\u56FE\u8F93\u5165\uFF0C1,050,000 \u4E0A\u4E0B\u6587 / 128,000 \u8F93\u51FA\uFF1BAI \u5B98\u65B9\u9ED8\u8BA4\u6863\u4F4D\u672A\u516C\u5E03\uFF0C\u6545\u4E0D\u586B\u3002\u5DE5\u5177\u8C03\u7528\u9700\u8D70 Responses API\u3002"},{id:"openai-gpt-5-6-cyber",patterns:["gpt-5.6-cyber"],efforts:{low:"low",medium:"medium",high:"high",xhigh:"xhigh"},compat:{thinkingFormat:"openai",supportsReasoningEffort:!0},input:["text","image"],contextWindow:4e5,maxTokens:128e3,note:"GPT-5.6-Cyber\uFF1A\u5B98\u65B9\u6A21\u578B\u9875\u672A\u5355\u5217 effort \u503C\u57DF\uFF08\u4E0D\u7B49\u4E8E\u4E0D\u652F\u6301\uFF09\uFF0C\u6545\u6309\u540C\u4EE3\u4FDD\u5B88\u6863 Low / Medium / High / XHigh\uFF1B\u8BE5\u578B\u53F7\u4EC5 Responses API\uFF0C\u5E26\u56FE\u8F93\u5165\u3001400K \u4E0A\u4E0B\u6587\u3002\u5B98\u65B9\u652F\u6301\u7684\u5176\u4ED6\u6863\u4F4D\u53EF\u624B\u8C03\u540E\u5E94\u7528\u3002"},{id:"openai-gpt-4o",patterns:["gpt-4o"],efforts:!1,input:["text","image"],contextWindow:128e3,maxTokens:16384,note:"GPT-4o \u4EE3\u9645\uFF1A\u975E\u63A8\u7406\u6A21\u578B\uFF0C\u4E0D\u652F\u6301 effort \u53C2\u6570\uFF08\u52FF\u52FE\u601D\u8003\u6863\uFF09\uFF1B\u56FE\u7247\u8F93\u5165\u5168\u7CFB\u6807\u914D\uFF0C128K / 16,384 \u8F93\u51FA\u3002"},{id:"openai-gpt-4-1",patterns:["gpt-4.1"],efforts:!1,input:["text","image"],contextWindow:1047576,maxTokens:32768,note:"GPT-4.1 \u5168\u7CFB\uFF08\u542B mini/nano\uFF09\uFF1A\u975E\u63A8\u7406\u6A21\u578B\uFF0C\u4E0D\u652F\u6301 effort \u53C2\u6570\uFF1B\u5B98\u65B9 1,047,576 \u4E0A\u4E0B\u6587 / 32,768 \u8F93\u51FA\uFF0C\u5168\u7CFB\u5E26\u56FE\u8F93\u5165\u3002"},{id:"openai-gpt-4-turbo-preview",patterns:["gpt-4-turbo-preview"],efforts:!1,input:["text"],contextWindow:128e3,maxTokens:4096,note:"GPT-4 Turbo Preview\uFF1A\u975E\u63A8\u7406\u6A21\u578B\uFF0C\u7EAF\u6587\u672C\u8F93\u5165\uFF08\u6B63\u5F0F turbo \u5FEB\u7167\u652F\u6301\u56FE\u7247\uFF0C\u89C1\u4E0B\u6761\uFF09\uFF0C128K\u3002"},{id:"openai-gpt-4-turbo",patterns:["gpt-4-turbo"],efforts:!1,input:["text","image"],contextWindow:128e3,maxTokens:4096,note:"GPT-4 Turbo\uFF1A\u975E\u63A8\u7406\u6A21\u578B\uFF0C\u5B98\u65B9\u652F\u6301\u56FE\u7247\u8F93\u5165\uFF0C128K / 4,096 \u8F93\u51FA\u3002"},{id:"openai-gpt",patterns:["gpt-4","gpt-3.5"],efforts:!1,input:["text"],note:"GPT-4/3.5 \u4EE3\u9645\uFF1A\u975E\u63A8\u7406\u6A21\u578B\uFF0C\u4E0D\u652F\u6301 effort \u53C2\u6570\uFF08\u52FF\u52FE\u601D\u8003\u6863\uFF09\u3002gpt-4-turbo/4.1 \u8D77\u652F\u6301\u56FE\u7247\uFF0C\u89C1\u5355\u72EC\u6761\u76EE\uFF1B\u65B0\u4EE3\u8BF7\u7528 GPT-5 \u7CFB\uFF08\u89C1 openai-chat/gpt-5.x \u6761\u76EE\uFF09\u3002"},{id:"anthropic-claude-5",patterns:["claude-fable-5","claude-mythos-5","claude-opus-5","claude-sonnet-5"],efforts:{low:"low",medium:"medium",high:"high",xhigh:"xhigh",max:"max"},defaultEffort:"high",compat:{supportsReasoningEffort:!0},anthropicAdaptive:!0,input:["text","image"],contextWindow:1e6,maxTokens:128e3,note:"Claude 5 \u4EE3\uFF08Fable 5 / Mythos 5 / Opus 5 / Sonnet 5\uFF09\u6863\u4F4D\uFF1ALow / Medium / High(\u9ED8\u8BA4) / XHigh / Max\uFF1BFable 5.1 \u4E0E Mythos 5.1 \u89C1\u5355\u72EC\u6761\u76EE\uFF0CMythos Preview \u4EC5\u81F3 Max\u30021M \u4E0A\u4E0B\u6587 / 128K \u8F93\u51FA\uFF08Batch 300K\uFF09\u3002\u5B98\u65B9\u652F\u6301 PDF \u8F93\u5165\u3002\u6CE8\u610F\uFF1AAnthropic \u5B98\u65B9 OpenAI \u517C\u5BB9\u5C42\u4F1A\u5FFD\u7565 effort \u53C2\u6570\uFF0C\u58F0\u660E\u5728\u7B2C\u4E09\u65B9\u7F51\u5173\u6620\u5C04\u65F6\u751F\u6548\u3002"},{id:"anthropic-claude-5-1",patterns:["claude-fable-5-1","claude-mythos-5-1"],efforts:{low:"low",medium:"medium",high:"high",xhigh:"xhigh",max:"max"},defaultEffort:"high",compat:{supportsReasoningEffort:!0},anthropicAdaptive:!0,input:["text","image"],contextWindow:1e6,maxTokens:128e3,note:"Claude Fable 5.1 / Mythos 5.1\uFF1A\u5B98\u65B9\u6863\u4F4D Low / Medium / High(\u9ED8\u8BA4) / XHigh / Max\uFF0C\u81EA\u9002\u5E94\u601D\u8003\u5E38\u5F00\uFF08\u4E0D\u63A5\u53D7 enabled/disabled\uFF09\u30021M \u4E0A\u4E0B\u6587 / 128K \u8F93\u51FA\uFF1B\u8FD9\u4E24\u578B\u4E5F\u662F\u5B98\u65B9\u552F\u4E00\u5141\u8BB8\u4F1A\u8BDD\u4E2D\u9014\u6539\u6863\u7684\uFF08\u9700 beta header\uFF0C\u672C\u63D2\u4EF6\u4E0D\u6D89\u53CA\uFF09\u3002"},{id:"anthropic-claude-mythos-preview",patterns:["claude-mythos-preview"],efforts:{low:"low",medium:"medium",high:"high",max:"max"},defaultEffort:"high",compat:{supportsReasoningEffort:!0},anthropicAdaptive:!0,input:["text","image"],contextWindow:1e6,maxTokens:128e3,note:"Claude Mythos Preview\uFF1A\u5B98\u65B9\u6863\u4F4D Low / Medium / High / Max\uFF08\u65E0 XHigh\uFF09\uFF0C1M \u4E0A\u4E0B\u6587\u3002"},{id:"anthropic-claude-opus-4-high",patterns:["claude-opus-4-8","claude-opus-4-7"],efforts:{low:"low",medium:"medium",high:"high",xhigh:"xhigh",max:"max"},defaultEffort:"high",compat:{supportsReasoningEffort:!0},anthropicAdaptive:!0,input:["text","image"],contextWindow:1e6,maxTokens:128e3,note:"Claude Opus 4.7/4.8 \u6863\u4F4D\uFF1ALow / Medium / High(\u9ED8\u8BA4) / XHigh / Max\uFF1Bxhigh \u4E3A\u5B98\u65B9\u63A8\u8350\u7684\u7F16\u7801\u8D77\u6B65\u6863\u30021M \u4E0A\u4E0B\u6587\u3002"},{id:"anthropic-claude-4-6",patterns:["claude-opus-4-6","claude-sonnet-4-6"],efforts:{low:"low",medium:"medium",high:"high",max:"max"},defaultEffort:"high",compat:{supportsReasoningEffort:!0},anthropicAdaptive:!0,input:["text","image"],contextWindow:1e6,maxTokens:128e3,note:"Claude 4.6 \u4EE3\u6863\u4F4D\uFF1ALow / Medium / High / Max\uFF08\u65E0 XHigh\u2014\u2014\u5B98\u65B9\u660E\u8A00\u300C\u652F\u6301 max \u7684\u90E8\u5206\u578B\u53F7\u4E0D\u652F\u6301 xhigh\u300D\uFF09\u30021M \u4E0A\u4E0B\u6587\u3002"},{id:"anthropic-claude-opus-4-5",patterns:["claude-opus-4-5"],efforts:{low:"low",medium:"medium",high:"high"},defaultEffort:"high",compat:{supportsReasoningEffort:!0},input:["text","image"],contextWindow:2e5,maxTokens:64e3,note:"Claude Opus 4.5\uFF1A\u5B98\u65B9 effort \u652F\u6301\u5217\u8868\uFF0820251101 \u5FEB\u7167\uFF09\uFF0C\u6863\u4F4D Low / Medium / High\uFF08\u65E0 XHigh/Max\uFF09\uFF0C\u53EF\u4E0E budget_tokens \u5E76\u7528\uFF1B200K / 64K\u3002"},{id:"anthropic-claude",patterns:["claude"],efforts:!1,input:["text","image"],contextWindow:2e5,maxTokens:64e3,note:"Claude 3.x \u4E0E Sonnet 4.5 / Haiku 4.5\uFF1A\u5B98\u65B9 effort \u53C2\u6570\u4E0D\u652F\u6301\uFF08\u4EC5 Fable/Mythos 5\u3001Opus 5/4.6-4.8\u3001Sonnet 5/4.6\u3001Opus 4.5 \u652F\u6301\uFF09\uFF0C\u601D\u8003\u7531 thinking.type \u63A7\u5236\u2014\u2014\u52FF\u52FE\u601D\u8003\u6863\u3002\u53C2\u8003\u5BB9\u91CF 200K / 64K\uFF08Haiku 3.5 \u4E3A\u7EAF\u6587\u672C\uFF0C\u6309\u9700\u53D6\u6D88\u56FE\u7247\uFF09\u3002"},{id:"google-gemini",patterns:["gemini"],efforts:{low:"low",medium:"medium",high:"high"},compat:{thinkingFormat:"openai",supportsReasoningEffort:!0},input:["text","image"],contextWindow:1048576,maxTokens:65536,note:"Gemini \u901A\u7528\u5B89\u5168\u6863\uFF1ALow / Medium / High\uFF08\u5B98\u65B9 OpenAI \u517C\u5BB9\u6620\u5C04\u8868\u53E6\u6536 minimal\uFF1A2.5 \u7CFB\u6620\u5C04\u4E3A 1,024 \u9884\u7B97\u30013.1 Flash-Lite/3 Flash \u539F\u751F minimal\u30013.1 Pro \u843D low\uFF09\u3002none \u4EC5\u80FD\u5173 2.5 \u975E Pro\uFF1B2.5 Pro \u4E0E 3 \u4EE3\u4E0D\u53EF\u5173\uFF1B\u5404\u578B\u9ED8\u8BA4\u4E0D\u4E00\uFF08flash-lite \u9ED8\u8BA4\u5173\uFF09\u3002\u5B98\u65B9\u53E6\u6536\u97F3\u9891/\u89C6\u9891/PDF\u3002"},{id:"xai-grok-4-7",patterns:["grok-4.7"],efforts:{low:"low",medium:"medium",high:"high",xhigh:"xhigh"},compat:{thinkingFormat:"openai",supportsReasoningEffort:!0},input:["text","image"],contextWindow:5e5,note:'Grok 4.7\uFF08\u4E0A\u6E38\u5FEB\u7167 grok-4.7-20260916\uFF09\uFF1A\u6863\u4F4D Low / Medium / High / XHigh\u2014\u2014**\u53D6\u81EA\u516C\u5F00\u76EE\u5F55**\uFF08OpenRouter \u7684 supported_parameters\u3001models.dev \u5BF9 docs.x.ai \u7684\u8F6C\u8FF0\uFF09\uFF0C\u672C\u6B21 xAI \u5B98\u65B9\u6587\u6863\u7AD9\u4E0D\u53EF\u8FBE\u3001\u672A\u80FD\u4E00\u624B\u8BC1\u5B9E\uFF1B\u9ED8\u8BA4\u6863\u4F4D\u4E0E"\u80FD\u5426\u5173\u95ED\u601D\u8003"\u540C\u6837\u672A\u8BC1\u5B9E\uFF0C\u6545\u4E0D\u58F0\u660E Off\uFF0C\u4E5F\u4E0D\u5199\u9ED8\u8BA4\u6863\u3002\u5E26\u56FE\u8F93\u5165\uFF08\u76EE\u5F55\u8BB0 text+image+file\uFF0CPDF \u5B58\u7591\uFF09\uFF0C500K \u4E0A\u4E0B\u6587\uFF1B\u6700\u5927\u8F93\u51FA\u5404\u76EE\u5F55\u7ED9\u51FA 450K \u4E0E 500K \u4E24\u79CD\u503C\uFF0C\u6309"\u5206\u6B67\u5373\u4E0D\u5199"\u5904\u7406\u30022026-08 \u90A3\u6B21"grok-4.7 \u4E0D\u5B58\u5728\uFF08\u5B98\u65B9 404\uFF09"\u7684\u7ED3\u8BBA\u5DF2\u968F\u53D1\u5E03\u4F5C\u5E9F\u3002'},{id:"xai-grok-high",patterns:["grok-4.6"],efforts:{low:"low",medium:"medium",high:"high",xhigh:"xhigh"},defaultEffort:"high",compat:{thinkingFormat:"openai",supportsReasoningEffort:!0},input:["text","image"],contextWindow:5e5,note:'Grok 4.6 \u6863\u4F4D\uFF1ALow / Medium / High(\u9ED8\u8BA4) / XHigh\uFF0C\u601D\u8003\u4E0D\u53EF\u5173\u95ED\uFF1B\u5E26\u56FE\u8F93\u5165\u3001500K \u4E0A\u4E0B\u6587\u3002Grok 4.7 \u89C1\u4E0A\u4E00\u6761\uFF08\u6B64\u524D\u8BB0\u4E3A"\u4E0D\u5B58\u5728"\uFF0C\u5DF2\u968F\u53D1\u5E03\u4F5C\u5E9F\uFF09\u3002'},{id:"xai-grok-4-5",patterns:["grok-4.5"],efforts:{low:"low",medium:"medium",high:"high"},defaultEffort:"high",compat:{thinkingFormat:"openai",supportsReasoningEffort:!0},input:["text","image"],contextWindow:5e5,note:"Grok 4.5 \u6863\u4F4D\uFF1ALow / Medium / High(\u9ED8\u8BA4)\uFF0C\u601D\u8003\u4E0D\u53EF\u5173\u95ED\uFF1B\u5E26\u56FE\u8F93\u5165\u3002\u4F20\u5165 xhigh \u4F1A\u88AB\u5B98\u65B9\u9759\u9ED8\u6309 High \u5904\u7406\u3002"},{id:"xai-grok-4-3",patterns:["grok-4.3"],efforts:{off:"none",low:"low",medium:"medium",high:"high",xhigh:"xhigh"},defaultEffort:"low",compat:{thinkingFormat:"openai",supportsReasoningEffort:!0},input:["text","image"],contextWindow:1e6,note:"Grok 4.3\uFF1A\u5B98\u65B9\u56DB\u7EA7 reasoning effort\uFF08None / Low / Medium / High\uFF09\uFF0C1M \u4E0A\u4E0B\u6587\u3001\u5E26\u56FE\u8F93\u5165\uFF1Bgrok-4-fast \u7B49\u65E7 slug 2026-05-15 \u8D77\u81EA\u52A8\u91CD\u5B9A\u5411\u5230\u672C\u578B\u53F7\u3002"},{id:"xai-grok",patterns:["grok"],efforts:{low:"low",medium:"medium",high:"high"},compat:{thinkingFormat:"openai",supportsReasoningEffort:!0},input:["text"],note:"Grok \u901A\u7528\u6863\u4F4D\uFF1ALow / Medium / High\u3002\u521D\u4EE3 grok-4\u3001grok-4.20 \u4E0E grok-build-0.1 \u4E0D\u63A5\u53D7\u8BE5\u53C2\u6570\uFF08grok-4 \u7CFB\u4E0E grok-3 \u5DF2\u4E8E 2026-05-15 \u9000\u5F79\u5E76\u91CD\u5B9A\u5411\u81F3 4.3\uFF09\uFF1Bgrok-4.20-multi-agent \u7684\u56DB\u6863\u63A7\u5236\u7684\u662F agent \u6570\u91CF\u800C\u975E\u601D\u8003\u6DF1\u5EA6\u3002\u65B0\u65E7\u4EE3\u9645\u8BF7\u4F18\u5148\u9009 4.5/4.6/4.3\uFF1B\u591A\u6A21\u6001\u53D8\u4F53\u6309\u9700\u52FE\u9009\u56FE\u7247\u3002"},{id:"mistral-magistral",patterns:["magistral"],efforts:!1,input:["text"],contextWindow:32768,maxTokens:32768,note:"Magistral \u539F\u751F\u601D\u8003\u7EBF\uFF08\u65E0 effort \u53C2\u6570\uFF0C\u4E3A prompt_mode \u8BED\u4E49\uFF09\uFF0C\u5B98\u65B9\u5DF2\u4E8E 2026-07-28 \u58F0\u660E\u5F03\u7528\u3001\u9010\u6B65\u64A4\u51FA\uFF1B\u73B0\u5F79\u63A8\u7406\u8D70 mistral-small-2603 / mistral-medium-3-5 \u7684 reasoning_effort\uFF08\u89C1\u4E0B\u6761\uFF09\u3002"},{id:"mistral-medium-3",patterns:["mistral-medium-3.5","mistral-small-latest","mistral-small-2603"],efforts:{off:"none",high:"high"},defaultEffort:"off",compat:{thinkingFormat:"openai",supportsReasoningEffort:!0},input:["text","image"],note:"Mistral \u73B0\u5F79\u63A8\u7406\u6863\uFF1ANone / High\u2014\u2014\u5B98\u65B9 reasoning_effort \u679A\u4E3E\uFF08mistral-common \u534F\u8BAE\u5E93\uFF09\u5373 none/high\uFF1Bmistral-small-2603\uFF08Small 4\uFF09\u4E0E mistral-medium-3-5 \u7ECF\u5B83\u63A7\u5236\uFF0CMedium 3.5 \u5E26\u89C6\u89C9\u3002\u5BB9\u91CF\u672A\u5728\u5B98\u65B9\u76EE\u5F55\u9875\u5355\u5217\uFF0C\u4E0D\u63D0\u4F9B\u3002"},{id:"qwen-vision",patterns:["qwen-vl","qwen2-vl","qwen2-5-vl","qwen3-vl","qvq"],efforts:{off:null,high:"high"},defaultEffort:"high",compat:{thinkingFormat:"qwen"},input:["text","image"],contextWindow:131072,maxTokens:8192,note:"\u901A\u4E49\u89C6\u89C9\u7EBF\uFF08Qwen-VL/QvQ\uFF09\uFF1Aenable_thinking \u5F00\u5173\uFF08\u5F00=High\uFF09\uFF0C\u6536\u56FE\u3002qwen3-vl \u5BB9\u91CF\u66F4\u5927\uFF0C\u6309\u9700\u4E0A\u8C03\u3002"},{id:"qwen-3-8",patterns:["qwen3.8"],efforts:{off:null,low:"low",medium:"medium",xhigh:"xhigh"},defaultEffort:"xhigh",compat:{thinkingFormat:"qwen",supportsReasoningEffort:!0},input:["text","image"],contextWindow:1e6,note:"Qwen 3.8 \u7CFB\uFF1A\u5B98\u65B9 reasoning_effort \u6863\u4F4D XHigh(\u9ED8\u8BA4) / Medium / Low\uFF0Cthinking \u9ED8\u8BA4\u5F00\u3001\u53EF\u6309\u8BF7\u6C42\u5173\u95ED\uFF1B\u539F\u751F\u591A\u6A21\u6001\uFF08qwen3.8-max \u56FE\u50CF/\u89C6\u9891\u7406\u89E3\uFF0C\u89C6\u9891\u672A\u5165\u6838\u5FC3\u8BCD\u8868\uFF09\u30021M \u6863\u4E0A\u4E0B\u6587\u300227B \u4E0E Flash-Next \u5F00\u6E90\u6B3E\u89C1\u5355\u72EC\u6761\u76EE\u3002"},{id:"qwen-3-8-27b",patterns:["qwen3.8-27b"],efforts:{off:null,low:"low",medium:"medium",xhigh:"xhigh"},defaultEffort:"xhigh",compat:{thinkingFormat:"qwen",supportsReasoningEffort:!0},input:["text","image"],contextWindow:262144,note:"Qwen3.8-27B\uFF08dense\uFF0C2026-08-14 \u5F00\u6E90\uFF09\uFF1A\u5B98\u65B9 reasoning_effort \u6863\u4F4D XHigh(\u9ED8\u8BA4) / Medium / Low\uFF0Cthinking \u9ED8\u8BA4\u5F00\u3001\u53EF\u6309\u8BF7\u6C42\u5173\uFF1B\u539F\u751F\u56FE\u50CF+\u89C6\u9891\u7406\u89E3\uFF08\u89C6\u9891\u672A\u5165\u6838\u5FC3\u8BCD\u8868\uFF09\u3002262,144 \u539F\u751F\u4E0A\u4E0B\u6587\u3001\u5B98\u65B9\u58F0\u660E\u53EF\u6269\u81F3 1M\u3002\u6765\u6E90\uFF1AHF Qwen/Qwen3.8-27B \u6A21\u578B\u5361\u3002"},{id:"qwen-3-8-flash-next",patterns:["qwen3.8-flash-next"],efforts:{off:null,low:"low",medium:"medium",xhigh:"xhigh"},defaultEffort:"xhigh",compat:{thinkingFormat:"qwen",supportsReasoningEffort:!0},input:["text","image"],contextWindow:262144,note:"Qwen3.8-Flash-Next\uFF08125B-A6B \u5B9E\u9A8C\u67B6\u6784\uFF0CQwen4 \u524D\u8EAB\uFF09\uFF1A\u5B98\u65B9 reasoning_effort \u6863\u4F4D XHigh(\u9ED8\u8BA4) / Medium / Low + enable_thinking \u5F00\u5173\uFF1B\u539F\u751F\u89C6\u89C9\uFF08Vision Encoder\uFF09\u3002262,144 \u539F\u751F\u4E0A\u4E0B\u6587\u3001\u53EF\u6269\u81F3 1M\u3002\u6765\u6E90\uFF1AHF \u6A21\u578B\u5361\u4E0E qwen.ai \u5B98\u65B9\u535A\u5BA2\u3002"},{id:"qwen",patterns:["qwen","qwq"],efforts:{off:null,high:"high"},defaultEffort:"high",compat:{thinkingFormat:"qwen"},input:["text"],contextWindow:1e6,maxTokens:65536,note:"\u901A\u4E49\u5343\u95EE\uFF1Aenable_thinking \u5F00\u5173\uFF08\u65E0 effort \u6863\uFF09\uFF0C\u5F00=High\uFF1B\u73B0\u5F79\u65D7\u8230\u4E3A qwen3.8 \u7CFB\uFF081M \u6863\u4E0A\u4E0B\u6587\uFF0C\u89C1 qwen-3-8 \u6761\u76EE\uFF09\u30023.6/3.7 \u4EE3\u7684 Plus/Flash \u4EA6\u9ED8\u8BA4\u591A\u6A21\u6001\uFF08\u56FE\u7247/\u89C6\u9891\uFF09\uFF0C\u5982\u63A5\u5165\u8BF7\u6309\u9700\u52FE\u9009\u56FE\u7247\uFF1B\u89C6\u89C9\u7EBF\u89C1 qwen-vision \u6761\u76EE\u3002"},{id:"glm-vision",patterns:["glm-4v","glm-4-6v","glm-4-5v","glm-5v"],efforts:{off:null,high:"high"},defaultEffort:"high",compat:{thinkingFormat:"zai"},input:["text","image"],contextWindow:131072,maxTokens:32768,note:"\u667A\u8C31\u89C6\u89C9\u7EBF\uFF08GLM-4V/4.5V/4.6V/5V\uFF09\uFF1Athinking \u5F00\u5173\uFF08\u5F00=High\uFF09\uFF0C\u6536\u56FE\u3002GLM-4.5V \u4E3A\u5F3A\u5236\u601D\u8003\uFF08\u4F20 disabled \u62A5\u9519\uFF0C\u8BF7\u624B\u52A8\u5220 Off \u6863\uFF09\u3002"},{id:"glm-5-3-flash",patterns:["glm-5.3-flash"],efforts:{low:"low",high:"high",max:"max"},defaultEffort:"max",compat:{thinkingFormat:"zai",supportsReasoningEffort:!0},input:["text","image"],contextWindow:1048576,maxTokens:131072,note:"GLM-5.3-Flash\uFF08320B\uFF0C\u5B98\u65B9\u6587\u6863 vlm \u5206\u7C7B\uFF09\uFF1A\u5F3A\u5236\u601D\u8003\uFF08thinking.type \u4EC5 enabled\uFF0C\u4E0D\u652F\u6301\u5173\u95ED\uFF09\uFF0C\u6587\u672C\u53C2\u6570\u4E0E GLM-5.3 \u4E00\u81F4\u2014\u2014\u6863\u4F4D Low / High / Max\u3002\u8F93\u5165\u6A21\u6001\uFF1A\u89C6\u9891\u3001\u56FE\u50CF\u3001\u6587\u672C\u3001\u6587\u4EF6\uFF08\u89C6\u9891/\u6587\u4EF6\u672A\u5165\u6838\u5FC3\u8BCD\u8868\uFF0C\u56FE\u7247\u53EF\u52FE\uFF09\u3002\u5B98\u65B9 1M \u4E0A\u4E0B\u6587 / 128K \u6700\u5927\u8F93\u51FA\u3002\u6765\u6E90\uFF1Adocs.bigmodel.cn \u6A21\u578B\u9875\u3002"},{id:"glm-5-3",patterns:["glm-5.3"],efforts:{low:"low",high:"high",max:"max"},defaultEffort:"max",compat:{thinkingFormat:"zai",supportsReasoningEffort:!0},input:["text"],contextWindow:1048576,maxTokens:131072,note:"GLM-5.3 \u6863\u4F4D\uFF1ALow / High / Max\uFF08\u5F3A\u5236\u601D\u8003\uFF0C\u5176\u4F59\u503C\u62A5\u9519\uFF09\u3002\u5B98\u65B9\u5BB9\u91CF 1M / 128K\u3002"},{id:"glm-5-2",patterns:["glm-5.2"],efforts:{off:"none",minimal:"minimal",low:"low",medium:"medium",high:"high",xhigh:"xhigh",max:"max"},defaultEffort:"max",compat:{thinkingFormat:"zai",supportsReasoningEffort:!0},input:["text"],contextWindow:1048576,maxTokens:131072,note:"GLM-5.2 \u6863\u4F4D\uFF1ANone / Minimal / Low / Medium / High / XHigh / Max\uFF08\u5B98\u65B9\u6620\u5C04\uFF1ALow\xB7Medium\u2192High\u3001XHigh\u2192Max\u3001None\xB7Minimal=\u505C\u6B62\u601D\u8003\uFF09\u3002\u89C6\u89C9\u7EBF\u89C1 glm-vision \u6761\u76EE\u3002"},{id:"glm",patterns:["glm","zhipu","chatglm"],efforts:{off:null,high:"high"},defaultEffort:"high",compat:{thinkingFormat:"zai"},input:["text"],note:"GLM \u901A\u7528\uFF1Athinking \u5F00\u5173\uFF08\u65E0 effort \u6863\uFF09\uFF0C\u5F00=High\uFF1Beffort \u9636\u68AF\u4EC5 GLM-5.2+ \u652F\u6301\uFF08\u89C1\u4E0A\u4E24\u6761\u76EE\uFF09\u3002\u6CE8\u610F GLM-4.7/GLM-4.5V \u4E3A\u5F3A\u5236\u601D\u8003\uFF0C\u4F20 disabled \u4F1A\u62A5\u9519\uFF08\u8BF7\u624B\u52A8\u5220 Off \u6863\uFF09\u3002\u89C6\u89C9\u7EBF\u89C1 glm-vision \u6761\u76EE\u3002"},{id:"kimi-k3",patterns:["kimi-k3"],efforts:{low:"low",high:"high",max:"max"},defaultEffort:"max",compat:{thinkingFormat:"openai",supportsReasoningEffort:!0},input:["text","image"],contextWindow:1048576,note:"Kimi K3 \u6863\u4F4D\uFF1ALow / High / Max(\u9ED8\u8BA4 Max)\uFF0C\u8D70\u9876\u5C42 reasoning_effort\uFF1B\u59CB\u7EC8\u63A8\u7406\u3001\u52FF\u4F20 thinking \u5BF9\u8C61\u3002\u539F\u751F\u89C6\u89C9\u7406\u89E3\uFF0C1M \u4E0A\u4E0B\u6587\uFF08\u6700\u5927\u8F93\u51FA\u5B98\u65B9\u672A\u5355\u72EC\u5217\uFF0C\u4E0D\u63D0\u4F9B\uFF09\u3002"},{id:"kimi-k2-vision",patterns:["kimi-k2.6","kimi-k2.5"],efforts:{off:null,high:"high"},defaultEffort:"high",compat:{thinkingFormat:"deepseek"},input:["text","image"],contextWindow:262144,note:"Kimi K2.5/K2.6 \u89C6\u89C9\u4EE3\uFF1Athinking.type \u5F00\u5173\uFF08\u9ED8\u8BA4\u5F00\u3001\u53EF\u5173\uFF09\uFF0C\u5F00=High\uFF1B\u5E26\u89C6\u89C9\uFF0C256K\u3002K2.7 Code \u59CB\u7EC8\u601D\u8003\uFF0C\u89C1\u5355\u72EC\u6761\u76EE\u3002"},{id:"kimi-k27-code",patterns:["kimi-k2.7"],efforts:{high:"high"},defaultEffort:"high",compat:{thinkingFormat:"deepseek"},input:["text","image"],contextWindow:262144,note:"Kimi K2.7 Code\uFF08\u542B\u9AD8\u901F\u7248\uFF09\uFF1A\u59CB\u7EC8\u601D\u8003\u2014\u2014thinking.type \u4EC5\u63A5\u53D7 enabled\uFF08\u4F20 disabled \u62A5\u9519\uFF09\uFF0C\u65E0 Off \u6863\uFF1B\u5E26\u89C6\u89C9\uFF0C256K\u3002"},{id:"kimi-moonshot-v1-vision",patterns:["moonshot-v1-8k-vision","moonshot-v1-32k-vision","moonshot-v1-128k-vision"],efforts:!1,input:["text","image"],note:"Moonshot V1 \u89C6\u89C9\u65E7\u4EE3\uFF088k/32k/128k \u5404\u4E00\uFF09\uFF1A\u65E0\u601D\u8003\u63A7\u4EF6\uFF08\u751F\u6210\u6A21\u578B\uFF09\u3001\u652F\u6301\u56FE\u7247\u8F93\u5165\uFF1B\u8BE5\u7EBF\u5DF2\u505C\u6B62\u5BF9\u65B0\u7528\u6237\u5F00\u653E\uFF082026-08-31 \u5168\u91CF\u4E0B\u7EBF\uFF0C\u7F51\u5173\u6B8B\u7559\u4ECD\u53EF\u547D\u4E2D\uFF09\u3002"},{id:"kimi",patterns:["kimi","moonshot"],efforts:{off:null,high:"high"},compat:{thinkingFormat:"deepseek"},input:["text"],contextWindow:262144,note:"Kimi \u901A\u7528\uFF1Athinking \u5F00\u5173\uFF08\u65E0 effort \u6863\uFF09\uFF0C\u5F00=High\u3002k2 \u7CFB\u5217 2026-05-25 \u4E0B\u7EBF\u3001kimi-latest 2026-01-28 \u4E0B\u7EBF\u3001moonshot-v1 \u7CFB 2026-08-31 \u5168\u91CF\u4E0B\u7EBF\uFF08\u7F51\u5173\u6B8B\u7559\u4ECD\u53EF\u547D\u4E2D\uFF1Bmoonshot-v1 \u672C\u8EAB\u975E\u601D\u8003\u6A21\u578B\uFF09\u3002\u89C6\u89C9\u4EE3\u4E0E K2.7 Code \u89C1\u5355\u72EC\u6761\u76EE\u3002"},{id:"hunyuan-hy3",patterns:["hy3"],efforts:{low:"low",high:"high"},compat:{thinkingFormat:"openai",supportsReasoningEffort:!0},input:["text"],contextWindow:262144,note:"\u6DF7\u5143 hy3\uFF1A\u5F00\u6E90\u5951\u7EA6\u7ECF chat_template_kwargs.reasoning_effort = no_think(\u9ED8\u8BA4)/low/high\uFF1B\u5B98\u65B9\u6A21\u578B\u5361 256K \u4E0A\u4E0B\u6587\uFF08295B MoE\uFF0C2026 \u5F00\u6E90\uFF09\u3002"},{id:"hunyuan-hy4",patterns:["hy4-preview","hy-4-preview"],efforts:{off:"no_think",high:"high"},defaultEffort:"high",compat:{thinkingFormat:"openai",supportsReasoningEffort:!0},contextWindow:1e6,note:"\u6DF7\u5143 Hy4 preview\uFF1A\u5B98\u65B9 README\u2014\u2014reasoning \u9ED8\u8BA4 high\uFF08\u6DF1\u5EA6\u601D\u8003\uFF09\uFF0C\u5173\u95ED\u7ECF chat_template_kwargs.reasoning_effort=no_think\uFF1B\u5B98\u65B9\u89C4\u683C\u8868 1M \u4E0A\u4E0B\u6587\uFF08770B-A49B MoE\uFF0CGated DSA\uFF09\u3002low \u6863\u5B98\u65B9\u672A\u5217\uFF0C\u5982\u6709\u8BF7\u624B\u8C03\uFF1B\u89C6\u89C9\u672A\u58F0\u660E\uFF0C\u6309\u9700\u624B\u52FE\u3002\u6765\u6E90\uFF1ATencent-Hunyuan/Hy4-preview \u5B98\u65B9 README\u3002"},{id:"step-5-preview",patterns:["step-5"],efforts:{low:"low",medium:"medium",high:"high"},defaultEffort:"medium",compat:{thinkingFormat:"openai",supportsReasoningEffort:!0},input:["text","image"],contextWindow:1e6,maxTokens:65536,note:'\u9636\u8DC3 Step-5-Preview\uFF08\u5B98\u65B9 id \u5373 step-5-preview\uFF0C\u65E0\u88F8 step-5\uFF1Bpattern \u53D6\u5BB6\u65CF\u4E3B\u5E72\u4EE5\u517C\u5BB9\u7F51\u5173\u5199\u6CD5\uFF09\uFF1A\u6863\u4F4D Low / Medium(\u5B98\u65B9\u6807"\u9ED8\u8BA4\u63A8\u8350") / High\uFF0C\u601D\u8003\u4E0D\u53EF\u5173\u95ED\uFF1B\u539F\u751F\u56FE\u7247 + \u89C6\u9891\u8F93\u5165\uFF1B1M \u4E0A\u4E0B\u6587\u300164K \u6700\u5927\u8F93\u51FA\uFF08\u5B98\u65B9\u53E6\u6CE8 max_tokens \u9ED8\u8BA4 INF\u3001\u4E0E 64K \u4E0A\u9650\u5E76\u5B58\uFF0C\u4EE5\u7AEF\u70B9\u5B9E\u6D4B\u4E3A\u51C6\uFF09\u3002'},{id:"step-3-7",patterns:["step-3.7","step-3.6"],efforts:{low:"low",medium:"medium",high:"high"},defaultEffort:"medium",compat:{thinkingFormat:"openai",supportsReasoningEffort:!0},input:["text","image"],contextWindow:262144,note:"\u9636\u8DC3 Step-3.6/3.7 \u6863\u4F4D\uFF1ALow / Medium(\u9ED8\u8BA4\u63A8\u8350) / High\uFF0C\u539F\u751F\u56FE\u7247+\u89C6\u9891\u7406\u89E3\u3002\u4E0A\u4E0B\u6587\u4E3A\u8F93\u5165+\u8F93\u51FA\u603B\u548C\u4E0A\u9650\u3002"},{id:"step-3-5",patterns:["step-3.5"],efforts:{low:"low",high:"high"},compat:{thinkingFormat:"openai",supportsReasoningEffort:!0},input:["text"],contextWindow:262144,note:"\u9636\u8DC3 Step-3.5 Flash \u6863\u4F4D\uFF1ALow / High\uFF08\u7EAF\u6587\u672C\u63A8\u7406\u65D7\u8230\uFF09\u3002\u4E0A\u4E0B\u6587\u4E3A\u8F93\u5165+\u8F93\u51FA\u603B\u548C\u4E0A\u9650\u3002"},{id:"step",patterns:["step-3","step-2"],efforts:{low:"low",medium:"medium",high:"high"},defaultEffort:"medium",compat:{thinkingFormat:"openai",supportsReasoningEffort:!0},input:["text"],note:"\u9636\u8DC3 Step \u6863\u4F4D\uFF1ALow / Medium / High\uFF08\u9ED8\u8BA4 Medium\uFF0C\u4E0D\u53EF\u5173\u95ED\uFF09\u30023.6/3.7 \u89C6\u89C9\u4EE3\u89C1\u5355\u72EC\u6761\u76EE\u3002"},{id:"doubao",patterns:["doubao","seed"],efforts:{off:null,low:"low",medium:"medium",high:"high"},compat:{thinkingFormat:"openai",supportsReasoningEffort:!0},input:["text","image"],note:"\u8C46\u5305\u6863\u4F4D\uFF1AOff / Low / Medium / High\u2014\u2014effort \u9636\u68AF\u4ECD\u662F\u793E\u533A\u8BC1\u636E\u3001\u5B98\u65B9 Ark \u6587\u6863\u660E\u5217\u7684\u4E3A thinking.type \u5F00\u5173\uFF082026-08-24 \u590D\u6838\u4ECD\u672A\u89C1\u5230 effort \u5B98\u65B9\u660E\u6587\uFF09\u3002seed \u4EE3\u6536\u56FE\uFF081.5-pro \u4F8B\u5916\uFF09\u3002"},{id:"minimax-m3",patterns:["minimax-m3"],efforts:{off:null,high:"high"},compat:{thinkingFormat:"deepseek"},input:["text","image"],contextWindow:1048576,note:"MiniMax-M3\uFF1A\u5B98\u65B9 thinking \u53C2\u6570 enabled/adaptive/disabled\uFF08\u65E0 effort \u6863\uFF09\uFF0C\u5F00=High\u3001\u5173=disabled\uFF1B\u539F\u751F\u591A\u6A21\u6001\uFF08\u56FE/\u89C6\u9891\uFF0C\u6838\u5FC3\u8BCD\u8868\u4EC5\u542B\u56FE\uFF09\uFF0C1M \u4E0A\u4E0B\u6587\u3002"},{id:"mimo-v2-6",patterns:["mimo-v2.6","mimo-v2.5"],efforts:{off:"none",low:"low",medium:"medium",high:"high"},compat:{thinkingFormat:"openai",supportsReasoningEffort:!0},input:["text","image"],contextWindow:1048576,maxTokens:131072,note:"\u5C0F\u7C73 MiMo v2.6 \u7CFB\u5217\uFF08mimo-v2.6-pro / -flash / -pro-ultraspeed\uFF1B1M \u4E0A\u4E0B\u6587 / 128K \u6700\u5927\u8F93\u51FA\u3001\u539F\u751F\u5168\u6A21\u6001\uFF09\u4E0E\u5176\u524D\u4EE3 mimo-v2.5\u3002\u5B98\u65B9\u6587\u6863\uFF1Athinking.type\uFF08enabled/disabled\uFF0C\u9ED8\u8BA4 enabled\uFF09+ reasoning.effort\uFF08none \u5173\u95ED\uFF1B\u5176\u4F59\u5408\u6CD5\u503C\u5747\u5F00\u542F\uFF0C\u4E14**\u73B0\u9636\u6BB5\u6682\u672A\u533A\u5206\u63A8\u7406\u5F3A\u5EA6**\u2014\u2014minimal \u5F52\u4E00\u4E3A low\u3001xhigh/max/ultra \u5F52\u4E00\u4E3A high\uFF09\uFF0C\u56E0\u6B64\u8FD9\u91CC\u58F0\u660E\u7684\u662F\u7AEF\u70B9**\u63A5\u53D7**\u7684\u6863\u4F4D Off / Low / Medium / High\uFF08xhigh\u3001max \u4E0D\u58F0\u660E\uFF0C\u7AEF\u70B9\u53EA\u4F1A\u6298\u53E0\u4E3A high\uFF09\u3002\u601D\u8003\u6A21\u5F0F\u4E0B temperature / top_p \u4E0D\u53EF\u81EA\u5B9A\u4E49\uFF08\u5F3A\u5236 1.0 / 0.95\uFF09\uFF1B\u5E26\u5DE5\u5177\u8C03\u7528\u7684\u5386\u53F2\u8F6E\u5FC5\u987B\u5B8C\u6574\u56DE\u4F20 reasoning_content\uFF0C\u5426\u5219 400\u3002mimo-v2.5 \u4E0E v2.5-pro \u5B98\u65B9\u5B9A\u4E8E 2026-10-21 \u4E0B\u7EBF\u3002"},{id:"mimo-v2-5-pro",patterns:["mimo-v2.5-pro"],efforts:{off:"none",low:"low",medium:"medium",high:"high"},compat:{thinkingFormat:"openai",supportsReasoningEffort:!0},input:["text"],contextWindow:1048576,maxTokens:131072,note:"\u5C0F\u7C73 MiMo v2.5-Pro\uFF1A\u8BE5\u5BB6\u65CF\u552F\u4E00\u7684**\u7EAF\u6587\u672C**\u6210\u5458\uFF08\u5B98\u65B9\u80FD\u529B\u8868\u672A\u5217\u5168\u6A21\u6001\u7406\u89E3\uFF09\uFF0C1M \u4E0A\u4E0B\u6587 / 128K \u6700\u5927\u8F93\u51FA\uFF0C\u63A8\u7406\u5951\u7EA6\u4E0E v2.6 \u7CFB\u5217\u76F8\u540C\uFF08thinking.type + reasoning.effort\uFF0Cnone \u5173\u95ED\u3001\u5176\u4F59\u6863\u4F4D\u6682\u4E0D\u533A\u5206\u5F3A\u5EA6\uFF09\u3002\u5B98\u65B9\u5B9A\u4E8E 2026-10-21 \u4E0B\u7EBF\u3002"},{id:"baidu-ernie",patterns:["ernie"],efforts:!1,input:["text"],contextWindow:131072,note:"\u767E\u5EA6\u5343\u5E06 ERNIE \u7CFB\uFF1A\u5B98\u65B9 OpenAI \u517C\u5BB9\u63A5\u53E3\u65E0 reasoning_effort \u53C2\u6570\u2014\u2014\u601D\u8003\u7531\u6A21\u578B\u53D8\u4F53\u51B3\u5B9A\uFF08-Thinking \u7CFB\u5217\u59CB\u7EC8\u601D\u8003\u3001\u666E\u901A\u7CFB\u5217\u4E0D\u601D\u8003\uFF09\uFF0C\u52FF\u52FE\u601D\u8003\u6863\u3002ERNIE 4.5 Turbo VL \u652F\u6301\u56FE\u7247\uFF0C\u6309\u9700\u624B\u52FE\uFF1B\u53C2\u8003\u5BB9\u91CF\u53D6 Turbo 128K \u6863\u3002"}],Zn={off:null,low:"low",medium:"medium",high:"high"},Ja={"openai-completions":Zn,"openai-responses":Zn,"anthropic-messages":Zn,deepseek:{off:"none",low:"low",high:"high",max:"max"}},Xa={low:"low",medium:"medium",high:"high"};function wt(e){return(e??"").toLowerCase().trim()}function No(e){return e!==void 0&&/[a-z0-9]/.test(e)}function yt(e){return e.toLowerCase().trim().replace(/[^a-z0-9]+/g," ")}function Co(e,t,n){let r=t===0?void 0:e[t-1],o=e[t+n];return!No(r)&&!No(o)}function tr(e,t){let n=yt(e)+" "+yt(t??""),r;for(let o of Ya)for(let i of o.patterns){let s=yt(i),a=n.indexOf(s);for(;a>=0;){if(Co(n,a,s.length)){(r===void 0||s.length>r.length)&&(r={entry:o,length:s.length});break}a=n.indexOf(s,a+1)}}return r?.entry}var Qa={"deepseek.com":"deepseek","anthropic.com":"anthropic-messages"};function Za(e){let t=wt(e.api);if(t.length>0)return t;let n=e.baseURL;if(n!==void 0&&n.length>0)try{let o=new URL(n).hostname.toLowerCase().split(".");if(o.length>=2){let i=Qa[o.slice(-2).join(".")];if(i!==void 0)return i}}catch{}return"openai-completions"}var Jt="openai-completions",Fo="anthropic-messages";function er(e){if(e===void 0||e.length===0)return!1;let t="";try{t=new URL(e).hostname.toLowerCase()}catch{return!1}return t==="localhost"||t==="::1"||t.endsWith(".local")||t.endsWith(".internal")||/^(127\.|10\.|192\.168\.)/.test(t)||/^172\.(1[6-9]|2[0-9]|3[01])\./.test(t)?!0:t.includes(":")}function ed(e,t){let n=wt(t),r={...e};if(delete r.supportsMidConvoEffort,delete r.allowedFallbackModels,n===Fo){for(let o of["thinkingFormat","supportsReasoningEffort","thinkingTokenBudgetField","supportsThinkingTokenBudget","vllmPriority","supportsMaxOutputTokens"])delete r[o];return r.forceAdaptiveThinking===void 0?void 0:{forceAdaptiveThinking:r.forceAdaptiveThinking}}if(n==="openai-responses"){for(let o of["thinkingFormat","supportsReasoningEffort","thinkingTokenBudgetField","supportsThinkingTokenBudget","vllmPriority"])delete r[o];return r.supportsMaxOutputTokens===void 0?void 0:{supportsMaxOutputTokens:r.supportsMaxOutputTokens}}if(n===Jt)return delete r.forceAdaptiveThinking,delete r.supportsMaxOutputTokens,Object.keys(r).length===0?void 0:r}function td(e,t){let n=wt(t.api);if(n===Jt){let r=e.compat;return r!==void 0&&(r=ed(r,n)??void 0),r===void 0&&!er(t.baseURL)?void 0:r===void 0?{thinkingTokenBudgetField:"thinking_token_budget"}:r.thinkingTokenBudgetField===void 0&&r.supportsThinkingTokenBudget!==!0&&er(t.baseURL)?{...r,thinkingTokenBudgetField:"thinking_token_budget"}:r}if(n===Fo&&e.anthropicAdaptive===!0)return{forceAdaptiveThinking:!0}}var nd=["openai.com","openai.azure.com","deepseek.com","openrouter.ai","z.ai","bigmodel.cn","moonshot.ai","moonshot.cn","aliyuncs.com","anthropic.com","x.ai","together.ai","together.xyz","nvidia.com","cerebras.ai","cloudflare.com","chutes.ai","opencode.ai","ant-ling.com"];function nr(e){if(wt(e.api)!==Jt)return!1;let t=e.baseURL;if(t===void 0||t.length===0)return!1;try{let n=new URL(t).hostname.toLowerCase();return n.includes(".")?!nd.some(r=>n===r||n.endsWith("."+r)):!1}catch{return!1}}function Do(e,t,n){return e===void 0||!n||e.supportsDeveloperRole!==void 0||!nr(t)?e:{...e,supportsDeveloperRole:!1}}var Io={off:null,low:"low",medium:"medium",high:"high"},rd=["vl","vision","omni","4o","pixtral","internvl"];function rr(e){let t=yt(e);for(let n of rd){let r=yt(n),o=t.indexOf(r);for(;o>=0;){if(Co(t,o,r.length))return["text","image"];o=t.indexOf(r,o+1)}}}function od(e){if(e===void 0)return;let t=e.map(n=>n.toLowerCase());if(t.some(n=>Va.includes(n)))return t.includes("image")?["text","image"]:["text"]}function be(e,t,n){let r=tr(e,t.displayName),o,i,s,a;r?.input!==void 0&&(o=r.input,i="knowledge"),r?.contextWindow!==void 0&&(s=r.contextWindow),r?.maxTokens!==void 0&&(a=r.maxTokens);let d=od(n?.input);if(d!==void 0&&(o=d,i="endpoint"),n?.contextLength!==void 0&&Number.isFinite(n.contextLength)&&n.contextLength>0&&(s=n.contextLength),o===void 0){let y=rr(e);y!==void 0&&(o=y,i="heuristic")}let u={...o===void 0?{}:{input:o},...i===void 0?{}:{inputSource:i},...s===void 0?{}:{contextWindow:s},...a===void 0?{}:{maxTokens:a}},m=n===void 0?{}:{endpoint:{reasoning:n.reasoning,source:n.source}};if(n?.reasoning===!1)return{efforts:!1,matched:!1,source:"endpoint:"+(n.source??"listing"),confidence:"high",...m,...u};if(r!==void 0){let y=Do(td(r,t),t,r.efforts!==!1);return{efforts:r.efforts,...r.efforts!==!1&&r.defaultEffort!==void 0&&r.efforts[r.defaultEffort]!==void 0?{defaultEffort:r.defaultEffort}:{},...y===void 0?{}:{compat:y},matched:!0,entryId:r.id,source:r.id,confidence:"high",...m,...u}}let p=Za(t),g=Ja[p]??Xa,l=wt(t.api)===Jt?{thinkingFormat:"openai",supportsReasoningEffort:!0}:void 0,c=l!==void 0&&er(t.baseURL)?{...l,thinkingTokenBudgetField:"thinking_token_budget"}:l,f=Do(c,t,!0);return n?.reasoning===!0?{efforts:{...Io},...Io.medium!==void 0?{defaultEffort:"medium"}:{},...f===void 0?{}:{compat:f},matched:!1,source:"endpoint:"+(n.source??"listing"),confidence:"medium",...m,...u}:{efforts:g,...g.medium!==void 0?{defaultEffort:"medium"}:{},...f===void 0?{}:{compat:f},matched:!1,source:"protocol:"+p,confidence:"low",...m,...u}}var Wo="dsh-model-think-level.slider.efforts",or="breSelectWired";function ir(e){return typeof e=="object"&&e!==null&&e.ok===!1}function sr(e){if(!ir(e))return;let t=e.error,n=typeof t?.code=="string"?t.code:"settings/rejected",r=typeof t?.message=="string"?t.message:"";return r.length>0?`${n}: ${r}`:n}function Be(e,t){return`${e}/${t}`}function qo(){try{let e=window.localStorage.getItem(Wo);if(e===null)return{};let t=JSON.parse(e);if(typeof t!="object"||t===null||Array.isArray(t))return{};let n={};for(let[r,o]of Object.entries(t))r.length>0&&typeof o=="string"&&o.trim().length>0&&(n[r]=o);return n}catch{return{}}}function id(e){try{window.localStorage.setItem(Wo,JSON.stringify(e))}catch{}}function sd(e,t,n){let r=qo();r[Be(e,t)]=n,id(r)}function ad(e,t){return qo()[Be(e,t)]}function Xt(e,t,n){let o=e.groups.find(i=>i.id===t)?.models.find(i=>i.id===n)?.reasoning?.efforts;return o===void 0?[]:o.map(i=>i.id)}function dd(e,t,n){return e.groups.find(o=>o.id===t)?.models.find(o=>o.id===n)?.reasoning?.defaultEffort}function ld(e){if(!(e.length<2))return e[Math.floor((e.length-1)/2)]}function ud(e,t){return e===null||e.provider!==t.provider||e.model!==t.model}async function Ko(e,t,n,r,o){let i=Xt(e,t,n);if(i.length===0)return;let s=Be(t,n),a=r.get(s);if(a!==void 0&&i.includes(a))return a;let d=await o?.configuredEffort?.(t,n);if(d!==void 0&&i.includes(d))return d;let u=ad(t,n);if(u!==void 0&&i.includes(u))return u;let m=be(n,{}).defaultEffort;if(m!==void 0&&i.includes(m))return m;let p=dd(e,t,n);return p!==void 0&&i.includes(p)?p:ld(i)}function Bo(e,t){let n=e;if(n[or]===!0)return()=>{};let r=Object.prototype.hasOwnProperty.call(n,"select"),o=e.select,i=new Map,s=new Set,a=new Map,d=3,u=0,m=async l=>{let c=++u;if(l.reasoningEffort!==void 0){let w=await o.call(e,l);return!ir(w)&&ce()&&(i.set(Be(l.provider,l.model),l.reasoningEffort),sd(l.provider,l.model,l.reasoningEffort)),w}let f=e.store.getSnapshot();if(!ud(f.current,l)){if(ce()){let w=Be(l.provider,l.model);i.delete(w),s.add(w)}return o.call(e,l)}if(!ce())return o.call(e,l);let y=await Ko(f,l.provider,l.model,i,t),k=e.store.getSnapshot();if(!(u!==c||((w,M)=>w===null||M===null?w!==M:w.provider!==M.provider||w.model!==M.model||w.reasoningEffort!==M.reasoningEffort)(k.current,f.current)))return!ce()||y===void 0||!Xt(k,l.provider,l.model).includes(y)?o.call(e,l):o.call(e,{...l,reasoningEffort:y})},p=()=>{let l=e.store.getSnapshot(),c=l.current;if(c===null||c.reasoningEffort!==void 0||!ce())return;let f=Be(c.provider,c.model);if(s.has(f))return;if(Xt(l,c.provider,c.model).length===0){s.add(f);return}s.add(f);let y=u;Ko(l,c.provider,c.model,i,t).then(async k=>{if(k===void 0){s.delete(f);return}if(!ce()){s.delete(f);return}let h=e.store.getSnapshot(),w=h.current;if(u!==y||w===null||w.reasoningEffort!==void 0||Be(w.provider,w.model)!==f||!Xt(h,w.provider,w.model).includes(k))return;let M=await o.call(e,{provider:w.provider,model:w.model,reasoningEffort:k});if(ir(M))throw M}).catch(()=>{let k=(a.get(f)??0)+1;a.set(f,k),k<d&&(s.delete(f),p())})},g=e.store.subscribe(p);return p(),n[or]=!0,e.select=m,()=>{delete n[or],g(),r?e.select=o:delete n.select}}function fd(e){if(e.current===null)return[];let r=e.groups.find(o=>o.id===e.current?.provider)?.models.find(o=>o.id===e.current?.model)?.reasoning?.efforts;return r!==void 0&&r.length>=2?r:[]}function cd(e){return e.current}function pd(e,t){let n=cd(t),r=e.findIndex(a=>a.id===n?.reasoningEffort);if(r>=0)return r;let i=t.groups.find(a=>a.id===n?.provider)?.models.find(a=>a.id===n?.model)?.reasoning?.defaultEffort,s=i===void 0?-1:e.findIndex(a=>a.id===i);return s>=0?s:Math.floor((e.length-1)/2)}function Uo(e){return e.models??[]}function st(e){let t=e;return t.name??t.label??t.title??e.id}function ar(e){return(0,L.createElement)("span",{className:"bre-row-chevron"+(e?" is-open":""),"aria-hidden":!0},"\u203A")}function md(){let[e,t]=(0,L.useState)(null),n=(0,L.useRef)(0);(0,L.useEffect)(()=>()=>{window.clearTimeout(n.current)},[]);let r=(0,L.useCallback)(()=>{window.clearTimeout(n.current),t(null)},[]),o=(0,L.useCallback)((i,s)=>{window.clearTimeout(n.current);let a=i.currentTarget;a.scrollWidth<=a.clientWidth+1||(n.current=window.setTimeout(()=>{t({target:a,text:s})},300))},[]);return{tip:e,onEnter:o,onLeave:r}}function gd({state:e}){if(typeof document>"u")return null;let t=e.target.getBoundingClientRect(),n=Math.max(12,Math.min(t.right,window.innerWidth-12));return(0,Go.createPortal)((0,L.createElement)("div",{className:"bre-tip",role:"tooltip",style:{top:Math.min(t.bottom+6,window.innerHeight-40),right:Math.max(12,window.innerWidth-n)}},e.text),document.body)}function hd(){return(0,L.createElement)("svg",{className:"bre-option-check",width:14,height:14,viewBox:"0 0 16 16",fill:"none","aria-hidden":!0},(0,L.createElement)("path",{d:"M3.5 8.5l3 3 6-7",stroke:"currentColor",strokeWidth:1.6,strokeLinecap:"round",strokeLinejoin:"round"}))}var jo=new Map;function bd(e){if(Array.isArray(e.input))return e.input.includes("image");let t=jo.get(e.id);if(t!==void 0)return t;let n=tr(e.id,e.name)?.input,r=n!==void 0?n.includes("image"):(rr(e.id)??[]).includes("image");return jo.set(e.id,r),r}function yd(e){let t=e.reasoning?.efforts;return Array.isArray(t)&&t.length>0}function wd(e){return(0,L.createElement)("svg",{className:"bre-tag-icon",width:13,height:13,viewBox:"0 0 16 16",fill:"none",role:"img","aria-label":e},(0,L.createElement)("path",{d:"M1.8 8s2.4-4.2 6.2-4.2S14.2 8 14.2 8s-2.4 4.2-6.2 4.2S1.8 8 1.8 8z",stroke:"currentColor",strokeWidth:1.3,strokeLinejoin:"round"}),(0,L.createElement)("circle",{cx:8,cy:8,r:1.8,fill:"currentColor"}))}function vd(e){return(0,L.createElement)("svg",{className:"bre-tag-icon",width:13,height:13,viewBox:"0 0 16 16",fill:"none",role:"img","aria-label":e},(0,L.createElement)("path",{d:"M8 1.9l1.35 3.75L13.1 7l-3.75 1.35L8 12.1 6.65 8.35 2.9 7l3.75-1.35z",fill:"currentColor"}))}function xd(e,t){let n=[];return bd(e)&&n.push((0,L.createElement)("span",{key:"vision",className:"bre-tag",title:t("tagVision")},wd(t("tagVision")))),yd(e)&&n.push((0,L.createElement)("span",{key:"thinking",className:"bre-tag",title:t("tagThinking")},vd(t("tagThinking")))),n.length===0?null:(0,L.createElement)("span",{className:"bre-option-tags"},...n)}function zo(e){let{directory:t,t:n}=e,r=e.onLayoutChange,o=(0,L.useSyncExternalStore)(T=>t.store.subscribe(T),()=>t.store.getSnapshot()),i=fd(o),[s,a]=(0,L.useState)(""),[d,u]=(0,L.useState)(null),[m,p]=(0,L.useState)(null),[g,l]=(0,L.useState)(!1),[c,f]=(0,L.useState)(null),y=(0,L.useRef)(null),k=(0,L.useRef)(""),h=(0,L.useRef)(!1),w=o.current!==null&&i.length>=2,M=g||o.status==="selecting",v=c??o.error,E=t.select;(0,L.useEffect)(()=>{if(h.current)return;let T=pd(i,o),Y=i[T]?.id??"";k.current=Y,a(Y),f(null)},[w,i,o]),(0,L.useEffect)(()=>{t.load().catch(()=>{})},[t]);let R=o.current,F=o.groups.find(T=>T.id===R?.provider),P=F?.models.find(T=>T.id===R?.model)?.name??(R===null?n("triggerFallback"):R.model),C=R===null?P:st(F??{id:R.provider})+" \xB7 "+P,A=i.find(T=>T.id===s)?.name??n("effortDefault"),I=(0,L.useSyncExternalStore)(Gt,$n),te=(0,L.useSyncExternalStore)($t,vo),V=(0,L.useSyncExternalStore)(Yt,Mo),W=o.groups.filter(T=>Uo(T).length>0&&!te.includes(T.id)).map(T=>T.id),B=ot(Vn(W),I),U=m!==null&&B.includes(m)?m:R!==null&&B.includes(R.provider)?R.provider:B[0]??null,S=U===null?[]:Oo(Uo(o.groups.find(T=>T.id===U)),V[U]??[]),N=R===null?"":R.provider+"/"+R.model,D=(0,L.useCallback)(T=>{d!==T&&((0,dr.flushSync)(()=>{u(T)}),r?.())},[r,d]),ee=(0,L.useCallback)(()=>{d!==null&&((0,dr.flushSync)(()=>{u(null)}),r?.())},[r,d]),se=(0,L.useCallback)(()=>{let T=y.current?.closest('[role="menu"]');T!=null&&(T.tabIndex=-1,T.focus({preventScroll:!0}))},[]),Fe=(0,L.useCallback)(async(T,Y)=>{if(h.current)return;let $=t.store.getSnapshot().current;if(ee(),!($!==null&&$.provider===T&&$.model===Y)){h.current=!0,se(),l(!0),f(null);try{let ae=await E({provider:T,model:Y}),Ae=sr(ae);if(Ae!==void 0)throw new Error(Ae)}catch(ae){f(ae instanceof Error?ae.message:String(ae))}finally{h.current=!1,l(!1)}}},[ee,t,se,E]),Ze=(0,L.useCallback)(async T=>{if(h.current||(ee(),T===o.current?.reasoningEffort&&o.status!=="error"))return;h.current=!0;let Y=k.current;se(),l(!0),f(null),a(T);try{let $=o.current;if($===null)throw new Error(n("sliderNoCurrent"));let ae=await E({provider:$.provider,model:$.model,reasoningEffort:T}),Ae=sr(ae);if(Ae!==void 0)throw new Error(Ae);let Ct=t.store.getSnapshot(),gt=i.find(Ft=>Ft.id===Ct.current?.reasoningEffort)?.id??T;k.current=gt,a(gt)}catch($){k.current=Y,a(Y),f($ instanceof Error?$.message:String($))}finally{h.current=!1,l(!1)}},[ee,t,se,i,E,o.current,o.status,n]),{tip:Se,onEnter:Ke,onLeave:We}=md(),Pt=[(0,L.createElement)("button",{key:"row:model",type:"button",role:"menuitem",className:"bre-row-control"+(d==="model"?" is-open":""),disabled:M,"aria-expanded":d==="model",onMouseLeave:We,onClick:()=>{D(d==="model"?null:"model")}},(0,L.createElement)("span",{className:"bre-row-label"},n("modelRowLabel")),(0,L.createElement)("span",{className:"bre-row-value","aria-label":C,onMouseEnter:T=>{Ke(T,C)}},C),ar(d==="model")),d==="model"?(0,L.createElement)("div",{key:"panel:model",className:"bre-panel bre-panel-models"},(0,L.createElement)("div",{className:"bre-providers",role:"group","aria-label":n("modelRowLabel")},...B.map(T=>(0,L.createElement)("button",{key:T,type:"button",className:"bre-provider"+(T===U?" is-open":"")+(T===R?.provider?" is-current":""),disabled:M,"aria-expanded":T===U,onMouseLeave:We,onClick:()=>{p(T)}},(0,L.createElement)("span",{className:"bre-option-name","aria-label":st(o.groups.find(Y=>Y.id===T)),onMouseEnter:Y=>{Ke(Y,st(o.groups.find($=>$.id===T)))}},st(o.groups.find(Y=>Y.id===T))),ar(T===U))),...B.length===0?[(0,L.createElement)("div",{key:"no-providers",className:"bre-empty"},n("sliderNoCurrent"))]:[]),(0,L.createElement)("div",{className:"bre-provider-models",role:"group","aria-label":n("modelRowLabel")},...S.length===0?[(0,L.createElement)("div",{key:"no-models",className:"bre-empty"},n("sliderNoCurrent"))]:S.map(T=>{let Y=U+"/"+T.id,$=Y===N;return(0,L.createElement)("button",{key:Y,type:"button",className:"bre-option"+($?" is-active":""),disabled:M,"aria-pressed":$,onMouseLeave:We,onClick:()=>{Fe(U,T.id)}},(0,L.createElement)("span",{className:"bre-option-name","aria-label":T.name??T.id,onMouseEnter:ae=>{Ke(ae,T.name??T.id)}},T.name??T.id),xd(T,n))}))):null,(0,L.createElement)("div",{key:"divider",className:"bre-divider","aria-hidden":!0}),(0,L.createElement)("button",{key:"row:effort",type:"button",role:"menuitem",className:"bre-row-control"+(d==="effort"?" is-open":""),disabled:M||!w,"aria-expanded":w?d==="effort":void 0,onClick:()=>{D(d==="effort"?null:"effort")}},(0,L.createElement)("span",{className:"bre-row-label"},n("effortRowLabel")),(0,L.createElement)("span",{className:"bre-row-value"+(w?"":" is-muted")},w?A:n("sliderNoLevels")),w?ar(d==="effort"):null),d==="effort"&&w?(0,L.createElement)("div",{key:"panel:effort",className:"bre-panel",role:"group","aria-label":n("effortRowLabel")},...i.map(T=>(0,L.createElement)("button",{key:T.id,type:"button",className:"bre-option"+(T.id===s?" is-active":""),disabled:M,"aria-pressed":T.id===s,onClick:()=>{Ze(T.id)}},(0,L.createElement)("span",{className:"bre-option-name"},T.name),T.id===s?hd():null))):null];return(0,L.createElement)("div",{className:"bre-slider-body",ref:y},(0,L.createElement)("div",{className:"bre-card"},...Pt),v===null?null:(0,L.createElement)("div",{className:"bre-model-error",role:"status"},v),Se===null?null:(0,L.createElement)(gd,{key:"tip",state:Se}))}var G=require("react"),Vo='section[role="group"]',ur='button[role="menuitemradio"]';function Yo(e){return e.querySelector(Vo)!==null}function lr(e){return Array.from(e.querySelectorAll(ur)).filter(t=>!t.disabled&&t.style.display!=="none")}function kd(e){let t=e.getAttribute("aria-labelledby");return(t===null?null:e.ownerDocument.getElementById(t))?.textContent?.toLowerCase()??""}function $o(e,t,n=new Map){let r=d=>{n.has(d)||n.set(d,d.style.display),d.style.display="none"},o=d=>{let u=n.get(d);u!==void 0&&(d.style.display=u,n.delete(d))};for(let d of[...n.keys()])d.isConnected||n.delete(d);let i=t.trim().toLowerCase().split(/\s+/).filter(Boolean),s=Array.from(e.querySelectorAll(Vo)),a=0;if(i.length===0){for(let d of[...n.keys()])o(d);for(let d of s)a+=d.querySelectorAll(ur).length;return a}for(let d of s){let u=kd(d),m=Array.from(d.querySelectorAll(ur)),p=0;for(let g of m){let l=(g.getAttribute("title")??"").toLowerCase(),c=(g.textContent??"").toLowerCase(),f=`${u} ${l} ${c}`;i.every(y=>f.includes(y))?(o(g),p+=1):r(g)}p>0?(o(d),a+=p):r(d)}return a}function Jo({menu:e,t}){let[n,r]=(0,G.useState)(""),[o,i]=(0,G.useState)(0),s=(0,G.useRef)(null),a=(0,G.useRef)(""),d=(0,G.useRef)(new Map),u=(0,G.useCallback)(l=>{a.current=l;let c=$o(e,l,d.current);i(c)},[e]);(0,G.useEffect)(()=>()=>{$o(e,"",d.current)},[e]),(0,G.useEffect)(()=>{let l=new MutationObserver(()=>{a.current.trim().length!==0&&u(a.current)});return l.observe(e,{childList:!0,subtree:!0}),()=>{l.disconnect()}},[e,u]),(0,G.useEffect)(()=>{let l=c=>{if(a.current.trim().length===0)return;let f=c.key;if(!(f==="ArrowDown"||f==="ArrowUp")&&!(f==="Home"||f==="End"||f==="PageUp"||f==="PageDown")||c.target===s.current||c.target instanceof Node&&!e.contains(c.target))return;let h=lr(e);if(h.length===0)return;let w=h.findIndex(v=>v===document.activeElement),M;f==="Home"||f==="PageUp"?M=0:f==="End"||f==="PageDown"?M=h.length-1:f==="ArrowDown"?M=w===-1?0:(w+1)%h.length:M=w===-1?h.length-1:(w-1+h.length)%h.length,c.preventDefault(),c.stopPropagation(),h[M]?.focus()};return e.addEventListener("keydown",l,!0),()=>{e.removeEventListener("keydown",l,!0)}},[e]);let m=l=>{let c=l.key;if(c==="ArrowDown"){l.preventDefault(),l.stopPropagation(),lr(e)[0]?.focus();return}if(n.trim().length>0&&(c==="ArrowUp"||c==="Home"||c==="PageUp"||c==="End"||c==="PageDown")){let f=lr(e);f.length>0&&(l.preventDefault(),l.stopPropagation(),f[c==="ArrowUp"||c==="End"||c==="PageDown"?f.length-1:0]?.focus());return}c==="Escape"&&n.length>0&&(l.preventDefault(),l.stopPropagation(),r(""),u(""))},p=()=>{r(""),u(""),s.current?.focus({preventScroll:!0})},g=o===0&&n.trim().length>0;return(0,G.createElement)("div",{className:"bre-model-search-box"+(g?" has-empty":""),"data-bre-search":"1"},(0,G.createElement)("div",{className:"bre-search-input-wrapper"},(0,G.createElement)("span",{className:"bre-search-icon","aria-hidden":"true"},(0,G.createElement)("svg",{viewBox:"0 0 16 16",fill:"none",stroke:"currentColor",strokeWidth:"1.5"},(0,G.createElement)("circle",{cx:"7",cy:"7",r:"4.5"}),(0,G.createElement)("path",{d:"M10.5 10.5L14 14",strokeLinecap:"round"}))),(0,G.createElement)("input",{ref:s,type:"text",className:"bre-search-input",role:"searchbox",placeholder:t("modelSearchPlaceholder"),"aria-label":t("modelSearchPlaceholder"),value:n,spellCheck:!1,autoComplete:"off",onChange:l=>{let c=l.currentTarget.value;r(c),u(c)},onKeyDown:m}),n.length>0?(0,G.createElement)("button",{type:"button",className:"bre-search-clear",title:t("modelSearchClear"),"aria-label":t("modelSearchClear"),onClick:p},(0,G.createElement)("svg",{viewBox:"0 0 16 16",fill:"none",stroke:"currentColor",strokeWidth:"1.5"},(0,G.createElement)("path",{d:"M4 4L12 12M12 4L4 12",strokeLinecap:"round"}))):null),g?(0,G.createElement)("div",{className:"bre-search-empty",role:"status"},t("modelSearchNoMatches")):null)}var Qt=require("react"),Xo=require("react-dom"),Qo=require("react-dom/client");function ie(){return document.body}function vt(e,t,n){let r=(0,Qo.createRoot)(e);return n?.sync===!0?(0,Xo.flushSync)(()=>{r.render(t)}):r.render(t),{wrapper:e,root:r}}function Ue(e){e!==void 0&&(e.root.unmount(),e.wrapper.remove())}var xe=class extends Qt.Component{constructor(){super(...arguments);to(this,"state",{error:null})}static getDerivedStateFromError(n){return{error:n instanceof Error?n.message:String(n)}}componentDidCatch(n,r){console.error("[bre] editor render failed:",n,r.componentStack)}render(){return this.state.error!==null?(0,Qt.createElement)("div",{style:{color:"#c00",fontSize:"11px",whiteSpace:"pre-wrap",padding:"6px"}},`${this.props.fallbackText}: ${this.state.error}`):this.props.children}};var Zo=()=>{(0,ei.flushSync)(()=>{window.dispatchEvent(new Event("resize"))})};function ti(e){let{menuOf:t,triggerOf:n,t:r,refreshed:o,sliderEnabled:i,directory:s}=e,a,d,u,m,p,g,l=()=>{g?.removeAttribute("data-bre-provider"),g=void 0},c=()=>{let v=n();g!==void 0&&g!==v&&l();let E=m?.store.getSnapshot(),R=E?.current;if(v===void 0||R===null||R===void 0){v===g&&l();return}let F=E?.groups.find(P=>P.id===R.provider),K=F===void 0?R.provider:st(F);if(K.trim()===""){v===g&&l();return}v.dataset.breProvider=K,g=v},f=()=>{let v=s();v!==m&&(p?.(),p=void 0,m=v,v!==void 0&&(p=v.store.subscribe(c))),c()},y=()=>{Ue(d),d=void 0},k=v=>{let E=v.querySelector('section[role="group"]'),R=E?.parentElement,F=R!=null&&R.parentElement===v?R:E;if(d===void 0){let K=document.createElement("div");K.dataset.plugin=X,K.dataset.breSearch="1",v.insertBefore(K,F),d=vt(K,(0,xt.createElement)(xe,{fallbackText:r("modelSearchFailed"),children:o(()=>(0,xt.createElement)(Jo,{menu:v,t:r}))}),{sync:!0});return}if(d.wrapper.parentElement!==v){v.insertBefore(d.wrapper,F);return}F!==null&&d.wrapper.nextSibling!==F&&v.insertBefore(d.wrapper,F)},h=v=>{if(!i()){Ue(a),a=void 0,v.classList.remove("bre-model-menu-host");for(let P of Array.from(v.children))P.getAttribute("role")==="menuitem"&&(P.style.display="");return}let E=s();if(E===void 0)return;if(a===void 0){let P=document.createElement("div");P.dataset.plugin=X,P.dataset.breSlider="1",v.insertBefore(P,v.firstChild),a=vt(P,(0,xt.createElement)(xe,{fallbackText:r("renderFailed"),children:o(()=>(0,xt.createElement)(zo,{directory:E,t:r,onLayoutChange:Zo}))}),{sync:!0})}else(a.wrapper.parentElement!==v||v.firstChild!==a.wrapper)&&v.insertBefore(a.wrapper,v.firstChild);v.classList.add("bre-model-menu-host");let R=Array.from(v.children).filter(P=>P.getAttribute("role")==="menuitem"),F=a.wrapper;if(Array.from(v.querySelectorAll('[role="menuitemradio"]')).some(P=>!F.contains(P)))a.wrapper.contains(document.activeElement)&&(v.tabIndex=-1,v.focus({preventScroll:!0})),a.wrapper.style.display="none";else{a.wrapper.style.display="";for(let P of R)P.style.display="none"}};return{reconcile:()=>{f();let v=t();if(v===void 0){Ue(a),a=void 0,y(),u=void 0;return}let E=Yo(v);E?k(v):y(),h(v),E!==u&&(u=E,(E||i())&&Zo())},dispose:()=>{p?.(),p=void 0,m=void 0,l(),Ue(a),a=void 0,y(),u=void 0}}}var O=e=>typeof e=="object"&&e!==null&&!Array.isArray(e);function ni(e){let t=e.toLowerCase();return t.includes("compat")||t.includes("thinkingtokenbudget")||t.includes("vllmpriority")||t.includes("supportsmaxoutput")}function Zt(e,t){if(!O(e))return[];let n=e[t];return!O(n)||!Array.isArray(n.models)?[]:n.models.filter(O)}function je(e,t){if(!O(e))return{};let n=e[t];if(!O(n))return{};let r=typeof n.api=="string"?n.api:void 0,o=typeof n.baseURL=="string"?n.baseURL:void 0,i=typeof n.displayName=="string"?n.displayName:void 0;return{api:r,baseURL:o,displayName:i}}var Oe=(e,t)=>typeof e[t]=="boolean";function Ed(e,t){if(Array.isArray(e)){for(let n of e)if(O(n)&&n.id===t)return n}}function Td(e){if(!O(e))return{reasoning:"unknown",source:null};let t=e.supported_features;if(Array.isArray(t)&&t.includes("reasoning"))return{...ye(e),reasoning:!0,source:"supported_features"};let n=e.supported_parameters;if(Array.isArray(n)&&(n.includes("reasoning")||n.includes("include_reasoning")||n.includes("reasoning_effort")))return{...ye(e),reasoning:!0,source:"supported_parameters"};if(Oe(e,"supports_reasoning"))return{...ye(e),reasoning:e.supports_reasoning,source:"supports_reasoning"};if(Oe(e,"supportsReasoning"))return{...ye(e),reasoning:e.supportsReasoning,source:"supportsReasoning"};if(Oe(e,"can_reason"))return{...ye(e),reasoning:e.can_reason,source:"can_reason"};if(Oe(e,"reasoning"))return{...ye(e),reasoning:e.reasoning,source:"reasoning"};let r=e.reasoning_effort;if(r!=null&&!(typeof r=="string"&&r.trim().length===0)||e.supports_reasoning_effort===!0)return{...ye(e),reasoning:!0,source:"reasoning_effort"};let o=O(e.capabilities)?e.capabilities:void 0;if(o!==void 0){let i=o.thinking;if(O(i)&&typeof i.supported=="boolean")return{...ye(e),reasoning:i.supported,source:"capabilities.thinking.supported"};let s=o.effort;if(O(s)&&typeof s.supported=="boolean")return{...ye(e),reasoning:s.supported,source:"capabilities.effort.supported"}}return{...ye(e),reasoning:"unknown",source:null}}function ye(e){let t={},n=s=>{if(!Array.isArray(s))return;let a=s.filter(d=>typeof d=="string");return a.length>0?a.map(d=>d.toLowerCase()):[]},r=O(e.architecture)?e.architecture:void 0,o=n(r?.input_modalities);if(o===void 0&&(o=n(e.input_modalities)),o===void 0){let s=O(e.modalities)?e.modalities:void 0;o=n(s?.input)}if(o===void 0){let s=e.capabilities,a=d=>Array.isArray(d)&&d.some(u=>typeof u=="string"&&u.toLowerCase()==="vision");if(a(e.supported_features)||a(s))o=["image"];else if(O(s)){let d=[];for(let u of["image_input","video_input","pdf_input","file_input"]){let m=O(s[u])?s[u]:void 0;if(m===void 0||typeof m.supported!="boolean")continue;let p=u.replace(/_input$/,"");m.supported===!0?d.push(p):d.length===0&&d.push("text")}d.length>0&&(o=d)}}o===void 0&&(Oe(e,"supports_vision")?o=e.supports_vision===!0?["image"]:[]:Oe(e,"supportsVision")?o=e.supportsVision===!0?["image"]:[]:(Oe(e,"supports_images")||Oe(e,"supportsImages"))&&(o=e.supports_images===!0||e.supportsImages===!0?["image"]:[])),o!==void 0&&(t.input=o.length===0?["text"]:o);let i=e.context_length;if(typeof i=="number"&&Number.isFinite(i)&&i>0)t.contextLength=i;else{let a=(O(e.top_provider)?e.top_provider:void 0)?.context_length;if(typeof a=="number"&&Number.isFinite(a)&&a>0)t.contextLength=a;else{let d=e.max_input_tokens;if(typeof d=="number"&&Number.isFinite(d)&&d>0)t.contextLength=d;else{let m=(O(e.limit)?e.limit:void 0)?.context;typeof m=="number"&&Number.isFinite(m)&&m>0&&(t.contextLength=m)}}}return t}function ri(e,t){let n=Ed(e,t);return n===void 0?{found:!1,signal:{reasoning:"unknown",source:null}}:{found:!0,signal:Td(n)}}function we(e){let n=e?.value?.providers;return typeof n!="object"||n===null||Array.isArray(n)?{}:Object.fromEntries(Object.entries(n).filter(([,r])=>typeof r=="object"&&r!==null&&!Array.isArray(r)))}function en(e){if(!O(e))return;let t=e.providers;return O(t)?t:void 0}function oi(e,t){for(let n of[e?.user,e?.base]){let r=en(n)?.[t];if(O(r)&&r.models!==void 0)return r.models}}function fr(e){return en(e?.user)}function tn(e,t){let n=e.find(o=>o.id===t);if(n===void 0)return;let r=n.reasoningEfforts;if(r===!1)return!1;if(typeof r=="object"&&r!==null&&!Array.isArray(r))return r}function nn(e,t){let r=e.find(i=>i.id===t)?.input;if(!Array.isArray(r))return;let o=r.filter(i=>typeof i=="string");return o.length>0?o:void 0}function rn(e,t){let r=e.find(o=>o.id===t)?.compat;if(O(r))return{...r}}function on(e,t){let r=e.find(o=>o.id===t)?.name;return typeof r=="string"&&r.length>0?r:void 0}function sn(e,t){let r=e.find(o=>o.id===t)?.[tt];return typeof r=="string"&&r.length>0?r:void 0}async function Ld(e,t){try{let n=await fetch(`${no}?route=${encodeURIComponent(e)}`,{method:"GET"});if(!n.ok)return{reasoning:"unknown",source:null};let r=await n.json();return r?.ok?ri(r.data,t).signal:{reasoning:"unknown",source:null}}catch{return{reasoning:"unknown",source:null}}}function an(e,t=()=>ne(e),n,r,o,i){return{async suggest(s,a,d,u){let m=we((await t()).namespace),p=je(m,s),g={api:p.api??u?.api,baseURL:p.baseURL??u?.baseURL,displayName:d??p.displayName},l=m[s]===void 0?void 0:await Ld(s,a),c=be(a,g,l);return c.efforts===void 0?{ok:!1,error:"no-suggestion"}:{ok:!0,suggestion:{efforts:c.efforts,...c.compat===void 0?{}:{compat:c.compat},...c.defaultEffort===void 0?{}:{defaultEffort:c.defaultEffort},...c.defaultEffort===void 0?{}:{defaultEffort:c.defaultEffort},...c.input===void 0?{}:{input:c.input},...c.inputSource===void 0?{}:{inputSource:c.inputSource},...c.contextWindow===void 0?{}:{contextWindow:c.contextWindow},...c.maxTokens===void 0?{}:{maxTokens:c.maxTokens},matched:c.matched,source:c.source,confidence:c.confidence,...c.endpoint===void 0?{}:{endpoint:c.endpoint}}}},commit(s,a,d){if(i?.()===!0){n?.(s,a,d.efforts,d.compat,d.input,d.defaultEffort);return}r?.(s,a,{efforts:d.efforts,...d.compat===void 0?{}:{compat:d.compat},...d.input===void 0?{}:{input:d.input},...d.clearCompatKeys===void 0?{}:{clearCompatKeys:d.clearCompatKeys},...d.defaultEffort===void 0?{}:{defaultEffort:d.defaultEffort}})},withdraw(s,a){o?.(s,a)},stageEfforts(s,a,d,u,m,p){n?.(s,a,d,u,m,p)},async writeEfforts(s,a,d,u,m,p,g){if(r!==void 0)return r(s,a,{efforts:d,...u===void 0?{}:{compat:u},...m===void 0?{}:{input:m},...p===void 0?{}:{clearCompatKeys:p},...g===void 0?{}:{defaultEffort:g}}),{ok:!0,staged:!0};let c=(await kt(e,s,[{modelId:a,efforts:d,...u===void 0?{}:{compat:u},...m===void 0?{}:{input:m},...p===void 0?{}:{clearCompatKeys:p},...g===void 0?{}:{defaultEffort:g}}],t))[0]??{ok:!1,error:"no-result"};return c.ok?{ok:!0}:c.modelNotFound===!0?{ok:!1,error:"model-not-found"}:{ok:!1,error:c.error??"conflict"}}}}async function kt(e,t,n,r=()=>ne(e),o){if(n.length===0)return[];let i=!1;for(let s=0;s<3;s++)try{let a=s===0?await r():await ne(e,{fresh:!0});if(a.namespace===void 0)return n.map(()=>({ok:!1,error:"no-namespace"}));let d=oi(a.namespace,t);if(!Array.isArray(d))return n.map(()=>({ok:!1,modelNotFound:!0}));if(!d.every(O))return n.map(()=>({ok:!1,error:"invalid-models"}));let m=d.map(l=>l),p=[];for(let l of n){let c=m.findIndex(f=>f.id===l.modelId);if(c<0){p.push(l.modelId);continue}m[c]=Md(m[c],l,i?void 0:l.compat)}if(p.length>0)return n.map(l=>p.includes(l.modelId)?{ok:!1,modelNotFound:!0}:{ok:!1,error:"model-not-found"});if(o?.()===!0)return n.map(()=>({ok:!1,aborted:!0}));let g=await e.settings.mutate(oe,[{op:"set",path:["providers",t,"models"],value:m}],a.namespace.revision);if(!g.ok){if(s===0&&g.error.code==="settings/conflict")continue;let l=g.error.code==="settings/rejected"&&ni(g.error.message);if(!i&&l&&n.some(c=>c.compat!==void 0)){i=!0;continue}return n.map(()=>({ok:!1,error:g.error.message}))}return n.map(()=>({ok:!0}))}catch(a){return n.map(()=>({ok:!1,error:a instanceof Error?a.message:String(a)}))}return n.map(()=>({ok:!1,error:"conflict"}))}function Md(e,t,n){let r={...e},o=t.efforts!=="keep",i=t.efforts==="keep"?void 0:t.efforts;if(o)if(i===void 0)delete r.reasoningEfforts,r[le]=!0;else if(delete r[le],delete r[et],i===!1)r.reasoningEfforts=!1;else{r.reasoningEfforts={...i};let s=O(e.compat)?e.compat:{},a={...s,...n??{}};for(let d of t.clearCompatKeys??[])delete a[d];(Object.keys(s).length>0||Object.keys(a).length>0)&&(Object.keys(a).length===0?delete r.compat:r.compat=a)}return t.input!==void 0&&(t.input===null?(delete r.input,r[Re]=!0):(delete r[Re],r.input=[...t.input])),t.defaultEffort!==void 0&&(t.defaultEffort===null?delete r[tt]:r[tt]=t.defaultEffort),r}function cr(e,t){for(let n of[e?.user,e?.base]){let r=en(n)?.[t];if(!O(r))continue;let o=r.headers;if(o===void 0)continue;if(!O(o))return;let i={};for(let[s,a]of Object.entries(o))typeof a=="string"&&(i[s]=a);return i}}async function pr(e,t,n){if(typeof t!="string"||t.length===0)return{ok:!1,error:"no-route"};for(let r=0;r<2;r+=1)try{let o=r===0?await ne(e):await ne(e,{fresh:!0});if(o.namespace===void 0)return{ok:!1,error:"no-namespace"};if(o.writable!==!0)return{ok:!1,error:"read-only"};if(!Sd(o.namespace,t))return{ok:!1,error:"no-route"};let i=await e.settings.mutate(oe,[{op:"set",path:["providers",t,"headers"],value:{...n}}],o.namespace.revision);if(!i.ok){if(r===0&&i.error.code==="settings/conflict")continue;return{ok:!1,error:i.error.message}}return{ok:!0}}catch(o){return{ok:!1,error:o instanceof Error?o.message:String(o)}}return{ok:!1,error:"conflict"}}function Sd(e,t){for(let n of[e?.user,e?.base]){let r=en(n);if(r!==void 0&&Object.prototype.hasOwnProperty.call(r,t))return!0}return!1}async function ne(e,t={}){let n=t.fresh===!0?void 0:Ad(e);if(n!==void 0)return n;let r=await e.settings.describe();return r.ok?{namespace:r.value.namespaces.find(i=>i.ns===oe),writable:r.value.writable}:{namespace:void 0,writable:!1}}function Ad(e){let t=e.scope?.getSnapshot();if(!(t===void 0||t.status!=="ready")&&typeof t.revision=="number")return{namespace:{ns:oe,schema:{},value:t.value,user:t.user,base:t.base,revision:t.revision,applies:"live",secrets:[]},writable:t.writable===!0}}function ii(e){let t,n,r=0,o=()=>{if(t!==void 0)return Promise.resolve();let a=r;return n??(n=ne(e.api).then(d=>{if(d.namespace===void 0){n=void 0;return}let u=new Map;for(let[m,p]of Object.entries(we(d.namespace))){let g=Array.isArray(p.models)?p.models:[];for(let l of g){if(typeof l!="object"||l===null||Array.isArray(l))continue;let c=l.id,f=l[tt];typeof c=="string"&&typeof f=="string"&&f.length>0&&u.set(`${m}/${c}`,f)}}a===r?t=u:n=void 0}).catch(()=>{a===r&&(n=void 0)})),n};return{of:async(a,d)=>(await o(),t?.get(`${a}/${d}`)),invalidate:()=>{r+=1,t=void 0,n=void 0}}}function Rd(e){let t=e.input;return Array.isArray(t)&&t.length>0}function si(e,t=()=>!0,n={},r=0){let o=n.efforts!==!1,i=n.modalities!==!1;if(!O(e))return;let s={};for(let a of Object.keys(e)){if(!t(a))continue;let d=e[a],u=O(d)&&Array.isArray(d.models)?d.models:void 0;if(u===void 0||u.length===0||!u.every(O))continue;let m=u,p=[],g=!1;for(let l of m){let c=l.reasoningEfforts!==void 0||l[le]===!0,f=Rd(l)||l[Re]===!0;if((c||!o)&&(f||!i)){let E=Hd(l,e,a);E!==void 0?(g=!0,p.push(E)):p.push(l);continue}let y=typeof l.id=="string"?l.id:"";if(y.length===0){p.push(l);continue}let k=je(e,a),h=typeof l.name=="string"?l.name:void 0,w=be(y,{...k,displayName:h??k.displayName});if(w.efforts===void 0){p.push(l);continue}let M={...l},v=!1;if(!c&&o&&(v=!0,M.reasoningEfforts=w.efforts,M[et]=r,w.compat!==void 0)){let E=O(l.compat)?l.compat:{};M.compat={...E,...w.compat}}if(!f&&i&&w.input!==void 0&&(v=!0,M.input=[...w.input]),!v){p.push(l);continue}g=!0,p.push(M)}g&&(s[a]={models:p})}return Object.keys(s).length===0?void 0:{providers:s}}function Hd(e,t,n){if(!O(e.reasoningEfforts)||e[le]===!0)return;let r=e.compat,o=O(r)?{...r}:{};if(o.supportsDeveloperRole===void 0&&nr(je(t,n)))return{...e,compat:{...o,supportsDeveloperRole:!1}}}function ai(e){let t,n=()=>(t??(t=(async()=>{let o={autofill:!0,modalityAutofill:!0};try{let i=await fetch(oo,{method:"GET"});if(!i.ok)return o;let s=await i.json();return s?.ok!==!0?o:{autofill:s.data?.autofill!==!1,modalityAutofill:s.data?.modalityAutofill!==!1}}catch{return o}})()),t),r=async()=>{try{let o=await n();if(!o.autofill)return;let i=await ne(e.api,{fresh:!0}),s=i.namespace;if(s===void 0||i.writable!==!0)return;let a=fr(s);if(a===void 0)return;let d=si(a,()=>!0,{modalities:o.modalityAutofill},s.revision);if(d===void 0)return;let u=d.providers,m=Object.entries(u).map(([g,l])=>({op:"set",path:["providers",g,"models"],value:l.models})),p=await e.api.settings.mutate(oe,m,s.revision);p.ok||console.error(`[bre] idle autofill refused: ${p.error.message}`)}catch(o){console.error(`[bre] idle autofill failed: ${o instanceof Error?o.message:String(o)}`)}};return{run:()=>{r()}}}var jr=require("react"),na=require("react-dom/client");var q=require("react");var Ge=Po;function ze(e){let t={};for(let n of Ge){if(e===void 0){t[n]={on:!1,wire:""};continue}if(e===!1){t[n]=n==="off"?{on:!0,wire:""}:{on:!1,wire:""};continue}let r=e[n];t[n]={on:r!==void 0,wire:r===null?"":typeof r=="string"?r:""}}return t}function at(e){let t=!1,n=!1,r={};for(let o of Ge){let i=e[o];if(!i.on)continue;if(o==="off"){t=!0;let a=i.wire.trim();r.off=a.length===0?null:a;continue}n=!0;let s=i.wire.trim();r[o]=s.length===0?o:s}return n?r:t?!1:void 0}function Et(e,t){if(e===t)return!0;if(e===!1||e===void 0||t===!1||t===void 0)return!1;let n=Ge.filter(o=>e[o]!==void 0),r=Ge.filter(o=>t[o]!==void 0);return n.length!==r.length?!1:n.every(o=>e[o]===t[o])}function di(e,t){if(!(e===void 0||e===!1)&&!("off"in e)){if(t==="zai"||t==="deepseek")return"thinking-disabled";if(t==="qwen")return"enable-thinking-false"}}var mr="bre:auto-effort",li=Promise.resolve();function ui(e){li=li.then(e,e).then(()=>{},()=>{})}function fi(e,t=document){t.dispatchEvent(new CustomEvent(mr,{detail:{route:e}}))}function ci(e,t=document){let n=r=>{let o=r.detail;typeof o?.route!="string"||o.route.length===0||e(o.route)};return t.addEventListener(mr,n),()=>{t.removeEventListener(mr,n)}}var x=require("react/jsx-runtime"),pi=new Intl.NumberFormat("en-US");function $e(e){return e===void 0||e.length===0?{declared:!1,image:!1}:{declared:!0,image:e.includes("image")}}function gr(e){return e.declared?e.image?["text","image"]:["text"]:null}var Od={"openai-completions":["thinkingTokenBudgetField","supportsThinkingTokenBudget","vllmPriority"],"openai-responses":["supportsMaxOutputTokens"]};function _d(e){return Od[(e??"").toLowerCase()]??[]}function mi(e,t){let n=_d(e);if(n.length===0)return[];let r=new Set(t===void 0?[]:Object.keys(t));return n.filter(o=>!r.has(o))}function Nd(e,t){if(t!==void 0)return{clearCompatKeys:mi(e,t)};let n=mi(e,void 0);return n.length===0?{}:{clearCompatKeys:n}}function dn(e,t){return e.declared?t===void 0?!1:e.image?t.includes("image"):!t.includes("image"):t===void 0}function hr(e,t,n){let r=e?t:!1;return e&&r===void 0&&n===void 0?"keep":r}function gi(e){let t={},n=e?.thinkingTokenBudgetField??"";n!==""&&(t.thinkingTokenBudgetField=n);let o=(e?.vllmPriority===void 0?"":String(e.vllmPriority)).trim();o!==""&&/^-?\d+$/.test(o)&&(t.vllmPriority=Number.parseInt(o,10));let i=e?.supportsMaxOutputTokens===void 0?"":String(e.supportsMaxOutputTokens);return i==="true"?t.supportsMaxOutputTokens=!0:i==="false"&&(t.supportsMaxOutputTokens=!1),Object.keys(t).length===0?void 0:t}function br(e){let t=e.appliedCompat,n=e.manualCompat,r=t!==void 0?{...t,...n??{}}:n;return e.initialCompat?.supportsThinkingTokenBudget===!0&&e.initialCompat?.thinkingTokenBudgetField===void 0&&r?.thinkingTokenBudgetField===void 0&&(e.routeApi??"").toLowerCase()==="openai-completions"&&(r={...r??{},thinkingTokenBudgetField:"thinking_token_budget"}),{efforts:e.efforts,...r===void 0?{}:{compat:r},...e.input===void 0?{}:{input:e.input},...Nd(e.routeApi,r),...e.defaultEffort===void 0?{}:{defaultEffort:e.defaultEffort}}}function ln({route:e,routeApi:t,routeBaseURL:n,modelId:r,modelName:o,efforts:i,effortsUnset:s=!1,input:a,compat:d,defaultEffort:u,index:m,staged:p=!1,officialInputTypes:g=!1,api:l,readOnly:c,t:f}){let[y,k]=(0,q.useState)(()=>ze(i)),[h,w]=(0,q.useState)(()=>$e(a)),[M,v]=(0,q.useState)(()=>i!==!1),[E,R]=(0,q.useState)(()=>u??""),[F,K]=(0,q.useState)(!1),[P,C]=(0,q.useState)(void 0),[A,I]=(0,q.useState)(void 0),[te,V]=(0,q.useState)(""),[W,B]=(0,q.useState)("low"),U=(0,q.useRef)(void 0),[S,N]=(0,q.useState)(()=>d?.thinkingTokenBudgetField??""),[D,ee]=(0,q.useState)(()=>d?.vllmPriority===void 0?"":String(d.vllmPriority)),[se,Fe]=(0,q.useState)(()=>d?.supportsMaxOutputTokens===void 0?"":String(d.supportsMaxOutputTokens)),Ze=(0,q.useRef)(d),[Se,Ke]=(0,q.useState)(void 0),[We,Pt]=(0,q.useState)(void 0),[T,Y]=(0,q.useState)(void 0),$=(0,q.useRef)(!1),ae=(0,q.useRef)(i),Ae=(0,q.useRef)(a),Ct=(0,q.useRef)(u),Wn=(0,q.useRef)(void 0),gt=(0,q.useRef)(i);gt.current=i;let Ft=(0,q.useRef)(s);Ft.current=s,(0,q.useEffect)(()=>ci(b=>{if(b!==e||gt.current!==void 0||Ft.current)return;let j=Wn.current;j!==void 0&&ui(j)}),[e]),(0,q.useEffect)(()=>{Et(ae.current,i)||(ae.current=i,$.current||(k(ze(i)),v(i!==!1))),Ae.current!==a&&(Ae.current=a,$.current||w($e(a))),Ct.current!==u&&(Ct.current=u,$.current||R(u??"")),JSON.stringify(Ze.current??null)!==JSON.stringify(d??null)&&(Ze.current=d,$.current||(N(d?.thinkingTokenBudgetField??""),ee(d?.vllmPriority===void 0?"":String(d.vllmPriority)),Fe(d?.supportsMaxOutputTokens===void 0?"":String(d.supportsMaxOutputTokens))))},[i,a,d,u]);let Yr=()=>{let b={};S!==""&&(b.thinkingTokenBudgetField=S);let j=D.trim();return j!==""&&/^-?\d+$/.test(j)&&(b.vllmPriority=Number.parseInt(j,10)),se==="true"?b.supportsMaxOutputTokens=!0:se==="false"&&(b.supportsMaxOutputTokens=!1),Object.keys(b).length===0?void 0:b},ya=()=>{let b=Yr();return JSON.stringify(b??null)!==JSON.stringify({...d?.thinkingTokenBudgetField===void 0?{}:{thinkingTokenBudgetField:d.thinkingTokenBudgetField},...d?.vllmPriority===void 0?{}:{vllmPriority:d.vllmPriority},...d?.supportsMaxOutputTokens===void 0?{}:{supportsMaxOutputTokens:d.supportsMaxOutputTokens}})},Kt=Ge.filter(b=>y[b].on),wa=E===(u??"")?void 0:E===""?null:E,va=M?at(y):!1,qn=!Et(va,i)||!dn(h,a)||ya()||wa!==void 0,Bn=(0,q.useRef)(void 0),me=()=>{$.current=!0,I(void 0),V(""),B("low"),Ke(void 0)},ge=(b,j,Z,he=M)=>{let fe=hr(he,at(b),i),_a=dn(j,a)?void 0:gr(j),Zr=br({efforts:fe,input:_a,defaultEffort:Z===(u??"")?void 0:Z===""?null:Z,manualCompat:Yr(),appliedCompat:U.current,routeApi:t,initialCompat:d}),eo=JSON.stringify(Zr);Bn.current!==eo&&(Bn.current=eo,l.commit(e,r,Zr))},xa=(b,j)=>{me();let Z=!j&&E===b?"":E;Z!==E&&R(Z),k(he=>{let fe={...he,[b]:{...he[b],on:j}};return j&&b!=="off"&&fe[b].wire.trim().length===0&&(fe[b]={...fe[b],wire:b}),ge(fe,h,Z),fe}),C(void 0)},ka=b=>{me(),v(b);let j=b?E:"";j!==E&&R(j),ge(y,h,j,b),C(void 0)},Ea=(b,j)=>{me(),k(Z=>{let he={...Z,[b]:{...Z[b],wire:j}};return ge(he,h,E),he}),C(void 0)},Ta=b=>{me();let j={declared:!0,image:b};w(j),ge(y,j,E),C(void 0)},La=()=>{me();let b={declared:!1,image:!1};w(b),ge(y,b,E),C(void 0)},Ma=b=>{me(),N(b),ge(y,h,E),C(void 0)},Sa=b=>{me(),ee(b),ge(y,h,E),C(void 0)},Aa=b=>{me(),Fe(b),ge(y,h,E),C(void 0)},Jr=b=>{me(),R(b),ge(y,h,b),C(void 0)},Ra=b=>{me();let j=b.efforts!==!1;v(j);let Z=ze(b.efforts);k(Z);let he=b.input===void 0?h:$e(b.input);b.input!==void 0&&w(he);let fe=E===""&&b.defaultEffort!==void 0?b.defaultEffort:E;fe!==E&&R(fe),I(b.efforts),V(b.source),B(b.confidence),U.current=b.compat,Ke(b.inputSource),Pt(b.contextWindow),Y(b.maxTokens),C({kind:"info",text:f("appliedHint",{source:b.source,confidence:f("confidence_"+b.confidence)})}),ge(Z,he,fe,j)},Xr=async()=>{if(!(c||F)){K(!0),C(void 0);try{let b=p?await l.suggest(e,r,o,{...t===void 0?{}:{api:t},...n===void 0?{}:{baseURL:n}}):await l.suggest(e,r,o);if(!b.ok){C({kind:"error",text:b.error==="no-suggestion"?f("noSuggestion"):b.error});return}Ra(b.suggestion)}catch(b){C({kind:"error",text:f("writeError",{message:String(b)})})}finally{K(!1)}}};(0,q.useEffect)(()=>{Wn.current=Xr});let Ha=()=>{$.current=!1,l.withdraw(e,r),k(ze(i)),v(i!==!1),w($e(a)),R(u??""),N(d?.thinkingTokenBudgetField??""),ee(d?.vllmPriority===void 0?"":String(d.vllmPriority)),Fe(d?.supportsMaxOutputTokens===void 0?"":String(d.supportsMaxOutputTokens)),I(void 0),V(""),B("low"),U.current=void 0,Ke(void 0),Pt(void 0),Y(void 0),C(void 0),Bn.current=void 0},Oa=U.current?.thinkingFormat??be(r,{...t===void 0?{}:{api:t},...n===void 0?{}:{baseURL:n}}).compat?.thinkingFormat,Qr=di(i,Oa),de=c||F;return(0,x.jsxs)("div",{className:"bre-effort-editor","data-plugin":X,children:[(0,x.jsxs)("label",{className:"bre-modality-row bre-thinking-switch",children:[(0,x.jsx)("input",{type:"checkbox",checked:M,disabled:de,"aria-label":f("thinkingMode")+" "+String(m+1),onChange:b=>{ka(b.target.checked)}}),(0,x.jsx)("span",{className:"bre-effort-level",children:f("thinkingMode")}),M?null:(0,x.jsx)("span",{className:"bre-effort-note",children:f("thinkingModeOff")})]}),M?(0,x.jsxs)("div",{className:"bre-effort-card",children:[(0,x.jsxs)("div",{className:"bre-effort-head",children:[(0,x.jsx)("span",{className:"bre-effort-title",children:f("reasoningEffort")}),(0,x.jsx)("button",{type:"button",className:"bre-link-button",disabled:de,onClick:()=>{Xr()},children:f("autoAdapt")})]}),(0,x.jsx)("div",{className:"bre-effort-grid",children:Ge.map(b=>{let j=y[b];return(0,x.jsxs)("label",{className:"bre-effort-row",children:[(0,x.jsx)("input",{type:"checkbox",checked:j.on,disabled:de,"aria-label":f("level_"+b)+" "+String(m+1),onChange:Z=>{xa(b,Z.target.checked)}}),(0,x.jsx)("span",{className:"bre-effort-level",children:f("level_"+b)}),j.on?(0,x.jsx)("input",{type:"text",className:"bre-effort-wire",value:j.wire,disabled:de,placeholder:f("wirePlaceholder"),"aria-label":f("level_"+b)+" "+f("wireValue"),onChange:Z=>{Ea(b,Z.target.value)}}):(0,x.jsx)("span",{className:"bre-effort-empty"})]},b)})}),Kt.length>0?(0,x.jsxs)("div",{className:"bre-modality",children:[(0,x.jsx)("span",{className:"bre-effort-title",children:f("defaultEffortLabel")}),(0,x.jsxs)("label",{className:"bre-modality-row",children:[(0,x.jsxs)("select",{className:"bre-select",disabled:de,"aria-label":f("defaultEffortLabel")+" "+String(m+1),value:E,onChange:b=>{Jr(b.target.value)},children:[(0,x.jsx)("option",{value:"",children:f("defaultEffortUnset")}),(E!==""&&!Kt.includes(E)?[...Kt,E]:Kt).map(b=>(0,x.jsx)("option",{value:b,children:f("level_"+b)},b))]}),E!==""?(0,x.jsx)("button",{type:"button",className:"bre-link-button bre-modality-clear",disabled:de,onClick:()=>{Jr("")},children:f("clearDefaultEffort")}):null]}),(0,x.jsx)("p",{className:"bre-modality-note",children:f("defaultEffortHint")})]}):null,g?null:(0,x.jsxs)("div",{className:"bre-modality",children:[(0,x.jsx)("span",{className:"bre-effort-title",children:f("inputModality")}),(0,x.jsxs)("label",{className:"bre-modality-row",children:[(0,x.jsx)("input",{type:"checkbox",checked:h.declared&&h.image,disabled:de,"aria-label":f("modalityImage")+" "+String(m+1),onChange:b=>{Ta(b.target.checked)}}),(0,x.jsx)("span",{className:"bre-effort-level",children:f("modalityImage")}),h.declared?(0,x.jsx)("button",{type:"button",className:"bre-link-button bre-modality-clear",disabled:de,onClick:La,children:f("clearDeclaration")}):null]}),h.declared?null:(0,x.jsx)("p",{className:"bre-modality-note",children:f("modalityInherit")})]}),(t??"").toLowerCase()==="openai-completions"?(0,x.jsxs)("div",{className:"bre-compat",children:[(0,x.jsx)("span",{className:"bre-effort-title",children:f("compatTitle")}),(0,x.jsxs)("label",{className:"bre-compat-row",children:[(0,x.jsx)("span",{className:"bre-compat-label",children:f("budgetFieldLabel")}),(0,x.jsxs)("select",{className:"bre-select",disabled:de,"aria-label":f("budgetFieldLabel")+" "+String(m+1),value:S,onChange:b=>{Ma(b.target.value)},children:[(0,x.jsx)("option",{value:"",children:f("budgetUnset")}),(0,x.jsx)("option",{value:"thinking_token_budget",children:"thinking_token_budget"}),(0,x.jsx)("option",{value:"thinking_budget",children:"thinking_budget"}),(0,x.jsx)("option",{value:"thinking_budget_tokens",children:"thinking_budget_tokens"})]}),(0,x.jsx)("span",{className:"bre-compat-hint",children:f("budgetFieldHint")})]}),(0,x.jsxs)("div",{className:"bre-compat-row",children:[(0,x.jsxs)("label",{className:"bre-compat-field",children:[(0,x.jsx)("span",{className:"bre-compat-label",children:f("priorityLabel")}),(0,x.jsx)("input",{type:"text",inputMode:"numeric",className:"bre-text-input",value:D,disabled:de,placeholder:f("priorityPlaceholder"),"aria-label":f("priorityLabel")+" "+String(m+1),onChange:b=>{Sa(b.target.value)}})]}),(0,x.jsx)("span",{className:"bre-compat-hint",children:f("priorityHint")}),D.trim()!==""&&!/^-?\d+$/.test(D.trim())?(0,x.jsx)("p",{className:"bre-effort-note bre-error",children:f("priorityInvalid")}):null]}),d?.supportsThinkingTokenBudget===!0&&d?.thinkingTokenBudgetField===void 0?(0,x.jsx)("p",{className:"bre-effort-note",children:f("aliasMigrated")}):null]}):null,(t??"").toLowerCase()==="openai-responses"?(0,x.jsxs)("div",{className:"bre-compat",children:[(0,x.jsx)("span",{className:"bre-effort-title",children:f("compatTitle")}),(0,x.jsxs)("label",{className:"bre-compat-row",children:[(0,x.jsx)("span",{className:"bre-compat-label",children:f("maxOutputLabel")}),(0,x.jsxs)("select",{className:"bre-select",disabled:de,"aria-label":f("maxOutputLabel")+" "+String(m+1),value:se,onChange:b=>{Aa(b.target.value)},children:[(0,x.jsx)("option",{value:"",children:f("maxOutputUnset")}),(0,x.jsx)("option",{value:"true",children:f("maxOutputOn")}),(0,x.jsx)("option",{value:"false",children:f("maxOutputOff")})]}),(0,x.jsx)("span",{className:"bre-compat-hint",children:f("maxOutputHint")})]})]}):null,p?(0,x.jsx)("p",{className:"bre-effort-note",children:f("stagedHint")}):null,i===!1?(0,x.jsx)("p",{className:"bre-effort-note",children:f("reasoningDisabled")}):null,Qr===void 0?null:(0,x.jsx)("p",{className:"bre-effort-note",children:f(Qr==="thinking-disabled"?"defaultRiskDisabled":"defaultRiskQwen")}),at(y)===void 0&&i!==void 0?(0,x.jsx)("p",{className:"bre-effort-note",children:f("bareHint")}):null,A!==void 0?(0,x.jsxs)("div",{className:"bre-suggestion",children:[(0,x.jsx)("p",{className:"bre-effort-note",children:f("appliedHint",{source:te,confidence:f("confidence_"+W)})}),Se===void 0?null:(0,x.jsx)("p",{className:"bre-effort-note",children:f(Se==="endpoint"?"inputHintEndpoint":Se==="knowledge"?"inputHintKnowledge":"inputHintHeuristic")}),We===void 0&&T===void 0?null:(0,x.jsxs)("div",{className:"bre-reference",children:[(0,x.jsx)("span",{className:"bre-reference-title",children:f("referenceTitle")}),(0,x.jsxs)("span",{className:"bre-reference-values",children:[We===void 0?null:(0,x.jsxs)("span",{children:[f("contextWindowLabel")," ",(0,x.jsx)("b",{children:pi.format(We)})]}),T===void 0?null:(0,x.jsxs)("span",{children:[f("maxTokensLabel")," ",(0,x.jsx)("b",{children:pi.format(T)})]})]})]})]}):null,P===void 0?null:(0,x.jsx)("p",{className:"bre-effort-message bre-"+P.kind,role:P.kind==="error"?"alert":"status",children:P.text}),qn?(0,x.jsx)("p",{className:"bre-effort-message bre-info",role:"status",children:f("pendingSave")}):null,qn?(0,x.jsx)("p",{className:"bre-effort-note",children:f("pendingHint")}):null,(0,x.jsx)("div",{className:"bre-effort-actions",children:(0,x.jsx)("button",{type:"button",className:"bre-secondary-button",disabled:de||!qn,onClick:Ha,children:f("reset")})})]}):null]})}var _e="data-bre-auto-effort",yr='[class*="modelCatalog"]',Dd='[class*="modelListHead"]',Id='button[class*="linkButton"]',Pd="bre-auto-effort",Cd="bre-auto-effort-note",Fd="data-bre-auto-effort-phase",bi="bre-auto-effort-note-text",yi="bre-auto-effort-note-detail",Kd=3e3;function Wd(e){return e.blocked==="busy"?null:e.failed!==void 0?{phase:"failed",count:0,missed:0,detail:e.failed}:e.blocked!==void 0?{phase:"blocked",count:0,missed:0,detail:""}:e.held>0?{phase:"done",count:e.held,missed:e.unsuggested,detail:""}:e.unsuggested>0?{phase:"unsuggested",count:0,missed:e.unsuggested,detail:""}:{phase:"empty",count:0,missed:0,detail:""}}function wr(e){return Array.from(e.querySelectorAll(yr)).filter(t=>(t.parentElement?.closest(yr)??null)===null)}function un(e,t,n){let r=new Map;for(let a of t)a.route.length!==0&&a.catalogue.isConnected&&r.set(a.catalogue,a.route);let o=n.t("autoAdaptAll");for(let[a,d]of r){let u=a.querySelector(Dd)??a,m=u.querySelector(`[${_e}]`)??Bd(n),p=qd(u);p!==null?p.nextElementSibling!==m&&p.after(m):u.lastElementChild!==m&&u.append(m),zd(m,d,o)}let i=new Set,s=new Set(r.values());for(let a of Array.from(e.querySelectorAll(`[${_e}]`))){let d=a.closest(yr),u=a.getAttribute(_e)??"";if(d===null||!r.has(d)||i.has(d)){a.remove(),u.length>0&&!s.has(u)&&vr(u);continue}i.add(d)}}function vr(e){let t=Ve.get(e);t!==void 0&&(t.timer!==null&&clearTimeout(t.timer),t.note.remove(),Ve.delete(e))}function wi(){for(let e of Array.from(document.querySelectorAll(`[${_e}]`)))e.remove();for(let e of Ve.values())e.timer!==null&&clearTimeout(e.timer),e.note.remove();Ve.clear()}function qd(e){let t=Array.from(e.querySelectorAll(Id));return t.length===0?null:t[t.length-1]}function Bd(e){let t=document.createElement("button");return t.className=Pd,t.setAttribute("type","button"),t.setAttribute(_e,""),t.addEventListener("click",()=>{let n=t.getAttribute(_e)??"";n.length!==0&&(fi(n),Ud(n,e))}),t}async function Ud(e,t){if(t.onRequest===void 0)return;hi(e,{phase:"working",count:0,missed:0,detail:""},t,0);let n;try{n=await t.onRequest(e)}catch(o){n={held:0,unsuggested:0,failed:String(o)}}if(n===void 0){vr(e);return}let r=Wd(n);r!==null&&hi(e,r,t,Kd)}function hi(e,t,n,r){let o=Ve.get(e);o!==void 0&&!o.note.isConnected&&(o.timer!==null&&clearTimeout(o.timer),Ve.delete(e),o=void 0),o!==void 0&&o.timer!==null&&clearTimeout(o.timer);let i=o?.note??jd();i.setAttribute(Fd,t.phase);let s=i.querySelector(`.${bi}`),a=i.querySelector(`.${yi}`),d=Gd(t,n);s.textContent!==d.text&&(s.textContent=d.text),a.textContent!==d.detail&&(a.textContent=d.detail),a.hidden=d.detail.length===0,o===void 0&&document.body.append(i);let u=r>0?setTimeout(()=>{vr(e)},r):null;i.style.setProperty("--bre-note-hold",`${r}ms`),Ve.set(e,{note:i,timer:u})}function jd(){let e=document.createElement("div");return e.className=Cd,e.setAttribute("role","status"),e.setAttribute("aria-live","polite"),e.innerHTML=`<span class="${bi}"></span><span class="${yi}"></span>`,e}var Ve=new Map;function Gd(e,t){switch(e.phase){case"working":return{text:t.t("autoAdaptWorking"),detail:""};case"done":return{text:t.t("autoAdaptDone",{count:e.count}),detail:e.missed>0?`${t.t("autoAdaptDoneHint",{count:e.count})} ${t.t("autoAdaptUnsuggestedHint")}`:t.t("autoAdaptDoneHint",{count:e.count})};case"empty":return{text:t.t("autoAdaptEmpty"),detail:t.t("autoAdaptEmptyHint")};case"unsuggested":return{text:t.t("autoAdaptUnsuggested"),detail:t.t("autoAdaptUnsuggestedHint")};case"blocked":return{text:t.t("autoAdaptBlocked"),detail:t.t("autoAdaptBlockedHint")};case"failed":return{text:t.t("autoAdaptFailed",{message:e.detail}),detail:e.detail}}}function zd(e,t,n){e.getAttribute(_e)!==t&&e.setAttribute(_e,t),e.textContent!==n&&(e.textContent=n),e.getAttribute("title")!==null&&e.removeAttribute("title")}var Tt="data-bre-drag-handle",xr="data-bre-row-head",kr="data-bre-drop-side",fn="bre-row-dragging",cn="bre-row-drop-target",Li="bre-drag-ghost",Mi="bre-drop-line",vi="http://www.w3.org/2000/svg",xi=8,ki=28,Ei=12,$d="transform 180ms cubic-bezier(0.2, 0.7, 0.3, 1)",Vd='button, a, input, textarea, select, [contenteditable], [role="button"], [role="switch"], [role="checkbox"], [role="textbox"], [role="combobox"]';function pn(){return{sources:new WeakSet,lists:new WeakSet,line:void 0,sighted:new WeakMap,drag:void 0}}function re(e){return Array.from(e.children).filter(t=>t instanceof HTMLElement)}function Yd(e,t){let n=e.style.order;if(n==="")return t;let r=Number.parseInt(n,10);return Number.isNaN(r)?t:r}function Ye(e){return re(e).map((t,n)=>({row:t,key:Yd(t,n),index:n})).sort((t,n)=>t.key-n.key||t.index-n.index).map(t=>t.row)}function Si(e,t){let n=e.filter(s=>t.includes(s)),r=n.map(s=>e.indexOf(s)),o=t.filter(s=>n.includes(s)),i=new Map;e.forEach((s,a)=>i.set(s,a)),r.forEach((s,a)=>{let d=o[a];d!==void 0&&i.set(d,s)});for(let[s,a]of i){let d=String(a);s.style.order!==d&&(s.style.order=d)}}function mn(e,t){Si(Ye(e),t)}function Er(e,t){let n=re(e),r=n.map(o=>o.offsetTop);t(),n.forEach((o,i)=>{let s=r[i]-o.offsetTop;s!==0&&(o.style.transition="none",o.style.transform=`translateY(${s}px)`,o.offsetHeight,o.style.transition=$d,o.style.transform="")})}function Lt(e,t){return Ye(e).map(n=>t(n)).filter(n=>n!==void 0)}function Jd(e,t,n){let r=Lt(e,t);if(n===void 0||!Xd(e,n))return r;let o=new Map;return n.ids.forEach((i,s)=>{o.has(i)||o.set(i,s)}),r.map((i,s)=>({id:i,key:o.get(i)??n.ids.length+s})).sort((i,s)=>i.key-s.key).map(i=>i.id)}function Xd(e,t){return t.rows.some(n=>!e.contains(n))}function Qd(e,t){let n=[];for(let o of Ye(e)){let i=t(o);i!==void 0&&n.push(i)}let r=[];for(let o of re(e))t(o)!==void 0&&r.push(o);return{ids:n,rows:r}}function Ai(e,t,n){let r=new Map;for(let[a,d]of t.entries())r.has(d)||r.set(d,a);let o=re(e),s=[...o.filter(a=>n(a)!==void 0)].sort((a,d)=>{let u=r.get(n(a))??Number.MAX_SAFE_INTEGER,m=r.get(n(d))??Number.MAX_SAFE_INTEGER;return u-m});Si(o,s)}function gn(e){for(let t of e)t.style.order="",t.style.transition="",t.style.transform=""}function Ri(e,t,n,r){let i=e.filter(s=>s!==t).indexOf(n);return i<0?Math.max(0,e.indexOf(t)):r?i+1:i}function Hi(e,t){let n,r=Number.POSITIVE_INFINITY;for(let o of e){let i=o.getBoundingClientRect(),s=t<i.top?i.top-t:t>i.bottom?t-i.bottom:0;s<r&&(r=s,n=o)}return n}function Zd(e,t){let n=e.getBoundingClientRect();return n.height<=0?!0:t>n.top+n.height/2}function Oi(e,t){let n=e.getBoundingClientRect();return t?n.bottom+xi/2-1:n.top-xi/2-1}function _i(){let e=document.createElementNS(vi,"svg");e.setAttribute("width","10"),e.setAttribute("height","14"),e.setAttribute("viewBox","0 0 10 14"),e.setAttribute("fill","none"),e.setAttribute("aria-hidden","true");let t=[[2.5,3],[7.5,3],[2.5,7],[7.5,7],[2.5,11],[7.5,11]];for(let[n,r]of t){let o=document.createElementNS(vi,"circle");o.setAttribute("cx",String(n)),o.setAttribute("cy",String(r)),o.setAttribute("r","1.2"),o.setAttribute("fill","currentColor"),e.appendChild(o)}return e}function Ni(e,t){let n=document.createElement("div");n.className=Li,n.setAttribute("aria-hidden","true"),n.appendChild(_i());let r=document.createElement("span");r.className="bre-drag-ghost-name";let o=t??e.querySelector('[class*="rowName"]')?.textContent?.trim();return r.textContent=o===void 0?"":o,n.appendChild(r),n}function el(e){return!(e instanceof Element)||e.closest(`[${Tt}]`)!==null?!1:e.closest(Vd)!==null}function Di(e){return e.parentElement??void 0}function Ii(e){for(let t of re(e))t.classList.remove(cn),t.removeAttribute(kr)}function Je(e){let t=e.parentElement;for(;t!==null;){if(tl(t))return t;t=t.parentElement}let n=document.scrollingElement;return n instanceof HTMLElement&&n.scrollHeight>n.clientHeight?n:void 0}function tl(e){if(e.scrollHeight<=e.clientHeight)return!1;let t=e.style.overflowY,n=t.length>0?t:window.getComputedStyle(e).overflowY;return n==="auto"||n==="scroll"||n==="overlay"}function Pi(e,t){let n=e.getBoundingClientRect();return n.height<=0?0:t<n.top+ki?-Ei:t>n.bottom-ki?Ei:0}function Ci(e,t,n){if(t.scrollStep===n)return;if(t.scrollStep=n,n===0){t.frame!==void 0&&(window.cancelAnimationFrame(t.frame),t.frame=void 0);return}let r=t.scroller;if(r===void 0||t.frame!==void 0)return;let o=()=>{t.frame=void 0,!(e.drag!==t||t.scrollStep===0)&&(r.scrollTop+=t.scrollStep,t.frame=window.requestAnimationFrame(o))};t.frame=window.requestAnimationFrame(o)}function nl(e){let t=e.line;if(t!==void 0&&t.isConnected)return t;let n=document.createElement("div");return n.className=Mi,n.setAttribute("aria-hidden","true"),document.body.appendChild(n),e.line=n,n}function rl(e,t,n){let r=nl(e),o=t.getBoundingClientRect();r.style.top=`${Oi(t,n)}px`,r.style.left=`${o.left}px`,r.style.width=`${o.width}px`,r.style.display="block",r.setAttribute(kr,n?"after":"before")}function ol(e){e.line!==void 0&&(e.line.style.display="none")}function il(e){let t=e.drag;e.drag=void 0,t!==void 0&&(Ci(e,t,0),ol(e),t.row.classList.remove(fn),Ii(t.list),t.dropped||Er(t.list,()=>{mn(t.list,t.before)}))}function sl(e,t,n,r){if(el(t.target)){t.preventDefault();return}let o=Di(e),i=n.idOf(e);if(o===void 0||i===void 0){t.preventDefault();return}let s={row:e,list:o,before:Ye(o),scroller:Je(o),adapter:n,scrollStep:0,frame:void 0,dropped:!1};r.drag=s,e.classList.add(fn);let a=Ni(e,n.labelOf(e));Number.isFinite(t.clientX)&&Number.isFinite(t.clientY)&&(a.style.left=`${t.clientX}px`,a.style.top=`${t.clientY}px`),document.body.appendChild(a);let d=t.dataTransfer;if(d!=null)try{d.effectAllowed="move",d.setData("text/plain",i),d.setDragImage(a,Math.round(a.offsetWidth/2),Math.round(a.offsetHeight/2))}catch{}window.setTimeout(()=>{a.remove()},0)}function al(e,t,n){let r=n.drag;if(r===void 0||r.list!==e)return;let o=t.target,i=o instanceof Element?r.adapter.rowOf(o,e):void 0,s=Ye(e),a=i!==void 0&&s.includes(i)?i:Hi(s,t.clientY);if(a===void 0)return;t.preventDefault();let d=t.dataTransfer;d!=null&&(d.dropEffect="move");let u=Zd(a,t.clientY),m=Ri(s,r.row,a,u);m!==s.indexOf(r.row)&&Er(e,()=>{mn(e,Yn(s,r.row,m))}),Ii(e),a.classList.add(cn),a.setAttribute(kr,u?"after":"before"),rl(n,a,u),Ci(n,r,r.scroller===void 0?0:Pi(r.scroller,t.clientY))}function dl(e,t){t.lists.has(e)||(t.lists.add(e),e.addEventListener("dragover",n=>{al(e,n,t)}),e.addEventListener("drop",n=>{let r=t.drag;r===void 0||r.list!==e||(n.preventDefault(),r.dropped=!0,r.adapter.commit(e))}))}function ll(e,t,n,r){r.sources.has(e)||(r.sources.add(e),n.seatDrags&&(e.setAttribute(xr,"1"),e.setAttribute("draggable","true")),e.addEventListener("dragstart",o=>{sl(t,o,n,r)}),e.addEventListener("dragend",()=>{il(r)}))}function ul(e,t,n,r){e.addEventListener("click",o=>{o.preventDefault(),o.stopPropagation()}),e.addEventListener("keydown",o=>{if(o.key!=="ArrowUp"&&o.key!=="ArrowDown")return;let i=Di(t);if(i===void 0)return;let s=Ye(i),a=s.indexOf(t);if(a<0)return;let d=a+(o.key==="ArrowUp"?-1:1);d<0||d>=s.length||(o.preventDefault(),Er(i,()=>{mn(i,Yn(s,t,d))}),n.commit(i),e.focus())})}function Ti(e,t,n,r){let o=r.gripLabel(t,n),i=r.gripHint();e.getAttribute(Tt)!==n&&e.setAttribute(Tt,n),e.getAttribute("aria-label")!==o&&e.setAttribute("aria-label",o),e.getAttribute("title")!==i&&e.setAttribute("title",i)}function fl(e,t,n,r,o){let i=t.querySelector(`[${Tt}]`);if(i!==null){Ti(i,e,n,r);return}r.decorate?.(e,t);let s=document.createElement("span");s.className="bre-drag-grip",s.setAttribute("role","button"),s.setAttribute("tabindex","0"),s.setAttribute("draggable","true"),s.appendChild(_i()),Ti(s,e,n,r),ul(s,e,r,o),ll(r.seatDrags?t:s,e,r,o),t.insertBefore(s,t.firstChild)}function hn(e,t,n,r){if(!e.isConnected)return;dl(t,r);for(let i of re(t)){let s=n.idOf(i);if(s===void 0)continue;let a=n.seatOf(i);a!==void 0&&fl(i,a,s,n,r)}if(r.drag!==void 0)return;let o=Jd(t,n.idOf,r.sighted.get(t));Ai(t,n.order(o),n.idOf),r.sighted.set(t,Qd(t,n.idOf))}function bn(e){e.drag=void 0;for(let t of Array.from(document.querySelectorAll(`[${Tt}]`)))t.remove();for(let t of Array.from(document.querySelectorAll(`[${xr}]`)))t.removeAttribute(xr),t.removeAttribute("draggable");for(let t of Array.from(document.querySelectorAll(`.${fn}, .${cn}`)))t.classList.remove(fn,cn);for(let t of Array.from(document.querySelectorAll(`.${Mi}`)))t.remove();for(let t of Array.from(document.querySelectorAll(`.${Li}`)))t.remove();e.line=void 0}function dt(e,t){return Object.prototype.hasOwnProperty.call(e,t)}var Tr="__breLedgerDocument";function Ui(){let e=globalThis;return e[Tr]??(e[Tr]=`${Date.now().toString(36)}-${Math.random().toString(36).slice(2)}`)}var yn="bre:held-writes:v1";function Mr(){try{return typeof sessionStorage>"u"?void 0:sessionStorage}catch{return}}function ve(e){let t=Mr();if(t!==void 0)try{if(e.pending.size===0&&e.queued.size===0){t.removeItem(yn);return}let n={document:Ui(),committed:[...e.committing].filter(r=>e.queued.has(r)),pending:[...e.pending].map(([r,o])=>[r,[...o]]),queued:[...e.queued].map(([r,o])=>[r,[...o]])};t.setItem(yn,JSON.stringify(n))}catch{}}function Fi(e,t){if(!Array.isArray(e))return;let n=[];for(let r of e){if(!Array.isArray(r)||r.length!==2)return;let[o,i]=r;if(typeof o!="string"||!Array.isArray(i))return;let s=[];for(let a of i){if(!Array.isArray(a)||a.length!==2)return;let[d,u]=a;if(typeof d!="string"||!O(u)||t!==void 0&&!t(u))return;s.push([d,u])}n.push([o,s])}return n}function cl(e){let t=Mr();if(t!==void 0)try{let n=t.getItem(yn);if(n===null)return;let r=JSON.parse(n);if(r.document!==Ui())return;let o=Fi(r.pending),i=Fi(r.queued,kl);if(o===void 0||i===void 0)return;let s=Array.isArray(r.committed)?r.committed.filter(a=>typeof a=="string"):[];for(let[a,d]of o)e.pending.set(a,new Map(d));for(let[a,d]of i)s.includes(a)&&(e.queued.set(a,new Map(d)),e.committing.add(a))}catch{}}function ji(e,t){(async()=>{try{await Sr(t,e),await Ar(t,e)}catch(n){console.error(`[bre] teardown flush failed: ${n instanceof Error?n.message:String(n)}`)}})()}function Gi(e,t){(async()=>{try{await Sr(t,e,!0),await Ar(t,e,!0)}catch(n){console.error(`[bre] unload flush failed: ${n instanceof Error?n.message:String(n)}`)}finally{try{Mr()?.removeItem(yn)}catch{}}})()}function zi(){let e={mounted:new Map,describePromise:void 0,pending:new Map,missedScans:new Map,queued:new Map,editing:void 0,flushing:!1,flushFailures:0,nextFlushAt:0,committing:new Set,adapting:new Set,signalsUnavailable:!1,submitWired:new WeakSet,cancelWired:new WeakSet,disclosureWired:new WeakSet,editWired:new WeakSet};return cl(e),e}async function pl(e,t){if(!t.flushing){t.flushing=!0;try{let n=await Sr(e,t),r=await Ar(e,t);n||r?Ki(e,t):(t.flushFailures=0,t.nextFlushAt=0)}catch(n){Ki(e,t),console.error(`[bre] idle flush failed: ${n instanceof Error?n.message:String(n)}`)}finally{t.flushing=!1}try{e.onIdle?.()}catch(n){console.error(`[bre] idle hook failed: ${n instanceof Error?n.message:String(n)}`)}}}function Ki(e,t){t.flushFailures+=1;let n=Math.min(2**t.flushFailures*500,3e4);t.nextFlushAt=Date.now()+n,e.onBackoff?.(n)}function ml(e){return e.queued.size>0||e.pending.size>0}function St(e,t,n,r,o,i,s){try{let a=e.pending.get(t);if(r===void 0){if(a===void 0)return;a.delete(n),a.size===0&&e.pending.delete(t);return}e.pending.set(t,(a??new Map).set(n,{efforts:r,...o===void 0?{}:{compat:o},...i===void 0?{}:{input:i},...s===void 0?{}:{defaultEffort:s}}))}finally{ve(e)}}function $i(e,t,n,r){e.queued.set(t,(e.queued.get(t)??new Map).set(n,r)),ve(e)}function gl(e,t,n){let r=e.pending.get(t);r!==void 0&&(r.delete(n),r.size===0&&e.pending.delete(t),ve(e))}function hl(e,t,n){let r=e.queued.get(t);r!==void 0&&(r.delete(n),r.size===0&&e.queued.delete(t),ve(e))}function bl(e,t,n){gl(e,t,n),hl(e,t,n)}function yl(e,t){e.queued.delete(t),e.pending.delete(t),e.missedScans.delete(t),e.committing.delete(t),ve(e)}function wl(e,t,n){if(t===void 0)return null;let i=t[le]!==!0&&t.reasoningEfforts!==void 0&&typeof t[et]=="number"||t[le]!==!0&&n?.efforts!==void 0&&vl(t.reasoningEfforts,n.efforts)?!1:t.reasoningEfforts!==void 0||t[le]===!0||e.efforts==="keep",a=t[Re]!==!0&&n?.input!==void 0&&xl(t.input,n.input)?!1:Array.isArray(t.input)&&t.input.length>0||t[Re]===!0,d=i?"keep":e.efforts,u=a?void 0:e.input,m=e.defaultEffort;return d==="keep"&&u===void 0&&m===void 0?null:{efforts:d,...e.compat===void 0?{}:{compat:e.compat},...u===void 0?{}:{input:u},...m===void 0?{}:{defaultEffort:m}}}function vl(e,t){if(e===t)return!0;if(!O(e)||!O(t))return!1;let n=Object.keys(t);if(Object.keys(e).length!==n.length)return!1;let r=t;return n.every(o=>e[o]===r[o])}function xl(e,t){if(!Array.isArray(e)||e.length!==t.length)return!1;let n=new Set(t);return e.every(r=>typeof r=="string"&&n.has(r))}function kl(e){if(!O(e))return!1;let t=e.efforts;if(t!==!1&&t!=="keep"&&!O(t))return!1;let n=e.clearCompatKeys;return n===void 0||Array.isArray(n)&&n.every(r=>typeof r=="string")}async function El(e,t,n,r,o=!1){let i=await e.describeNamespace(),s=we(i.namespace),a=[];for(let[p,g]of[...r]){let l=Zt(s,n).find(h=>h.id===p);if(l===void 0||t.pending.get(n)?.get(p)!==g)continue;let c=je(s,n),f=typeof l.name=="string"?l.name:void 0,y=be(p,f===void 0?c:{...c,displayName:f}),k=wl(g,l,{...y.efforts===void 0?{}:{efforts:y.efforts},...y.input===void 0?{}:{input:y.input}});if(k===null){St(t,n,p,void 0);continue}a.push({modelId:p,efforts:k.efforts,...k.compat===void 0?{}:{compat:k.compat},...k.input===void 0?{}:{input:k.input},...k.defaultEffort===void 0?{}:{defaultEffort:k.defaultEffort}})}if(a.length===0)return!1;let d=!1,u=await kt(e.api,n,a,()=>d?e.describeNamespace():(d=!0,Promise.resolve(i)),o?void 0:rs),m=!1;return a.forEach((p,g)=>{let l=u[g];if(l?.aborted!==!0){if(l?.ok===!0||l?.modelNotFound===!0){St(t,n,p.modelId,void 0);return}m=!0,console.error(`[bre] staged flush write failed for "${n}"/"${p.modelId}": ${l?.error??"unknown"}`)}}),m}async function Sr(e,t,n=!1){for(let s of[...t.committing])t.queued.has(s)||t.committing.delete(s);if(![...t.queued.keys()].some(s=>t.committing.has(s)||t.signalsUnavailable)||(await e.describeNamespace()).writable!==!0)return ve(t),!1;let i=!1;for(let[s,a]of[...t.queued]){if(!t.committing.has(s)&&!t.signalsUnavailable)continue;let u=[...a].map(([g,l])=>({modelId:g,efforts:l.efforts,...l.compat===void 0?{}:{compat:l.compat},...l.input===void 0?{}:{input:l.input},...l.clearCompatKeys===void 0?{}:{clearCompatKeys:l.clearCompatKeys},...l.defaultEffort===void 0?{}:{defaultEffort:l.defaultEffort}})),m=await kt(e.api,s,u,void 0,n?void 0:rs),p=!1;u.forEach((g,l)=>{let c=m[l];if(c?.aborted===!0){p=!0;return}if(c?.ok===!0||c?.modelNotFound===!0){a.delete(g.modelId);return}console.error(`[bre] held write failed for "${s}"/"${g.modelId}": ${c?.error??"unknown"}`)}),a.size===0?(t.queued.delete(s),t.committing.delete(s)):p||(i=!0)}return ve(t),i}async function Ar(e,t,n=!1){if(t.pending.size===0)return!1;let r=await e.describeNamespace();if(r.writable!==!0)return!1;let o=we(r.namespace),i=!1;for(let[s,a]of[...t.pending]){if(a.size===0){t.pending.delete(s);continue}dt(o,s)&&await El(e,t,s,a,n)&&(i=!0)}return ve(t),i}function Ee(e,t){for(let n of t){let r=Array.from(e.querySelectorAll("input[aria-label], select[aria-label]")).find(o=>(o.getAttribute("aria-label")??"").startsWith(n));if(r!==void 0&&r.value.trim().length>0)return r.value.trim()}return""}function wn(e){return e.closest('[class*="editor"], [class*="rowCard"], [class*="addCard"]')??void 0}function Tl(e){let t=e.closest('[class*="modelEntry"]');if(t===null){let r=wn(e);if(r===void 0)return;let o=Array.from(r.querySelectorAll('[class*="modelAdvanced"]'));return o.find(i=>i.offsetParent!==null)??o[0]}let n=Array.from(t.querySelectorAll('[class*="modelAdvanced"]'));return n.find(r=>r.offsetParent!==null)??n[0]}function Ll(e){return e.querySelector('[class*="modelInputTypes"]')!==null}function Ml(e,t,n,r,o){!e.isConnected||Hr(e)===void 0||Array.from(e.querySelectorAll("button[aria-label]")).some(s=>o.capacity.some(a=>(s.getAttribute("aria-label")??"").startsWith(a)))||un(e,Sl(e,we(r.namespace),o),{t:t.t,onRequest:s=>Vi(n,t,s)})}function Sl(e,t,n){let r=[];for(let o of wr(e)){let i=wn(o);if(i===void 0)continue;let s=ke(i,t,n);s===void 0||s.staged||r.push({catalogue:o,route:s.route})}return r}function Al(e,t,n){let r=[],o=new Set;for(let i of e){if(o.has(i.card))continue;o.add(i.card);let s=ke(i.card,t,n);if(s===void 0)continue;let[a]=wr(i.card);a!==void 0&&r.push({catalogue:a,route:s.route})}return r}function Rl(e,t,n,r){let o=[],i=new Set;for(let s of e)s.modelId.length===0||i.has(s.modelId)||ke(s.card,n,r)?.route===t&&(i.add(s.modelId),o.push({id:s.modelId,name:Ee(s.row,r.modelName)}));return o}async function Vi(e,t,n,r=[]){if(n.length===0)return{held:0,unsuggested:0,blocked:"unknown-route"};if(e.adapting.has(n))return{held:0,unsuggested:0,blocked:"busy"};e.adapting.add(n);let o=0,i=0;try{let s,a=()=>s??(s=t.describeNamespace()),d=await a(),u=we(d.namespace);if(d.writable!==!0)return{held:0,unsuggested:0,blocked:"unwritable"};if(!dt(u,n))return{held:0,unsuggested:0,blocked:"unknown-route"};let m=Zt(u,n),p=new Set;for(let h of m){let w=typeof h.id=="string"?h.id:"";w.length>0&&p.add(w)}let g=m.slice();for(let h of r)h.id.length===0||p.has(h.id)||g.push({id:h.id,name:h.name});if(g.length===0)return{held:0,unsuggested:0,blocked:"no-models"};let l=u[n]??{},c=typeof l.api=="string"?l.api:void 0,f=new Set;for(let h of e.mounted.values())h.props.route===n&&h.props.efforts!==void 0&&f.add(h.props.modelId);let y=!1,k=an(t.api,a,(h,w,M,v,E,R)=>{St(e,h,w,M,v,E,R)},(h,w,M)=>{$i(e,h,w,M)},void 0,()=>y);for(let h of g){let w=typeof h.id=="string"?h.id:"";if(w.length===0||f.has(w))continue;let M=tn(g,w);if(M!==void 0||h[le]===!0)continue;let v=nn(g,w),E=rn(g,w),R=sn(g,w)??"",F=await k.suggest(n,w,on(g,w));if(!F.ok){i+=1;continue}let K=F.suggestion,P=K.efforts!==!1,C=K.input===void 0?$e(v):$e(K.input),A=K.defaultEffort??R,I=A===R?void 0:A===""?null:A;y=!p.has(w),k.commit(n,w,br({efforts:hr(P,at(ze(K.efforts)),M),input:dn(C,v)?void 0:gr(C),defaultEffort:I,manualCompat:gi(E),appliedCompat:K.compat,routeApi:c,initialCompat:E})),y=!1,o+=1}return{held:o,unsuggested:i}}catch(s){return console.warn("[bre] provider-wide adapt failed:",s),{held:o,unsuggested:i,failed:s instanceof Error?s.message:String(s)}}finally{e.adapting.delete(n)}}function Hl(e){return e.querySelector(`[data-plugin="${X}"]`)!==null}function Ol(e,t){return e.route===t.route&&e.routeDisplayName===t.routeDisplayName&&e.routeApi===t.routeApi&&e.routeBaseURL===t.routeBaseURL&&e.modelId===t.modelId&&e.modelName===t.modelName&&e.index===t.index&&e.readOnly===t.readOnly&&e.defaultEffort===t.defaultEffort&&e.staged===t.staged&&e.officialInputTypes===t.officialInputTypes&&e.effortsUnset===t.effortsUnset&&Et(e.efforts,t.efforts)&&Nl(e.input,t.input)&&_l(e.compat,t.compat)}function _l(e,t){return e===t?!0:e===void 0||t===void 0?!1:JSON.stringify({...e},Object.keys({...e,...t}).sort())===JSON.stringify({...t},Object.keys({...e,...t}).sort())}function Nl(e,t){if(e===t)return!0;if(e===void 0||t===void 0)return!1;let n=new Set(e);return e.length===t.length&&t.every(r=>n.has(r))}function Dl(e,t){return Array.from(e.querySelectorAll("input[aria-label], select[aria-label]")).some(n=>t.some(r=>(n.getAttribute("aria-label")??"").startsWith(r)))}function ke(e,t,n){let r=e.querySelector('[class*="editorRoute"]')?.textContent?.trim();if(r!==void 0&&r.length>0&&dt(t,r))return{route:r,staged:!1};if(Dl(e,n.routeId)){let s=Ee(e,n.routeId);return s.length>0&&!dt(t,s)?{route:s,staged:!0}:void 0}let o=e.querySelector('[class*="editorTitle"], [class*="rowName"]')?.textContent?.trim();if(o===void 0||o.length===0)return;let i=Object.entries(t).find(([,s])=>s.displayName===o);if(i!==void 0)return{route:i[0],staged:!1};if(dt(t,o))return{route:o,staged:!1}}function Il(e,t){let n=e.querySelector('[class*="editorActions"]');if(n===null)return;let r=Array.from(n.querySelectorAll("button"));if(r.length<2)return;let o=(p,g)=>(p.textContent??"").trim()===g,i=n.querySelector('[class*="primaryButton"]'),s=n.querySelector('[class*="secondaryButton"]');if(i!==null&&s!==null)return{submit:i,cancel:s};let a=[...r].reverse().find(p=>t.apply.some(g=>o(p,g))),d=[...r].reverse().find(p=>t.cancel.some(g=>o(p,g)));if(a!==void 0&&d!==void 0)return{submit:a,cancel:d};let u=r[r.length-1],m=r[r.length-2];if(!(u===void 0||m===void 0))return{submit:u,cancel:m}}function vn(e,t,n){t.has(e)||(t.add(e),e.addEventListener("click",n,{capture:!0}))}var Lr=new WeakMap,Rr=420,Pl=320,Cl=160,Wi=2e3,Fl=150,Yi=new Set(["PageUp","PageDown","Home","End","ArrowUp","ArrowDown"," "]);function kn(e,t){let n=Je(e);if(n===void 0||!e.isConnected)return;let r=performance.now(),o=Lr.get(n);if(o!==void 0){o.deadline=Math.min(Math.max(o.deadline,r+t),o.startedAt+Wi);return}let i=e.getBoundingClientRect(),s=i.top,a=i.height,d=n.scrollTop;n.style.overflowAnchor="none";let u={deadline:r+t,startedAt:r,frame:void 0,release:()=>{}},m=()=>{u.frame!==void 0&&(window.cancelAnimationFrame(u.frame),u.frame=void 0),n.style.overflowAnchor="",Lr.delete(n),document.removeEventListener("wheel",p,!0),document.removeEventListener("touchstart",p,!0),document.removeEventListener("pointerdown",p,!0),document.removeEventListener("keydown",g,!0)};function p(){m()}function g(f){Yi.has(f.key)&&m()}u.release=m,Lr.set(n,u),document.addEventListener("wheel",p,{capture:!0,passive:!0}),document.addEventListener("touchstart",p,{capture:!0,passive:!0}),document.addEventListener("pointerdown",p,{capture:!0}),document.addEventListener("keydown",g,{capture:!0});let l=0,c=()=>{if(u.frame=void 0,l+=1,!e.isConnected||l>=Fl){m();return}let f=e.getBoundingClientRect(),y=Math.abs(f.height-a)>.5;if(!y&&n.scrollTop!==d){m();return}let k=f.top-s;k!==0&&(n.scrollTop+=k,d=n.scrollTop);let h=performance.now();if(y&&(a=f.height,u.deadline=Math.min(Math.max(u.deadline,h+Cl),u.startedAt+Wi)),h>=u.deadline){m();return}u.frame=window.requestAnimationFrame(c)};u.frame=window.requestAnimationFrame(c)}var Ji='[class*="modelList"]',Kl="bre-list-slack",Wl=3e3,En,lt=new WeakMap,Xe=new Set;function Xi(e){if(!(e instanceof Element))return;let t=e.closest(Ji);if(t===null)return;let n=Je(t);n===void 0||n===document.scrollingElement||!n.contains(t)||(En={host:n,top:n.scrollTop,at:performance.now()})}function Te(){En=void 0}function Qi(e){Xi(e.target)}function Zi(e){if(Yi.has(e.key)){Te();return}Xi(e.target)}var Mt=0;function es(){Mt+=1,!(Mt>1)&&(document.addEventListener("click",Qi,!0),document.addEventListener("keydown",Zi,!0),document.addEventListener("focusin",Te,!0),document.addEventListener("pointerdown",Te,!0),document.addEventListener("wheel",Te,{capture:!0,passive:!0}),document.addEventListener("touchstart",Te,{capture:!0,passive:!0}))}function xn(e){let t=lt.get(e);t!==void 0&&(lt.delete(e),Xe.delete(t.spacer),e.removeEventListener("scroll",t.onScroll),t.spacer.remove())}function ql(){if(Xe.size!==0)for(let e of Array.from(Xe)){let t=e.parentElement,n=t===null?void 0:lt.get(t);if(t===null||n===void 0){Xe.delete(e),e.remove();continue}t.scrollTop<=t.scrollHeight-t.clientHeight-n.height&&xn(t)}}function qi(e,t){return e.scrollTop>e.scrollHeight-e.clientHeight-t}function Bl(e=performance.now()){let t=En;if(t===void 0||e-t.at>Wl)return;let n=t.host;if(!n.isConnected)return;let r=lt.get(n),o=r===void 0?0:r.height,i=n.scrollHeight-n.clientHeight-o,s=t.top-i;if(s<=0){r!==void 0&&!qi(n,r.height)&&xn(n);return}let a=r;if(a===void 0){let d=document.createElement("div");d.className=Kl,d.dataset.plugin=X,d.setAttribute("aria-hidden","true"),d.style.height="0px",n.appendChild(d);let u=()=>{let m=lt.get(n);m!==void 0&&!qi(n,m.height)&&xn(n)};a={spacer:d,height:0,onScroll:u},lt.set(n,a),Xe.add(d),n.addEventListener("scroll",u,{passive:!0})}a.height!==s&&(a.height=s,a.spacer.style.height=`${s}px`),n.scrollTop!==t.top&&(n.scrollTop=t.top)}function ts(){if(Mt=Math.max(0,Mt-1),!(Mt>0)){document.removeEventListener("click",Qi,!0),document.removeEventListener("keydown",Zi,!0),document.removeEventListener("focusin",Te,!0),document.removeEventListener("pointerdown",Te,!0),document.removeEventListener("wheel",Te,!0),document.removeEventListener("touchstart",Te,!0),En=void 0;for(let e of Array.from(Xe)){let t=e.parentElement;if(t===null){Xe.delete(e),e.remove();continue}xn(t)}}}function ns(e,t=Rr){Bl(),ql();let n=new Set;for(let r of Array.from(e.querySelectorAll(Ji))){let o=r.closest('[class*="rowCard"], [class*="setupCard"], [class*="addCard"]');o===null||n.has(o)||(n.add(o),kn(o,t))}}function Ul(e,t){vn(e,t,()=>{let n=e.closest('[class*="modelEntry"]')??e.closest('[class*="rowCard"]');n!==null&&kn(e.closest('[class*="rowCard"]')??n,Rr)})}var Bi="{provider}";function jl(e,t){let n=t.editProvider.map(o=>{let i=o.indexOf(Bi);return i<0?void 0:{prefix:o.slice(0,i),suffix:o.slice(i+Bi.length)}}).filter(o=>o!==void 0);if(n.length===0)return[];let r=[];for(let o of Array.from(e.querySelectorAll("button[aria-label]"))){let i=o.getAttribute("aria-label")??"";n.some(s=>i.length>s.prefix.length+s.suffix.length&&i.startsWith(s.prefix)&&i.endsWith(s.suffix))&&o.closest("[data-plugin]")===null&&r.push(o)}return r}function Gl(e,t){vn(e,t,()=>{let n=e.closest('[class*="rowCard"], [class*="setupCard"], [class*="addCard"]');n!==null&&kn(n,Rr)})}function Hr(e){return e.querySelector('[class*="editorActions"]')??e.querySelector('[class*="modelEntry"]')??void 0}function rs(){return Hr(ie())!==void 0}function os(e,t,n){if(!e.isConnected)return;let r=t.labels(),o=Hr(e)!==void 0;for(let a of Array.from(e.querySelectorAll('[class*="rowCard"], [class*="setupCard"]')))for(let d of jl(a,r))Gl(d,n.editWired);let i=Array.from(e.querySelectorAll("button[aria-label]")).some(a=>r.capacity.some(d=>(a.getAttribute("aria-label")??"").startsWith(d)));if(!o){if(un(e,[],{t:t.t}),n.mounted.size>0){for(let[,d]of n.mounted)d.editor.unmount();n.mounted.clear()}let a=n.editing;n.editing=!1,(a!==!1||ml(n)&&Date.now()>=n.nextFlushAt)&&pl(t,n).catch(d=>{console.error(`[bre] idle pass failed: ${d instanceof Error?d.message:String(d)}`)});return}if(n.editing=!0,!i){for(let[,d]of n.mounted)d.editor.unmount();n.mounted.clear(),n.describePromise??(n.describePromise=t.describeNamespace());let a=r;n.describePromise.then(d=>{Ml(e,t,n,d,a)}).catch(d=>{console.error(`[bre] empty-catalog seat failed: ${d instanceof Error?d.message:String(d)}`)});return}for(let a of r.capacity)for(let d of Array.from(e.querySelectorAll("button[aria-label]")))(d.getAttribute("aria-label")??"").startsWith(a)&&Ul(d,n.disclosureWired);n.describePromise??(n.describePromise=t.describeNamespace());let s=a=>{if(!e.isConnected)return;let d=a.namespace,u=we(d),m=[];for(let g of r.capacity){let l=Array.from(e.querySelectorAll("button[aria-label]")).filter(c=>(c.getAttribute("aria-label")??"").startsWith(g));for(let c of l){let f=wn(c);if(f===void 0)continue;let y=c.closest('[class*="modelEntry"]')??f,k=Ee(y,r.modelId);k.length!==0&&m.push({container:Tl(c),row:y,modelId:k,card:f})}}un(e,Al(m,u,r),{t:t.t,onRequest:g=>Vi(n,t,g,Rl(m,g,u,r))});for(let[g,l]of n.mounted)m.some(c=>c.container===g)||(l.editor.unmount(),n.mounted.delete(g));if(n.pending.size>0){let g=new Map;for(let c of m){let f=ke(c.card,u,r);if(f===void 0)continue;let y=g.get(f.route);y===void 0&&g.set(f.route,y=new Set),y.add(c.modelId)}let l=new Map;for(let[c,f]of n.pending){if(!dt(u,c))continue;let y=g.get(c),k=[...f.keys()].filter(h=>!y?.has(h));k.length>0&&l.set(c,new Set(k))}for(let[c,f]of l){let y=n.missedScans.get(c);if(y!==void 0)for(let k of f)y.has(k)&&(St(n,c,k,void 0),y.delete(k))}n.missedScans=l}let p=new Set(m.map(g=>g.card));for(let g of p){let l=ke(g,u,r);if(l===void 0)continue;let c=l.route,f=Il(g,r);f===void 0?n.signalsUnavailable=!0:(n.signalsUnavailable=!1,vn(f.submit,n.submitWired,()=>{let y=ke(g,u,r)?.route??c;n.committing.add(y),ve(n)}),vn(f.cancel,n.cancelWired,()=>{let y=ke(g,u,r)?.route??c;yl(n,y)}))}m.forEach((g,l)=>{let c=g.container;if(c===void 0)return;let f=ke(g.card,u,r);if(f===void 0)return;let{route:y,staged:k}=f,h=u[y]??{},w=Zt(u,y),M=new Set(w.map(D=>D.id)),v=k||!M.has(g.modelId),E=v?n.pending.get(y)?.get(g.modelId)?.efforts:void 0,R=v?E==="keep"?void 0:E:tn(w,g.modelId),F=!v&&w.some(D=>D.id===g.modelId&&D[le]===!0),K=v?n.pending.get(y)?.get(g.modelId)?.input:nn(w,g.modelId),P=v?n.pending.get(y)?.get(g.modelId)?.compat:rn(w,g.modelId),C=v?n.pending.get(y)?.get(g.modelId)?.defaultEffort??void 0:sn(w,g.modelId),A=v?Ee(g.row,r.modelName):"",I=v?A.length>0?A:void 0:on(w,g.modelId),te=k?Ee(g.card,r.apiProtocol):"",V=k?Ee(g.card,r.baseUrl):"",W=k&&te.length>0?te:typeof h.api=="string"?h.api:void 0,B=k&&V.length>0?V:typeof h.baseURL=="string"?h.baseURL:void 0,U={route:y,routeDisplayName:k?y:typeof h.displayName=="string"?h.displayName:y,...W===void 0?{}:{routeApi:W},...B===void 0?{}:{routeBaseURL:B},modelId:g.modelId,...I===void 0?{}:{modelName:I},...R===void 0?{}:{efforts:R},...F?{effortsUnset:F}:{},...K===void 0?{}:{input:K},...P===void 0?{}:{compat:P},...C===void 0?{}:{defaultEffort:C},index:l,staged:v,officialInputTypes:Ll(c),api:an(t.api,void 0,(D,ee,se,Fe,Ze,Se)=>{St(n,D,ee,se,Fe,Ze,Se)},(D,ee,se)=>{$i(n,D,ee,se)},D=>{bl(n,D,g.modelId)},()=>(ke(g.card,u,r)?.staged??k)||!M.has(g.modelId)),readOnly:a.writable!==!0,t:t.t},S=n.mounted.get(c);if(S!==void 0){Ol(S.props,U)||(S.props=U,S.editor.render(U));return}if(Hl(c))return;kn(wn(c)??g.card,Pl);let N=t.mount(c,U);n.mounted.set(c,{editor:N,props:U})})};n.describePromise.then(s,()=>{n.describePromise=void 0})}function z(e,t,n){e.getAttribute(t)!==n&&e.setAttribute(t,n)}function At(e,t){e!==void 0&&e.hidden!==t&&(e.hidden=t)}function Ne(e,t,n){e.classList.contains(t)!==n&&(n?e.classList.add(t):e.classList.remove(t))}function Tn(e,t){e!==void 0&&e.textContent!==t&&(e.textContent=t)}var Or=require("react");var Q=require("react");function is(e){if(typeof e!="string")return;let t="";for(let n of e){let r=n.codePointAt(0)??0;r<32||r===127||(t+=n)}if(t=t.trim(),t.length!==0)return t.slice(0,40)}function Ln(e){return typeof e=="string"&&/^[\x21-\x7E]+$/.test(e)}function zl(e){for(let t of["error","message"]){let n=e[t];if(typeof n=="string"&&n.length>0)return n}}function $l(e){if(!O(e))return;let t=e.ref;if(typeof t!="string"||t.length===0)return;let n=e.alias,r=e.configured,o=e.masked;return{ref:t,...typeof n=="string"&&n.length>0?{alias:n}:{},enabled:e.enabled===!0,configured:typeof r=="boolean"?r:null,...typeof o=="string"&&o.length>0?{masked:o}:{}}}function Vl(e){let t=e.entries;if(!Array.isArray(t))return;let n=[];for(let i of t){let s=$l(i);s!==void 0&&n.push(s)}let r=e.enabledRef,o=e.route;return{ok:!0,route:typeof o=="string"?o:"",enabledRef:typeof r=="string"&&r.length>0?r:null,entries:n}}async function Yl(e){let t;try{t=await e.json()}catch{t=void 0}if(!O(t))return{ok:!1};if(t.ok===!0){let r=Vl(t);if(r!==void 0)return r}let n=zl(t);return n===void 0?{ok:!1}:{ok:!1,error:n}}async function ut(e,t){let n=`${ro}?route=${encodeURIComponent(e)}`;try{let r=await fetch(n,t===void 0?{method:"GET",cache:"no-store",credentials:"same-origin"}:{method:"POST",cache:"no-store",credentials:"same-origin",headers:{"content-type":"application/json"},body:JSON.stringify(t)});return await Yl(r)}catch{return{ok:!1}}}var ss={list:e=>ut(e),add:(e,t,n)=>ut(e,{op:"add",value:t,...n===void 0?{}:{alias:n}}),enable:(e,t)=>ut(e,{op:"enable",ref:t}),rename:(e,t,n)=>ut(e,{op:"rename",ref:t,...n===void 0?{}:{alias:n}}),remove:(e,t)=>ut(e,{op:"remove",ref:t}),replace:(e,t,n)=>ut(e,{op:"value",ref:t,value:n}),async reveal(e,t){try{let n=await fetch(`${qt}?route=${encodeURIComponent(e)}&ref=${encodeURIComponent(t)}`,{method:"GET",cache:"no-store",credentials:"same-origin"});if(!n.ok)return;let r=await n.json();if(!O(r)||r.ok!==!0)return;let o=r.key;return typeof o=="string"&&o.length>0?o:void 0}catch{return}}};var H=require("react/jsx-runtime"),Jl="M3.9 8.35 6.6 11.05 12.1 5.5",Xl=["M8 3.9v8.2","M3.9 8h8.2"];function as({paths:e}){return(0,H.jsx)("svg",{viewBox:"0 0 16 16",width:16,height:16,fill:"none",stroke:"currentColor",strokeWidth:1.5,strokeLinecap:"round",strokeLinejoin:"round","aria-hidden":"true",focusable:"false",children:e.map(t=>(0,H.jsx)("path",{d:t},t))})}function Ql(e,t){return e.masked!==void 0?e.masked:e.configured===!1?t("keysMissing"):"\u2022\u2022\u2022\u2022\u2022\u2022\u2022\u2022"}function Zl(e){return e.alias??e.masked??e.ref}function ds(e){let{route:t,t:n}=e,r=e.client??ss,o=(0,Q.useId)(),[i,s]=(0,Q.useState)(void 0),[a,d]=(0,Q.useState)(null),[u,m]=(0,Q.useState)(void 0),[p,g]=(0,Q.useState)(!1),[l,c]=(0,Q.useState)(void 0),[f,y]=(0,Q.useState)(""),[k,h]=(0,Q.useState)(""),[w,M]=(0,Q.useState)(void 0),v=(0,Q.useCallback)((A,I)=>{if(!A.ok){m({kind:"error",text:A.error??n("keysUnreachable")});return}s(A.entries),d(A.enabledRef),m(I===void 0?void 0:{kind:"status",text:I})},[n]);(0,Q.useEffect)(()=>{let A=!0;return(async()=>{let I=await r.list(t);A&&v(I,void 0)})(),()=>{A=!1}},[v,r,t]);let E=(0,Q.useCallback)(async(A,I)=>{g(!0),M(void 0),c(void 0);try{v(await A(),I)}finally{g(!1)}},[v]),R=()=>{c(void 0),y(""),h("")},F=(A,I)=>{c({kind:A,ref:I.ref}),y(A==="alias"?I.alias??"":""),h(""),M(void 0)},K=()=>{if(p||l===void 0)return;let A=l.kind,I=l.ref;if(A!=="alias"&&!Ln(k))return;let te=is(f);g(!0),(async()=>{try{if(A==="add"){let W=await r.add(t,k,te);v(W,n("keysAdded")),W.ok&&R();return}if(I===void 0)return;let V=A==="alias"?await r.rename(t,I,te):await r.replace(t,I,k);v(V,n(A==="alias"?"keysRenamed":"keysReplaced")),V.ok&&R()}finally{g(!1)}})()},P=()=>{if(l===void 0)return null;let A=l.kind,I=A!=="alias",te=I&&k.length>0&&!Ln(k);return(0,H.jsxs)("div",{className:"bre-keys-form",children:[(0,H.jsxs)("div",{className:"bre-keys-form-fields",children:[A==="value"?null:(0,H.jsx)("input",{className:"bre-text-input bre-keys-name",type:"text",value:f,placeholder:n("keysAliasPlaceholder"),"aria-label":n("keysAlias"),disabled:p,autoFocus:A==="alias",onChange:V=>y(V.target.value)}),I?(0,H.jsx)("input",{className:"bre-text-input bre-keys-secret",type:"password",autoComplete:"new-password",spellCheck:!1,value:k,placeholder:n(A==="add"?"keysValuePlaceholder":"keysNewValuePlaceholder"),"aria-label":n("keysValue"),"aria-invalid":te,disabled:p,autoFocus:!0,onChange:V=>h(V.target.value)}):null]}),te?(0,H.jsx)("p",{className:"bre-effort-message bre-error",role:"alert",children:n("keysAddIllegal")}):null,(0,H.jsxs)("div",{className:"bre-keys-form-actions",children:[(0,H.jsx)("button",{type:"button",className:"bre-link-button",disabled:p,onClick:R,children:n("keysCancel")}),(0,H.jsx)("button",{type:"button",className:"bre-primary-button",disabled:p||I&&!Ln(k),onClick:K,children:n(A==="add"?"keysAddConfirm":"keysSave")})]})]})},C=()=>l?.kind==="add"?(0,H.jsx)("li",{className:"bre-keys-form-row",children:P()}):(0,H.jsx)("li",{className:"bre-keys-add-row",children:(0,H.jsxs)("button",{type:"button",className:"bre-keys-add",disabled:p,onClick:()=>{c({kind:"add"}),y(""),h(""),M(void 0)},children:[(0,H.jsx)("span",{className:"bre-keys-add-mark","aria-hidden":"true",children:(0,H.jsx)(as,{paths:Xl})}),n("keysAdd")]})});return i===void 0?u===void 0?(0,H.jsx)("div",{className:"bre-keys"}):(0,H.jsxs)("div",{className:"bre-keys",children:[(0,H.jsx)("p",{className:"bre-effort-message bre-"+u.kind,role:u.kind==="error"?"alert":"status",children:u.text}),(0,H.jsx)("ul",{className:"bre-keys-list",children:C()})]}):(0,H.jsxs)("div",{className:"bre-keys",children:[(0,H.jsxs)("ul",{className:"bre-keys-list",children:[i.map(A=>{let I=Zl(A);return(0,H.jsxs)(Q.Fragment,{children:[(0,H.jsxs)("li",{className:"bre-keys-row","data-state":A.configured===!1?"missing":"ready",children:[A.alias===void 0?null:(0,H.jsx)("span",{className:"bre-keys-alias",children:A.alias}),(0,H.jsx)("span",{className:A.alias===void 0?"bre-keys-mask bre-keys-mask-plain":"bre-keys-mask",children:Ql(A,n)}),(0,H.jsx)("span",{className:"bre-keys-actions",children:w===A.ref?(0,H.jsxs)(H.Fragment,{children:[(0,H.jsx)("button",{type:"button",className:"bre-link-button bre-keys-danger",disabled:p,onClick:()=>{E(()=>r.remove(t,A.ref),n("keysRemoved"))},children:n("keysConfirmRemove")}),(0,H.jsx)("button",{type:"button",className:"bre-link-button",disabled:p,onClick:()=>M(void 0),children:n("keysCancel")})]}):(0,H.jsxs)(H.Fragment,{children:[(0,H.jsx)("button",{type:"button",className:"bre-link-button",disabled:p,onClick:()=>{M(A.ref),c(void 0)},children:n("keysRemove")}),(0,H.jsx)("button",{type:"button",className:"bre-link-button",disabled:p,onClick:()=>F("alias",A),children:n("keysAlias")}),(0,H.jsx)("button",{type:"button",className:"bre-link-button",disabled:p,onClick:()=>F("value",A),children:n("keysEdit")})]})}),(0,H.jsxs)("label",{className:"bre-keys-enable",title:n("keysEnable",{name:I}),children:[(0,H.jsx)("input",{type:"radio",name:o,className:"bre-keys-enabled",checked:A.enabled,disabled:p,"aria-label":n("keysEnable",{name:I}),onChange:()=>{E(()=>r.enable(t,A.ref),n("keysEnabledNote",{name:I}))}}),(0,H.jsx)("span",{className:"bre-keys-mark","aria-hidden":"true",children:A.enabled?(0,H.jsx)(as,{paths:[Jl]}):null}),(0,H.jsx)("span",{className:"bre-keys-enable-text",children:n("keysEnabled")})]})]}),l!==void 0&&l.ref===A.ref?(0,H.jsx)("li",{className:"bre-keys-form-row",children:P()}):null]},A.ref)}),C()]}),u===void 0?null:(0,H.jsx)("p",{className:"bre-effort-message bre-"+u.kind,role:u.kind==="error"?"alert":"status",children:u.text})]})}var Sn="bre-key-managed",eu="bre-keys-host",_r="data-bre-key-host",tu="data-bre-key-input",Mn="data-bre-region",De=new WeakMap;function nu(e){let t=e.querySelector(`input[${tu}]`);if(t instanceof HTMLInputElement)return t;let n=e.querySelector('input[type="password"]');return n instanceof HTMLInputElement?n:void 0}function ls(e){let t=De.get(e)?.host;if(t!==void 0&&t.isConnected)return t;let n=e.nextElementSibling;return n instanceof HTMLElement&&n.hasAttribute(_r)?n:void 0}function us(e,t){let n=t.route;if(n===void 0||n.length===0||nu(e)===void 0||e.parentElement===null)return;Ne(e,Sn,!0);let r=De.get(e),o=ls(e);o===void 0&&(r!==void 0&&fs(e,r),o=e.ownerDocument.createElement("div"),o.className=eu,e.after(o)),z(o,_r,n);let i=e.getAttribute(Mn);i===null?o.hasAttribute(Mn)&&o.removeAttribute(Mn):z(o,Mn,i);let s=()=>(0,Or.createElement)(xe,{fallbackText:t.t("keysPanelFailed")},(0,Or.createElement)(ds,{route:n,t:t.t,client:t.client})),a=De.get(e);if(a!==void 0&&a.route===n){(a.t!==t.t||a.client!==t.client)&&(a.t=t.t,a.client=t.client,a.mount.root.render(s()));return}a!==void 0&&(De.delete(e),a.mount.root.unmount()),De.set(e,{route:n,host:o,mount:vt(o,s(),{sync:!0}),t:t.t,client:t.client})}function fs(e,t){De.delete(e),Ue(t.mount)}function An(e){Ne(e,Sn,!1);let t=De.get(e);t!==void 0&&fs(e,t),ls(e)?.remove()}function cs(){for(let e of Array.from(document.querySelectorAll(`[${_r}]`))){let t=e.previousElementSibling;t instanceof HTMLElement&&De.has(t)?An(t):e.remove()}}var ps="http://www.w3.org/2000/svg",ru="data-bre-icon";function ou(e){let t=document.createElementNS(ps,"path");return t.setAttribute("d",e),t}function ms(e,t){let n=document.createElementNS(ps,"svg");return n.setAttribute("viewBox","0 0 16 16"),n.setAttribute("width","16"),n.setAttribute("height","16"),n.setAttribute("fill","none"),n.setAttribute("stroke","currentColor"),n.setAttribute("stroke-width","1.5"),n.setAttribute("stroke-linecap","round"),n.setAttribute("stroke-linejoin","round"),n.setAttribute("aria-hidden","true"),n.setAttribute("focusable","false"),n.setAttribute(ru,e),n.append(...t.map(ou)),n}var Hn="bre-key-field",ys="bre-key-eye",Rn="data-bre-key-input",ws="data-bre-eye-show",vs="data-bre-eye-hide",gs=["M1.5 8S4 3.75 8 3.75 14.5 8 14.5 8 12 12.25 8 12.25 1.5 8 1.5 8Z","M6.2 8a1.8 1.8 0 1 0 3.6 0 1.8 1.8 0 0 0-3.6 0Z"],Ir=new WeakMap;function Nr(e){let t=e.querySelector(`input[${Rn}]`);if(t instanceof HTMLInputElement)return t;let n=e.querySelector('input[type="password"]');return n instanceof HTMLInputElement?n:void 0}function xs(e){for(let t of Array.from(e.children))if(t instanceof HTMLButtonElement&&t.classList.contains(ys))return t}function ks(e,t){let n=Nr(e);if(n===void 0){On(e);return}Ir.set(e,t),z(n,Rn,""),Ne(e,Hn,!0);let r=xs(e)??su(e);z(r,ws,t.t("keyRevealShow")),z(r,vs,t.t("keyRevealHide")),Dr(r,n)}function On(e){let t=xs(e);t!==void 0&&t.remove(),Ir.delete(e),Ne(e,Hn,!1);let n=e.querySelector(`input[${Rn}]`);n instanceof HTMLInputElement&&(n.removeAttribute(Rn),n.type="password")}async function iu(e){try{let t=await fetch(`${qt}?route=${encodeURIComponent(e)}`,{method:"GET",cache:"no-store",credentials:"same-origin"});if(!t.ok)return;let n=await t.json();return n===null||typeof n!="object"||n.ok!==!0?void 0:typeof n.key=="string"&&n.key.length>0?n.key:void 0}catch{return}}function Dr(e,t){let n=t.type!=="password";z(e,"aria-pressed",n?"true":"false");let r=e.getAttribute(n?vs:ws);r!==null&&(z(e,"aria-label",r),z(e,"title",r)),At(e,t.disabled)}function hs(e,t){let n=Object.getOwnPropertyDescriptor(HTMLInputElement.prototype,"value");n?.set===void 0?e.value=t:n.set.call(e,t),e.dispatchEvent(new Event("input",{bubbles:!0}))}function su(e){let t=document.createElement("button");t.type="button",t.className=ys,t.append(bs("eye"),bs("eye-off"));let n,r=async()=>{let o=Nr(e),i=Ir.get(e);if(o===void 0||i===void 0)return;if(o.type!=="password"){n!==void 0&&o.value===n&&hs(o,""),n=void 0,o.type="password",Dr(t,o);return}let s=i.route;if(s!==void 0&&n===void 0&&o.value.length===0){z(t,"aria-busy","true");let a;try{a=await(i.loadKey??iu)(s)}catch{a=void 0}if(t.hasAttribute("aria-busy")&&t.removeAttribute("aria-busy"),a===void 0){let d=i.t("keyRevealFailed");z(t,"aria-label",d),z(t,"title",d);return}Nr(e)===o&&o.value.length===0&&(n=a,hs(o,a))}o.type="text",Dr(t,o)};return t.addEventListener("click",o=>{o.preventDefault(),o.stopPropagation(),r()}),e.append(t),t}function bs(e){let t=e==="eye-off"?[...gs,"M2.5 13.5 13.5 2.5"]:gs;return ms(e,t)}var Pr="bre-editor-tabs",au="bre-editor-tab",_n="data-bre-tab-id",Ot="bre-tabbed",Pe="data-bre-tab",Es="data-bre-provider",pe="data-bre-region",Ht="data-bre-editor-body",_t="data-bre-details";var du=".bre-headers",Ie="provider",ft="models",ct="advanced",lu=[Ie,ft,ct],uu="none",Ts=lu,Ls=Pr,Ms=au,Ss=_n,Nn='[class*="editorActions"], [class*="modelList"], [class*="modelCatalog"], [class*="modelEntry"]',fu='[class*="modelCatalog"], [class*="modelList"], [class*="modelEntry"]',As='[class*="rowCard"], [class*="addCard"], li';function Rs(){return{warned:new WeakSet}}function In(e){return e===null?null:e.closest(As)}function Hs(e,t){let n=Je(e),r=e.getBoundingClientRect().top,o=n?.scrollTop??0;n!==void 0&&(n.style.overflowAnchor="none"),z(e,Pe,t),Ns(e),n!==void 0&&requestAnimationFrame(()=>{if(n.style.overflowAnchor="",n.scrollTop!==o)return;let i=e.getBoundingClientRect().top-r;i!==0&&(n.scrollTop+=i)})}function Cr(e,t,n){if(!e.isConnected)return;let r=new Set;for(let o of Array.from(e.querySelectorAll(Nn))){let i=o.closest(As);i!==null&&r.add(i)}for(let o of Array.from(e.querySelectorAll(`.${Ot}`)))r.has(o)||Dn(o);for(let o of r)try{hu(o,t)}catch(i){n.warned.has(o)||(n.warned.add(o),console.warn("[bre] editor tabs: rolled a provider card back to the official layout:",i)),Dn(o)}}function Os(){for(let e of Array.from(document.querySelectorAll(`.${Ot}`))){e.classList.remove(Ot),e.removeAttribute(Pe),e.removeAttribute(Ht);for(let t of Array.from(e.querySelectorAll(`[${pe}]`)))t.removeAttribute(pe)}for(let e of Array.from(document.querySelectorAll(`[${Pe}]`)))e.removeAttribute(Pe);for(let e of Array.from(document.querySelectorAll(`[${pe}]`)))e.removeAttribute(pe);for(let e of Array.from(document.querySelectorAll(`[${Ht}]`)))e.removeAttribute(Ht);for(let e of Array.from(document.querySelectorAll(`details[${_t}]`)))e.removeAttribute("open"),e.removeAttribute(_t);for(let e of Array.from(document.querySelectorAll(`.${Hn}`)))On(e);for(let e of Array.from(document.querySelectorAll(`.${Sn}`)))An(e);cs()}function cu(e){for(let n of Array.from(e.children))if(n instanceof HTMLElement&&!n.matches('[class*="editorHeader"], [class*="editorTitle"], [class*="editorActions"], [class*="editorRoute"]')&&n.matches('[class*="editor"]')&&(n.querySelector(Nn)!==null||n.querySelector("input, select")!==null))return n;let t=e.querySelector(Nn);for(;t!==null&&t.parentElement!==e;)t=t.parentElement;return t!==null&&t!==e?t:void 0}function pu(e){let t={header:void 0,models:void 0,actions:void 0,fields:[]};_s(e,t,0);let{actions:n,fields:r,header:o,models:i}=t;if(!(n===void 0||r.length===0)&&r.some(s=>s.querySelector("input, select, textarea")!==null))return{header:o,models:i,actions:n,fields:r}}var mu=4;function _s(e,t,n){if(!(n>mu)){for(let r of Array.from(e.children))if(r instanceof HTMLElement&&!r.matches('[class*="bre-"], [data-plugin]')){if(t.header===void 0&&r.matches('[class*="editorHeader"], [class*="editorTitle"]')){t.header=r;continue}if(r.matches('[class*="editorActions"]')){t.actions??(t.actions=r);continue}if(r.matches(fu)){t.models??(t.models=r);continue}if(r.querySelector(Nn)!==null){_s(r,t,n+1);continue}if(r.querySelector('[class*="editorActions"]')!==null){t.actions??(t.actions=r);continue}r.querySelector("input, select, textarea")!==null&&t.fields.push(r)}}}function gu(e){let n=e.querySelector(`[${Es}]`)?.getAttribute(Es);return n==null||n===""?void 0:n}function hu(e,t){let n=cu(e);if(n===void 0){Dn(e);return}let r=pu(n);if(r===void 0){Dn(e);return}let o=e.querySelector(du),i=gu(e);for(let d of r.fields)z(d,pe,Ie),ks(d,{t:t.t,route:i}),us(d,{t:t.t,route:i});r.header!==void 0&&z(r.header,pe,uu),r.models!==void 0&&z(r.models,pe,ft),z(n,Ht,""),o!==null&&z(o,pe,ct),yu(n);let s=new Set([Ie]);r.models!==void 0&&s.add(ft),o!==null&&s.add(ct);let a=e.getAttribute(Pe)??Ie;z(e,Pe,s.has(a)?a:Ie),Ne(e,Ot,!0),bu(e,t,s)}function bu(e,t,n){let r=e.querySelector(`.${Pr}`);r!==null&&(z(r,"aria-label",t.t("editorTabsLabel")),Tn(Rt(r,Ie),t.t("editorTabProvider")),Tn(Rt(r,ft),t.t("editorTabModels")),Tn(Rt(r,ct),t.t("editorTabAdvanced")),At(Rt(r,ft),!n.has(ft)),At(Rt(r,ct),!n.has(ct)),Ns(e,r))}function Ns(e,t){let n=t??e.querySelector(`.${Pr}`);if(n===null)return;let r=e.getAttribute(Pe)??Ie;for(let o of Array.from(n.querySelectorAll(`[${_n}]`)))z(o,"aria-selected",o.getAttribute(_n)===r?"true":"false")}function Rt(e,t){for(let n of Array.from(e.children))if(n instanceof HTMLElement&&n.getAttribute(_n)===t)return n}function Dn(e){e.classList.remove(Ot),e.removeAttribute(Pe),e.removeAttribute(Ht);for(let t of Array.from(e.querySelectorAll(`[${pe}]`)))t.getAttribute(pe)===Ie&&(On(t),An(t)),t.removeAttribute(pe);wu(e)}function yu(e){for(let t of Array.from(e.querySelectorAll("details")))t.hasAttribute("open")||(z(t,_t,"closed"),z(t,"open",""))}function wu(e){for(let t of Array.from(e.querySelectorAll(`details[${_t}]`)))t.removeAttribute("open"),t.removeAttribute(_t)}var Nt="data-bre-row-provider",Ds="{provider}",vu=["rowCard","setupCard"];function Is(){return pn()}function Qe(e){for(let t of vu)for(let n of Array.from(e.querySelectorAll(`[class*="${t}"]`))){let r=n.parentElement;if(!(r===null||r.tagName!=="UL")&&re(r).length!==0)return r}}function Dt(e){return e.querySelector('[class*="rowHead"]')??void 0}function pt(e){let t=e.querySelector('[class*="rowName"]')?.textContent?.trim();return t!==void 0&&t.length>0?t:void 0}function xu(e){let t=e.indexOf(Ds);if(!(t<0))return{prefix:e.slice(0,t),suffix:e.slice(t+Ds.length)}}function ku(e){let t=e.trim();if(t.length===0)return;let n=/^(.*) \(([^()]*)\)$/.exec(t);if(n!==null){let r=n[2];return r.length===0?void 0:r}return/\s/.test(t)?void 0:t}var Eu='[class*="rowCard"], [class*="setupCard"], [class*="addCard"]';function Tu(e){let t=e.closest(Eu);for(let n=e;n!==null&&n!==t;n=n.parentElement)if(n.matches('[data-plugin], [class*="bre-"]'))return!0;return!1}function Le(e,t){let n=e.querySelector("[data-bre-provider]")?.getAttribute("data-bre-provider");if(typeof n=="string"&&n.length>0)return n;for(let r of t.editProvider){let o=xu(r);if(o!==void 0)for(let i of Array.from(e.querySelectorAll("button[aria-label]"))){if(Tu(i))continue;let s=i.getAttribute("aria-label")??"";if(s.length<=o.prefix.length+o.suffix.length||!s.startsWith(o.prefix)||!s.endsWith(o.suffix))continue;let a=ku(s.slice(o.prefix.length,s.length-o.suffix.length));if(a!==void 0)return a}}}function Fr(e){let t=e.getAttribute(Nt);return t===null||t.length===0?void 0:t}function Lu(e){return Lt(e,Fr)}function Ps(e,t,n){if(!e.isConnected)return;let r=Qe(e);if(r===void 0)return;let o=t.labels();for(let i of re(r)){let s=Le(i,o);if(s===void 0){i.removeAttribute(Nt);continue}Fr(i)!==s&&i.setAttribute(Nt,s)}hn(e,r,Mu(t),n)}function Mu(e){return{rowOf:t=>{let n=t.closest("li");return n instanceof HTMLElement?n:void 0},idOf:Fr,labelOf:pt,order:t=>yo(t),commit:t=>{ho(Lu(t))},seatOf:Dt,seatDrags:!0,gripLabel:(t,n)=>e.t("providerReorderAria",{provider:pt(t)??n}),gripHint:()=>e.t("providerReorderHint")}}function Cs(e){bn(e);let t=Array.from(document.querySelectorAll(`[${Nt}]`));gn(t);for(let n of t)n.removeAttribute(Nt)}var mt="data-bre-provider-switch",Pn="bre-row-disabled";function Ks(){return{switches:new WeakSet}}function Ws(e,t,n){if(!e.isConnected)return;let r=Qe(e);if(r===void 0)return;let o=t.labels();for(let i of Array.from(r.children)){if(!(i instanceof HTMLElement))continue;let s=Le(i,o);if(s===void 0)continue;let a=Dt(i);a!==void 0&&(Su(i,a,s,t,n),i.classList.toggle(Pn,!it(s)))}}function qs(){for(let e of Array.from(document.querySelectorAll(`[${mt}]`)))e.remove();for(let e of Array.from(document.querySelectorAll(`.${Pn}`)))e.classList.remove(Pn)}function Su(e,t,n,r,o){let i=t.querySelector(`[${mt}]`);if(i!==null){Fs(i,e,n,r);return}let s=document.createElement("button");s.className="bre-provider-switch",s.setAttribute("type","button"),s.setAttribute("role","switch"),s.setAttribute(mt,n),Fs(s,e,n,r),Au(s,e,o);let a=t.querySelector('[class*="rowActions"]');a===null?t.appendChild(s):a.insertBefore(s,a.firstChild)}function Fs(e,t,n,r){let o=r.t("providerToggleAria",{provider:pt(t)??n}),i=r.t("providerToggleHint"),s=it(n)?"true":"false";e.getAttribute(mt)!==n&&e.setAttribute(mt,n),e.getAttribute("aria-checked")!==s&&e.setAttribute("aria-checked",s),e.getAttribute("aria-label")!==o&&e.setAttribute("aria-label",o),e.getAttribute("title")!==i&&e.setAttribute("title",i)}function Au(e,t,n){n.switches.has(e)||(n.switches.add(e),e.addEventListener("click",r=>{r.preventDefault(),r.stopPropagation();let o=e.getAttribute(mt);if(o===null)return;let i=!it(o);xo(o,i),e.setAttribute("aria-checked",i?"true":"false"),t.classList.toggle(Pn,!i)}))}var Cn="data-bre-provider-delete",Bs='[class*="rowActions"]',Us='[class*="dangerButton"]',Ru="bre-provider-delete";function js(e,t){if(!e.isConnected)return;let n=Qe(e);if(n===void 0)return;let r=t.labels(),o=Hu(n)??t.t("providerRemoveDisabled");for(let i of Array.from(n.children)){if(!(i instanceof HTMLElement))continue;let s=Le(i,r);if(s===void 0)continue;let a=Dt(i);if(a===void 0)continue;let d=a.querySelector(Bs);if(d===null)continue;let u=d.querySelector(`[${Cn}]`);if(d.querySelector(Us)!==null){u!==null&&u.remove();continue}let m=u??Ou();d.lastElementChild!==m&&d.appendChild(m),_u(m,s,o,t.t("providerRemoveLocked",{provider:pt(i)??s}))}}function Gs(){for(let e of Array.from(document.querySelectorAll(`[${Cn}]`)))e.remove()}function Hu(e){let n=e.querySelector(`${Bs} ${Us}`)?.textContent?.trim()??"";return n.length>0?n:void 0}function Ou(){let e=document.createElement("button");return e.className=Ru,e.setAttribute("type","button"),e.setAttribute("disabled",""),e}function _u(e,t,n,r){e.getAttribute(Cn)!==t&&e.setAttribute(Cn,t),e.textContent!==n&&(e.textContent=n),e.getAttribute("aria-label")!==r&&e.setAttribute("aria-label",r),e.getAttribute("title")!==r&&e.setAttribute("title",r)}var Fn="data-bre-provider-disabled-group",Kr="bre-row-hidden";function zs(){return{expanded:!1}}function $s(e,t,n){if(!e.isConnected)return;let r=Qe(e);if(r===void 0)return;let o=Ys(r,t.labels()),i=o.filter(d=>!d.enabled).length,s=Js(r);if(i===0){s!==void 0&&s.remove(),Wr(o,n);return}let a=s??Nu(r,t,n);r.nextElementSibling!==a&&r.parentElement?.insertBefore(a,r.nextSibling),Wr(o,n),Xs(a,i,t,n)}function Vs(){for(let e of Array.from(document.querySelectorAll(`[${Fn}]`)))e.remove();for(let e of Array.from(document.querySelectorAll(`.${Kr}`)))e.classList.remove(Kr)}function Ys(e,t){let n=[];for(let r of Array.from(e.children)){if(!(r instanceof HTMLElement)||r.getAttribute(Fn)!==null)continue;let o=Le(r,t);o!==void 0&&n.push({row:r,id:o,enabled:it(o)})}return n}function Wr(e,t){for(let n of e){let r=!n.enabled&&!t.expanded;n.row.classList.toggle(Kr,r)}}function Js(e){let t=e.parentElement;if(t!==null)return t.querySelector(`[${Fn}]`)??void 0}function Nu(e,t,n){let r=document.createElement("button");return r.className="bre-provider-disabled-group",r.setAttribute("type","button"),r.setAttribute(Fn,""),r.addEventListener("click",o=>{o.preventDefault(),o.stopPropagation(),n.expanded=!n.expanded,Du(e,t,n)}),e.parentElement?.insertBefore(r,e.nextSibling),r}function Du(e,t,n){let r=Ys(e,t.labels());Wr(r,n);let o=Js(e);if(o===void 0)return;let i=r.filter(s=>!s.enabled).length;if(i===0){o.remove();return}Xs(o,i,t,n)}function Xs(e,t,n,r){let o=n.t(r.expanded?"providerDisabledGroupHide":"providerDisabledGroupShow",{count:t}),i=n.t("providerDisabledGroupHint"),s=r.expanded?"true":"false";e.textContent!==o&&(e.textContent=o),e.getAttribute("aria-expanded")!==s&&e.setAttribute("aria-expanded",s),e.getAttribute("aria-label")!==o&&e.setAttribute("aria-label",o),e.getAttribute("title")!==i&&e.setAttribute("title",i)}var It="data-bre-row-model",qr="bre-model-grid";function Zs(){return pn()}function Iu(e){let t=[];for(let n of Array.from(e.querySelectorAll('[class*="modelList"]')))re(n).filter(o=>o.matches('[class*="modelEntry"]')).length!==0&&t.push(n);return t}function ea(e){for(let t of e){if(t.type!=="childList")continue;let n=t.target;if(n instanceof HTMLElement&&n.matches('[class*="modelList"]')&&re(n).some(r=>r.matches('[class*="modelEntry"]')))return!0;for(let r of[t.addedNodes,t.removedNodes])for(let o of Array.from(r))if(o instanceof HTMLElement&&o.matches('[class*="modelEntry"]'))return!0}return!1}function Kn(e){let t=e.getAttribute(It);return t===null||t.length===0?void 0:t}function Br(e,t){let n=e.closest("li");if(n!==null)return Le(n,t.labels())}function Qs(e,t){let n=Ee(e,t.labels().modelName);return n.length>0?n:Kn(e)}function Pu(e,t){return{rowOf:n=>{let r=n.closest('[class*="modelEntry"]');return r instanceof HTMLElement?r:void 0},idOf:Kn,labelOf:n=>Qs(n,t),order:n=>{let r=Br(e,t);return r===void 0?n:Ho(r,n)},commit:n=>{let r=Br(n,t);r!==void 0&&Ao(r,Lt(n,Kn))},seatOf:n=>n.querySelector('[class*="modelRow"]')??void 0,seatDrags:!1,gripLabel:(n,r)=>t.t("modelReorderAria",{model:Qs(n,t)??r}),gripHint:()=>t.t("modelReorderHint"),decorate:(n,r)=>{r.classList.add(qr)}}}function Ur(e,t,n){if(!e.isConnected)return;let r=t.labels();for(let o of Iu(e))if(Br(o,t)!==void 0){for(let i of re(o)){let s=Ee(i,r.modelId);if(s.length===0){i.removeAttribute(It);continue}Kn(i)!==s&&i.setAttribute(It,s)}hn(e,o,Pu(o,t),n)}}function ta(e){bn(e);for(let n of Array.from(document.querySelectorAll(`.${qr}`)))n.classList.remove(qr);let t=Array.from(document.querySelectorAll(`[${It}]`));gn(t);for(let n of t)n.removeAttribute(It)}var Cu="settings.models",Me={capacity:["modelAdvanced","Model options","Capacities"],modelId:["modelId","Model ID"],modelName:["modelName","Display name"],routeId:["customRoute","Provider ID"],baseUrl:["baseUrl","Base URL"],apiProtocol:["customApi","API protocol"],apply:["apply","Apply"],cancel:["cancel","Cancel"],editProvider:["editProvider","Edit {provider}"]};function ra(e){let{ctx:t,api:n,t:r,onIdle:o,refreshed:i}=e,s=()=>{let W=t.locale.bind(Cu),B=([U,...S])=>{let N=W(U);return N===U||N.trim()===""?S:[N,...S]};return{capacity:B(Me.capacity),modelId:B(Me.modelId),modelName:B(Me.modelName),routeId:B(Me.routeId),baseUrl:B(Me.baseUrl),apiProtocol:B(Me.apiProtocol),apply:B(Me.apply),cancel:B(Me.cancel),editProvider:B(Me.editProvider)}},a=120,d=zi(),u=Is(),m={t:r,labels:s},p=Ks(),g={t:r,labels:s},l={t:r,labels:s},c=zs(),f={t:r,labels:s},y=Zs(),k={t:r,labels:s},h=Rs(),w={t:r},M,v,E,R,F=!1,K={api:n,describeNamespace:()=>ne(n),t:r,labels:s,onIdle:o,onBackoff:W=>{P(W)},mount(W,B){let U=document.createElement("div");U.className="bre-effort-slot",U.dataset.plugin=X,W.appendChild(U);let S=(0,na.createRoot)(U),N=D=>{S.render((0,jr.createElement)(xe,{fallbackText:r("renderFailed"),children:i(()=>(0,jr.createElement)(ln,D))}))};return N(B),{unmount:()=>{S.unmount()},render:N}}};function P(W){F||v!==void 0||(v=window.setTimeout(()=>{v=void 0,C()},W))}function C(){F||M!==void 0||(M=window.setTimeout(()=>{M=void 0,R?.(),os(ie(),K,d),Cr(ie(),w,h),Ps(ie(),m,u),Ws(ie(),g,p),js(ie(),l),$s(ie(),f,c),Ur(ie(),k,y)},a))}let A=W=>{F||E!==void 0||(R=W,W(),es(),E=new MutationObserver(B=>{W(),Cr(ie(),w,h),ea(B)&&(Ur(ie(),k,y),ns(ie())),C()}),E.observe(document.body,{childList:!0,subtree:!0}),C())},I=()=>{F=!0,M!==void 0&&(window.clearTimeout(M),M=void 0),v!==void 0&&(window.clearTimeout(v),v=void 0),E?.disconnect(),E=void 0};return{state:d,labels:s,start:A,stopObserver:I,teardown:()=>{I(),ji(d,K);for(let[,W]of d.mounted)W.editor.unmount();d.mounted.clear(),Cs(u),qs(),Gs(),Vs(),wi(),ta(y),Os(),ts()},flushOnUnload:()=>{Gi(d,K)},schedule:C}}function Fu(e,t){let n=e?.list?.getSnapshot(),r=n?.current;if(typeof r=="string"&&r.length>0)return r;let o=t?.adapter?.current?.getSnapshot?.()?.key;if(typeof o=="string"&&o.length>0)return o;for(let[i,s]of Object.entries(n?.byId??{}))if(!(s===void 0||(s.retainedBy?.mainView??0)<=0))return typeof s.id=="string"&&s.id.length>0?s.id:i}function oa(e){let t,n=new Map,r=(s,a)=>{for(let[d,u]of n){if(d===a)continue;let m;try{m=s.directoryFor(u.sessionId)===d}catch{m=!1}m||(u.restore(),n.delete(d))}};return{ensure:()=>{let s=e.ctx,a=s.get?.("sessions"),d=s.get?.("uiSession"),u=s.get?.("modelDirectories"),m=Fu(a,d);if(!(m===void 0||u===void 0))try{let p=u.directoryFor(m);return r(u,p),t!==void 0&&t.sessionId===m&&t.directory===p||(n.has(p)||n.set(p,{sessionId:m,restore:Bo(p,{configuredEffort:e.configuredEffort})}),t={sessionId:m,directory:p}),p}catch{t=void 0;return}},dispose:()=>{for(let[,s]of n)s.restore();n.clear()}}}var Ku="conversation.input.model";function ia(e){return e.querySelector("[data-composer-card]")??void 0}function Gr(e){return e.querySelector(`[data-slot="${Ku}"]`)??void 0}function sa(e){let t=Gr(e)??e;return Array.from(t.querySelectorAll('button[aria-haspopup="menu"]'))}function aa(e,t){let n=e.getAttribute("aria-controls");if(n===null||n.length===0)return;let r=t.getElementById(n);if(r!==null)return r.getAttribute("role")==="menu"?r:void 0}function zr(e=document){let t=ia(e);if(t===void 0)return;for(let r of sa(t)){let o=aa(r,e);if(o!==void 0)return o}let n=Gr(t)??t;for(let r of Array.from(n.querySelectorAll('[role="menu"]')))if(r.previousElementSibling?.matches('button[aria-haspopup="menu"]'))return r}function $r(e=document){let t=ia(e);if(t===void 0)return;let n=Gr(t),r=sa(t),o=r[0];if(o!==void 0){for(let i of r)if(aa(i,e)!==void 0)return i;for(let i of r)if(i.nextElementSibling?.matches('[role="menu"]'))return i;return n===void 0?r.at(-1):o}}function da(){return zr()}function la(){return $r()}var Ce=require("react");var J=require("react");var _=require("react/jsx-runtime"),Wu=["claude-cli/2.1.161 (external, cli)","claude-code/1.0.0","Kilo-Code/1.0"];function ua(e){let t=0,n=Object.entries(e??{}).map(([r,o])=>({id:t+=1,name:r,value:o}));return n.length===0&&n.push({id:t+=1,name:"",value:""}),{rows:n}}function qu(e){let t={},n=!1;for(let o of e.rows){let i=o.name.trim();i.length!==0&&(t[i]=o.value,i.toLowerCase()==="user-agent"&&(n=!0))}let r=e.userAgent?.trim();return!n&&r!==void 0&&r.length>0&&(t["user-agent"]=r),t}function fa({route:e,api:t,t:n}){let r=(0,J.useId)(),[o,i]=(0,J.useState)(void 0),[s,a]=(0,J.useState)({rows:[]}),[d,u]=(0,J.useState)(!1),[m,p]=(0,J.useState)(!1),[g,l]=(0,J.useState)(!0),[c,f]=(0,J.useState)(!1),[y,k]=(0,J.useState)(!1),[h,w]=(0,J.useState)(void 0),[M,v]=(0,J.useState)(void 0),[E,R]=(0,J.useState)(!1),F=(0,J.useRef)(1),K=(0,J.useRef)(null);(0,J.useEffect)(()=>{let S=!0;return(async()=>{try{let N=await ne(t);if(!S)return;let D=cr(N.namespace,e);i(D),a(ua(D)),k(N.writable!==!0)}catch{S&&k(!0)}finally{S&&l(!1)}})(),()=>{S=!1}},[t,e]),(0,J.useEffect)(()=>{let S=!0;return(async()=>{try{let D=await(await fetch(io,{method:"GET"})).json();S&&D.ok===!0&&D.data!==void 0&&v(D.data)}catch{}})(),()=>{S=!1}},[]),(0,J.useEffect)(()=>{let S=K.current;if(S===null)return;let N=()=>{R(S.dataset.breRegion==="advanced")};N();let D=new MutationObserver(N);return D.observe(S,{attributes:!0,attributeFilter:["data-bre-region"]}),()=>{D.disconnect()}},[]);let P=()=>{a(S=>({...S,rows:[...S.rows,{id:F.current+=1,name:"",value:""}]})),w(void 0)},C=(S,N)=>{a(D=>({...D,rows:D.rows.map(ee=>ee.id===S?{...ee,...N}:ee)})),w(void 0)},A=S=>{a(N=>({...N,rows:N.rows.filter(D=>D.id!==S)})),w(void 0)},I=()=>{a(ua(o)),p(!1),w(void 0)},te=async S=>{f(!0),w(void 0);let N;try{N=await pr(t,e,S)}catch(D){N={ok:!1,error:D instanceof Error?D.message:String(D)}}if(f(!1),!N.ok){w({kind:"error",text:N.error==="no-route"?n("headersNoRoute"):N.error==="read-only"?n("headersReadOnly"):n("headersError",{error:N.error})});return}i(S),p(!1),w({kind:"success",text:Object.keys(S).length===0?n("headersCleared"):n("headersSaved")})},V=Object.entries(o??{}),W=y||c,B=V.length,U=E;return(0,_.jsxs)("div",{className:"bre-headers",ref:K,"data-plugin":X,"data-open":d?"1":"0",children:[(0,_.jsx)("div",{className:"bre-headers-head",children:m||E?(0,_.jsx)("span",{className:"bre-effort-title",children:n("headersTitle")}):(0,_.jsxs)("button",{type:"button",className:"bre-headers-disclosure","aria-expanded":d,"aria-label":`${n("headersTitle")} ${e}`,onClick:()=>{u(!d),w(void 0)},children:[(0,_.jsx)("span",{className:"bre-effort-title",children:n("headersTitle")}),g||B===0?null:(0,_.jsx)("span",{className:"bre-headers-count",children:B}),(0,_.jsx)("span",{className:"bre-headers-chevron","aria-hidden":"true",children:"\u203A"})]})}),!d&&!m&&!E?null:(0,_.jsxs)(_.Fragment,{children:[(0,_.jsx)("p",{className:"bre-effort-note",children:n("headersHint")}),M===void 0?null:(0,_.jsxs)(_.Fragment,{children:[M.environment.preferOfficialLayer?(0,_.jsx)("p",{className:"bre-effort-note bre-warn",children:n("headersConflictPatched")}):null,M.conflicts.length===0&&(M.headerConflicts?.length??0)===0?null:(0,_.jsx)("p",{className:"bre-effort-note bre-warn",children:n("headersConflictOrigin")}),M.environment.siblings.length===0?null:(0,_.jsx)("p",{className:"bre-effort-note bre-warn",children:n("headersConflictSiblings",{names:M.environment.siblings.map(S=>S.name).join(", ")})})]}),g?null:m||U?(0,_.jsxs)("div",{className:"bre-headers-edit",children:[(0,_.jsxs)("div",{className:"bre-headers-columns","aria-hidden":"true",children:[(0,_.jsx)("span",{children:n("headersName")}),(0,_.jsx)("span",{children:n("headersValue")}),(0,_.jsx)("span",{})]}),s.rows.map(S=>(0,_.jsxs)("div",{className:"bre-headers-row",children:[(0,_.jsx)("input",{type:"text",className:"bre-text-input bre-headers-name",value:S.name,disabled:W,placeholder:n("headersNamePlaceholder"),"aria-label":n("headersName"),onChange:N=>{C(S.id,{name:N.target.value})}}),(0,_.jsx)("input",{type:"text",className:"bre-text-input bre-headers-value",value:S.value,disabled:W,list:S.name.trim().toLowerCase()==="user-agent"?r:void 0,placeholder:n("headersValue"),"aria-label":n("headersValue"),onChange:N=>{C(S.id,{value:N.target.value})}}),(0,_.jsx)("button",{type:"button",className:"bre-link-button bre-headers-remove",disabled:W,"aria-label":`${n("headersClear")} ${S.name}`,onClick:()=>{A(S.id)},children:"\xD7"})]},S.id)),(0,_.jsx)("button",{type:"button",className:"bre-link-button bre-headers-add",disabled:W,onClick:P,children:n("headersAdd")}),!1,(0,_.jsx)("datalist",{id:r,children:Wu.map(S=>(0,_.jsx)("option",{value:S},S))}),(0,_.jsx)("p",{className:"bre-effort-note bre-headers-legacy",hidden:!0,children:n("headersUserAgentHint")}),(0,_.jsxs)("div",{className:"bre-effort-actions",children:[(0,_.jsx)("button",{type:"button",className:"bre-primary-button",disabled:W,onClick:()=>{te(qu(s))},children:n("headersSave")}),(0,_.jsx)("button",{type:"button",className:"bre-secondary-button",disabled:W,onClick:I,children:n("headersCancel")})]})]}):(0,_.jsxs)("div",{className:"bre-headers-rows",children:[V.length===0?(0,_.jsx)("p",{className:"bre-effort-note",children:n("headersEmpty")}):V.map(([S,N])=>(0,_.jsxs)("div",{className:"bre-headers-row",children:[(0,_.jsx)("span",{className:"bre-headers-name",children:S}),(0,_.jsx)("span",{className:"bre-headers-value bre-headers-masked",children:"\u2022".repeat(Math.min(N.length,24))})]},S)),y?null:(0,_.jsx)("div",{className:"bre-effort-actions",children:(0,_.jsx)("button",{type:"button",className:"bre-secondary-button",disabled:W,onClick:()=>{p(!0),w(void 0)},children:n("headersEdit")})})]})]}),h===void 0?null:(0,_.jsx)("p",{className:"bre-effort-message bre-"+h.kind,role:h.kind==="error"?"alert":"status",children:h.text})]})}var Vr=require("react");var Bu={provider:"editorTabProvider",models:"editorTabModels",advanced:"editorTabAdvanced"};function ca({host:e,t}){return(0,Vr.createElement)("div",{className:Ls,role:"tablist","aria-label":t("editorTabsLabel")},...Ts.map(n=>(0,Vr.createElement)("button",{key:n,type:"button",role:"tab",className:Ms,[Ss]:n,onClick:r=>{r.preventDefault(),r.stopPropagation();let o=In(e.current);o!==null&&Hs(o,n)}},t(Bu[n]))))}var pa="settings.models.provider-card";function Uu({provider:e,api:t,t:n}){let r=(0,Ce.useRef)(null);(0,Ce.useEffect)(()=>{let i=r.current,s=In(i);if(i===null||s===null)return;let a=s,d=()=>s.querySelector('[class*="_editor"]')!==null,u=()=>{let p=d()?"1":"0";i.dataset.edit!==p&&(i.dataset.edit=p)};u();let m=new MutationObserver(u);return m.observe(a,{childList:!0,subtree:!0}),()=>{m.disconnect()}},[]);let o=e?.provider;return typeof o!="string"||o.length===0?null:(0,Ce.createElement)("div",{ref:r,className:"bre-headers-host","data-bre-provider":o},(0,Ce.createElement)(ca,{host:r,t:n}),(0,Ce.createElement)(fa,{route:o,api:t,t:n}))}function ma(e,t,n){let r=e,o=r.slots?.inject(pa,()=>{r.slots?.register({name:pa,key:oe,inject:()=>({api:t,t:n})},Uu)});return typeof o=="function"?o:()=>{}}var ue=require("react");function ga(e){let{t}=e,n=(0,ue.useSyncExternalStore)(Ut,ce),r=()=>{fo(!n)};return(0,ue.createElement)("div",{className:"bre-slider-setting"},(0,ue.createElement)("div",{className:"bre-slider-setting-row"},(0,ue.createElement)("div",{className:"bre-slider-setting-copy"},(0,ue.createElement)("div",{className:"bre-slider-setting-title"},t("sliderToggleTitle")),(0,ue.createElement)("div",{className:"bre-slider-setting-description"},t("sliderToggleDescription"))),(0,ue.createElement)("div",{className:"bre-slider-setting-control"},(0,ue.createElement)("span",{className:"bre-slider-setting-state"},t(n?"settingOn":"settingOff")),(0,ue.createElement)("button",{type:"button",role:"switch","aria-label":t("sliderToggleAria"),"aria-checked":n,className:"bre-slider-setting-switch"+(n?" is-on":""),onClick:r},(0,ue.createElement)("span",{className:"bre-slider-setting-switch-knob","aria-hidden":!0})))))}function ha(e,t){let n=e,r=n.slots?.inject("settings.models.footer",()=>{n.slots?.register({name:"settings.models.footer",id:X+"-slider-toggle",order:15,inject:()=>({t})},ga)});return typeof r=="function"?r:()=>{}}var ju=X,Gu=["slots","locale","connection","remote","remote.settings"];function zu(e){e.effect(()=>e.locale.register(Un,{zh:lo,en:ao}),"dsh-model-think-level: dictionaries");let t=document.createElement("style");t.dataset.plugin=X,t.dataset.pluginStyles=X,t.textContent=_o,document.head.appendChild(t),e.effect(()=>()=>t.remove(),"dsh-model-think-level: stylesheet");let n=(()=>{try{let l=e.get?.("configForms");try{let f=l?.get?.(oe);if(f!==void 0)return f}catch{}return e.get?.("settingsScope")?.bind?.({namespace:oe})}catch{return}})(),r=n===void 0?{settings:e.remote.settings}:{settings:e.remote.settings,scope:n},o=e.locale.bind(Un),i=()=>{let l=e.locale;return typeof l.subscribe=="function"&&typeof l.getSnapshot=="function"?l:void 0},s=l=>{let c=i();return c===void 0?l():(0,ba.createElement)(so,{locale:c,children:l})},a=ii({api:r}),d=oa({ctx:e,configuredEffort:a.of}),u=ti({menuOf:da,triggerOf:la,t:o,refreshed:s,sliderEnabled:ce,directory:d.ensure}),m=ai({api:r}),p=ra({ctx:e,api:r,t:o,onIdle:m.run,refreshed:s}),g=()=>{d.ensure(),u.reconcile()};e.effect(()=>(p.start(g),()=>{p.teardown(),u.dispose(),d.dispose()}),"dsh-model-think-level: DOM injector"),e.effect(()=>{let l=()=>{p.flushOnUnload()};return window.addEventListener("pagehide",l),()=>{window.removeEventListener("pagehide",l)}},"dsh-model-think-level: ledger flush on unload"),e.effect(()=>{let l=()=>{p.state.describePromise=void 0,a.invalidate(),p.schedule()},c=[e.remote.$on("settings/document-updated",f=>{f===oe&&l()}),e.on("connection/reset",l)];return()=>{for(let f of c)f()}},"dsh-model-think-level: pushed invalidations"),e.effect(()=>{let l=h=>{h.key===Bt?co(h.newValue!=="false"):h.key===jt?bo(rt(h.newValue)):h.key===zt?ko(wo(h.newValue)):h.key===Vt&&Ro(Qn(h.newValue))};window.addEventListener("storage",l);let c=Ut(()=>{p.schedule()}),f=Gt(()=>{p.schedule()}),y=$t(()=>{p.schedule()}),k=Yt(()=>{p.schedule()});return()=>{window.removeEventListener("storage",l),c(),f(),y(),k()}},"dsh-model-think-level: client preferences"),e.effect(()=>ha(e,o),"dsh-model-think-level: footer slot activation"),e.effect(()=>ma(e,r,o),"dsh-model-think-level: provider-card slot activation")}

		return module.exports;
	}
});

//# sourceMappingURL=client.js.map
