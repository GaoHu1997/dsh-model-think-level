/** 形状声明：这份 .mjs 是上游 ModelTrace fingerprint-core 的逐字拷贝，没有类型。 */
export const VALUE_MIN: number
export const VALUE_MAX: number
export const DIMENSION: number
export const ALPHA: number
export const ORDERED_BLOCK_WEIGHT: number

export function parseNumbers(text: string): number[]
export function countNumbers(numbers: number[]): number[]

export interface UpstreamResultRow {
  model: string
  display_name: string
  probability: number
  profile_similarity: number
  score: number
  family: string
  family_name: string
  conditional_probability: number
}

export interface UpstreamAttribution {
  prediction: string
  prediction_name: string
  probability: number
  used_outputs: number
  results: UpstreamResultRow[]
  diagnostics: Array<{ index: number; parsed_numbers: number; minimum_numbers: number; accepted: boolean }>
  calibration: { queries: string; beta: number; cv_accuracy: number }
  family_prediction: string
  family_prediction_name: string
  family_probability: number
  family_probabilities: Array<{ family: string; display_name: string; probability: number }>
  method: string
}

export function analyzeGlobalOutputs(
  outputs: Array<{ text: string; expected_count: number }>,
  bank: unknown,
): UpstreamAttribution
