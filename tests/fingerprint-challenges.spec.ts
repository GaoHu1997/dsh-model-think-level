import { describe, expect, it } from 'vitest'

import {
  CHALLENGE_TEXT,
  generateChallenges,
  minimumNumbers,
  type Challenge,
} from '../src/fingerprint/challenges.js'

const HARD_RULES = [
  '每个位置都要单独选择；不要从 1 开始计数，不要连续递增或递减，也不要采用等差、循环、重复区块或其他规则化模式。',
  '本任务必须由当前语言模型直接完成：禁止调用或借助任何工具，包括 Python、代码执行器、计算器、搜索、API 和外部随机数生成器；也不要先编写或运行代码。',
  '直接从第一个取值开始输出，不要在序列前重复数量、范围或任务说明。',
]

describe('generateChallenges', () => {
  it('produces three challenges with distinct lengths in 292..332', () => {
    const challenges = generateChallenges(3)
    expect(challenges).toHaveLength(3)
    const lengths = challenges.map((challenge) => challenge.expected_count)
    for (const length of lengths) {
      expect(Number.isInteger(length)).toBe(true)
      expect(length).toBeGreaterThanOrEqual(292)
      expect(length).toBeLessThanOrEqual(332)
    }
    expect(new Set(lengths).size).toBe(3)
  })

  it('keeps every upstream hard rule verbatim', () => {
    for (const challenge of generateChallenges(3)) {
      for (const rule of HARD_RULES) expect(challenge.prompt).toContain(rule)
    }
  })

  it('names the requested length and the inclusive range', () => {
    for (const challenge of generateChallenges(3)) {
      expect(challenge.prompt).toContain(`${challenge.expected_count} 个 1 到 355（含端点）的整数。`)
    }
  })

  it('draws wording from every pool and never leaves a blank', () => {
    for (const challenge of generateChallenges(3)) {
      expect(challenge.prompt.trim().length).toBeGreaterThan(0)
      expect(challenge.prompt).not.toContain('undefined')
      expect(challenge.prompt).not.toContain('null')
      const opened = CHALLENGE_TEXT.openings.some((line) => challenge.prompt.startsWith(`${line}。`))
      expect(opened).toBe(true)
    }
  })

  it('identifies each challenge as probe-N-<14 hex>', () => {
    const challenges: Challenge[] = generateChallenges(3)
    const ids = challenges.map((challenge) => challenge.id)
    expect(new Set(ids).size).toBe(3)
    ids.forEach((id, index) => {
      expect(id).toMatch(new RegExp(`^probe-${index + 1}-[0-9a-f]{14}$`))
    })
  })

  it('honours a different count', () => {
    expect(generateChallenges(1)).toHaveLength(1)
    expect(generateChallenges(5).map((challenge) => challenge.expected_count)).toHaveLength(5)
  })

  it('asks for the pools that the upstream prompt draws from', () => {
    expect(CHALLENGE_TEXT.openings).toHaveLength(5)
    expect(CHALLENGE_TEXT.actions).toHaveLength(5)
    expect(CHALLENGE_TEXT.endings).toHaveLength(5)
    expect(CHALLENGE_TEXT.separatorHints).toHaveLength(4)
  })
})

describe('minimumNumbers', () => {
  it('follows max(80, ceil(expected * 0.55))', () => {
    expect(minimumNumbers(292)).toBe(161)
    expect(minimumNumbers(332)).toBe(183)
    expect(minimumNumbers(100)).toBe(80)
    expect(minimumNumbers(0)).toBe(80)
    expect(minimumNumbers(145)).toBe(80)
    expect(minimumNumbers(146)).toBe(81)
    expect(minimumNumbers(300)).toBe(165)
  })
})
