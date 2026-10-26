// ModelTrace 数字指纹：三道题的生成。
//
// 出处：https://github.com/xqy2006/ModelTrace  (MIT, Copyright (c) 2026 xqy2006)
// 对应文件：fingerprint.py:generate_challenges
// 移植原则：文案池逐字照抄，不改写；只把 random.SystemRandom / secrets.token_hex
// 换成 Web Crypto（Node 22 与浏览器都有 globalThis.crypto）。
//
// 题干里的两条硬约束（禁止工具 / 禁止规律化模式）是上游明确要求「照抄，别改写」的，
// 改一个字都会让指纹分布偏离银行。

import { randomInt, randomToken } from './random.js';

export interface Challenge {
  id: string;
  expected_count: number;
  prompt: string;
}

const LENGTH_MIN = 292;
const LENGTH_MAX_EXCLUSIVE = 333;

const OPENINGS = [
  '这是一次独立的数值选择记录',
  '请完成下面的无语义整数选择任务',
  '执行一次第一反应取值记录',
  '生成一组不承载语义的整数选择',
  '进行一轮快速逐项取值',
];

const ACTIONS = [
  '为各个位置分别凭第一反应选择',
  '逐项选择',
  '每次只决定当前一项，共给出',
  '分别凭第一反应给出',
  '逐个直接选择',
];

const ENDINGS = [
  '允许某个数字再次出现；每项写出后不要回头排序、去重或替换。',
  '偶然重复是有效的；不要重新排列或修正已经写出的项目。',
  '相同值可以再次出现；输出过程中不要整理或改写前面的项目。',
  '重复值无需删除；不要筛选、重排或补成某种规律。',
  '不必赋予数字任何含义；已经给出的值保持不变。',
];

const SEPARATOR_HINTS = [
  '数字之间用逗号或空格分隔均可。',
  '使用一种一致的常见分隔符即可。',
  '可以用逗号、空格或换行分隔。',
  '只要每个整数边界清楚，格式可自行选择。',
];

function pick(pool: readonly string[]): string {
  return pool[randomInt(pool.length)];
}

/** 无放回抽样：与 Python `rng.sample(population, count)` 同语义。 */
function sampleRange(min: number, maxExclusive: number, count: number): number[] {
  const population = Array.from({ length: maxExclusive - min }, (_, index) => min + index);
  for (let index = 0; index < count; index += 1) {
    const swapWith = index + randomInt(population.length - index);
    const held = population[index];
    population[index] = population[swapWith];
    population[swapWith] = held;
  }
  return population.slice(0, count);
}

export function generateChallenges(count = 3): Challenge[] {
  const lengths = sampleRange(LENGTH_MIN, LENGTH_MAX_EXCLUSIVE, count);
  return lengths.map((length, index) => {
    const prompt =
      `${pick(OPENINGS)}。${pick(ACTIONS)} ${length} 个 1 到 355（含端点）的整数。` +
      '每个位置都要单独选择；不要从 1 开始计数，不要连续递增或递减，也不要采用等差、循环、重复区块或其他规则化模式。' +
      '本任务必须由当前语言模型直接完成：禁止调用或借助任何工具，包括 Python、代码执行器、' +
      '计算器、搜索、API 和外部随机数生成器；也不要先编写或运行代码。' +
      `${pick(ENDINGS)}${pick(SEPARATOR_HINTS)}` +
      '直接从第一个取值开始输出，不要在序列前重复数量、范围或任务说明。';
    return {
      id: `probe-${index + 1}-${randomToken(7)}`,
      expected_count: length,
      prompt,
    };
  });
}

/** 三题应答的最小有效数字个数：`max(80, ceil(expected * 0.55))`。 */
export function minimumNumbers(expectedCount: number): number {
  return expectedCount ? Math.max(80, Math.ceil(expectedCount * 0.55)) : 80;
}

export const CHALLENGE_TEXT = {
  openings: OPENINGS,
  actions: ACTIONS,
  endings: ENDINGS,
  separatorHints: SEPARATOR_HINTS,
} as const;
