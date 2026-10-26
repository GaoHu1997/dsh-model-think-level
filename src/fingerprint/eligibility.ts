// 指纹检测的「资格」判定：哪些模型允许进这一页。
//
// 指纹库只有两个家族（GPT / Claude）共 18 个候选，别的模型根本无从判定。
// 所以资格判断是**页面级的存在判断**：不在名单里的模型连入口都不出现，
// 而不是显示一行「不支持」。理由见 docs/fingerprint-design.md §4.3。

const ELIGIBLE = /^(gpt-|chatgpt-|o[134](-|$)|claude-)/;

/** 取模型 id 里最后一个 `/` 之后的部分，兼容 `anthropic/claude-…` 这类带前缀的写法。 */
export function bareModelId(modelId: string): string {
  const trimmed = String(modelId ?? '').trim();
  const slash = trimmed.lastIndexOf('/');
  return slash === -1 ? trimmed : trimmed.slice(slash + 1);
}

/** 该模型是否能被当前指纹库判定。 */
export function isEligibleModel(modelId: string): boolean {
  const bare = bareModelId(modelId).toLowerCase();
  return bare.length > 0 && ELIGIBLE.test(bare);
}

/** 从一串模型 id 里挑出可检测的那几个，保持原顺序。 */
export function eligibleModels<T extends string>(modelIds: readonly T[]): T[] {
  return modelIds.filter((id) => isEligibleModel(id));
}

/** 面向用户的家族名，用于文案（「GPT 系列」/「Claude 系列」）。 */
export function familyLabelOf(modelId: string): string {
  const bare = bareModelId(modelId).toLowerCase();
  if (bare.startsWith('claude-')) return 'Claude';
  return 'GPT';
}
