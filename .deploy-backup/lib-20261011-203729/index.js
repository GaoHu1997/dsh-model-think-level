// src/index.ts
import Schema from "@deepseek-ai/schemastery";

// src/constants.ts
var PLUGIN_ID = "dsh-model-think-level";
var PROBE_PATH = "/dsh-model-think-level/raw-models";
var DIAG_PATH = "/dsh-model-think-level/header-bridge";
var PROVIDER_KEY_PATH = "/dsh-model-think-level/provider-key";
var KEY_INDEX_PATH = "/dsh-model-think-level/key-index";
var AUTOFILL_CONFIG_PATH = "/dsh-model-think-level/autofill-config";
var HEADERS_CONFIG_PATH = "/dsh-model-think-level/headers-config";
var PI_AI_NS = "llm-pi-ai";
var UNSET_MARKER = "reasoningEffortsUnset";
var INPUT_UNSET_MARKER = "inputUnset";
var AUTOFILL_MARKER = "reasoningEffortsAutofilled";

// src/key-refs.ts
var KEY_ALIAS_MAX_LENGTH = 40;
function deriveKeyRef(route) {
  return `${route.toUpperCase().replace(/[^A-Z0-9]+/g, "_")}_API_KEY`;
}
function nextKeyRef(route, taken) {
  const used = new Set(taken);
  const base = deriveKeyRef(route);
  if (!used.has(base)) return base;
  for (let suffix = 2; suffix <= 999; suffix += 1) {
    const candidate = `${base}_${suffix}`;
    if (!used.has(candidate)) return candidate;
  }
  return `${base}_${Date.now()}`;
}
function normalizeKeyAlias(value) {
  if (typeof value !== "string") return void 0;
  let cleaned = "";
  for (const char of value) {
    const code = char.codePointAt(0) ?? 0;
    if (code < 32 || code === 127) continue;
    cleaned += char;
  }
  cleaned = cleaned.trim();
  if (cleaned.length === 0) return void 0;
  return cleaned.slice(0, KEY_ALIAS_MAX_LENGTH);
}
function isLegalKeyValue(value) {
  return typeof value === "string" && /^[\x21-\x7E]+$/.test(value);
}
var KEY_MASK_MIN_LENGTH = 12;
function maskKeyValue(value) {
  if (value.length === 0) return "";
  if (value.length < KEY_MASK_MIN_LENGTH) return "\u2022\u2022\u2022\u2022\u2022\u2022\u2022\u2022";
  return `${value.slice(0, 4)}...${value.slice(-4)}`;
}

// src/key-index.ts
import { mkdirSync, readFileSync, renameSync, unlinkSync, writeFileSync } from "node:fs";
import { homedir } from "node:os";
import { dirname, join } from "node:path";
function emptyKeyIndex() {
  return { version: 1, providers: {} };
}
function harnessHome() {
  const configured = process.env["DSH_HOME"];
  if (typeof configured === "string" && configured.length > 0) return configured;
  try {
    return join(homedir(), ".dsh");
  } catch {
    return ".dsh";
  }
}
function keyIndexFilePath(home = harnessHome()) {
  return join(home, "dsh-model-think-level", "key-index.json");
}
function parseKeyIndex(raw) {
  if (typeof raw !== "object" || raw === null) return emptyKeyIndex();
  const providers = raw["providers"];
  if (typeof providers !== "object" || providers === null) return emptyKeyIndex();
  const out = {};
  for (const [route, entries] of Object.entries(providers)) {
    if (route.length === 0 || !Array.isArray(entries)) continue;
    const list = [];
    for (const entry of entries) {
      if (typeof entry !== "object" || entry === null) continue;
      const record = entry;
      const ref = record["ref"];
      if (typeof ref !== "string" || ref.length === 0) continue;
      if (list.some((existing) => existing.ref === ref)) continue;
      const alias = normalizeKeyAlias(record["alias"]);
      list.push(alias === void 0 ? { ref } : { ref, alias });
    }
    if (list.length > 0) out[route] = list;
  }
  return { version: 1, providers: out };
}
function readKeyIndex(file = keyIndexFilePath()) {
  try {
    return parseKeyIndex(JSON.parse(readFileSync(file, "utf8")));
  } catch {
    return emptyKeyIndex();
  }
}
function writeKeyIndex(document, file = keyIndexFilePath()) {
  mkdirSync(dirname(file), { recursive: true });
  const temporary = `${file}.${process.pid}.tmp`;
  writeFileSync(temporary, `${JSON.stringify(document, null, 2)}
`, "utf8");
  try {
    renameSync(temporary, file);
  } catch (error) {
    try {
      unlinkSync(temporary);
    } catch {
    }
    throw error;
  }
}
function updateKeyIndex(mutate, file = keyIndexFilePath()) {
  const next = mutate(readKeyIndex(file));
  writeKeyIndex(next, file);
  return next;
}
function keyEntriesOf(document, route) {
  const entries = document.providers[route];
  return Array.isArray(entries) ? entries : [];
}
function hasKeyEntry(document, route, ref) {
  return keyEntriesOf(document, route).some((entry) => entry.ref === ref);
}
function withKeyEntry(document, route, ref, alias) {
  const list = [...keyEntriesOf(document, route)];
  const index = list.findIndex((entry) => entry.ref === ref);
  const label = normalizeKeyAlias(alias);
  const next = label === void 0 ? { ref } : { ref, alias: label };
  if (index === -1) list.push(next);
  else list[index] = label === void 0 && list[index]?.alias !== void 0 ? { ref, alias: list[index]?.alias } : next;
  return { version: 1, providers: { ...document.providers, [route]: list } };
}
function withKeyAlias(document, route, ref, alias) {
  const list = [...keyEntriesOf(document, route)];
  const index = list.findIndex((entry) => entry.ref === ref);
  if (index === -1) return document;
  const label = normalizeKeyAlias(alias);
  list[index] = label === void 0 ? { ref } : { ref, alias: label };
  return { version: 1, providers: { ...document.providers, [route]: list } };
}
function withoutKeyEntry(document, route, ref) {
  const list = keyEntriesOf(document, route).filter((entry) => entry.ref !== ref);
  const providers = { ...document.providers };
  if (list.length === 0) delete providers[route];
  else providers[route] = list;
  return { version: 1, providers };
}

// src/knowledge.ts
var INPUT_MODALITIES = ["text", "image"];
var NEW_COMPAT_KEYS = ["thinkingTokenBudgetField", "vllmPriority", "supportsMaxOutputTokens"];
var KNOWLEDGE_BASE = [
  {
    id: "deepseek-v4-vision",
    // Must precede deepseek-v4 semantically -- guaranteed anyway by the
    // longest-boundary-hit rule, since these patterns are strictly longer.
    patterns: ["deepseek-v4-flash-vision", "deepseek-v4-vision"],
    efforts: { off: "none", low: "low", high: "high", max: "max" },
    defaultEffort: "high",
    compat: { thinkingFormat: "deepseek", supportsReasoningEffort: true },
    input: ["text", "image"],
    contextWindow: 1048576,
    maxTokens: 384e3,
    note: "DeepSeek \u89C6\u89C9\u5B9E\u9A8C\u7248 id\uFF08deepseek-v4-flash-vision-exp\uFF09\u3002\u5B98\u65B9\u76EE\u5F55\u5DF2\u6807\u6CE8\u8BE5\u6A21\u578B\u9000\u5F79\uFF0C\u540D\u5B57\u4ECD\u88AB\u63A5\u53D7\u3001\u7531\u73B0\u884C deepseek-flash \u63D0\u4F9B\u670D\u52A1\u2014\u2014\u56FE\u7247\u8F93\u5165\u73B0\u5DF2\u7531 deepseek-flash \u539F\u751F\u63D0\u4F9B\u3002"
  },
  {
    id: "deepseek-v4-1-flash",
    // V4.1-Flash is DeepSeek's CURRENT flagship and it takes image input, which
    // the shared `deepseek-v4` stem cannot express: that entry carries the text
    // floor its pro/legacy siblings share, and one modal answer cannot be both.
    // This entry keys every V4.1 spelling, and it must stay ahead of the base
    // stem -- the longest-hit rule guarantees that, these patterns are strictly
    // longer -- so an id, or a display name, that says "V4.1 Flash" declares
    // images even when the relay invented the id itself.
    // 'deepseek-flash' is the CURRENT official id (2026-09-10) and belongs
    // here, not to the stem: the pricing page serves it as V4.1-Flash, and a
    // third-party reseller exposing DeepSeek's own model under that name means
    // the same model.
    patterns: ["deepseek-v4.1-flash", "deepseek-flash"],
    efforts: { off: "none", low: "low", high: "high", max: "max" },
    defaultEffort: "high",
    compat: { thinkingFormat: "deepseek", supportsReasoningEffort: true },
    input: ["text", "image"],
    contextWindow: 1048576,
    maxTokens: 384e3,
    note: 'DeepSeek-V4.1-Flash\uFF082026-09-10 \u53D1\u5E03\u7684\u73B0\u884C\u5B98\u65B9\u6A21\u578B\uFF0C\u5B98\u65B9 id \u4E3A deepseek-flash\uFF1B25 \u4E07\u5E76\u53D1\u3001**\u539F\u751F\u56FE\u7247\u8F93\u5165**\uFF09\u3002V4.1 \u7684\u5404\u5199\u6CD5\uFF08deepseek-flash\u3001deepseek-v4.1-flash\u3001deepseek-v4-1-flash\uFF0C\u4EE5\u53CA\u5E26\u65E5\u671F\u540E\u7F00\u7684\u7B2C\u4E09\u65B9\u53D8\u4F53\uFF09\u90FD\u5F52\u6B64\u6761\u2014\u2014\u7EAF\u6587\u672C\u7684 deepseek-v4 \u4E3B\u5E72\u4E0D\u518D\u541E\u6389\u5B83\u4EEC\u3002\u5B98\u65B9\u679A\u4E3E\u540C V4 \u7CFB\uFF1AOff\uFF08thinking:"disabled"\uFF09/ Low / High / Max\uFF0C\u9ED8\u8BA4 High\uFF1B\u5BB9\u91CF 1,048,576 \u4E0A\u4E0B\u6587 / \u6700\u5927\u8F93\u51FA 384K\u3002'
  },
  {
    id: "deepseek-v4",
    // One pattern covers the family's TEXT-floor members: every serving
    // suffixes the base id (deepseek-v4-flash, deepseek-v4-pro,
    // deepseek-v4-flash-free ...), so the shared stem keys them all --
    // including free/aggregator spellings the official catalog never lists.
    // Closing thinking is the 'thinking: disabled' object, so the off spelling
    // is a non-null placeholder that arms the deepseek format's disabled
    // branch. The placeholder must stay 'none': pi-ai's deepseek completions
    // branch only checks non-null (any string arms thinking:disabled), while
    // the same map rides the Responses API as reasoning.effort, whose official
    // DeepSeek values are none/low/high/max -- 'off' would be a 400 there.
    // The stem deliberately stops at 'deepseek-v4': the image-capable V4.1
    // generation keys its own strictly longer entry above, while this entry
    // keeps the retired deepseek-v4-flash spelling and the text-only
    // deepseek-v4-pro, whose declarations agree with its text floor.
    patterns: ["deepseek-v4"],
    efforts: { off: "none", low: "low", high: "high", max: "max" },
    defaultEffort: "high",
    compat: { thinkingFormat: "deepseek", supportsReasoningEffort: true },
    input: ["text"],
    contextWindow: 1048576,
    maxTokens: 384e3,
    note: 'DeepSeek \u5B98\u65B9\u679A\u4E3E Low / High / Max\uFF08\u9ED8\u8BA4 High\uFF1Bminimal\u3001medium\u3001xhigh \u517C\u5BB9\u6620\u5C04\uFF0Cultra\u2192max\uFF09\uFF0COff \u5373 thinking:"disabled"\uFF08Responses API \u4E0B off \u4EE5 reasoning.effort:"none" \u8868\u793A\uFF09\u3002\u672C\u6761\u76EE\u662F V4 \u5BB6\u65CF\u7684**\u7EAF\u6587\u672C**\u6210\u5458\uFF1Adeepseek-v4-pro\uFF08= DeepSeek-V4-Pro-0813\uFF0C\u5B98\u65B9\u4E0D\u652F\u6301\u56FE\u7247\uFF09\u4E0E\u5DF2\u9000\u5F79\u6A21\u578B\u7684\u517C\u5BB9\u522B\u540D deepseek-v4-flash\uFF08deepseek-v4-flash-vision-exp \u53E6\u6709\u89C6\u89C9\u6761\u76EE\uFF09\u3002**\u6536\u56FE\u7684 V4.1-Flash\uFF08\u5B98\u65B9 id deepseek-flash\uFF09\u53E6\u6709\u4E13\u95E8\u6761\u76EE**\uFF0C\u5176 input \u542B image\u3002\u5BB9\u91CF\uFF1A1,048,576 \u4E0A\u4E0B\u6587 / \u6700\u5927\u8F93\u51FA 384K\uFF08393,216\uFF1B\u9ED8\u8BA4\u975E\u601D\u8003 8K\u3001\u601D\u8003 64K\u3001effort=max \u65F6 128K\uFF09\u3002'
  },
  {
    id: "deepseek-v3",
    // deepseek-reasoner belongs to the R1 entry: it is the reasoning model's
    // API name and must not match here. The old alias pair
    // (deepseek-chat / deepseek-reasoner) was retired upstream in 2026-07;
    // the id patterns stay for third-party gateways still serving V3.x.
    patterns: ["deepseek-v3", "deepseek-chat"],
    efforts: { off: "none", high: "high", max: "max" },
    compat: { thinkingFormat: "deepseek", supportsReasoningEffort: true },
    input: ["text"],
    contextWindow: 163840,
    maxTokens: 65536,
    note: "DeepSeek V3 \u6863\u4F4D\uFF1AOff / High / Max\u3002\u5B98\u65B9\u5DF2\u505C\u552E V3 \u4EE3\uFF08\u5B9A\u4EF7\u9875\u4EC5\u5269 V4 \u4E09\u578B\uFF09\uFF0C\u5BB9\u91CF\u53D6\u76EE\u5F55\u73B0\u5F79\u503C\u3002"
  },
  {
    id: "deepseek-r1",
    patterns: ["deepseek-r1", "deepseek-reasoner"],
    // R1's reasoning cannot be switched off at the API level; the harness
    // treats it as a thinking model whose only declared level is the default.
    efforts: { high: "high" },
    defaultEffort: "high",
    compat: { thinkingFormat: "deepseek", supportsReasoningEffort: true },
    input: ["text"],
    contextWindow: 163840,
    maxTokens: 32768,
    note: "DeepSeek-R1 \u4E3A\u63A8\u7406\u6A21\u578B\uFF0C\u4EC5\u63D0\u4F9B High\u3002\u5B98\u65B9\u5DF2\u4E0B\u67B6 R1 \u4EE3\uFF0C\u5BB9\u91CF\u53D6\u76EE\u5F55 r1-0528 \u503C\u3002"
  },
  {
    id: "openai-gpt-5-2",
    patterns: ["gpt-5.2"],
    // gpt-5.2 (2025-12) took 'none' as the explicit no-thinking value
    // (replacing gpt-5's 'minimal') and added xhigh; its default is none.
    efforts: { off: "none", low: "low", medium: "medium", high: "high", xhigh: "xhigh" },
    defaultEffort: "off",
    compat: { thinkingFormat: "openai", supportsReasoningEffort: true },
    input: ["text", "image"],
    contextWindow: 4e5,
    maxTokens: 128e3,
    note: "GPT-5.2 \u6863\u4F4D\uFF1ANone / Low / Medium / High / XHigh\uFF08\u9ED8\u8BA4 None\uFF09\u3002\u5B98\u65B9\u53E6\u652F\u6301 PDF \u8F93\u5165\uFF08\u6838\u5FC3\u8BCD\u8868\u6682\u4E0D\u542B\uFF09\u3002gpt-5.2-pro \u5B98\u65B9\u9875\u672A\u5355\u5217\u6863\u4F4D\u884C\uFF0C\u6309\u672C\u6761\u76EE\u540C\u6863\u5904\u7406\uFF1Bgpt-5.2-codex \u89C1\u5355\u72EC\u6761\u76EE\u3002"
  },
  {
    id: "openai-gpt-5-2-codex",
    // The codex variant's official model page names low/medium/high/xhigh
    // only -- NO none -- so the shared gpt-5.2 entry must not claim an off
    // for it (a 'none' request would 400). Longer pattern wins over 'gpt-5.2'.
    patterns: ["gpt-5.2-codex"],
    efforts: { low: "low", medium: "medium", high: "high", xhigh: "xhigh" },
    // OpenAI's API default for the codex line is medium (Inspect AI's
    // per-model default table, aligned with developers.openai.com).
    defaultEffort: "medium",
    compat: { thinkingFormat: "openai", supportsReasoningEffort: true },
    input: ["text", "image"],
    contextWindow: 4e5,
    maxTokens: 128e3,
    note: "GPT-5.2-Codex \u6863\u4F4D\uFF1ALow / Medium / High / XHigh\uFF08\u65E0 None \u6863\uFF0C\u52FF\u52FE Off\uFF09\uFF0C\u5E26\u56FE\u8F93\u5165\u3001400K\u3002"
  },
  {
    id: "openai-gpt-5-6",
    patterns: ["gpt-5.6"],
    // gpt-5.6 spans the full modern ladder including max; the sol/luna/terra
    // variants share it (official reasoning guide: values "can include none
    // minimal low medium high xhigh, and max").
    efforts: { off: "none", low: "low", medium: "medium", high: "high", xhigh: "xhigh", max: "max" },
    defaultEffort: "medium",
    compat: { thinkingFormat: "openai", supportsReasoningEffort: true },
    input: ["text", "image"],
    contextWindow: 105e4,
    maxTokens: 128e3,
    note: "GPT-5.6\uFF08\u522B\u540D\u5373 sol\uFF09\u6863\u4F4D\uFF1ANone / Low / Medium(\u9ED8\u8BA4) / High / XHigh / Max\uFF1Bsol/luna/terra \u540C\u6863\uFF0C\u5E26\u56FE\u8F93\u5165\u3002"
  },
  {
    id: "openai-gpt-5-5",
    patterns: ["gpt-5.5"],
    // gpt-5.5 defaults to medium (official reasoning guide) and tops out at
    // xhigh; the -pro variant drops none/low (medium/high/xhigh only).
    efforts: { off: "none", low: "low", medium: "medium", high: "high", xhigh: "xhigh" },
    defaultEffort: "medium",
    compat: { thinkingFormat: "openai", supportsReasoningEffort: true },
    input: ["text", "image"],
    contextWindow: 105e4,
    maxTokens: 128e3,
    note: "GPT-5.5 \u6863\u4F4D\uFF1ANone / Low / Medium(\u9ED8\u8BA4) / High / XHigh\uFF0C\u5E26\u56FE\u8F93\u5165\u3002pro \u53D8\u4F53\u4EC5 Medium / High(\u9ED8\u8BA4) / XHigh \u4E14\u4EC5 Responses API\u3002"
  },
  {
    id: "openai-gpt-5-4",
    patterns: ["gpt-5.4"],
    // Official model page: none (default) / low / medium / high / xhigh;
    // pro drops none+low and is Responses-only; mini/nano sit on 400K.
    efforts: { off: "none", low: "low", medium: "medium", high: "high", xhigh: "xhigh" },
    defaultEffort: "off",
    compat: { thinkingFormat: "openai", supportsReasoningEffort: true },
    input: ["text", "image"],
    contextWindow: 105e4,
    maxTokens: 128e3,
    note: "GPT-5.4 \u6863\u4F4D\uFF1ANone(\u9ED8\u8BA4) / Low / Medium / High / XHigh\uFF0C\u5E26\u56FE\u8F93\u5165\u3002pro \u53D8\u4F53\u4EC5 Medium/High/XHigh\uFF1Bmini/nano \u4E3A 400K \u4E0A\u4E0B\u6587\u3002"
  },
  {
    id: "openai-gpt-5-3",
    patterns: ["gpt-5.3"],
    // Official model page: low / medium / high / xhigh only -- no none.
    efforts: { low: "low", medium: "medium", high: "high", xhigh: "xhigh" },
    defaultEffort: "medium",
    compat: { thinkingFormat: "openai", supportsReasoningEffort: true },
    input: ["text", "image"],
    contextWindow: 4e5,
    maxTokens: 128e3,
    note: "GPT-5.3-Codex \u6863\u4F4D\uFF1ALow / Medium / High / XHigh\uFF08\u65E0 None \u6863\uFF09\uFF0C\u5E26\u56FE\u8F93\u5165\u3001400K\uFF1Bgpt-5.3-chat \u4E3A\u975E\u63A8\u7406\u804A\u5929\u6A21\u578B\uFF08\u89C1 chat \u6761\u76EE\uFF09\u3002"
  },
  {
    id: "openai-gpt-5-1",
    patterns: ["gpt-5.1"],
    // gpt-5.1 (2025-11): none replaces minimal; no xhigh outside codex-max.
    // The codex variants split into their own entry: their official pages
    // publish no effort line, and the codex line's 5.2/5.3 successors take
    // no none -- so the conservative declaration there drops both none and
    // xhigh (see openai-gpt-5-1-codex).
    efforts: { off: "none", low: "low", medium: "medium", high: "high" },
    defaultEffort: "off",
    compat: { thinkingFormat: "openai", supportsReasoningEffort: true },
    input: ["text", "image"],
    contextWindow: 4e5,
    maxTokens: 128e3,
    note: "GPT-5.1 \u6863\u4F4D\uFF1ANone / Low / Medium / High\uFF08\u9ED8\u8BA4 None\uFF09\u3002"
  },
  {
    id: "openai-gpt-5-1-codex",
    // Official model pages for 5.1-codex / -codex-max / -codex-mini publish no
    // reasoning-effort line (unlike gpt-5.1 itself); the codex successors
    // 5.2/5.3 are low/medium/high/xhigh without none, so none is NOT declared
    // here either. xhigh is likewise unproven for 5.1-codex (the 5.1 page's
    // own ladder stops at high) and is withheld.
    patterns: ["gpt-5.1-codex"],
    efforts: { low: "low", medium: "medium", high: "high" },
    compat: { thinkingFormat: "openai", supportsReasoningEffort: true },
    input: ["text", "image"],
    contextWindow: 4e5,
    maxTokens: 128e3,
    note: "GPT-5.1-Codex \u7CFB\u5217\uFF1A\u5B98\u65B9\u6A21\u578B\u9875\u672A\u5355\u5217 effort \u503C\u57DF\uFF0C\u6309\u540C\u4EE3\u4FDD\u5B88\u6863 Low / Medium / High\uFF08\u65E0 None\uFF1Bxhigh \u672A\u8BC1\u5B9E\uFF09\u3002\u5982\u7AEF\u70B9\u652F\u6301 xhigh/none \u53EF\u624B\u8C03\u3002"
  },
  {
    id: "openai-gpt-5",
    patterns: ["gpt-5"],
    // The 2025-08 first generation: minimal is the floor, there is no none,
    // and the default (medium) thinks -- so no off level is offered.
    efforts: { minimal: "minimal", low: "low", medium: "medium", high: "high" },
    defaultEffort: "medium",
    compat: { thinkingFormat: "openai", supportsReasoningEffort: true },
    input: ["text", "image"],
    contextWindow: 4e5,
    maxTokens: 128e3,
    note: "GPT-5 \u521D\u4EE3\u6863\u4F4D\uFF1AMinimal / Low / Medium / High\uFF0C\u65E0\u5173\u95ED\u6863\u3002"
  },
  {
    id: "openai-chat",
    // Non-reasoning chat lines across generations: they take no
    // reasoning_effort at all (official model pages list no "Reasoning").
    // Official ids are the *-chat-latest snapshots; the bare -chat spellings
    // stay for gateways serving them. gpt-5-chat-latest was removed upstream
    // on 2026-07-23 and gpt-chat-latest has no model page anymore -- the
    // patterns persist for compatibility only.
    patterns: [
      "gpt-5.1-chat-latest",
      "gpt-5.2-chat-latest",
      "gpt-5.3-chat-latest",
      "gpt-5-chat-latest",
      "gpt-chat-latest",
      "gpt-5-chat",
      "gpt-5.1-chat",
      "gpt-5.2-chat",
      "gpt-5.3-chat"
    ],
    efforts: false,
    input: ["text", "image"],
    contextWindow: 128e3,
    maxTokens: 16384,
    note: "-chat \u7CFB\u5217\uFF08\u5B98\u65B9 id \u4E3A gpt-5.x-chat-latest\uFF09\u4E3A\u975E\u63A8\u7406\u804A\u5929\u6A21\u578B\uFF0C\u4E0D\u652F\u6301 effort \u53C2\u6570\uFF08\u52FF\u52FE\u601D\u8003\u6863\uFF09\uFF1B\u5B98\u65B9\u652F\u6301\u56FE\u7247\u8F93\u5165\uFF0C128K / 16,384 \u8F93\u51FA\u3002gpt-5-chat-latest \u5DF2\u4E8E 2026-07-23 \u4E0B\u67B6\u3001gpt-chat-latest \u5DF2\u65E0\u5B98\u65B9\u9875\u9762\uFF08\u4FDD\u7559\u6A21\u5F0F\u4F9B\u7F51\u5173\uFF09\u3002"
  },
  {
    id: "openai-o",
    // The o-series scheduled-removal notice (2026-06-11): o1/o1-pro/o3-mini/
    // o4-mini are removed 2026-10-23 and o3/o3-pro on 2026-12-11, with
    // gpt-5.6-sol / gpt-5.6-terra replacing them; the tokens stay for
    // gateways and local deployments still serving them, and match only on
    // word boundaries (see matchKnowledgeBase), so 'o1' hits 'o1-mini' but
    // not 'ko1'.
    patterns: ["o1", "o3", "o4"],
    // o-series had no none: not sending the parameter meant medium (think
    // on), so no off level is offered.
    efforts: { low: "low", medium: "medium", high: "high" },
    defaultEffort: "medium",
    compat: { thinkingFormat: "openai", supportsReasoningEffort: true },
    input: ["text", "image"],
    contextWindow: 2e5,
    maxTokens: 1e5,
    note: "OpenAI o \u7CFB\u6863\u4F4D\uFF1ALow / Medium / High\u3002\u5B98\u65B9\u5DF2\u4E8E 2026-06 \u516C\u544A\u9000\u5F79\uFF08o1/o1-pro/o3-mini/o4-mini 2026-10-23 \u79FB\u9664\u3001o3/o3-pro 2026-12-11\uFF09\uFF0C\u7F51\u5173\u6B8B\u7559\u4ECD\u53EF\u547D\u4E2D\uFF1B\u591A\u6570 o \u7CFB\u7AEF\u70B9\u6536\u56FE\uFF08o3-mini \u4F8B\u5916\uFF09\u3002"
  },
  {
    id: "openai-gpt-oss",
    // Official README: configurable reasoning effort low / medium / high
    // (CLI default: low); official model page: 131,072 context and exactly
    // the same 131,072 max output tokens, text input only.
    patterns: ["gpt-oss"],
    efforts: { low: "low", medium: "medium", high: "high" },
    defaultEffort: "low",
    compat: { thinkingFormat: "openai", supportsReasoningEffort: true },
    input: ["text"],
    contextWindow: 131072,
    maxTokens: 131072,
    note: "GPT-OSS \u5F00\u6E90\u6743\u91CD\uFF08Ollama/vLLM \u5E38\u89C1\uFF09\uFF1Areasoning effort Low / Medium / High\uFF0C\u7EAF\u6587\u672C\uFF0C131K \u4E0A\u4E0B\u6587 / 131K \u8F93\u51FA\u30022026-09 \u590D\u6838\uFF1A\u5B98\u65B9\u6A21\u578B\u9875\u73B0\u5728\u5199 Chat Completions = Not supported\u3001\u65E0\u56FE\u7247\u8F93\u5165\uFF08\u9ED8\u8BA4 Low \u6765\u81EA\u5B98\u65B9 CLI\uFF0C\u4E0D\u662F API \u9875\uFF09\uFF0C\u56E0\u6B64\u8FD9\u91CC\u4E0D\u518D\u58F0\u660E Off\u3002"
  },
  {
    id: "openai-gpt-6-astra",
    // Longest-pattern-wins keeps this ahead of the 5.x entries; 'astra' is the
    // only stable token an aggregator is likely to expose.
    patterns: ["gpt-6-astra", "gpt-6"],
    // Official reasoning guide: none returns HTTP 400 on this model, and the
    // model page lists low/medium/high/xhigh/max. Official docs publish no
    // default effort for it, so none is recorded rather than guessed.
    efforts: { low: "low", medium: "medium", high: "high", xhigh: "xhigh", max: "max" },
    compat: { thinkingFormat: "openai", supportsReasoningEffort: true },
    input: ["text", "image"],
    contextWindow: 105e4,
    maxTokens: 128e3,
    note: "GPT-6 Astra \u6863\u4F4D\uFF1ALow / Medium / High / XHigh / Max\u2014\u2014**\u6CA1\u6709 None \u6863**\uFF08\u5B98\u65B9\u539F\u6587\uFF1A\u8BBE\u4E3A none \u8FD4\u56DE HTTP 400\uFF09\uFF0C\u56E0\u6B64\u672C\u6761\u76EE\u4E0D\u58F0\u660E Off\u3002\u5E26\u56FE\u8F93\u5165\uFF0C1,050,000 \u4E0A\u4E0B\u6587 / 128,000 \u8F93\u51FA\uFF1BAI \u5B98\u65B9\u9ED8\u8BA4\u6863\u4F4D\u672A\u516C\u5E03\uFF0C\u6545\u4E0D\u586B\u3002\u5DE5\u5177\u8C03\u7528\u9700\u8D70 Responses API\u3002"
  },
  {
    id: "openai-gpt-5-6-cyber",
    // Before the family entry: cyber's model page publishes NO effort line and
    // limits Chat Completions, so the family ladder (which includes none/max)
    // must not be offered for it.
    patterns: ["gpt-5.6-cyber"],
    // Conservative: the codex-style successors publish no none, and cyber's
    // page publishes nothing at all -- declare the intersection the other 5.6
    // variants agree on, plus xhigh (every published 5.6 ladder carries it).
    efforts: { low: "low", medium: "medium", high: "high", xhigh: "xhigh" },
    compat: { thinkingFormat: "openai", supportsReasoningEffort: true },
    input: ["text", "image"],
    contextWindow: 4e5,
    maxTokens: 128e3,
    note: "GPT-5.6-Cyber\uFF1A\u5B98\u65B9\u6A21\u578B\u9875\u672A\u5355\u5217 effort \u503C\u57DF\uFF08\u4E0D\u7B49\u4E8E\u4E0D\u652F\u6301\uFF09\uFF0C\u6545\u6309\u540C\u4EE3\u4FDD\u5B88\u6863 Low / Medium / High / XHigh\uFF1B\u8BE5\u578B\u53F7\u4EC5 Responses API\uFF0C\u5E26\u56FE\u8F93\u5165\u3001400K \u4E0A\u4E0B\u6587\u3002\u5B98\u65B9\u652F\u6301\u7684\u5176\u4ED6\u6863\u4F4D\u53EF\u624B\u8C03\u540E\u5E94\u7528\u3002"
  },
  {
    id: "openai-gpt-4o",
    // Boundary matching keeps 'gpt-4' from hitting 'gpt-4o', so the vision
    // generation needs its own entry. gpt-4.1 keeps its own entry below
    // (1M context, larger output cap).
    patterns: ["gpt-4o"],
    // GPT-4o is not a reasoning model (official catalog lists no reasoning,
    // the API refuses reasoning_effort): suggest `false` so the editor
    // marks the row "does not reason" instead of wiring a rejected ladder.
    efforts: false,
    input: ["text", "image"],
    contextWindow: 128e3,
    maxTokens: 16384,
    note: "GPT-4o \u4EE3\u9645\uFF1A\u975E\u63A8\u7406\u6A21\u578B\uFF0C\u4E0D\u652F\u6301 effort \u53C2\u6570\uFF08\u52FF\u52FE\u601D\u8003\u6863\uFF09\uFF1B\u56FE\u7247\u8F93\u5165\u5168\u7CFB\u6807\u914D\uFF0C128K / 16,384 \u8F93\u51FA\u3002"
  },
  {
    id: "openai-gpt-4-1",
    // Official model page: 1,047,576 context / 32,768 max output, text+image
    // on every variant (4.1 / mini / nano alike -- the old "nano is
    // text-only" claim was wrong). No reasoning step at all.
    patterns: ["gpt-4.1"],
    efforts: false,
    input: ["text", "image"],
    contextWindow: 1047576,
    maxTokens: 32768,
    note: "GPT-4.1 \u5168\u7CFB\uFF08\u542B mini/nano\uFF09\uFF1A\u975E\u63A8\u7406\u6A21\u578B\uFF0C\u4E0D\u652F\u6301 effort \u53C2\u6570\uFF1B\u5B98\u65B9 1,047,576 \u4E0A\u4E0B\u6587 / 32,768 \u8F93\u51FA\uFF0C\u5168\u7CFB\u5E26\u56FE\u8F93\u5165\u3002"
  },
  {
    id: "openai-gpt-4-turbo-preview",
    // The preview snapshot is text-only (later turbo snapshots take images;
    // the shared preview spelling must not claim them). Longest-boundary-hit
    // keeps it ahead of 'gpt-4-turbo'.
    patterns: ["gpt-4-turbo-preview"],
    efforts: false,
    input: ["text"],
    contextWindow: 128e3,
    maxTokens: 4096,
    note: "GPT-4 Turbo Preview\uFF1A\u975E\u63A8\u7406\u6A21\u578B\uFF0C\u7EAF\u6587\u672C\u8F93\u5165\uFF08\u6B63\u5F0F turbo \u5FEB\u7167\u652F\u6301\u56FE\u7247\uFF0C\u89C1\u4E0B\u6761\uFF09\uFF0C128K\u3002"
  },
  {
    id: "openai-gpt-4-turbo",
    patterns: ["gpt-4-turbo"],
    efforts: false,
    input: ["text", "image"],
    contextWindow: 128e3,
    maxTokens: 4096,
    note: "GPT-4 Turbo\uFF1A\u975E\u63A8\u7406\u6A21\u578B\uFF0C\u5B98\u65B9\u652F\u6301\u56FE\u7247\u8F93\u5165\uFF0C128K / 4,096 \u8F93\u51FA\u3002"
  },
  {
    id: "openai-gpt",
    patterns: ["gpt-4", "gpt-3.5"],
    // Same reasoning as gpt-4o above: the GPT-4/3.5 generations take no
    // reasoning_effort -- suggest `false` rather than a rejected ladder.
    // gpt-4 remains text-only (8K window); the vision-bearing 4o/4.1/turbo
    // lines have their own entries.
    efforts: false,
    input: ["text"],
    note: "GPT-4/3.5 \u4EE3\u9645\uFF1A\u975E\u63A8\u7406\u6A21\u578B\uFF0C\u4E0D\u652F\u6301 effort \u53C2\u6570\uFF08\u52FF\u52FE\u601D\u8003\u6863\uFF09\u3002gpt-4-turbo/4.1 \u8D77\u652F\u6301\u56FE\u7247\uFF0C\u89C1\u5355\u72EC\u6761\u76EE\uFF1B\u65B0\u4EE3\u8BF7\u7528 GPT-5 \u7CFB\uFF08\u89C1 openai-chat/gpt-5.x \u6761\u76EE\uFF09\u3002"
  },
  {
    id: "anthropic-claude-5",
    // Claude 5th generation (fable/mythos/opus-5/sonnet-5, 2026): adaptive
    // thinking with an effort ladder that adds xhigh and max; the fable and
    // mythos entries think always-on, so no off level. Mythos Preview is
    // split into its own entry: it takes max but NOT xhigh (official effort
    // matrix), so the shared ladder's xhigh would be a 400.
    patterns: ["claude-fable-5", "claude-mythos-5", "claude-opus-5", "claude-sonnet-5"],
    // Ladder per the official effort matrix (platform.claude.com
    // docs/build-with-claude/effort). NOTE: Anthropic's own OpenAI-SDK
    // compatibility layer IGNORES reasoning_effort (thinking is driven by
    // its own param, on by default for Claude 5) -- the declaration bites
    // on third-party gateways that map it; on the native
    // anthropic-messages protocol, anthropicAdaptive pins the compat that
    // makes pi-ai dispatch these as output_config.effort.
    efforts: { low: "low", medium: "medium", high: "high", xhigh: "xhigh", max: "max" },
    defaultEffort: "high",
    // No thinkingFormat: pi-ai has no 'anthropic' member, and the
    // openai-completions compat gate that takes thinkingFormat is not the
    // protocol an Anthropic endpoint speaks.
    compat: { supportsReasoningEffort: true },
    anthropicAdaptive: true,
    input: ["text", "image"],
    contextWindow: 1e6,
    maxTokens: 128e3,
    note: "Claude 5 \u4EE3\uFF08Fable 5 / Mythos 5 / Opus 5 / Sonnet 5\uFF09\u6863\u4F4D\uFF1ALow / Medium / High(\u9ED8\u8BA4) / XHigh / Max\uFF1BFable 5.1 \u4E0E Mythos 5.1 \u89C1\u5355\u72EC\u6761\u76EE\uFF0CMythos Preview \u4EC5\u81F3 Max\u30021M \u4E0A\u4E0B\u6587 / 128K \u8F93\u51FA\uFF08Batch 300K\uFF09\u3002\u5B98\u65B9\u652F\u6301 PDF \u8F93\u5165\u3002\u6CE8\u610F\uFF1AAnthropic \u5B98\u65B9 OpenAI \u517C\u5BB9\u5C42\u4F1A\u5FFD\u7565 effort \u53C2\u6570\uFF0C\u58F0\u660E\u5728\u7B2C\u4E09\u65B9\u7F51\u5173\u6620\u5C04\u65F6\u751F\u6548\u3002"
  },
  {
    id: "anthropic-claude-5-1",
    // Ahead of the claude-5 entry, whose 'claude-fable-5' / 'claude-mythos-5'
    // patterns are prefixes of these ids and would win the equal-length tie.
    // Same ladder and default as the 5.0 generation per the official effort
    // page; the meaningful difference is behavioural (these two are the
    // models allowed to change effort mid-conversation), which this plugin
    // does not declare per model.
    patterns: ["claude-fable-5-1", "claude-mythos-5-1"],
    efforts: { low: "low", medium: "medium", high: "high", xhigh: "xhigh", max: "max" },
    defaultEffort: "high",
    compat: { supportsReasoningEffort: true },
    anthropicAdaptive: true,
    input: ["text", "image"],
    contextWindow: 1e6,
    maxTokens: 128e3,
    note: "Claude Fable 5.1 / Mythos 5.1\uFF1A\u5B98\u65B9\u6863\u4F4D Low / Medium / High(\u9ED8\u8BA4) / XHigh / Max\uFF0C\u81EA\u9002\u5E94\u601D\u8003\u5E38\u5F00\uFF08\u4E0D\u63A5\u53D7 enabled/disabled\uFF09\u30021M \u4E0A\u4E0B\u6587 / 128K \u8F93\u51FA\uFF1B\u8FD9\u4E24\u578B\u4E5F\u662F\u5B98\u65B9\u552F\u4E00\u5141\u8BB8\u4F1A\u8BDD\u4E2D\u9014\u6539\u6863\u7684\uFF08\u9700 beta header\uFF0C\u672C\u63D2\u4EF6\u4E0D\u6D89\u53CA\uFF09\u3002"
  },
  {
    id: "anthropic-claude-mythos-preview",
    // Official effort matrix: max is available, xhigh is NOT (the matrix's
    // xhigh list covers Fable 5 / Mythos 5 / Opus 5 / Opus 4.8 / Opus 4.7 /
    // Sonnet 5 only).
    patterns: ["claude-mythos-preview"],
    efforts: { low: "low", medium: "medium", high: "high", max: "max" },
    // Anthropic's effort page: the API default is HIGH across the whole
    // supported list (omitting effort behaves exactly as high).
    defaultEffort: "high",
    compat: { supportsReasoningEffort: true },
    anthropicAdaptive: true,
    input: ["text", "image"],
    contextWindow: 1e6,
    maxTokens: 128e3,
    note: "Claude Mythos Preview\uFF1A\u5B98\u65B9\u6863\u4F4D Low / Medium / High / Max\uFF08\u65E0 XHigh\uFF09\uFF0C1M \u4E0A\u4E0B\u6587\u3002"
  },
  {
    id: "anthropic-claude-opus-4-high",
    patterns: ["claude-opus-4-8", "claude-opus-4-7"],
    // Official effort page: Opus 4.7/4.8 take the full ladder including
    // xhigh and max (xhigh is the recommended coding start on 4.7).
    efforts: { low: "low", medium: "medium", high: "high", xhigh: "xhigh", max: "max" },
    defaultEffort: "high",
    compat: { supportsReasoningEffort: true },
    anthropicAdaptive: true,
    input: ["text", "image"],
    contextWindow: 1e6,
    maxTokens: 128e3,
    note: "Claude Opus 4.7/4.8 \u6863\u4F4D\uFF1ALow / Medium / High(\u9ED8\u8BA4) / XHigh / Max\uFF1Bxhigh \u4E3A\u5B98\u65B9\u63A8\u8350\u7684\u7F16\u7801\u8D77\u6B65\u6863\u30021M \u4E0A\u4E0B\u6587\u3002"
  },
  {
    id: "anthropic-claude-4-6",
    patterns: ["claude-opus-4-6", "claude-sonnet-4-6"],
    // Official effort page: the 4.6 generation supports max but NOT xhigh
    // ("some models that support max don't support xhigh").
    efforts: { low: "low", medium: "medium", high: "high", max: "max" },
    defaultEffort: "high",
    compat: { supportsReasoningEffort: true },
    anthropicAdaptive: true,
    input: ["text", "image"],
    contextWindow: 1e6,
    maxTokens: 128e3,
    note: "Claude 4.6 \u4EE3\u6863\u4F4D\uFF1ALow / Medium / High / Max\uFF08\u65E0 XHigh\u2014\u2014\u5B98\u65B9\u660E\u8A00\u300C\u652F\u6301 max \u7684\u90E8\u5206\u578B\u53F7\u4E0D\u652F\u6301 xhigh\u300D\uFF09\u30021M \u4E0A\u4E0B\u6587\u3002"
  },
  {
    id: "anthropic-claude-opus-4-5",
    // The only extended-thinking-only model in Anthropic's official effort
    // support list (claude-opus-4-5-20251101): effort works alongside
    // budget_tokens, and the max/xhigh columns of the official matrix do not
    // name it -- so the ladder tops out at high.
    patterns: ["claude-opus-4-5"],
    efforts: { low: "low", medium: "medium", high: "high" },
    defaultEffort: "high",
    compat: { supportsReasoningEffort: true },
    input: ["text", "image"],
    contextWindow: 2e5,
    maxTokens: 64e3,
    note: "Claude Opus 4.5\uFF1A\u5B98\u65B9 effort \u652F\u6301\u5217\u8868\uFF0820251101 \u5FEB\u7167\uFF09\uFF0C\u6863\u4F4D Low / Medium / High\uFF08\u65E0 XHigh/Max\uFF09\uFF0C\u53EF\u4E0E budget_tokens \u5E76\u7528\uFF1B200K / 64K\u3002"
  },
  {
    id: "anthropic-claude",
    // Everything else in the Claude line: 3.x and the 4.5-generation
    // Sonnet/Haiku. Anthropic's official effort support list names exactly
    // fable-5 / mythos-5 / mythos-preview / opus-5 / opus-4-8 / opus-4-7 /
    // opus-4-6 / sonnet-5 / sonnet-4-6 / opus-4-5-20251101 -- none of the
    // models matching this entry take the effort parameter (their thinking
    // rides thinking.type), so a ladder here would be refused. `false` is
    // the honest "no effort control" declaration, matching the openai-chat
    // convention.
    patterns: ["claude"],
    efforts: false,
    input: ["text", "image"],
    contextWindow: 2e5,
    maxTokens: 64e3,
    note: "Claude 3.x \u4E0E Sonnet 4.5 / Haiku 4.5\uFF1A\u5B98\u65B9 effort \u53C2\u6570\u4E0D\u652F\u6301\uFF08\u4EC5 Fable/Mythos 5\u3001Opus 5/4.6-4.8\u3001Sonnet 5/4.6\u3001Opus 4.5 \u652F\u6301\uFF09\uFF0C\u601D\u8003\u7531 thinking.type \u63A7\u5236\u2014\u2014\u52FF\u52FE\u601D\u8003\u6863\u3002\u53C2\u8003\u5BB9\u91CF 200K / 64K\uFF08Haiku 3.5 \u4E3A\u7EAF\u6587\u672C\uFF0C\u6309\u9700\u53D6\u6D88\u56FE\u7247\uFF09\u3002"
  },
  {
    id: "google-gemini",
    patterns: ["gemini"],
    // Gemini over the OpenAI-compat layer maps reasoning_effort per family
    // (3.1+/3.x -> thinking_level, 2.5 -> thinking_budget). The official
    // compatibility sheet is a full grid (minimal / low / medium / high x
    // family), but the declared ladder stays low/medium/high: the safest
    // universal set, since minimal lands on a non-native value on Gemini
    // 3.1 Pro and none is reserved for 2.5 non-Pro. Users wanting the finer
    // grid tune by hand.
    efforts: { low: "low", medium: "medium", high: "high" },
    compat: { thinkingFormat: "openai", supportsReasoningEffort: true },
    input: ["text", "image"],
    contextWindow: 1048576,
    maxTokens: 65536,
    note: "Gemini \u901A\u7528\u5B89\u5168\u6863\uFF1ALow / Medium / High\uFF08\u5B98\u65B9 OpenAI \u517C\u5BB9\u6620\u5C04\u8868\u53E6\u6536 minimal\uFF1A2.5 \u7CFB\u6620\u5C04\u4E3A 1,024 \u9884\u7B97\u30013.1 Flash-Lite/3 Flash \u539F\u751F minimal\u30013.1 Pro \u843D low\uFF09\u3002none \u4EC5\u80FD\u5173 2.5 \u975E Pro\uFF1B2.5 Pro \u4E0E 3 \u4EE3\u4E0D\u53EF\u5173\uFF1B\u5404\u578B\u9ED8\u8BA4\u4E0D\u4E00\uFF08flash-lite \u9ED8\u8BA4\u5173\uFF09\u3002\u5B98\u65B9\u53E6\u6536\u97F3\u9891/\u89C6\u9891/PDF\u3002"
  },
  {
    id: "xai-grok-4-7",
    // grok-4.7 shipped after the 2026-08 pass that read it as 404 upstream;
    // that reading is retired here. xAI's own docs were unreachable for this
    // pass, so every field below is a public-catalog reading rather than a
    // first-party one: OpenRouter publishes the slug x-ai/grok-4.7 with
    // reasoning_effort in its supported_parameters, and models.dev records
    // the ladder as low/medium/high/xhigh -- the same four steps 4.6 takes,
    // which is why the same declaration shape is reused. The default level
    // and whether thinking can be closed are NOT established, so neither an
    // `off` nor a defaultEffort is declared. Capacity follows the sources
    // that agree (500K context); max output disagrees across catalogs
    // (450K vs 500K), so it stays out.
    patterns: ["grok-4.7"],
    efforts: { low: "low", medium: "medium", high: "high", xhigh: "xhigh" },
    compat: { thinkingFormat: "openai", supportsReasoningEffort: true },
    input: ["text", "image"],
    contextWindow: 5e5,
    note: 'Grok 4.7\uFF08\u4E0A\u6E38\u5FEB\u7167 grok-4.7-20260916\uFF09\uFF1A\u6863\u4F4D Low / Medium / High / XHigh\u2014\u2014**\u53D6\u81EA\u516C\u5F00\u76EE\u5F55**\uFF08OpenRouter \u7684 supported_parameters\u3001models.dev \u5BF9 docs.x.ai \u7684\u8F6C\u8FF0\uFF09\uFF0C\u672C\u6B21 xAI \u5B98\u65B9\u6587\u6863\u7AD9\u4E0D\u53EF\u8FBE\u3001\u672A\u80FD\u4E00\u624B\u8BC1\u5B9E\uFF1B\u9ED8\u8BA4\u6863\u4F4D\u4E0E"\u80FD\u5426\u5173\u95ED\u601D\u8003"\u540C\u6837\u672A\u8BC1\u5B9E\uFF0C\u6545\u4E0D\u58F0\u660E Off\uFF0C\u4E5F\u4E0D\u5199\u9ED8\u8BA4\u6863\u3002\u5E26\u56FE\u8F93\u5165\uFF08\u76EE\u5F55\u8BB0 text+image+file\uFF0CPDF \u5B58\u7591\uFF09\uFF0C500K \u4E0A\u4E0B\u6587\uFF1B\u6700\u5927\u8F93\u51FA\u5404\u76EE\u5F55\u7ED9\u51FA 450K \u4E0E 500K \u4E24\u79CD\u503C\uFF0C\u6309"\u5206\u6B67\u5373\u4E0D\u5199"\u5904\u7406\u30022026-08 \u90A3\u6B21"grok-4.7 \u4E0D\u5B58\u5728\uFF08\u5B98\u65B9 404\uFF09"\u7684\u7ED3\u8BBA\u5DF2\u968F\u53D1\u5E03\u4F5C\u5E9F\u3002'
  },
  {
    id: "xai-grok-high",
    patterns: ["grok-4.6"],
    // grok-4.6 adds xhigh on top of low/medium/high (default) and cannot
    // close thinking (docs.x.ai model page + reasoning capability page).
    // (An earlier pass read grok-4.7 as 404 upstream; it shipped later --
    // see the entry above.)
    efforts: { low: "low", medium: "medium", high: "high", xhigh: "xhigh" },
    defaultEffort: "high",
    compat: { thinkingFormat: "openai", supportsReasoningEffort: true },
    input: ["text", "image"],
    contextWindow: 5e5,
    note: 'Grok 4.6 \u6863\u4F4D\uFF1ALow / Medium / High(\u9ED8\u8BA4) / XHigh\uFF0C\u601D\u8003\u4E0D\u53EF\u5173\u95ED\uFF1B\u5E26\u56FE\u8F93\u5165\u3001500K \u4E0A\u4E0B\u6587\u3002Grok 4.7 \u89C1\u4E0A\u4E00\u6761\uFF08\u6B64\u524D\u8BB0\u4E3A"\u4E0D\u5B58\u5728"\uFF0C\u5DF2\u968F\u53D1\u5E03\u4F5C\u5E9F\uFF09\u3002'
  },
  {
    id: "xai-grok-4-5",
    // grok-4.5 keeps the three-step ladder (default high) with image input
    // and a 500K context window; an xhigh request is silently treated as
    // high (official reasoning page), so it is not declared here.
    patterns: ["grok-4.5"],
    efforts: { low: "low", medium: "medium", high: "high" },
    defaultEffort: "high",
    compat: { thinkingFormat: "openai", supportsReasoningEffort: true },
    input: ["text", "image"],
    contextWindow: 5e5,
    note: "Grok 4.5 \u6863\u4F4D\uFF1ALow / Medium / High(\u9ED8\u8BA4)\uFF0C\u601D\u8003\u4E0D\u53EF\u5173\u95ED\uFF1B\u5E26\u56FE\u8F93\u5165\u3002\u4F20\u5165 xhigh \u4F1A\u88AB\u5B98\u65B9\u9759\u9ED8\u6309 High \u5904\u7406\u3002"
  },
  {
    id: "xai-grok-4-3",
    // Official reasoning-capability pages: grok-4.3 documents FOUR effort
    // levels (none / low / medium / high) with a 1M context window; the
    // deprecated grok-4-fast/grok-4-1-fast/grok-4-0709 slugs redirect to
    // grok-4.3 at low/none. The old "no none for 4.3" reading of the docs
    // was wrong and is fixed here.
    patterns: ["grok-4.3"],
    // Official models page (docs.x.ai model JSON): supportedEfforts now
    // spans none/low/medium/high/XHIGH with defaultEffort "low" -- xhigh
    // joined the ladder after the 2026-08 pass, and low is the default.
    efforts: { off: "none", low: "low", medium: "medium", high: "high", xhigh: "xhigh" },
    defaultEffort: "low",
    compat: { thinkingFormat: "openai", supportsReasoningEffort: true },
    input: ["text", "image"],
    contextWindow: 1e6,
    note: "Grok 4.3\uFF1A\u5B98\u65B9\u56DB\u7EA7 reasoning effort\uFF08None / Low / Medium / High\uFF09\uFF0C1M \u4E0A\u4E0B\u6587\u3001\u5E26\u56FE\u8F93\u5165\uFF1Bgrok-4-fast \u7B49\u65E7 slug 2026-05-15 \u8D77\u81EA\u52A8\u91CD\u5B9A\u5411\u5230\u672C\u578B\u53F7\u3002"
  },
  {
    id: "xai-grok",
    // grok-4.5 (and 4.1-fast etc.) take the standard three-step ladder;
    // grok-4 and older reject reasoning_effort outright -- gateways serving
    // them will refuse the value and the user can clear it by hand. Grok
    // 4/4.1 and grok-3 retired 2026-05-15 (redirected to grok-4.3), and
    // grok-build-0.1 (early-access coding model) publishes no effort
    // contract.
    patterns: ["grok"],
    efforts: { low: "low", medium: "medium", high: "high" },
    compat: { thinkingFormat: "openai", supportsReasoningEffort: true },
    input: ["text"],
    note: "Grok \u901A\u7528\u6863\u4F4D\uFF1ALow / Medium / High\u3002\u521D\u4EE3 grok-4\u3001grok-4.20 \u4E0E grok-build-0.1 \u4E0D\u63A5\u53D7\u8BE5\u53C2\u6570\uFF08grok-4 \u7CFB\u4E0E grok-3 \u5DF2\u4E8E 2026-05-15 \u9000\u5F79\u5E76\u91CD\u5B9A\u5411\u81F3 4.3\uFF09\uFF1Bgrok-4.20-multi-agent \u7684\u56DB\u6863\u63A7\u5236\u7684\u662F agent \u6570\u91CF\u800C\u975E\u601D\u8003\u6DF1\u5EA6\u3002\u65B0\u65E7\u4EE3\u9645\u8BF7\u4F18\u5148\u9009 4.5/4.6/4.3\uFF1B\u591A\u6A21\u6001\u53D8\u4F53\u6309\u9700\u52FE\u9009\u56FE\u7247\u3002"
  },
  {
    id: "mistral-magistral",
    // The native magistral line is a run-together thinking family with no
    // reasoning_effort control of its own (its thinking is driven by
    // prompt_mode / always-on), and Mistral marked the whole line
    // deprecated on 2026-07-28 (phased out through mid-2026; reasoning now
    // rides the generalist models). `false` is the honest "no effort
    // control" declaration; gateways that happen to map an effort
    // parameter onto magistral ids can be tuned by hand.
    patterns: ["magistral"],
    efforts: false,
    input: ["text"],
    contextWindow: 32768,
    maxTokens: 32768,
    note: "Magistral \u539F\u751F\u601D\u8003\u7EBF\uFF08\u65E0 effort \u53C2\u6570\uFF0C\u4E3A prompt_mode \u8BED\u4E49\uFF09\uFF0C\u5B98\u65B9\u5DF2\u4E8E 2026-07-28 \u58F0\u660E\u5F03\u7528\u3001\u9010\u6B65\u64A4\u51FA\uFF1B\u73B0\u5F79\u63A8\u7406\u8D70 mistral-small-2603 / mistral-medium-3-5 \u7684 reasoning_effort\uFF08\u89C1\u4E0B\u6761\uFF09\u3002"
  },
  {
    id: "mistral-medium-3",
    // Official reasoning page + mistral-common request.py (the first-party
    // protocol enum) name the reasoning_effort models: values are exactly
    // none/high. The API ids today are mistral-medium-3-5 (Medium 3.5's
    // model page names the dotted spelling too) and mistral-small-2603
    // (Mistral Small 4); mistral-small-latest is its alias. The dated
    // "small-2506" builds are retiring and are NOT matched; the bare
    // 'mistral-medium-3' stem was dropped so the 3.1 generation (no
    // reasoning_effort) does not get the ladder.
    // Normalization folds '.' and '-' to the same space, so the one dotted
    // spelling also keys the API id (mistral-medium-3-5).
    patterns: ["mistral-medium-3.5", "mistral-small-latest", "mistral-small-2603"],
    efforts: { off: "none", high: "high" },
    // mistral-common's ModelSettings defaults reasoning_effort to None --
    // the endpoint's no-parameter behaviour IS the none/off level.
    defaultEffort: "off",
    compat: { thinkingFormat: "openai", supportsReasoningEffort: true },
    input: ["text", "image"],
    note: "Mistral \u73B0\u5F79\u63A8\u7406\u6863\uFF1ANone / High\u2014\u2014\u5B98\u65B9 reasoning_effort \u679A\u4E3E\uFF08mistral-common \u534F\u8BAE\u5E93\uFF09\u5373 none/high\uFF1Bmistral-small-2603\uFF08Small 4\uFF09\u4E0E mistral-medium-3-5 \u7ECF\u5B83\u63A7\u5236\uFF0CMedium 3.5 \u5E26\u89C6\u89C9\u3002\u5BB9\u91CF\u672A\u5728\u5B98\u65B9\u76EE\u5F55\u9875\u5355\u5217\uFF0C\u4E0D\u63D0\u4F9B\u3002"
  },
  {
    id: "qwen-vision",
    // The DashScope vision lines: -vl suffixes and QvQ. Normalization folds
    // 'qwen2.5-vl' to 'qwen2 5 vl', hence the spelled-out middle pattern.
    // Note the modern generations (3.8-max / 3.7-plus / 3.7-flash and the
    // 3.5-omni line) are multimodal too -- see the qwen-3-8 entry and the
    // plain qwen entry note.
    patterns: ["qwen-vl", "qwen2-vl", "qwen2-5-vl", "qwen3-vl", "qvq"],
    // DashScope takes NO reasoning_effort: thinking is the enable_thinking
    // boolean -- pi-ai's 'qwen' format dispatches exactly that switch.
    // Commercial Model Studio deployments default enable_thinking to TRUE
    // (help.aliyun.com) -- the on state, which is High here.
    efforts: { off: null, high: "high" },
    defaultEffort: "high",
    compat: { thinkingFormat: "qwen" },
    input: ["text", "image"],
    contextWindow: 131072,
    maxTokens: 8192,
    note: "\u901A\u4E49\u89C6\u89C9\u7EBF\uFF08Qwen-VL/QvQ\uFF09\uFF1Aenable_thinking \u5F00\u5173\uFF08\u5F00=High\uFF09\uFF0C\u6536\u56FE\u3002qwen3-vl \u5BB9\u91CF\u66F4\u5927\uFF0C\u6309\u9700\u4E0A\u8C03\u3002"
  },
  {
    id: "qwen-3-8",
    // The 3.8 generation moved from the bare enable_thinking switch to an
    // official reasoning_effort ladder: the Qwen3.8 README ("Flexible
    // Thinking Control"), the Qwen3.8-27B model card, the Qwen3.8-Flash-Next
    // card and the qwen.ai Flash-Next blog all document reasoning_effort
    // with xhigh as the DEFAULT (xhigh/medium/low), alongside the
    // per-request enable_thinking toggle (chat_template_kwargs on
    // open-weight serving). qwen3.8-max stays the current flagship (1M
    // context; Model Studio lists it under image/video understanding), so
    // the plain qwen entry's text-only declaration must not claim it.
    patterns: ["qwen3.8"],
    efforts: { off: null, low: "low", medium: "medium", xhigh: "xhigh" },
    defaultEffort: "xhigh",
    compat: { thinkingFormat: "qwen", supportsReasoningEffort: true },
    input: ["text", "image"],
    contextWindow: 1e6,
    note: "Qwen 3.8 \u7CFB\uFF1A\u5B98\u65B9 reasoning_effort \u6863\u4F4D XHigh(\u9ED8\u8BA4) / Medium / Low\uFF0Cthinking \u9ED8\u8BA4\u5F00\u3001\u53EF\u6309\u8BF7\u6C42\u5173\u95ED\uFF1B\u539F\u751F\u591A\u6A21\u6001\uFF08qwen3.8-max \u56FE\u50CF/\u89C6\u9891\u7406\u89E3\uFF0C\u89C6\u9891\u672A\u5165\u6838\u5FC3\u8BCD\u8868\uFF09\u30021M \u6863\u4E0A\u4E0B\u6587\u300227B \u4E0E Flash-Next \u5F00\u6E90\u6B3E\u89C1\u5355\u72EC\u6761\u76EE\u3002"
  },
  {
    id: "qwen-3-8-27b",
    // Open-weight dense release (2026-08-14, HF Qwen/Qwen3.8-27B model
    // card): "native vision-language model", 262,144 context natively
    // "extensible up to 1,000,000 tokens", reasoning_effort xhigh (default)
    // / medium / low with per-request thinking disable. Longer than the
    // bare 'qwen3.8' pattern, so it wins for -27B ids.
    patterns: ["qwen3.8-27b"],
    efforts: { off: null, low: "low", medium: "medium", xhigh: "xhigh" },
    defaultEffort: "xhigh",
    compat: { thinkingFormat: "qwen", supportsReasoningEffort: true },
    input: ["text", "image"],
    contextWindow: 262144,
    note: "Qwen3.8-27B\uFF08dense\uFF0C2026-08-14 \u5F00\u6E90\uFF09\uFF1A\u5B98\u65B9 reasoning_effort \u6863\u4F4D XHigh(\u9ED8\u8BA4) / Medium / Low\uFF0Cthinking \u9ED8\u8BA4\u5F00\u3001\u53EF\u6309\u8BF7\u6C42\u5173\uFF1B\u539F\u751F\u56FE\u50CF+\u89C6\u9891\u7406\u89E3\uFF08\u89C6\u9891\u672A\u5165\u6838\u5FC3\u8BCD\u8868\uFF09\u3002262,144 \u539F\u751F\u4E0A\u4E0B\u6587\u3001\u5B98\u65B9\u58F0\u660E\u53EF\u6269\u81F3 1M\u3002\u6765\u6E90\uFF1AHF Qwen/Qwen3.8-27B \u6A21\u578B\u5361\u3002"
  },
  {
    id: "qwen-3-8-flash-next",
    // Open-weight experimental architecture preview (HF
    // Qwen/Qwen3.8-Flash-Next card + the qwen.ai blog): the
    // Qwen4-underpinning hybrid (QSA, n-gram embedding; 125B with 6B
    // activated), native vision encoder, 262,144 context natively
    // extensible to 1M. Thinking control identical to the 3.8 generation:
    // enable_thinking toggle plus reasoning_effort xhigh (default) /
    // medium / low. Longest pattern, so it wins for -flash-next ids.
    patterns: ["qwen3.8-flash-next"],
    efforts: { off: null, low: "low", medium: "medium", xhigh: "xhigh" },
    defaultEffort: "xhigh",
    compat: { thinkingFormat: "qwen", supportsReasoningEffort: true },
    input: ["text", "image"],
    contextWindow: 262144,
    note: "Qwen3.8-Flash-Next\uFF08125B-A6B \u5B9E\u9A8C\u67B6\u6784\uFF0CQwen4 \u524D\u8EAB\uFF09\uFF1A\u5B98\u65B9 reasoning_effort \u6863\u4F4D XHigh(\u9ED8\u8BA4) / Medium / Low + enable_thinking \u5F00\u5173\uFF1B\u539F\u751F\u89C6\u89C9\uFF08Vision Encoder\uFF09\u3002262,144 \u539F\u751F\u4E0A\u4E0B\u6587\u3001\u53EF\u6269\u81F3 1M\u3002\u6765\u6E90\uFF1AHF \u6A21\u578B\u5361\u4E0E qwen.ai \u5B98\u65B9\u535A\u5BA2\u3002"
  },
  {
    id: "qwen",
    patterns: ["qwen", "qwq"],
    // DashScope takes NO reasoning_effort: thinking is the enable_thinking
    // boolean (plus thinking_budget) -- pi-ai's 'qwen' format dispatches
    // exactly that switch, so the ladder is honestly open/close with one
    // nominal thinking level. QwQ is think-always; clearing the off level
    // there is one click. Commercial DashScope defaults enable_thinking to
    // TRUE (open-weight serving defaults to false) -- the on state is High.
    efforts: { off: null, high: "high" },
    defaultEffort: "high",
    compat: { thinkingFormat: "qwen" },
    input: ["text"],
    contextWindow: 1e6,
    maxTokens: 65536,
    note: "\u901A\u4E49\u5343\u95EE\uFF1Aenable_thinking \u5F00\u5173\uFF08\u65E0 effort \u6863\uFF09\uFF0C\u5F00=High\uFF1B\u73B0\u5F79\u65D7\u8230\u4E3A qwen3.8 \u7CFB\uFF081M \u6863\u4E0A\u4E0B\u6587\uFF0C\u89C1 qwen-3-8 \u6761\u76EE\uFF09\u30023.6/3.7 \u4EE3\u7684 Plus/Flash \u4EA6\u9ED8\u8BA4\u591A\u6A21\u6001\uFF08\u56FE\u7247/\u89C6\u9891\uFF09\uFF0C\u5982\u63A5\u5165\u8BF7\u6309\u9700\u52FE\u9009\u56FE\u7247\uFF1B\u89C6\u89C9\u7EBF\u89C1 qwen-vision \u6761\u76EE\u3002"
  },
  {
    id: "glm-vision",
    // Zhipu's vision lines: glm-4v / glm-4.6v / glm-4.5v / glm-5v. Longer
    // than the plain 'glm' patterns, so they win for those ids.
    // 'glm-4-6v' (not 'glm-46v'): normalization folds 'glm-4.6v' to
    // 'glm 4 6v', so the pattern must carry the same inner separator; the
    // same fold gives 'glm-4.5v' -> 'glm 4 5v'.
    patterns: ["glm-4v", "glm-4-6v", "glm-4-5v", "glm-5v"],
    efforts: { off: null, high: "high" },
    // GLM-4.5V is forced-thinking and the 4.x line defaults to enabled
    // (docs.bigmodel.cn thinking page) -- the on state is High.
    defaultEffort: "high",
    compat: { thinkingFormat: "zai" },
    input: ["text", "image"],
    contextWindow: 131072,
    maxTokens: 32768,
    note: "\u667A\u8C31\u89C6\u89C9\u7EBF\uFF08GLM-4V/4.5V/4.6V/5V\uFF09\uFF1Athinking \u5F00\u5173\uFF08\u5F00=High\uFF09\uFF0C\u6536\u56FE\u3002GLM-4.5V \u4E3A\u5F3A\u5236\u601D\u8003\uFF08\u4F20 disabled \u62A5\u9519\uFF0C\u8BF7\u624B\u52A8\u5220 Off \u6863\uFF09\u3002"
  },
  {
    id: "glm-5-3-flash",
    // Official model page (docs.bigmodel.cn/cn/guide/models/vlm/glm-5.3-flash,
    // page dated 2026-08-28): input modalities "视频、图像、文本、文件", 1M
    // context / 128K max output, and "thinking.type 仅支持 enabled" — forced
    // thinking, no off switch. "文本参数与 GLM-5.3 保持一致" gives the flash
    // variant the 5.3 ladder (low/high/max). Native multimodal (320B), which
    // the text-only glm-5.3 entry must NOT claim — hence this separate entry;
    // the longer pattern wins over plain 'glm-5.3'.
    patterns: ["glm-5.3-flash"],
    efforts: { low: "low", high: "high", max: "max" },
    defaultEffort: "max",
    compat: { thinkingFormat: "zai", supportsReasoningEffort: true },
    input: ["text", "image"],
    contextWindow: 1048576,
    maxTokens: 131072,
    note: "GLM-5.3-Flash\uFF08320B\uFF0C\u5B98\u65B9\u6587\u6863 vlm \u5206\u7C7B\uFF09\uFF1A\u5F3A\u5236\u601D\u8003\uFF08thinking.type \u4EC5 enabled\uFF0C\u4E0D\u652F\u6301\u5173\u95ED\uFF09\uFF0C\u6587\u672C\u53C2\u6570\u4E0E GLM-5.3 \u4E00\u81F4\u2014\u2014\u6863\u4F4D Low / High / Max\u3002\u8F93\u5165\u6A21\u6001\uFF1A\u89C6\u9891\u3001\u56FE\u50CF\u3001\u6587\u672C\u3001\u6587\u4EF6\uFF08\u89C6\u9891/\u6587\u4EF6\u672A\u5165\u6838\u5FC3\u8BCD\u8868\uFF0C\u56FE\u7247\u53EF\u52FE\uFF09\u3002\u5B98\u65B9 1M \u4E0A\u4E0B\u6587 / 128K \u6700\u5927\u8F93\u51FA\u3002\u6765\u6E90\uFF1Adocs.bigmodel.cn \u6A21\u578B\u9875\u3002"
  },
  {
    id: "glm-5-3",
    patterns: ["glm-5.3"],
    // glm-5.3 accepts exactly max/high/low; anything else (including the
    // 5.2 ladder's minimal/none) errors, and thinking cannot be disabled.
    // The API reference names reasoning_effort's default as max.
    efforts: { low: "low", high: "high", max: "max" },
    defaultEffort: "max",
    compat: { thinkingFormat: "zai", supportsReasoningEffort: true },
    input: ["text"],
    contextWindow: 1048576,
    maxTokens: 131072,
    note: "GLM-5.3 \u6863\u4F4D\uFF1ALow / High / Max\uFF08\u5F3A\u5236\u601D\u8003\uFF0C\u5176\u4F59\u503C\u62A5\u9519\uFF09\u3002\u5B98\u65B9\u5BB9\u91CF 1M / 128K\u3002"
  },
  {
    id: "glm-5-2",
    patterns: ["glm-5.2"],
    // glm-5.2 takes the widest ladder in the wild: none/minimal/low/medium/
    // high/xhigh/max (default max). The zai format arms thinking:disabled
    // for off and sends the effort for the rest.
    efforts: { off: "none", minimal: "minimal", low: "low", medium: "medium", high: "high", xhigh: "xhigh", max: "max" },
    defaultEffort: "max",
    compat: { thinkingFormat: "zai", supportsReasoningEffort: true },
    input: ["text"],
    contextWindow: 1048576,
    maxTokens: 131072,
    // Official capability page: none/minimal stop thinking, low/medium map
    // to high, xhigh maps to max -- all seven spellings are accepted.
    note: "GLM-5.2 \u6863\u4F4D\uFF1ANone / Minimal / Low / Medium / High / XHigh / Max\uFF08\u5B98\u65B9\u6620\u5C04\uFF1ALow\xB7Medium\u2192High\u3001XHigh\u2192Max\u3001None\xB7Minimal=\u505C\u6B62\u601D\u8003\uFF09\u3002\u89C6\u89C9\u7EBF\u89C1 glm-vision \u6761\u76EE\u3002"
  },
  {
    id: "glm",
    patterns: ["glm", "zhipu", "chatglm"],
    // GLM 4.x: thinking.type enabled/disabled only, no effort ladder --
    // the zai format sends exactly that switch (and no effort value,
    // because supportsReasoningEffort is not declared). GLM-4.5/4.6
    // default to enabled (hybrid reasoning: the model decides per
    // request) -- the on state is High.
    efforts: { off: null, high: "high" },
    defaultEffort: "high",
    compat: { thinkingFormat: "zai" },
    input: ["text"],
    note: "GLM \u901A\u7528\uFF1Athinking \u5F00\u5173\uFF08\u65E0 effort \u6863\uFF09\uFF0C\u5F00=High\uFF1Beffort \u9636\u68AF\u4EC5 GLM-5.2+ \u652F\u6301\uFF08\u89C1\u4E0A\u4E24\u6761\u76EE\uFF09\u3002\u6CE8\u610F GLM-4.7/GLM-4.5V \u4E3A\u5F3A\u5236\u601D\u8003\uFF0C\u4F20 disabled \u4F1A\u62A5\u9519\uFF08\u8BF7\u624B\u52A8\u5220 Off \u6863\uFF09\u3002\u89C6\u89C9\u7EBF\u89C1 glm-vision \u6761\u76EE\u3002"
  },
  {
    id: "kimi-k3",
    patterns: ["kimi-k3"],
    // kimi-k3: top-level reasoning_effort low/high/max (default max),
    // always thinking -- the thinking object must not be sent at all.
    efforts: { low: "low", high: "high", max: "max" },
    defaultEffort: "max",
    compat: { thinkingFormat: "openai", supportsReasoningEffort: true },
    input: ["text", "image"],
    contextWindow: 1048576,
    note: "Kimi K3 \u6863\u4F4D\uFF1ALow / High / Max(\u9ED8\u8BA4 Max)\uFF0C\u8D70\u9876\u5C42 reasoning_effort\uFF1B\u59CB\u7EC8\u63A8\u7406\u3001\u52FF\u4F20 thinking \u5BF9\u8C61\u3002\u539F\u751F\u89C6\u89C9\u7406\u89E3\uFF0C1M \u4E0A\u4E0B\u6587\uFF08\u6700\u5927\u8F93\u51FA\u5B98\u65B9\u672A\u5355\u72EC\u5217\uFF0C\u4E0D\u63D0\u4F9B\uFF09\u3002"
  },
  {
    id: "kimi-k2-vision",
    // K2.5/K2.6 are multimodal thinking models with a toggleable
    // thinking.type switch (official use-thinking-models table); K2.5 was
    // re-verified as MULTIMODAL on 2026-08-24 (the old "text-only" note was
    // wrong). Longer patterns beat the plain 'kimi' stem below.
    patterns: ["kimi-k2.6", "kimi-k2.5"],
    efforts: { off: null, high: "high" },
    defaultEffort: "high",
    compat: { thinkingFormat: "deepseek" },
    input: ["text", "image"],
    contextWindow: 262144,
    note: "Kimi K2.5/K2.6 \u89C6\u89C9\u4EE3\uFF1Athinking.type \u5F00\u5173\uFF08\u9ED8\u8BA4\u5F00\u3001\u53EF\u5173\uFF09\uFF0C\u5F00=High\uFF1B\u5E26\u89C6\u89C9\uFF0C256K\u3002K2.7 Code \u59CB\u7EC8\u601D\u8003\uFF0C\u89C1\u5355\u72EC\u6761\u76EE\u3002"
  },
  {
    id: "kimi-k27-code",
    // K2.7 Code (and its highspeed twin) ALWAYS think: thinking.type only
    // accepts "enabled", sending "disabled" errors -- so no Off level.
    patterns: ["kimi-k2.7"],
    efforts: { high: "high" },
    defaultEffort: "high",
    compat: { thinkingFormat: "deepseek" },
    input: ["text", "image"],
    contextWindow: 262144,
    note: "Kimi K2.7 Code\uFF08\u542B\u9AD8\u901F\u7248\uFF09\uFF1A\u59CB\u7EC8\u601D\u8003\u2014\u2014thinking.type \u4EC5\u63A5\u53D7 enabled\uFF08\u4F20 disabled \u62A5\u9519\uFF09\uFF0C\u65E0 Off \u6863\uFF1B\u5E26\u89C6\u89C9\uFF0C256K\u3002"
  },
  {
    id: "kimi-moonshot-v1-vision",
    // Legacy Moonshot V1 vision variants (official model list): plain
    // generation models with no thinking control, but they DO accept images
    // -- the generic 'moonshot' pattern must not declare text-only for them.
    patterns: ["moonshot-v1-8k-vision", "moonshot-v1-32k-vision", "moonshot-v1-128k-vision"],
    efforts: false,
    input: ["text", "image"],
    note: "Moonshot V1 \u89C6\u89C9\u65E7\u4EE3\uFF088k/32k/128k \u5404\u4E00\uFF09\uFF1A\u65E0\u601D\u8003\u63A7\u4EF6\uFF08\u751F\u6210\u6A21\u578B\uFF09\u3001\u652F\u6301\u56FE\u7247\u8F93\u5165\uFF1B\u8BE5\u7EBF\u5DF2\u505C\u6B62\u5BF9\u65B0\u7528\u6237\u5F00\u653E\uFF082026-08-31 \u5168\u91CF\u4E0B\u7EBF\uFF0C\u7F51\u5173\u6B8B\u7559\u4ECD\u53EF\u547D\u4E2D\uFF09\u3002"
  },
  {
    id: "kimi",
    // k2.5/2.6 use the DeepSeek-shaped thinking.type enabled/disabled
    // switch, which the 'deepseek' format dispatches; the old k2 preview
    // ids and moonshot-v1 names are retired upstream (2026-05/08) but live
    // on gateways. Effort ladders are not part of their contract.
    patterns: ["kimi", "moonshot"],
    efforts: { off: null, high: "high" },
    compat: { thinkingFormat: "deepseek" },
    input: ["text"],
    contextWindow: 262144,
    note: "Kimi \u901A\u7528\uFF1Athinking \u5F00\u5173\uFF08\u65E0 effort \u6863\uFF09\uFF0C\u5F00=High\u3002k2 \u7CFB\u5217 2026-05-25 \u4E0B\u7EBF\u3001kimi-latest 2026-01-28 \u4E0B\u7EBF\u3001moonshot-v1 \u7CFB 2026-08-31 \u5168\u91CF\u4E0B\u7EBF\uFF08\u7F51\u5173\u6B8B\u7559\u4ECD\u53EF\u547D\u4E2D\uFF1Bmoonshot-v1 \u672C\u8EAB\u975E\u601D\u8003\u6A21\u578B\uFF09\u3002\u89C6\u89C9\u4EE3\u4E0E K2.7 Code \u89C1\u5355\u72EC\u6761\u76EE\u3002"
  },
  {
    id: "hunyuan-hy3",
    // Open-weight contract (Tencent-Hunyuan/Hy3 README): reasoning_effort
    // travels inside chat_template_kwargs as "no_think" (default) / "low" /
    // "high"; the same README's spec table states a 256K context length.
    patterns: ["hy3"],
    efforts: { low: "low", high: "high" },
    compat: { thinkingFormat: "openai", supportsReasoningEffort: true },
    input: ["text"],
    contextWindow: 262144,
    note: "\u6DF7\u5143 hy3\uFF1A\u5F00\u6E90\u5951\u7EA6\u7ECF chat_template_kwargs.reasoning_effort = no_think(\u9ED8\u8BA4)/low/high\uFF1B\u5B98\u65B9\u6A21\u578B\u5361 256K \u4E0A\u4E0B\u6587\uFF08295B MoE\uFF0C2026 \u5F00\u6E90\uFF09\u3002"
  },
  {
    id: "hunyuan-hy4",
    // Open-weight contract (Tencent-Hunyuan/Hy4-preview README): reasoning
    // defaults to "high" (deep chain-of-thought) and is disabled with
    // extra_body={"chat_template_kwargs": {"reasoning_effort": "no_think"}}
    // — the same chat-template channel as hy3, with the default flipped to
    // high. The spec table states a 1M context length; the model is a
    // 770B-A49B MoE with Gated DSA attention. The README documents no levels
    // beyond high/no_think, so a low rung is NOT declared without evidence.
    patterns: ["hy4-preview", "hy-4-preview"],
    efforts: { off: "no_think", high: "high" },
    defaultEffort: "high",
    compat: { thinkingFormat: "openai", supportsReasoningEffort: true },
    contextWindow: 1e6,
    note: "\u6DF7\u5143 Hy4 preview\uFF1A\u5B98\u65B9 README\u2014\u2014reasoning \u9ED8\u8BA4 high\uFF08\u6DF1\u5EA6\u601D\u8003\uFF09\uFF0C\u5173\u95ED\u7ECF chat_template_kwargs.reasoning_effort=no_think\uFF1B\u5B98\u65B9\u89C4\u683C\u8868 1M \u4E0A\u4E0B\u6587\uFF08770B-A49B MoE\uFF0CGated DSA\uFF09\u3002low \u6863\u5B98\u65B9\u672A\u5217\uFF0C\u5982\u6709\u8BF7\u624B\u8C03\uFF1B\u89C6\u89C9\u672A\u58F0\u660E\uFF0C\u6309\u9700\u624B\u52FE\u3002\u6765\u6E90\uFF1ATencent-Hunyuan/Hy4-preview \u5B98\u65B9 README\u3002"
  },
  {
    id: "step-5-preview",
    // StepFun's official model is 'step-5-preview' (there is no bare
    // 'step-5'), carrying the same three-step reasoning_effort ladder as the
    // 3.x line with no way to close thinking -- hence no `off`. The official
    // page calls medium the "default recommendation". 1M context, 64K max
    // output, native image + video input.
    patterns: ["step-5"],
    efforts: { low: "low", medium: "medium", high: "high" },
    defaultEffort: "medium",
    compat: { thinkingFormat: "openai", supportsReasoningEffort: true },
    input: ["text", "image"],
    contextWindow: 1e6,
    maxTokens: 65536,
    note: '\u9636\u8DC3 Step-5-Preview\uFF08\u5B98\u65B9 id \u5373 step-5-preview\uFF0C\u65E0\u88F8 step-5\uFF1Bpattern \u53D6\u5BB6\u65CF\u4E3B\u5E72\u4EE5\u517C\u5BB9\u7F51\u5173\u5199\u6CD5\uFF09\uFF1A\u6863\u4F4D Low / Medium(\u5B98\u65B9\u6807"\u9ED8\u8BA4\u63A8\u8350") / High\uFF0C\u601D\u8003\u4E0D\u53EF\u5173\u95ED\uFF1B\u539F\u751F\u56FE\u7247 + \u89C6\u9891\u8F93\u5165\uFF1B1M \u4E0A\u4E0B\u6587\u300164K \u6700\u5927\u8F93\u51FA\uFF08\u5B98\u65B9\u53E6\u6CE8 max_tokens \u9ED8\u8BA4 INF\u3001\u4E0E 64K \u4E0A\u9650\u5E76\u5B58\uFF0C\u4EE5\u7AEF\u70B9\u5B9E\u6D4B\u4E3A\u51C6\uFF09\u3002'
  },
  {
    id: "step-3-7",
    // StepFun step-3.7 is the vision-capable generation; 3.5 stayed
    // text-only on the official serving plan.
    patterns: ["step-3.7", "step-3.6"],
    efforts: { low: "low", medium: "medium", high: "high" },
    defaultEffort: "medium",
    compat: { thinkingFormat: "openai", supportsReasoningEffort: true },
    input: ["text", "image"],
    contextWindow: 262144,
    note: "\u9636\u8DC3 Step-3.6/3.7 \u6863\u4F4D\uFF1ALow / Medium(\u9ED8\u8BA4\u63A8\u8350) / High\uFF0C\u539F\u751F\u56FE\u7247+\u89C6\u9891\u7406\u89E3\u3002\u4E0A\u4E0B\u6587\u4E3A\u8F93\u5165+\u8F93\u51FA\u603B\u548C\u4E0A\u9650\u3002"
  },
  {
    id: "step-3-5",
    // step-3.5-flash (official listing): only low/high, text-only.
    patterns: ["step-3.5"],
    efforts: { low: "low", high: "high" },
    compat: { thinkingFormat: "openai", supportsReasoningEffort: true },
    input: ["text"],
    contextWindow: 262144,
    note: "\u9636\u8DC3 Step-3.5 Flash \u6863\u4F4D\uFF1ALow / High\uFF08\u7EAF\u6587\u672C\u63A8\u7406\u65D7\u8230\uFF09\u3002\u4E0A\u4E0B\u6587\u4E3A\u8F93\u5165+\u8F93\u51FA\u603B\u548C\u4E0A\u9650\u3002"
  },
  {
    id: "step",
    // StepFun step-3.x: reasoning_effort low/medium/high (default medium);
    // thinking cannot be turned off, only tuned.
    patterns: ["step-3", "step-2"],
    efforts: { low: "low", medium: "medium", high: "high" },
    defaultEffort: "medium",
    compat: { thinkingFormat: "openai", supportsReasoningEffort: true },
    input: ["text"],
    note: "\u9636\u8DC3 Step \u6863\u4F4D\uFF1ALow / Medium / High\uFF08\u9ED8\u8BA4 Medium\uFF0C\u4E0D\u53EF\u5173\u95ED\uFF09\u30023.6/3.7 \u89C6\u89C9\u4EE3\u89C1\u5355\u72EC\u6761\u76EE\u3002"
  },
  {
    id: "doubao",
    // Volcengine Ark: officially documented is the thinking.type
    // enabled/disabled/auto switch; the reasoning_effort ladder on
    // seed-2.x has community evidence (chatbox/compshare) but no first-
    // party doc yet -- kept as the conventional ladder, verify per gateway.
    // 'doubao' already covers every doubao-* spelling; the bare 'seed' token
    // (boundary-checked) catches seed-first ids some gateways serve. The
    // seed generations are vision-capable; doubao-1.5-pro stays text-only.
    patterns: ["doubao", "seed"],
    efforts: { off: null, low: "low", medium: "medium", high: "high" },
    compat: { thinkingFormat: "openai", supportsReasoningEffort: true },
    input: ["text", "image"],
    note: "\u8C46\u5305\u6863\u4F4D\uFF1AOff / Low / Medium / High\u2014\u2014effort \u9636\u68AF\u4ECD\u662F\u793E\u533A\u8BC1\u636E\u3001\u5B98\u65B9 Ark \u6587\u6863\u660E\u5217\u7684\u4E3A thinking.type \u5F00\u5173\uFF082026-08-24 \u590D\u6838\u4ECD\u672A\u89C1\u5230 effort \u5B98\u65B9\u660E\u6587\uFF09\u3002seed \u4EE3\u6536\u56FE\uFF081.5-pro \u4F8B\u5916\uFF09\u3002"
  },
  {
    id: "minimax-m3",
    // Official M3 README: a thinking parameter with enabled / adaptive /
    // disabled -- NO reasoning_effort ladder. That is exactly the
    // deepseek-shaped toggle, so the kimi-style declaration fits; "adaptive"
    // is not expressible in the level vocabulary and defaults apply.
    patterns: ["minimax-m3"],
    efforts: { off: null, high: "high" },
    compat: { thinkingFormat: "deepseek" },
    input: ["text", "image"],
    contextWindow: 1048576,
    note: "MiniMax-M3\uFF1A\u5B98\u65B9 thinking \u53C2\u6570 enabled/adaptive/disabled\uFF08\u65E0 effort \u6863\uFF09\uFF0C\u5F00=High\u3001\u5173=disabled\uFF1B\u539F\u751F\u591A\u6A21\u6001\uFF08\u56FE/\u89C6\u9891\uFF0C\u6838\u5FC3\u8BCD\u8868\u4EC5\u542B\u56FE\uFF09\uFF0C1M \u4E0A\u4E0B\u6587\u3002"
  },
  {
    id: "mimo-v2-6",
    // Xiaomi MiMo v2.6 (and the v2.5 generation it supersedes) takes a required
    // thinking.type toggle (enabled/disabled, default enabled) plus a required
    // reasoning.effort. The official page lists the accepted effort values as
    // none/minimal/low/medium/high/xhigh/max/ultra and normalizes minimal to
    // low and xhigh/max/ultra to high -- but says outright that reasoning
    // strength is not differentiated yet, so the ladder below is what the
    // endpoint ACCEPTS, not a set of levels that behave differently today.
    // xhigh/max are deliberately absent: the endpoint folds them into high.
    // One entry covers both generations: the same models are documented under
    // one contract, and the family's only text-only member (v2.5-pro) keys its
    // own entry with a strictly longer pattern.
    patterns: ["mimo-v2.6", "mimo-v2.5"],
    efforts: { off: "none", low: "low", medium: "medium", high: "high" },
    compat: { thinkingFormat: "openai", supportsReasoningEffort: true },
    input: ["text", "image"],
    contextWindow: 1048576,
    maxTokens: 131072,
    note: "\u5C0F\u7C73 MiMo v2.6 \u7CFB\u5217\uFF08mimo-v2.6-pro / -flash / -pro-ultraspeed\uFF1B1M \u4E0A\u4E0B\u6587 / 128K \u6700\u5927\u8F93\u51FA\u3001\u539F\u751F\u5168\u6A21\u6001\uFF09\u4E0E\u5176\u524D\u4EE3 mimo-v2.5\u3002\u5B98\u65B9\u6587\u6863\uFF1Athinking.type\uFF08enabled/disabled\uFF0C\u9ED8\u8BA4 enabled\uFF09+ reasoning.effort\uFF08none \u5173\u95ED\uFF1B\u5176\u4F59\u5408\u6CD5\u503C\u5747\u5F00\u542F\uFF0C\u4E14**\u73B0\u9636\u6BB5\u6682\u672A\u533A\u5206\u63A8\u7406\u5F3A\u5EA6**\u2014\u2014minimal \u5F52\u4E00\u4E3A low\u3001xhigh/max/ultra \u5F52\u4E00\u4E3A high\uFF09\uFF0C\u56E0\u6B64\u8FD9\u91CC\u58F0\u660E\u7684\u662F\u7AEF\u70B9**\u63A5\u53D7**\u7684\u6863\u4F4D Off / Low / Medium / High\uFF08xhigh\u3001max \u4E0D\u58F0\u660E\uFF0C\u7AEF\u70B9\u53EA\u4F1A\u6298\u53E0\u4E3A high\uFF09\u3002\u601D\u8003\u6A21\u5F0F\u4E0B temperature / top_p \u4E0D\u53EF\u81EA\u5B9A\u4E49\uFF08\u5F3A\u5236 1.0 / 0.95\uFF09\uFF1B\u5E26\u5DE5\u5177\u8C03\u7528\u7684\u5386\u53F2\u8F6E\u5FC5\u987B\u5B8C\u6574\u56DE\u4F20 reasoning_content\uFF0C\u5426\u5219 400\u3002mimo-v2.5 \u4E0E v2.5-pro \u5B98\u65B9\u5B9A\u4E8E 2026-10-21 \u4E0B\u7EBF\u3002"
  },
  {
    id: "mimo-v2-5-pro",
    // The v2.5 flagship is the family's only text-only member -- the official
    // capability table lists no multimodal understanding for it (models.dev
    // agrees, attachment=false), while every v2.6 model and mimo-v2.5 do.
    // Strictly longer pattern than the family entry's 'mimo-v2.5', so the
    // longest-hit rule routes it here.
    patterns: ["mimo-v2.5-pro"],
    efforts: { off: "none", low: "low", medium: "medium", high: "high" },
    compat: { thinkingFormat: "openai", supportsReasoningEffort: true },
    input: ["text"],
    contextWindow: 1048576,
    maxTokens: 131072,
    note: "\u5C0F\u7C73 MiMo v2.5-Pro\uFF1A\u8BE5\u5BB6\u65CF\u552F\u4E00\u7684**\u7EAF\u6587\u672C**\u6210\u5458\uFF08\u5B98\u65B9\u80FD\u529B\u8868\u672A\u5217\u5168\u6A21\u6001\u7406\u89E3\uFF09\uFF0C1M \u4E0A\u4E0B\u6587 / 128K \u6700\u5927\u8F93\u51FA\uFF0C\u63A8\u7406\u5951\u7EA6\u4E0E v2.6 \u7CFB\u5217\u76F8\u540C\uFF08thinking.type + reasoning.effort\uFF0Cnone \u5173\u95ED\u3001\u5176\u4F59\u6863\u4F4D\u6682\u4E0D\u533A\u5206\u5F3A\u5EA6\uFF09\u3002\u5B98\u65B9\u5B9A\u4E8E 2026-10-21 \u4E0B\u7EBF\u3002"
  },
  {
    id: "baidu-ernie",
    // Baidu Qianfan's OpenAI-compatible surface accepts no reasoning_effort
    // parameter (the v2 API parameter tables carry none); thinking is a
    // per-variant property: the -Thinking / ERNIE 5.0-Thinking-* family is
    // always-on thinking, the plain ERNIE 4.5/5.0/5.1 generations are not
    // thinking models at all. The official pricing page (2026-08) lists
    // ERNIE 5.1 / 5.0 / 5.0-Thinking-Preview|Latest|Exp / 4.5-Turbo(-VL).
    patterns: ["ernie"],
    efforts: false,
    input: ["text"],
    contextWindow: 131072,
    note: "\u767E\u5EA6\u5343\u5E06 ERNIE \u7CFB\uFF1A\u5B98\u65B9 OpenAI \u517C\u5BB9\u63A5\u53E3\u65E0 reasoning_effort \u53C2\u6570\u2014\u2014\u601D\u8003\u7531\u6A21\u578B\u53D8\u4F53\u51B3\u5B9A\uFF08-Thinking \u7CFB\u5217\u59CB\u7EC8\u601D\u8003\u3001\u666E\u901A\u7CFB\u5217\u4E0D\u601D\u8003\uFF09\uFF0C\u52FF\u52FE\u601D\u8003\u6863\u3002ERNIE 4.5 Turbo VL \u652F\u6301\u56FE\u7247\uFF0C\u6309\u9700\u624B\u52FE\uFF1B\u53C2\u8003\u5BB9\u91CF\u53D6 Turbo 128K \u6863\u3002"
  }
];
var GENERIC_OPENAI_EFFORTS = {
  off: null,
  low: "low",
  medium: "medium",
  high: "high"
};
var PROTOCOL_INFERENCE = {
  "openai-completions": GENERIC_OPENAI_EFFORTS,
  "openai-responses": GENERIC_OPENAI_EFFORTS,
  "anthropic-messages": GENERIC_OPENAI_EFFORTS,
  // The live V4 contract: low/high/max (+ thinking toggle for off, spelled
  // 'none' so an off selection also maps to the official Responses-API value
  // reasoning.effort: none).
  deepseek: { off: "none", low: "low", high: "high", max: "max" }
};
var GENERIC_FALLBACK = { low: "low", medium: "medium", high: "high" };
function normalize(value) {
  return (value ?? "").toLowerCase().trim();
}
function isAlnum(ch) {
  return ch !== void 0 && /[a-z0-9]/.test(ch);
}
function normalizeLoose(value) {
  return value.toLowerCase().trim().replace(/[^a-z0-9]+/g, " ");
}
function onBoundary(haystack, at, length) {
  const before = at === 0 ? void 0 : haystack[at - 1];
  const after = haystack[at + length];
  return !isAlnum(before) && !isAlnum(after);
}
function matchKnowledgeBase(modelId, displayName) {
  const haystack = normalizeLoose(modelId) + " " + normalizeLoose(displayName ?? "");
  let best;
  for (const entry of KNOWLEDGE_BASE) {
    for (const pattern of entry.patterns) {
      const needle = normalizeLoose(pattern);
      let at = haystack.indexOf(needle);
      while (at >= 0) {
        if (onBoundary(haystack, at, needle.length)) {
          if (best === void 0 || needle.length > best.length) {
            best = { entry, length: needle.length };
          }
          break;
        }
        at = haystack.indexOf(needle, at + 1);
      }
    }
  }
  return best?.entry;
}
var NATIVE_DIALECT_DOMAINS = {
  // api.deepseek.com is the official endpoint (api-docs.deepseek.com). The
  // 'deepseek.ai' form was dropped: it resolves to a Vercel-hosted site
  // (76.76.21.21), not DeepSeek infrastructure, so nothing warrants assuming
  // the native dialect for it.
  "deepseek.com": "deepseek",
  "anthropic.com": "anthropic-messages"
};
function inferProtocol(route) {
  const api = normalize(route.api);
  if (api.length > 0) return api;
  const baseURL = route.baseURL;
  if (baseURL !== void 0 && baseURL.length > 0) {
    try {
      const host = new URL(baseURL).hostname.toLowerCase();
      const parts = host.split(".");
      if (parts.length >= 2) {
        const dialect = NATIVE_DIALECT_DOMAINS[parts.slice(-2).join(".")];
        if (dialect !== void 0) return dialect;
      }
    } catch {
    }
  }
  return "openai-completions";
}
var COMPAT_CAPABLE_PROTOCOL = "openai-completions";
var ANTHROPIC_PROTOCOL = "anthropic-messages";
function isSelfHostedEndpoint(baseURL) {
  if (baseURL === void 0 || baseURL.length === 0) return false;
  let host = "";
  try {
    host = new URL(baseURL).hostname.toLowerCase();
  } catch {
    return false;
  }
  if (host === "localhost" || host === "::1" || host.endsWith(".local") || host.endsWith(".internal")) return true;
  if (/^(127\.|10\.|192\.168\.)/.test(host)) return true;
  if (/^172\.(1[6-9]|2[0-9]|3[01])\./.test(host)) return true;
  return host.includes(":");
}
function sanitizeCompatForProtocol(compat, api) {
  const norm = normalize(api);
  const copy = { ...compat };
  delete copy["supportsMidConvoEffort"];
  delete copy["allowedFallbackModels"];
  if (norm === ANTHROPIC_PROTOCOL) {
    for (const key of ["thinkingFormat", "supportsReasoningEffort", "thinkingTokenBudgetField", "supportsThinkingTokenBudget", "vllmPriority", "supportsMaxOutputTokens"]) delete copy[key];
    if (copy["forceAdaptiveThinking"] === void 0) return void 0;
    return { forceAdaptiveThinking: copy["forceAdaptiveThinking"] };
  }
  if (norm === "openai-responses") {
    for (const key of ["thinkingFormat", "supportsReasoningEffort", "thinkingTokenBudgetField", "supportsThinkingTokenBudget", "vllmPriority"]) delete copy[key];
    if (copy["supportsMaxOutputTokens"] === void 0) return void 0;
    return { supportsMaxOutputTokens: copy["supportsMaxOutputTokens"] };
  }
  if (norm !== COMPAT_CAPABLE_PROTOCOL) return void 0;
  delete copy["forceAdaptiveThinking"];
  delete copy["supportsMaxOutputTokens"];
  return Object.keys(copy).length === 0 ? void 0 : copy;
}
function compatForRoute(entry, route) {
  const api = normalize(route.api);
  if (api === COMPAT_CAPABLE_PROTOCOL) {
    let compat = entry.compat;
    if (compat !== void 0) compat = sanitizeCompatForProtocol(compat, api) ?? void 0;
    if (compat === void 0 && !isSelfHostedEndpoint(route.baseURL)) return void 0;
    if (compat === void 0) return { thinkingTokenBudgetField: "thinking_token_budget" };
    if (compat.thinkingTokenBudgetField === void 0 && compat.supportsThinkingTokenBudget !== true && isSelfHostedEndpoint(route.baseURL)) {
      return { ...compat, thinkingTokenBudgetField: "thinking_token_budget" };
    }
    return compat;
  }
  if (api === ANTHROPIC_PROTOCOL && entry.anthropicAdaptive === true) {
    return { forceAdaptiveThinking: true };
  }
  return void 0;
}
var OFFICIAL_RELAY_DOMAINS = [
  // First-party OpenAI-compatible endpoints (developer accepted).
  "openai.com",
  "openai.azure.com",
  "deepseek.com",
  "openrouter.ai",
  "z.ai",
  "bigmodel.cn",
  "moonshot.ai",
  "moonshot.cn",
  "aliyuncs.com",
  "anthropic.com",
  "x.ai",
  "together.ai",
  "together.xyz",
  "nvidia.com",
  "cerebras.ai",
  "cloudflare.com",
  // pi-ai-parity: detected nonstandard upstream (pin would be a no-op).
  "chutes.ai",
  "opencode.ai",
  "ant-ling.com"
];
function isSelfHostedRelay(route) {
  if (normalize(route.api) !== COMPAT_CAPABLE_PROTOCOL) return false;
  const baseURL = route.baseURL;
  if (baseURL === void 0 || baseURL.length === 0) return false;
  try {
    const host = new URL(baseURL).hostname.toLowerCase();
    if (!host.includes(".")) return false;
    return !OFFICIAL_RELAY_DOMAINS.some((root) => host === root || host.endsWith("." + root));
  } catch {
    return false;
  }
}
function withRolePin(compat, route, reasons) {
  if (compat === void 0 || !reasons) return compat;
  if (compat.supportsDeveloperRole !== void 0) return compat;
  if (!isSelfHostedRelay(route)) return compat;
  return { ...compat, supportsDeveloperRole: false };
}
var ENDPOINT_CONFIRMED_LADDER = { off: null, low: "low", medium: "medium", high: "high" };
var VISION_NAME_TOKENS = [
  "vl",
  "vision",
  "omni",
  "4o",
  "pixtral",
  "internvl"
];
function inferModalitiesFromName(modelId) {
  const haystack = normalizeLoose(modelId);
  for (const token of VISION_NAME_TOKENS) {
    const needle = normalizeLoose(token);
    let at = haystack.indexOf(needle);
    while (at >= 0) {
      if (onBoundary(haystack, at, needle.length)) return ["text", "image"];
      at = haystack.indexOf(needle, at + 1);
    }
  }
  return void 0;
}
function declaredCoreInput(raw) {
  if (raw === void 0) return void 0;
  const lowered = raw.map((value) => value.toLowerCase());
  if (!lowered.some((value) => INPUT_MODALITIES.includes(value))) return void 0;
  return lowered.includes("image") ? ["text", "image"] : ["text"];
}
function suggestEfforts(modelId, route, endpoint) {
  const entry = matchKnowledgeBase(modelId, route.displayName);
  let input;
  let inputSource;
  let contextWindow;
  let maxTokens;
  if (entry?.input !== void 0) {
    input = entry.input;
    inputSource = "knowledge";
  }
  if (entry?.contextWindow !== void 0) contextWindow = entry.contextWindow;
  if (entry?.maxTokens !== void 0) maxTokens = entry.maxTokens;
  const listedInput = declaredCoreInput(endpoint?.input);
  if (listedInput !== void 0) {
    input = listedInput;
    inputSource = "endpoint";
  }
  if (endpoint?.contextLength !== void 0 && Number.isFinite(endpoint.contextLength) && endpoint.contextLength > 0) {
    contextWindow = endpoint.contextLength;
  }
  if (input === void 0) {
    const guessed = inferModalitiesFromName(modelId);
    if (guessed !== void 0) {
      input = guessed;
      inputSource = "heuristic";
    }
  }
  const modalityParts = {
    ...input === void 0 ? {} : { input },
    ...inputSource === void 0 ? {} : { inputSource },
    ...contextWindow === void 0 ? {} : { contextWindow },
    ...maxTokens === void 0 ? {} : { maxTokens }
  };
  const endpointPart = endpoint === void 0 ? {} : { endpoint: { reasoning: endpoint.reasoning, source: endpoint.source } };
  if (endpoint?.reasoning === false) {
    return {
      efforts: false,
      matched: false,
      source: "endpoint:" + (endpoint.source ?? "listing"),
      confidence: "high",
      ...endpointPart,
      ...modalityParts
    };
  }
  if (entry !== void 0) {
    const compat2 = withRolePin(compatForRoute(entry, route), route, entry.efforts !== false);
    return {
      efforts: entry.efforts,
      // The vendor default rides along only when the suggested ladder
      // actually carries it (a declaration may deliberately drop a level).
      ...entry.efforts !== false && entry.defaultEffort !== void 0 && entry.efforts[entry.defaultEffort] !== void 0 ? { defaultEffort: entry.defaultEffort } : {},
      ...compat2 === void 0 ? {} : { compat: compat2 },
      matched: true,
      entryId: entry.id,
      source: entry.id,
      // Knowledge base carries the wire values; an agreeing endpoint signal
      // only reinforces it. A DISAGREEING signal (endpoint says no reasoning)
      // was handled above; unknown changes nothing.
      confidence: "high",
      ...endpointPart,
      ...modalityParts
    };
  }
  const protocol = inferProtocol(route);
  const efforts = PROTOCOL_INFERENCE[protocol] ?? GENERIC_FALLBACK;
  const compatBase = normalize(route.api) === COMPAT_CAPABLE_PROTOCOL ? { thinkingFormat: "openai", supportsReasoningEffort: true } : void 0;
  const compatWithBudget = compatBase !== void 0 && isSelfHostedEndpoint(route.baseURL) ? { ...compatBase, thinkingTokenBudgetField: "thinking_token_budget" } : compatBase;
  const compat = withRolePin(compatWithBudget, route, true);
  if (endpoint?.reasoning === true) {
    return {
      efforts: { ...ENDPOINT_CONFIRMED_LADDER },
      ...ENDPOINT_CONFIRMED_LADDER["medium"] !== void 0 ? { defaultEffort: "medium" } : {},
      // compat was already gated to the protocol above; no second gate.
      ...compat === void 0 ? {} : { compat },
      matched: false,
      source: "endpoint:" + (endpoint.source ?? "listing"),
      confidence: "medium",
      ...endpointPart,
      ...modalityParts
    };
  }
  return {
    efforts,
    // Inferred ladders default to medium (the convention codex/OpenAI set for
    // their own ladders) whenever the inferred set carries it.
    ...efforts["medium"] !== void 0 ? { defaultEffort: "medium" } : {},
    ...compat === void 0 ? {} : { compat },
    matched: false,
    source: "protocol:" + protocol,
    confidence: "low",
    ...endpointPart,
    ...modalityParts
  };
}

// src/guard.ts
function resolveGuardEffort(input) {
  if (input.requested !== void 0) return void 0;
  const declared = input.declared;
  if (declared === void 0 || declared === false) return void 0;
  if ("off" in declared) return void 0;
  if (input.profileDefault !== void 0) return void 0;
  const fallback = input.vendorDefault;
  if (fallback === void 0 || !(fallback in declared)) return void 0;
  return fallback;
}

// src/shared.ts
var isRecord = (value) => typeof value === "object" && value !== null && !Array.isArray(value);
function looksLikeCompatRefusal(message) {
  const msg = message.toLowerCase();
  return msg.includes("compat") || msg.includes("thinkingtokenbudget") || msg.includes("vllmpriority") || msg.includes("supportsmaxoutput");
}
function routeFactsOf(providers, route) {
  if (!isRecord(providers)) return {};
  const profile = providers[route];
  if (!isRecord(profile)) return {};
  const api = typeof profile["api"] === "string" ? profile["api"] : void 0;
  const baseURL = typeof profile["baseURL"] === "string" ? profile["baseURL"] : void 0;
  const displayName = typeof profile["displayName"] === "string" ? profile["displayName"] : void 0;
  return { api, baseURL, displayName };
}

// src/headers-core.ts
var MAX_UA_LENGTH = 512;
function emptyIndex() {
  return { routes: [], overrides: [], byOrigin: /* @__PURE__ */ new Map(), conflicts: [], headerConflicts: [] };
}
function originOf(url) {
  if (url === void 0 || url.trim().length === 0) return void 0;
  try {
    return new URL(url).origin;
  } catch {
    return void 0;
  }
}
function isSendableUserAgent(value) {
  if (value.length === 0 || value.length > MAX_UA_LENGTH) return false;
  return !/[\r\n\0]/.test(value);
}
function isSendableHeader(name2, value) {
  if (name2.length === 0) return false;
  try {
    const headers = new Headers();
    headers.set(name2, value);
    return true;
  } catch {
    return false;
  }
}
function headersOf(profile) {
  if (profile === void 0) return void 0;
  const headers = profile["headers"];
  if (!isRecord(headers)) return void 0;
  const pairs = {};
  for (const [name2, value] of Object.entries(headers)) {
    if (typeof value === "string") pairs[name2] = value;
  }
  return Object.keys(pairs).length === 0 ? void 0 : pairs;
}
function sendableHeadersOf(profile) {
  const headers = headersOf(profile);
  if (headers === void 0) return void 0;
  const sendable = {};
  for (const [name2, value] of Object.entries(headers)) {
    if (!isSendableHeader(name2, value)) continue;
    if (name2.toLowerCase() === "user-agent" && !isSendableUserAgent(value)) continue;
    sendable[name2] = value;
  }
  return Object.keys(sendable).length === 0 ? void 0 : sendable;
}
function pathPrefixOf(url) {
  try {
    const pathname = new URL(url).pathname.replace(/\/+$/, "");
    return pathname.length === 0 ? "/" : pathname;
  } catch {
    return "/";
  }
}
function modelIdsOf(profile) {
  const ids = /* @__PURE__ */ new Set();
  const models = profile["models"];
  if (Array.isArray(models)) {
    for (const model of models) {
      if (!isRecord(model) || typeof model["id"] !== "string" || model["id"].length === 0) continue;
      ids.add(model["id"]);
    }
  }
  const overrides = profile["modelOverrides"];
  if (isRecord(overrides)) {
    for (const id of Object.keys(overrides)) if (id.length > 0) ids.add(id);
  }
  return [...ids];
}
function normalizedHeaders(headers) {
  const normalized = /* @__PURE__ */ new Map();
  for (const [name2, value] of Object.entries(headers)) {
    normalized.set(name2.toLowerCase(), { name: name2, value });
  }
  return normalized;
}
function recordHeaderConflicts(index, existing, route, headers) {
  const first = normalizedHeaders(existing.headers);
  const next = normalizedHeaders(headers);
  const names = /* @__PURE__ */ new Set([...first.keys(), ...next.keys()]);
  for (const name2 of names) {
    const oldEntry = first.get(name2);
    const nextEntry = next.get(name2);
    if (oldEntry?.value === nextEntry?.value) continue;
    const reportedName = nextEntry?.name ?? oldEntry?.name ?? name2;
    const reported = index.headerConflicts.find((entry) => entry.origin === existing.origin && entry.header.toLowerCase() === name2);
    if (reported === void 0) {
      index.headerConflicts.push({
        origin: existing.origin,
        header: reportedName,
        routes: [existing.route, route],
        values: [oldEntry?.value ?? "<not configured>", nextEntry?.value ?? "<not configured>"]
      });
    } else if (!reported.routes.includes(route)) {
      reported.routes.push(route);
      reported.values.push(nextEntry?.value ?? "<not configured>");
    }
  }
}
function buildHeaderIndex(providers) {
  const index = emptyIndex();
  const claimedUserAgents = /* @__PURE__ */ new Map();
  for (const [route, profile] of Object.entries(providers)) {
    const baseURL = typeof profile["baseURL"] === "string" ? profile["baseURL"] : void 0;
    const origin = originOf(baseURL);
    if (origin === void 0) continue;
    const sendable = sendableHeadersOf(profile) ?? {};
    const hasHeaders = Object.keys(sendable).length > 0;
    const userAgent = Object.entries(sendable).find(([name2]) => name2.toLowerCase() === "user-agent")?.[1];
    const override = {
      origin,
      pathPrefix: pathPrefixOf(baseURL ?? origin),
      headers: sendable,
      route,
      modelIds: modelIdsOf(profile),
      hasHeaders,
      ...userAgent === void 0 ? {} : { userAgent }
    };
    index.routes.push(override);
    if (!hasHeaders) continue;
    index.overrides.push(override);
    const existing = index.byOrigin.get(origin);
    if (existing === void 0) {
      index.byOrigin.set(origin, override);
    } else {
      recordHeaderConflicts(index, existing, route, sendable);
    }
    if (userAgent === void 0) continue;
    const claimed = claimedUserAgents.get(origin);
    if (claimed === void 0) {
      claimedUserAgents.set(origin, { routes: [route], values: [userAgent] });
      continue;
    }
    claimed.routes.push(route);
    claimed.values.push(userAgent);
    if (claimed.values.every((value) => value === claimed.values[0])) continue;
    const reported = index.conflicts.find((entry) => entry.origin === origin);
    if (reported === void 0) index.conflicts.push({ origin, routes: [...claimed.routes], values: [...claimed.values] });
    else {
      reported.routes = [...claimed.routes];
      reported.values = [...claimed.values];
    }
  }
  return index;
}
function requestPathOf(url) {
  try {
    return new URL(url).pathname;
  } catch {
    return void 0;
  }
}
function pathMatches(requestPath, prefix) {
  if (prefix === "/") return true;
  return requestPath === prefix || requestPath.startsWith(`${prefix}/`);
}
function modelOfJsonBody(body) {
  try {
    const parsed = JSON.parse(body);
    if (!isRecord(parsed)) return void 0;
    const model = parsed["model"];
    return typeof model === "string" && model.length > 0 ? model : void 0;
  } catch {
    return void 0;
  }
}
function pathCandidatesOf(index, url) {
  const origin = originOf(url);
  if (origin === void 0) return [];
  const known = index.routes.length === 0 ? index.overrides : index.routes;
  const byOrigin = known.length === 0 ? (() => {
    const only = index.byOrigin.get(origin);
    return only === void 0 ? [] : [only];
  })() : known.filter((entry) => entry.origin === origin);
  if (byOrigin.length <= 1) return byOrigin;
  const requestPath = requestPathOf(url);
  if (requestPath === void 0) return byOrigin;
  const matched = byOrigin.filter((entry) => pathMatches(requestPath, entry.pathPrefix));
  return matched.length === 0 ? byOrigin : matched;
}
function selectOverrideFrom(candidates, model) {
  if (candidates.length <= 1) return candidates[0];
  if (model !== void 0) {
    const byModel = candidates.filter((entry) => entry.modelIds.includes(model));
    if (byModel.length === 1) return byModel[0];
  }
  return candidates[0];
}
function selectOverride(index, url, model) {
  return selectOverrideFrom(pathCandidatesOf(index, url), model);
}
function requestUrlOf(input) {
  if (typeof input === "string") return input;
  if (typeof URL !== "undefined" && input instanceof URL) return input.href;
  if (typeof Request !== "undefined" && input instanceof Request) return input.url;
  return void 0;
}

// src/headers-fetch.ts
var REGISTRY = /* @__PURE__ */ Symbol.for("dsh-model-think-level.fetch-overrides");
function registryOf() {
  const holder = globalThis;
  return holder[REGISTRY];
}
async function bodyTextOf(input, init) {
  if (typeof init?.body === "string") return init.body;
  if (typeof Request !== "undefined" && input instanceof Request) {
    try {
      return await input.clone().text();
    } catch {
      return void 0;
    }
  }
  return void 0;
}
function seedHeaders(input, init) {
  if (init?.headers !== void 0 && init.headers !== null) return new Headers(init.headers);
  if (typeof Request !== "undefined" && input instanceof Request) return new Headers(input.headers);
  return new Headers();
}
function makeWrapper(base, entries) {
  return async function fetchWithProviderHeaders(input, init) {
    const url = requestUrlOf(input);
    if (url === void 0) return base(input, init);
    let candidates = [];
    for (const entry of entries.values()) {
      candidates = pathCandidatesOf(entry.index(), url);
      if (candidates.length > 0) break;
    }
    if (candidates.length === 0) return base(input, init);
    let override = candidates.length === 1 ? candidates[0] : void 0;
    if (override === void 0) {
      const body = await bodyTextOf(input, init);
      const model = body === void 0 ? void 0 : modelOfJsonBody(body);
      override = selectOverrideFrom(candidates, model);
    }
    if (override === void 0) return base(input, init);
    if (!override.hasHeaders) return base(input, init);
    const headers = seedHeaders(input, init);
    for (const [name2, value] of Object.entries(override.headers)) {
      try {
        headers.set(name2, value);
      } catch {
      }
    }
    const nextInit = { ...init, headers };
    if (typeof Request !== "undefined" && input instanceof Request) {
      return base(new Request(input, { headers }), nextInit);
    }
    return base(input, nextInit);
  };
}
function installHeaderOverlay(source) {
  const holder = globalThis;
  let registry = holder[REGISTRY];
  const token = /* @__PURE__ */ Symbol("bre-header-overlay");
  if (registry === void 0) {
    const base = globalThis.fetch;
    const entries = /* @__PURE__ */ new Map();
    const wrapper = makeWrapper(base, entries);
    registry = { base, wrapper, entries };
    holder[REGISTRY] = registry;
    globalThis.fetch = wrapper;
  }
  registry.entries.set(token, { index: () => source.current });
  const owned = registry;
  return {
    get active() {
      return owned.entries.has(token);
    },
    dispose() {
      owned.entries.delete(token);
      if (owned.entries.size > 0) return;
      if (globalThis.fetch === owned.wrapper) globalThis.fetch = owned.base;
      if (holder[REGISTRY] === owned) delete holder[REGISTRY];
    }
  };
}
function headerOverlayInstalled() {
  const registry = registryOf();
  return registry !== void 0 && globalThis.fetch === registry.wrapper;
}

// src/headers-pi-ai.ts
var PATCH_STATE = /* @__PURE__ */ Symbol.for("dsh-model-think-level.pi-ai-header-transform");
var REGISTER_PATCH_STATE = /* @__PURE__ */ Symbol.for("dsh-model-think-level.pi-ai-header-register");
var CORDIS_ORIGINAL = /* @__PURE__ */ Symbol.for("cordis.original");
function objectOf(value) {
  return typeof value === "object" && value !== null ? value : void 0;
}
function runtimeObjectOf(value) {
  const object = objectOf(value);
  if (object === void 0) return void 0;
  const original = object[CORDIS_ORIGINAL];
  return objectOf(original) ?? object;
}
function noOpHandle() {
  return {
    active: false,
    dispose() {
    }
  };
}
function routeOverrideOf(source, model) {
  try {
    if (!isRecord(model)) return void 0;
    const baseURL = model["baseUrl"];
    if (typeof baseURL !== "string" || baseURL.length === 0) return void 0;
    const modelId = typeof model["id"] === "string" ? model["id"] : void 0;
    return selectOverride(source.current, baseURL, modelId);
  } catch {
    return void 0;
  }
}
function modelsProxyOf(models, source) {
  return new Proxy(models, {
    get(target, property, receiver) {
      if (property !== "streamSimple") return Reflect.get(target, property, receiver);
      const streamSimple = Reflect.get(target, property, target);
      if (typeof streamSimple !== "function") return streamSimple;
      return (...args) => {
        const model = args[0];
        const context = args[1];
        const options = args[2];
        const modelObject = isRecord(model) ? model : void 0;
        if (modelObject === void 0 || typeof modelObject["baseUrl"] !== "string" || !isRecord(options)) {
          return streamSimple.call(target, model, context, options);
        }
        const existing = typeof options["transformHeaders"] === "function" ? options["transformHeaders"] : void 0;
        const transformHeaders = async (headers) => {
          const merged = existing === void 0 ? headers : await existing(headers);
          const override = routeOverrideOf(source, model);
          return override?.hasHeaders ? { ...merged, ...override.headers } : merged;
        };
        return streamSimple.call(target, model, context, {
          ...options,
          transformHeaders
        });
      };
    }
  });
}
function snapshotProxyOf(snapshot, source) {
  const models = snapshot["models"];
  const modelObject = objectOf(models);
  if (modelObject === void 0 || typeof modelObject["streamSimple"] !== "function") return snapshot;
  const proxiedModels = modelsProxyOf(modelObject, source);
  return new Proxy(snapshot, {
    get(target, property, receiver) {
      if (property === "models") return proxiedModels;
      return Reflect.get(target, property, receiver);
    }
  });
}
function installPiAiHeaderTransform(adapter, source) {
  const target = objectOf(adapter);
  if (target === void 0 || typeof target["current"] !== "function") return noOpHandle();
  const current = target["current"];
  const stored = target[PATCH_STATE];
  if (stored !== void 0 && current === stored.wrappedCurrent) {
    stored.source = source;
    stored.users += 1;
    let active2 = true;
    return {
      get active() {
        return active2 && stored.users > 0;
      },
      dispose() {
        if (!active2) return;
        active2 = false;
        stored.users -= 1;
        if (stored.users > 0) return;
        if (target["current"] === stored.wrappedCurrent) target["current"] = stored.originalCurrent;
        if (target[PATCH_STATE] === stored) delete target[PATCH_STATE];
      }
    };
  }
  const originalCurrent = current;
  const wrappedCurrent = function(...args) {
    const snapshot = originalCurrent.apply(this, args);
    const snapshotObject = objectOf(snapshot);
    return snapshotObject === void 0 ? snapshot : snapshotProxyOf(snapshotObject, state.source);
  };
  const state = { originalCurrent, wrappedCurrent, source, users: 1 };
  target["current"] = wrappedCurrent;
  Object.defineProperty(target, PATCH_STATE, { configurable: true, value: state });
  let active = true;
  return {
    get active() {
      return active && state.users > 0;
    },
    dispose() {
      if (!active) return;
      active = false;
      state.users -= 1;
      if (state.users > 0) return;
      if (target["current"] === state.wrappedCurrent) target["current"] = state.originalCurrent;
      if (target[PATCH_STATE] === state) delete target[PATCH_STATE];
    }
  };
}
function describePiAiHeaderState(llm, source) {
  const runtime = runtimeObjectOf(llm);
  const adapters = runtime?.["adapters"];
  const names = [];
  let total = 0;
  let patched = 0;
  if (adapters instanceof Map) {
    for (const registration of adapters.values()) {
      const adapter = objectOf(objectOf(registration)?.["adapter"]);
      if (adapter === void 0 || typeof adapter["current"] !== "function") continue;
      total += 1;
      const state = adapter[PATCH_STATE];
      const isPatched = state !== void 0 && adapter["current"] === state.wrappedCurrent;
      if (isPatched) patched += 1;
      const name2 = typeof adapter["constructor"] === "function" ? adapter["constructor"].name : "unknown";
      names.push(`${name2}${isPatched ? "+" : "-"}`);
    }
  }
  const registerState = runtime?.[REGISTER_PATCH_STATE];
  return {
    runtimeFound: runtime !== void 0,
    registerPatched: registerState !== void 0 && runtime?.["registerAdapter"] === registerState.wrappedRegister,
    adaptersInRuntime: total,
    adaptersPatched: patched,
    adapters: names,
    routes: source.current.routes.length,
    overrides: source.current.overrides.length
  };
}
function installPiAiHeaderTransforms(llm, source) {
  const installed = /* @__PURE__ */ new Map();
  const runtime = runtimeObjectOf(llm);
  let disposed = false;
  const install = (adapter) => {
    if (disposed) return;
    const adapterObject = objectOf(adapter);
    if (adapterObject === void 0 || typeof adapterObject["current"] !== "function") return;
    if (!installed.has(adapterObject)) installed.set(adapterObject, installPiAiHeaderTransform(adapterObject, source));
  };
  const refresh = () => {
    if (disposed) return;
    const adapters = runtime?.["adapters"];
    if (!(adapters instanceof Map)) return;
    const seen = /* @__PURE__ */ new Set();
    for (const registration of adapters.values()) {
      const registrationObject = objectOf(registration);
      const adapterObject = objectOf(registrationObject?.["adapter"]);
      if (adapterObject === void 0 || typeof adapterObject["current"] !== "function") continue;
      seen.add(adapterObject);
      install(adapterObject);
    }
    for (const [adapter, handle] of installed) {
      if (seen.has(adapter)) continue;
      handle.dispose();
      installed.delete(adapter);
    }
  };
  let registerHandle;
  const originalRegister = runtime?.["registerAdapter"];
  if (runtime !== void 0 && typeof originalRegister === "function") {
    const registerState = runtime[REGISTER_PATCH_STATE];
    if (registerState !== void 0 && runtime["registerAdapter"] === registerState.wrappedRegister) {
      registerState.users += 1;
      registerHandle = {
        get active() {
          return !disposed && registerState.users > 0;
        },
        dispose() {
          if (registerState.users <= 0) return;
          registerState.users -= 1;
          if (registerState.users > 0) return;
          if (runtime["registerAdapter"] === registerState.wrappedRegister) runtime["registerAdapter"] = registerState.originalRegister;
          if (runtime[REGISTER_PATCH_STATE] === registerState) delete runtime[REGISTER_PATCH_STATE];
        }
      };
    } else {
      const original = originalRegister;
      const wrappedRegister = function(...args) {
        const adapter = args[1];
        install(adapter);
        try {
          return original.apply(this, args);
        } finally {
          refresh();
        }
      };
      const state = {
        originalRegister: original,
        wrappedRegister,
        users: 1
      };
      runtime["registerAdapter"] = wrappedRegister;
      Object.defineProperty(runtime, REGISTER_PATCH_STATE, { configurable: true, value: state });
      registerHandle = {
        get active() {
          return !disposed && state.users > 0;
        },
        dispose() {
          if (state.users <= 0) return;
          state.users -= 1;
          if (state.users > 0) return;
          if (runtime["registerAdapter"] === state.wrappedRegister) runtime["registerAdapter"] = state.originalRegister;
          if (runtime[REGISTER_PATCH_STATE] === state) delete runtime[REGISTER_PATCH_STATE];
        }
      };
    }
  }
  refresh();
  return {
    refresh,
    dispose() {
      if (disposed) return;
      disposed = true;
      registerHandle?.dispose();
      for (const handle of installed.values()) handle.dispose();
      installed.clear();
    }
  };
}

// src/headers-conflict.ts
import { existsSync, readFileSync as readFileSync2 } from "node:fs";
import { createRequire } from "node:module";
import { dirname as dirname2, join as join2, resolve } from "node:path";
var SIBLING_PACKAGES = [
  "dsh-client-masquerade",
  "dsh-llm-headers",
  "dsh-llm-pi-ai-headers",
  "dsh-custom-provider-settings"
];
var ADAPTER_PATCH_MARKERS = ["configuredUserAgent", "masquerade routes rely on"];
function searchRoots() {
  const roots = /* @__PURE__ */ new Set();
  const entry = process.argv[1];
  if (typeof entry === "string" && entry.length > 0) {
    let dir = dirname2(resolve(entry));
    for (let depth = 0; depth < 8; depth += 1) {
      roots.add(join2(dir, "node_modules"));
      const parent = dirname2(dir);
      if (parent === dir) break;
      dir = parent;
    }
  }
  roots.add(join2(process.cwd(), "node_modules"));
  try {
    const require2 = createRequire(import.meta.url);
    for (const name2 of SIBLING_PACKAGES) {
      try {
        roots.add(join2(dirname2(dirname2(dirname2(require2.resolve(`${name2}/package.json`)))), "node_modules"));
      } catch {
      }
    }
  } catch {
  }
  return [...roots];
}
function findAdapterFile() {
  const relative = join2("@deepseek-ai", "dsh-llm-pi-ai", "lib", "index.js");
  const candidates = [];
  try {
    const require2 = createRequire(import.meta.url);
    candidates.push(require2.resolve("@deepseek-ai/dsh-llm-pi-ai"));
  } catch {
  }
  for (const root of searchRoots()) candidates.push(join2(root, relative));
  for (const candidate of candidates) {
    if (existsSync(candidate)) return candidate;
  }
  return void 0;
}
function adapterSourcePatched(source) {
  return ADAPTER_PATCH_MARKERS.some((marker) => source.includes(marker));
}
function adapterPatchState(path) {
  try {
    return adapterSourcePatched(readFileSync2(path, "utf8")) ? "patched" : "stock";
  } catch {
    return "unknown";
  }
}
function findSiblings() {
  const found = [];
  const seen = /* @__PURE__ */ new Set();
  for (const root of searchRoots()) {
    for (const name2 of SIBLING_PACKAGES) {
      if (seen.has(name2)) continue;
      const dir = join2(root, name2);
      const manifest = join2(dir, "package.json");
      if (!existsSync(manifest)) continue;
      seen.add(name2);
      found.push({ name: name2, path: dir });
    }
  }
  return found;
}
function detectHeaderConflicts() {
  let adapter = "unknown";
  let adapterPath;
  let siblings = [];
  try {
    adapterPath = findAdapterFile();
    if (adapterPath !== void 0) adapter = adapterPatchState(adapterPath);
  } catch {
    adapter = "unknown";
  }
  try {
    siblings = findSiblings();
  } catch {
    siblings = [];
  }
  return {
    adapter,
    ...adapterPath === void 0 ? {} : { adapterPath },
    siblings,
    preferOfficialLayer: adapter === "patched"
  };
}

// src/autofill.ts
function declaresInput(model) {
  const input = model["input"];
  return Array.isArray(input) && input.length > 0;
}
function buildAutofillPatch(providers, routeFilter = () => true, options = {}, revision = 0) {
  const fillEfforts = options.efforts !== false;
  const fillModalities = options.modalities !== false;
  if (!isRecord(providers)) return void 0;
  const patchRoutes = {};
  for (const route of Object.keys(providers)) {
    if (!routeFilter(route)) continue;
    const profile = providers[route];
    const rawModels = isRecord(profile) && Array.isArray(profile["models"]) ? profile["models"] : void 0;
    if (rawModels === void 0 || rawModels.length === 0) continue;
    if (!rawModels.every(isRecord)) continue;
    const models = rawModels;
    const nextModels = [];
    let changed = false;
    for (const model of models) {
      const effortsDeclared = model["reasoningEfforts"] !== void 0 || model[UNSET_MARKER] === true;
      const inputDeclared = declaresInput(model) || model[INPUT_UNSET_MARKER] === true;
      if ((effortsDeclared || !fillEfforts) && (inputDeclared || !fillModalities)) {
        const backfilled = backfillRolePin(model, providers, route);
        if (backfilled !== void 0) {
          changed = true;
          nextModels.push(backfilled);
        } else {
          nextModels.push(model);
        }
        continue;
      }
      const id = typeof model["id"] === "string" ? model["id"] : "";
      if (id.length === 0) {
        nextModels.push(model);
        continue;
      }
      const routeInfo = routeFactsOf(providers, route);
      const name2 = typeof model["name"] === "string" ? model["name"] : void 0;
      const suggestion = suggestEfforts(id, { ...routeInfo, displayName: name2 ?? routeInfo.displayName });
      if (suggestion.efforts === void 0) {
        nextModels.push(model);
        continue;
      }
      const fill = { ...model };
      let touched = false;
      if (!effortsDeclared && fillEfforts) {
        touched = true;
        fill["reasoningEfforts"] = suggestion.efforts;
        fill[AUTOFILL_MARKER] = revision;
        if (suggestion.compat !== void 0) {
          const stored = isRecord(model["compat"]) ? model["compat"] : {};
          fill["compat"] = { ...stored, ...suggestion.compat };
        }
      }
      if (!inputDeclared && fillModalities && suggestion.input !== void 0) {
        touched = true;
        fill["input"] = [...suggestion.input];
      }
      if (!touched) {
        nextModels.push(model);
        continue;
      }
      changed = true;
      nextModels.push(fill);
    }
    if (changed) patchRoutes[route] = { models: nextModels };
  }
  return Object.keys(patchRoutes).length === 0 ? void 0 : { providers: patchRoutes };
}
function stripNewCompatKeysDeep(patch) {
  const providers = isRecord(patch["providers"]) ? patch["providers"] : void 0;
  if (providers === void 0) return void 0;
  let strippedAny = false;
  const nextProviders = {};
  for (const [route, profile] of Object.entries(providers)) {
    if (!isRecord(profile) || !Array.isArray(profile["models"])) {
      nextProviders[route] = profile;
      continue;
    }
    nextProviders[route] = {
      ...profile,
      models: profile["models"].map((model) => {
        if (!isRecord(model) || !isRecord(model["compat"])) return model;
        const compat = { ...model["compat"] };
        for (const key of NEW_COMPAT_KEYS) {
          if (key in compat) {
            delete compat[key];
            strippedAny = true;
          }
        }
        return { ...model, compat };
      })
    };
  }
  if (!strippedAny) return void 0;
  return { providers: nextProviders };
}
function backfillRolePin(model, providers, route) {
  if (!isRecord(model["reasoningEfforts"])) return void 0;
  if (model[UNSET_MARKER] === true) return void 0;
  const compat = model["compat"];
  const base = isRecord(compat) ? { ...compat } : {};
  if (base["supportsDeveloperRole"] !== void 0) return void 0;
  if (!isSelfHostedRelay(routeFactsOf(providers, route))) return void 0;
  return { ...model, compat: { ...base, supportsDeveloperRole: false } };
}

// src/index.ts
var name = PLUGIN_ID;
var inject = ["settings", "llm"];
var PI_NS = PI_AI_NS;
var BOOT_RETRY_DELAYS_MS = [1e3, 2e3, 4e3, 8e3, 16e3, 3e4];
var PROBE_TIMEOUT_MS = 15e3;
var Config = Schema.object({
  autofill: Schema.boolean().default(true),
  modalityAutofill: Schema.boolean().default(true),
  probeTimeoutMs: Schema.natural().min(1).default(PROBE_TIMEOUT_MS),
  bootRetryDelaysMs: Schema.array(Schema.natural().min(1)).default([...BOOT_RETRY_DELAYS_MS]),
  defaultGuard: Schema.boolean().default(true),
  uaOverride: Schema.boolean().default(true)
});
function providerProfileOf(section, route) {
  if (!isRecord(section)) return void 0;
  const providers = section["providers"];
  if (!isRecord(providers)) return void 0;
  const profile = providers[route];
  return isRecord(profile) ? profile : void 0;
}
function enabledRefOf(profile) {
  const ref = profile?.["apiKeyEnv"];
  return typeof ref === "string" && ref.length > 0 ? ref : void 0;
}
function isRefusal(answer) {
  return isRecord(answer) && answer["ok"] === false;
}
function refusalMessage(answer) {
  if (!isRecord(answer)) return void 0;
  const error = answer["error"];
  if (typeof error === "string") return error;
  if (isRecord(error) && typeof error["message"] === "string") return error["message"];
  return typeof answer["message"] === "string" ? answer["message"] : void 0;
}
function describeRecords(answer) {
  const candidate = isRecord(answer) && answer["value"] !== void 0 ? answer["value"] : answer;
  return isRecord(candidate) ? candidate : void 0;
}
async function storeCredential(credentials, ref, value) {
  const set = credentials?.set;
  if (credentials === void 0 || typeof set !== "function") {
    return "this deployment cannot write the credential store";
  }
  try {
    const answer = await set.call(credentials, ref, value);
    if (!isRefusal(answer)) return void 0;
    return refusalMessage(answer) ?? `the credential store refused ${ref}`;
  } catch (error) {
    return error instanceof Error ? error.message : String(error);
  }
}
async function forgetCredential(credentials, ref) {
  const unset = credentials?.unset;
  if (credentials === void 0 || typeof unset !== "function") {
    return "this deployment cannot write the credential store";
  }
  try {
    const answer = await unset.call(credentials, ref);
    if (!isRefusal(answer)) return void 0;
    return refusalMessage(answer) ?? `the credential store refused to forget ${ref}`;
  } catch (error) {
    return error instanceof Error ? error.message : String(error);
  }
}
async function credentialFacts(credentials, refs) {
  const out = {};
  if (credentials === void 0 || refs.length === 0) return out;
  const describe = credentials.describe;
  if (typeof describe === "function") {
    try {
      const records = describeRecords(await describe.call(credentials, [...refs]));
      for (const ref of refs) {
        const info = records?.[ref];
        if (isRecord(info) && typeof info["configured"] === "boolean") {
          out[ref] = { configured: info["configured"] };
        }
      }
    } catch {
    }
  }
  const resolve2 = credentials.resolve;
  for (const ref of refs) {
    try {
      const hit = await resolve2.call(credentials, ref);
      const value = hit !== void 0 && typeof hit.value === "string" ? hit.value : void 0;
      const configured = out[ref]?.configured ?? (value !== void 0 && value.length > 0);
      const masked = value === void 0 ? void 0 : maskKeyValue(value);
      out[ref] = masked === void 0 || masked.length === 0 ? { configured } : { configured, masked };
    } catch {
    }
  }
  return out;
}
async function credentialConfigured(credentials, refs) {
  const facts = await credentialFacts(credentials, refs);
  const out = {};
  for (const ref of refs) {
    const configured = facts[ref]?.configured;
    if (configured !== void 0) out[ref] = configured;
  }
  return out;
}
function isConflictError(error) {
  return isRecord(error) && error["code"] === "SETTINGS_CONFLICT";
}
async function readJsonBody(req, limit = 8192) {
  const decoder = new TextDecoder();
  let text = "";
  try {
    for await (const chunk of req) {
      text += typeof chunk === "string" ? chunk : decoder.decode(chunk, { stream: true });
      if (text.length > limit) return void 0;
    }
  } catch {
    return void 0;
  }
  if (text.length === 0) return void 0;
  try {
    return JSON.parse(text);
  } catch {
    return void 0;
  }
}
function isLoopbackHostname(hostname) {
  return hostname === "localhost" || hostname === "127.0.0.1" || hostname === "::1";
}
function parseAuthority(authority) {
  try {
    return new URL(`http://${authority}`);
  } catch {
    return void 0;
  }
}
function isIpLiteralHostname(hostname) {
  return /^\d{1,3}(\.\d{1,3}){3}$/.test(hostname) || hostname.includes(":");
}
function isTrustedRequest(req) {
  const host = req.headers.host;
  if (typeof host !== "string" || host.length === 0) return false;
  const hostUrl = parseAuthority(host);
  if (hostUrl === void 0) return false;
  const secFetchSite = req.headers["sec-fetch-site"];
  if (secFetchSite === "cross-site") return false;
  const origin = req.headers.origin;
  if (typeof origin === "string") {
    if (origin === "null") return false;
    try {
      if (new URL(origin).host !== hostUrl.host) return false;
    } catch {
      return false;
    }
  }
  const hostname = hostUrl.hostname.toLowerCase();
  return isLoopbackHostname(hostname) || isIpLiteralHostname(hostname);
}
function sendJson(res, status, body) {
  res.statusCode = status;
  res.setHeader("content-type", "application/json; charset=utf-8");
  res.end(JSON.stringify(body));
}
function displayUrl(raw) {
  try {
    const url = new URL(raw);
    url.username = "";
    url.password = "";
    return url.toString();
  } catch {
    return raw;
  }
}
function probeListingUrl(baseURL, api) {
  const base = baseURL.replace(/\/+$/, "");
  if (api !== "anthropic-messages") return `${base}/models`;
  const root = base.endsWith("/v1") ? base.slice(0, -3) : base;
  return `${root}/v1/models?limit=${String(ANTHROPIC_MODEL_LIMIT)}`;
}
var LISTABLE_PROTOCOLS = /* @__PURE__ */ new Set([
  "anthropic-messages",
  "openai-completions",
  "openai-responses"
]);
var ANTHROPIC_VERSION = "2023-06-01";
var ANTHROPIC_MODEL_LIMIT = 1e3;
function composeProbeHeaders(profileHeaders, apiKey, api) {
  const headers = new Headers();
  if (isRecord(profileHeaders)) {
    for (const [name2, value] of Object.entries(profileHeaders)) {
      if (typeof value !== "string") continue;
      try {
        headers.set(name2, value);
      } catch {
      }
    }
  }
  headers.set("accept", "application/json");
  if (api === "anthropic-messages") {
    headers.set("anthropic-version", ANTHROPIC_VERSION);
    if (apiKey !== void 0) headers.set("x-api-key", apiKey);
  } else if (apiKey !== void 0) {
    headers.set("authorization", `Bearer ${apiKey}`);
  }
  return Object.fromEntries(headers.entries());
}
async function readBounded(response, url) {
  const declared = Number(response.headers.get("content-length") ?? Number.NaN);
  if (Number.isFinite(declared) && declared > MAX_RESPONSE_BYTES) {
    await response.body?.cancel();
    throw new Error(`${displayUrl(url)} overshoots the ${MAX_RESPONSE_BYTES}-byte listing ceiling`);
  }
  if (response.body === null) return "";
  const reader = response.body.getReader();
  const chunks = [];
  let total = 0;
  try {
    for (; ; ) {
      const { done, value } = await reader.read();
      if (done) break;
      total += value.byteLength;
      if (total > MAX_RESPONSE_BYTES) throw new Error(`${displayUrl(url)} overshoots the ${MAX_RESPONSE_BYTES}-byte listing ceiling`);
      chunks.push(value);
    }
  } finally {
    await reader.cancel().catch(() => {
    });
  }
  const body = new Uint8Array(total);
  let offset = 0;
  for (const chunk of chunks) {
    body.set(chunk, offset);
    offset += chunk.byteLength;
  }
  return new TextDecoder().decode(body);
}
var MAX_RESPONSE_BYTES = 4 * 1024 * 1024;
function listingEntries(body) {
  const listing = isRecord(body) ? body : {};
  const data = listing["data"];
  if (Array.isArray(data)) return data.filter(isRecord);
  const models = listing["models"];
  if (isRecord(models)) {
    return Object.entries(models).filter(([, raw]) => isRecord(raw)).map(([key, raw]) => {
      const entry = raw;
      const ownId = typeof entry["id"] === "string" && entry["id"].length > 0 ? entry["id"] : "";
      return { ...entry, id: key.length > 0 ? key : ownId };
    }).filter((entry) => typeof entry["id"] === "string" && entry["id"].length > 0);
  }
  return void 0;
}
function guardCallConfig(cfg, section) {
  try {
    if (typeof cfg["reasoningEffort"] !== "undefined") return cfg;
    const provider = cfg["provider"];
    const modelId = cfg["model"];
    if (typeof provider !== "string" || typeof modelId !== "string") return cfg;
    if (!isRecord(section)) return cfg;
    const providers = section["providers"];
    if (!isRecord(providers)) return cfg;
    const profile = providers[provider];
    if (!isRecord(profile)) return cfg;
    const rawModels = profile["models"];
    if (!Array.isArray(rawModels)) return cfg;
    const row = rawModels.find((candidate) => isRecord(candidate) && candidate["id"] === modelId);
    if (row === void 0 || !isRecord(row["reasoningEfforts"])) return cfg;
    const profileDefault = typeof profile["reasoning"] === "string" ? profile["reasoning"] : void 0;
    const facts = routeFactsOf({ providers: { [provider]: profile } }, provider);
    const suggestion = suggestEfforts(modelId, facts);
    const level = resolveGuardEffort({
      declared: row["reasoningEfforts"],
      vendorDefault: suggestion.defaultEffort,
      profileDefault,
      requested: void 0
    });
    return level === void 0 ? cfg : { ...cfg, reasoningEffort: level };
  } catch {
    return cfg;
  }
}
function apply(ctx, config = {}) {
  const resolved = {
    autofill: config.autofill !== false,
    modalityAutofill: config.modalityAutofill !== false,
    probeTimeoutMs: config.probeTimeoutMs ?? PROBE_TIMEOUT_MS,
    bootRetryDelaysMs: config.bootRetryDelaysMs ?? [...BOOT_RETRY_DELAYS_MS],
    defaultGuard: config.defaultGuard !== false,
    uaOverride: config.uaOverride !== false
  };
  const settings = ctx.settings;
  let piSectionCache;
  let piSectionCached = false;
  const piSection = () => {
    if (piSectionCached) return piSectionCache;
    let value;
    try {
      value = settings.describe().find((entry) => entry.ns === PI_NS)?.value;
    } catch {
      return void 0;
    }
    if (value === void 0) return void 0;
    piSectionCache = value;
    piSectionCached = true;
    return value;
  };
  ctx.on("settings/document-updated", (ns) => {
    if (ns === PI_NS) piSectionCached = false;
  });
  if (resolved.autofill) {
    const autofillOnce = async () => {
      const descriptor = settings.describe().find((entry) => entry.ns === PI_NS);
      if (!isRecord(descriptor?.value)) return false;
      const user = descriptor?.user;
      const userProviders = isRecord(user) && isRecord(user["providers"]) ? user["providers"] : void 0;
      if (userProviders === void 0) return true;
      const fullPatch = buildAutofillPatch(userProviders, () => true, { modalities: resolved.modalityAutofill }, descriptor?.revision ?? 0);
      if (fullPatch === void 0) return true;
      try {
        await settings.update(PI_NS, fullPatch, descriptor?.revision);
      } catch (error) {
        const msg = String(error instanceof Error ? error.message : error);
        if (!looksLikeCompatRefusal(msg)) throw error;
        const stripped = stripNewCompatKeysDeep(fullPatch);
        if (stripped === void 0) throw error;
        await settings.update(PI_NS, stripped, settings.describe().find((entry) => entry.ns === PI_NS)?.revision);
      }
      return true;
    };
    const logFailure = (error) => {
      console.error(`[dsh-model-think-level] autofill failed: ${error instanceof Error ? error.message : String(error)}`);
    };
    const timers = /* @__PURE__ */ new Set();
    ctx.effect(() => () => {
      for (const timer of timers) clearTimeout(timer);
      timers.clear();
    }, "dsh-model-think-level: boot-fill retries");
    const bootFill = (attempt) => {
      void autofillOnce().then((ready) => {
        if (ready || attempt >= resolved.bootRetryDelaysMs.length) return;
        const timer = setTimeout(() => {
          timers.delete(timer);
          bootFill(attempt + 1);
        }, resolved.bootRetryDelaysMs[attempt]);
        timers.add(timer);
      }, logFailure);
    };
    bootFill(0);
  }
  if (resolved.defaultGuard) {
    ctx.inject(["llm"], (llmCtx) => {
      const llm = llmCtx.llm;
      if (llm === void 0 || typeof llm.prepareCall !== "function" || typeof llm.stream !== "function") return;
      const origPrepare = llm.prepareCall;
      const origStream = llm.stream;
      llm.prepareCall = (callConfig, signal) => origPrepare.call(llm, guardCallConfig(callConfig, piSection()), signal);
      llm.stream = (options) => origStream.call(llm, guardCallConfig(options, piSection()));
      ctx.effect(() => () => {
        llm.prepareCall = origPrepare;
        llm.stream = origStream;
      }, "dsh-model-think-level: default-guard");
    });
  }
  const overlaySource = { current: emptyIndex() };
  const headerRetryTimers = /* @__PURE__ */ new Set();
  let headerRetryAttempt = 0;
  const stopHeaderRetries = () => {
    for (const timer of headerRetryTimers) clearTimeout(timer);
    headerRetryTimers.clear();
    headerRetryAttempt = 0;
  };
  const scheduleHeaderRefresh = (refresh) => {
    if (headerRetryTimers.size > 0 || headerRetryAttempt >= resolved.bootRetryDelaysMs.length) return;
    const delay = resolved.bootRetryDelaysMs[headerRetryAttempt];
    headerRetryAttempt += 1;
    const timer = setTimeout(() => {
      headerRetryTimers.delete(timer);
      refresh();
    }, delay);
    headerRetryTimers.add(timer);
  };
  const refreshHeaders = () => {
    if (!resolved.uaOverride) {
      overlaySource.current = emptyIndex();
      stopHeaderRetries();
      return;
    }
    const section = piSection();
    if (section === void 0) {
      overlaySource.current = emptyIndex();
      scheduleHeaderRefresh(refreshHeaders);
      return;
    }
    stopHeaderRetries();
    const providers = isRecord(section) && isRecord(section["providers"]) ? section["providers"] : {};
    overlaySource.current = buildHeaderIndex(providers);
  };
  refreshHeaders();
  ctx.effect(() => () => stopHeaderRetries(), "dsh-model-think-level: header retries");
  ctx.on("settings/document-updated", (ns) => {
    if (ns === PI_NS) refreshHeaders();
  });
  const overlay = installHeaderOverlay(overlaySource);
  ctx.effect(() => () => {
    overlay.dispose();
  }, "dsh-model-think-level: fetch header overlay");
  let headerBridgeState = () => ({ stage: "not-installed" });
  const installPiAiBridge = (llm) => {
    const transforms = installPiAiHeaderTransforms(llm, overlaySource);
    transforms.refresh();
    headerBridgeState = () => describePiAiHeaderState(llm, overlaySource);
    ctx.on("llm/adapters-updated", () => transforms.refresh());
    ctx.effect(() => () => transforms.dispose(), "dsh-model-think-level: pi-ai request headers");
  };
  const availableLlm = ctx.llm;
  if (availableLlm === void 0) {
    ctx.inject(["llm"], (llmCtx) => {
      const llm = llmCtx.llm;
      if (llm !== void 0) installPiAiBridge(llm);
    });
  } else {
    installPiAiBridge(availableLlm);
  }
  const headerConflicts = detectHeaderConflicts();
  ctx.inject(["webServer"], (webServerCtx) => {
    ctx.effect(
      () => webServerCtx.webServer.register({
        kind: "exact",
        path: PROBE_PATH,
        handler: async (req, res) => {
          if (!isTrustedRequest(req)) {
            sendJson(res, 403, { ok: false, error: "forbidden" });
            return;
          }
          if (req.method !== "GET") {
            sendJson(res, 405, { ok: false, error: "method not allowed" });
            return;
          }
          const url = new URL(req.url ?? "/", "http://x");
          if (url.searchParams.get("diag") === "1") {
            sendJson(res, 200, {
              ok: true,
              bridge: headerBridgeState(),
              overlay: {
                routes: overlaySource.current.routes.length,
                overrides: overlaySource.current.overrides.length
              }
            });
            return;
          }
          const route = url.searchParams.get("route") ?? "";
          const section = piSection();
          const profile = isRecord(section) && isRecord(section["providers"]) ? section["providers"][route] : void 0;
          if (!isRecord(profile)) {
            sendJson(res, 400, { ok: false, error: `no llm-pi-ai provider route "${route}"` });
            return;
          }
          const baseURL = typeof profile["baseURL"] === "string" ? profile["baseURL"] : "";
          if (baseURL.length === 0) {
            sendJson(res, 400, { ok: false, error: `provider route "${route}" has no baseURL` });
            return;
          }
          const api = typeof profile["api"] === "string" ? profile["api"] : "";
          if (api.length === 0) {
            sendJson(res, 400, {
              ok: false,
              error: `provider route "${route}" names no API protocol to interrogate`
            });
            return;
          }
          if (!LISTABLE_PROTOCOLS.has(api)) {
            sendJson(res, 400, {
              ok: false,
              error: `protocol "${api}" cannot be interrogated; enter this provider's models by hand`
            });
            return;
          }
          const apiKeyEnv = typeof profile["apiKeyEnv"] === "string" ? profile["apiKeyEnv"] : void 0;
          const listingURL = probeListingUrl(baseURL, api);
          let apiKey;
          if (apiKeyEnv !== void 0) {
            try {
              const credentials = ctx.get("credentials");
              const hit = credentials === void 0 ? void 0 : await credentials.resolve(apiKeyEnv);
              apiKey = hit !== void 0 && typeof hit.value === "string" && hit.value.length > 0 ? hit.value : void 0;
            } catch {
            }
          }
          try {
            const upstream = await fetch(listingURL, {
              method: "GET",
              // Header composition mirrors the harness's own model discovery:
              // the profile's configured request headers ride
              // along, so a deployment that authenticates through a custom
              // header probes here exactly as it lists officially — and an
              // Anthropic endpoint answers through x-api-key + a fixed
              // anthropic-version instead of a Bearer.
              headers: composeProbeHeaders(profile["headers"], apiKey, api),
              // A probe carries the user's stored credential, so it must
              // reach exactly the authority the profile names: Fetch's
              // default would FOLLOW a cross-origin redirect, and the
              // headers composed here (`x-api-key`, a profile's own auth
              // header) are not stripped on that hop the way `authorization`
              // is. Official discovery keeps the default; this route is
              // stricter on purpose, and the cost is bounded — a gateway
              // that lists only behind a redirect yields no endpoint
              // evidence, so Auto-adapt falls back to the knowledge base /
              // protocol inference, the path every unanswerable endpoint
              // takes.
              redirect: "error",
              signal: AbortSignal.timeout(resolved.probeTimeoutMs)
            });
            if (!upstream.ok) {
              const hint = upstream.status === 401 || upstream.status === 403 ? "; check the API key" : "";
              sendJson(res, 502, { ok: false, error: `${displayUrl(listingURL)} answered ${upstream.status}${hint}` });
              return;
            }
            const text = await readBounded(upstream, listingURL);
            let body;
            try {
              body = JSON.parse(text);
            } catch {
              sendJson(res, 502, { ok: false, error: `${displayUrl(listingURL)} answered with a malformed JSON body` });
              return;
            }
            const entries = listingEntries(body);
            if (entries === void 0) {
              sendJson(res, 502, {
                ok: false,
                error: `${displayUrl(listingURL)} model listing has neither a "data" array nor a "models" object`
              });
              return;
            }
            sendJson(res, 200, { ok: true, url: displayUrl(listingURL), data: entries });
          } catch (error) {
            sendJson(res, 502, {
              ok: false,
              error: `could not reach ${displayUrl(listingURL)}: ${error instanceof Error ? error.message : String(error)}`
            });
          }
        }
      }),
      "dsh-model-think-level: raw-models probe route"
    );
    ctx.effect(
      () => webServerCtx.webServer.register({
        kind: "exact",
        path: DIAG_PATH,
        handler: (req, res) => {
          if (!isTrustedRequest(req)) {
            sendJson(res, 403, { ok: false, error: "forbidden" });
            return;
          }
          sendJson(res, 200, {
            ok: true,
            uaOverride: resolved.uaOverride,
            bridge: headerBridgeState(),
            overlay: {
              routes: overlaySource.current.routes.length,
              overrides: overlaySource.current.overrides.length
            }
          });
        }
      }),
      "dsh-model-think-level: header diagnostics route"
    );
    ctx.effect(
      () => webServerCtx.webServer.register({
        kind: "exact",
        path: PROVIDER_KEY_PATH,
        handler: async (req, res) => {
          res.setHeader("cache-control", "no-store");
          if (!isTrustedRequest(req)) {
            sendJson(res, 403, { ok: false, error: "forbidden" });
            return;
          }
          if (req.method !== "GET") {
            sendJson(res, 405, { ok: false, error: "method not allowed" });
            return;
          }
          const url = new URL(req.url ?? "/", "http://x");
          const route = url.searchParams.get("route") ?? "";
          const section = piSection();
          const profile = isRecord(section) && isRecord(section["providers"]) ? section["providers"][route] : void 0;
          if (!isRecord(profile)) {
            sendJson(res, 400, { ok: false, error: `no llm-pi-ai provider route "${route}"` });
            return;
          }
          const apiKeyEnv = typeof profile["apiKeyEnv"] === "string" ? profile["apiKeyEnv"] : void 0;
          const named = url.searchParams.get("ref") ?? "";
          const ref = named.length > 0 ? named === apiKeyEnv || hasKeyEntry(readKeyIndex(keyIndexFilePath()), route, named) ? named : void 0 : apiKeyEnv;
          if (ref === void 0) {
            sendJson(res, 404, {
              ok: false,
              error: named.length > 0 ? `provider route "${route}" lists no key "${named}"` : `provider route "${route}" stores no credential reference`
            });
            return;
          }
          let value;
          try {
            const credentials = ctx.get("credentials");
            const hit = credentials === void 0 ? void 0 : await credentials.resolve(ref);
            value = hit !== void 0 && typeof hit.value === "string" && hit.value.length > 0 ? hit.value : void 0;
          } catch {
            value = void 0;
          }
          if (value === void 0) {
            sendJson(res, 404, { ok: false, error: `no credential is configured for ${ref}` });
            return;
          }
          sendJson(res, 200, { ok: true, key: value });
        }
      }),
      "dsh-model-think-level: provider-key route"
    );
    ctx.effect(
      () => webServerCtx.webServer.register({
        kind: "exact",
        path: KEY_INDEX_PATH,
        handler: async (req, res) => {
          res.setHeader("cache-control", "no-store");
          if (!isTrustedRequest(req)) {
            sendJson(res, 403, { ok: false, error: "forbidden" });
            return;
          }
          if (req.method !== "GET" && req.method !== "POST") {
            sendJson(res, 405, { ok: false, error: "method not allowed" });
            return;
          }
          const url = new URL(req.url ?? "/", "http://x");
          const route = url.searchParams.get("route") ?? "";
          const entryOf = () => {
            try {
              const found = settings.describe().find((candidate) => candidate.ns === PI_NS);
              return found === void 0 ? void 0 : { value: found.value, revision: found.revision };
            } catch {
              return void 0;
            }
          };
          if (route.length === 0 || providerProfileOf(entryOf()?.value, route) === void 0) {
            sendJson(res, 400, { ok: false, error: `no llm-pi-ai provider route "${route}"` });
            return;
          }
          const credentials = ctx.get("credentials");
          const indexFile = keyIndexFilePath();
          const enabledNow = () => enabledRefOf(providerProfileOf(entryOf()?.value, route));
          const setEnabledKey = async (ref2) => {
            for (let attempt = 0; attempt < 2; attempt += 1) {
              const entry = entryOf();
              if (entry === void 0) return "the llm-pi-ai settings entry is unavailable";
              try {
                await settings.mutate(
                  PI_NS,
                  ref2 === void 0 ? [{ op: "unset", path: ["providers", route, "apiKeyEnv"] }] : [{ op: "set", path: ["providers", route, "apiKeyEnv"], value: ref2 }],
                  entry.revision
                );
                return void 0;
              } catch (error) {
                if (attempt === 0 && isConflictError(error)) continue;
                return error instanceof Error ? error.message : String(error);
              }
            }
            return "the settings document kept changing; try again";
          };
          const payload = async () => {
            const enabledRef = enabledNow();
            const listed = keyEntriesOf(readKeyIndex(indexFile), route);
            const refs = listed.map((entry) => entry.ref);
            if (enabledRef !== void 0 && !refs.includes(enabledRef)) refs.push(enabledRef);
            const facts = await credentialFacts(credentials, refs);
            const entries = refs.map((ref2) => {
              const fact = facts[ref2];
              const view = {
                ref: ref2,
                enabled: ref2 === enabledRef,
                configured: fact?.configured ?? null
              };
              if (fact?.masked !== void 0) view.masked = fact.masked;
              const stored = listed.find((candidate) => candidate.ref === ref2);
              if (stored?.alias !== void 0) view.alias = stored.alias;
              return view;
            });
            return { ok: true, route, enabledRef: enabledRef ?? null, entries };
          };
          if (req.method === "GET") {
            sendJson(res, 200, await payload());
            return;
          }
          const body = await readJsonBody(req);
          const op = isRecord(body) && typeof body["op"] === "string" ? body["op"] : "";
          const ref = isRecord(body) && typeof body["ref"] === "string" ? body["ref"] : void 0;
          const alias = isRecord(body) ? normalizeKeyAlias(body["alias"]) : void 0;
          const value = isRecord(body) && typeof body["value"] === "string" ? body["value"] : void 0;
          const refuse = (error) => sendJson(res, 400, { ok: false, error });
          try {
            if (op === "add") {
              if (!isLegalKeyValue(value)) {
                refuse("a key must be printable ASCII without spaces");
                return;
              }
              const taken = keyEntriesOf(readKeyIndex(indexFile), route).map((candidate) => candidate.ref);
              const active = enabledNow();
              if (active !== void 0 && !taken.includes(active)) taken.push(active);
              const created = nextKeyRef(route, taken);
              const refused = await storeCredential(credentials, created, value);
              if (refused !== void 0) {
                refuse(refused);
                return;
              }
              updateKeyIndex((document) => withKeyEntry(document, route, created, alias), indexFile);
              if (enabledNow() === void 0) {
                const failed = await setEnabledKey(created);
                if (failed !== void 0) {
                  refuse(failed);
                  return;
                }
              }
            } else if (op === "enable") {
              const listed = readKeyIndex(indexFile);
              if (ref === void 0 || !hasKeyEntry(listed, route, ref)) {
                refuse("that key is not listed for this provider");
                return;
              }
              const previous = enabledNow();
              if (previous !== void 0 && previous !== ref && !hasKeyEntry(listed, route, previous)) {
                const leaving = previous;
                updateKeyIndex(
                  (document) => hasKeyEntry(document, route, leaving) ? document : withKeyEntry(document, route, leaving, void 0),
                  indexFile
                );
              }
              const failed = await setEnabledKey(ref);
              if (failed !== void 0) {
                refuse(failed);
                return;
              }
            } else if (op === "rename") {
              const known = ref !== void 0 && (hasKeyEntry(readKeyIndex(indexFile), route, ref) || ref === enabledNow());
              if (ref === void 0 || !known) {
                refuse("that key is not listed for this provider");
                return;
              }
              const target = ref;
              updateKeyIndex(
                (document) => hasKeyEntry(document, route, target) ? withKeyAlias(document, route, target, alias) : withKeyEntry(document, route, target, alias),
                indexFile
              );
            } else if (op === "value") {
              const known = ref !== void 0 && (hasKeyEntry(readKeyIndex(indexFile), route, ref) || ref === enabledNow());
              if (ref === void 0 || !known) {
                refuse("that key is not listed for this provider");
                return;
              }
              if (!isLegalKeyValue(value)) {
                refuse("a key must be printable ASCII without spaces");
                return;
              }
              const refused = await storeCredential(credentials, ref, value);
              if (refused !== void 0) {
                refuse(refused);
                return;
              }
            } else if (op === "remove") {
              const document = readKeyIndex(indexFile);
              if (ref === void 0 || !hasKeyEntry(document, route, ref) && ref !== enabledNow()) {
                refuse("that key is not listed for this provider");
                return;
              }
              if (ref === enabledNow()) {
                const remaining = keyEntriesOf(document, route).map((candidate) => candidate.ref).filter((candidate) => candidate !== ref);
                const failed = await setEnabledKey(remaining[0]);
                if (failed !== void 0) {
                  refuse(failed);
                  return;
                }
              }
              const configured = (await credentialConfigured(credentials, [ref]))[ref];
              if (configured !== false) {
                const refused = await forgetCredential(credentials, ref);
                if (refused !== void 0) {
                  refuse(refused);
                  return;
                }
              }
              updateKeyIndex((document2) => withoutKeyEntry(document2, route, ref), indexFile);
            } else {
              refuse(`unknown key operation "${op}"`);
              return;
            }
          } catch (error) {
            sendJson(res, 500, { ok: false, error: error instanceof Error ? error.message : String(error) });
            return;
          }
          sendJson(res, 200, await payload());
        }
      }),
      "dsh-model-think-level: key index route"
    );
    ctx.effect(
      () => webServerCtx.webServer.register({
        kind: "exact",
        path: AUTOFILL_CONFIG_PATH,
        handler: async (req, res) => {
          if (!isTrustedRequest(req)) {
            sendJson(res, 403, { ok: false, error: "forbidden" });
            return;
          }
          if (req.method !== "GET") {
            sendJson(res, 405, { ok: false, error: "method not allowed" });
            return;
          }
          sendJson(res, 200, {
            ok: true,
            data: { autofill: resolved.autofill, modalityAutofill: resolved.modalityAutofill }
          });
        }
      }),
      "dsh-model-think-level: autofill config route"
    );
    ctx.effect(
      () => webServerCtx.webServer.register({
        kind: "exact",
        path: HEADERS_CONFIG_PATH,
        handler: async (req, res) => {
          if (!isTrustedRequest(req)) {
            sendJson(res, 403, { ok: false, error: "forbidden" });
            return;
          }
          if (req.method !== "GET") {
            sendJson(res, 405, { ok: false, error: "method not allowed" });
            return;
          }
          const index = overlaySource.current;
          sendJson(res, 200, {
            ok: true,
            data: {
              /** Whether the fetch-layer takeover is enabled in this deployment. */
              enabled: resolved.uaOverride,
              /** Whether this plugin's wrapper currently owns the global fetch. */
              installed: headerOverlayInstalled(),
              /** Routes whose configured request headers are sent, by origin. */
              overrides: index.overrides.map((entry) => ({
                origin: entry.origin,
                route: entry.route,
                headers: entry.headers,
                ...entry.userAgent === void 0 ? {} : { userAgent: entry.userAgent }
              })),
              /** Same-origin routes with different User-Agent values. */
              conflicts: index.conflicts,
              /** Same-origin differences for any configured request header. */
              headerConflicts: index.headerConflicts,
              /** What was found of the plugins that rewrite the same surface. */
              environment: headerConflicts
            }
          });
        }
      }),
      "dsh-model-think-level: headers config route"
    );
  });
}
export {
  Config,
  apply,
  buildAutofillPatch,
  composeProbeHeaders,
  inject,
  name
};
//# sourceMappingURL=index.js.map
