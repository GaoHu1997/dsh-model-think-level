// 指纹检测结果的落盘：`<DSH home>/dsh-model-think-level/fingerprint.json`。
//
// 与 key-index.json 同目录、同写法（先写同级临时文件再 rename，保证原子）。
// 只存统计量，不存原始作答文本 —— 见 docs/fingerprint-design.md §4.2。

import { mkdirSync, readFileSync, renameSync, unlinkSync, writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'

import { harnessHome } from '../key-index.js'

// 判据本身在 `verdict.ts`（纯函数、客户端共用）；这里 re-export 只是为了
// 落盘一侧的引用不必多一个 import。记录形状也在那边：浏览器要拿它画徽章，
// 而这个模块是 Node-only 的。
import {
  type FingerprintRecord,
  type FingerprintStatus,
  type FingerprintTopEntry,
} from './verdict.js'

export { type FingerprintRecord, type FingerprintStatus, type FingerprintTopEntry }

export interface FingerprintDocument {
  version: 1
  /** 银行的 built_at；换银行就整体失效。 */
  bankBuiltAt: string
  records: Record<string, FingerprintRecord>
}

const STATUSES = new Set<string>(['identified', 'doubtful', 'failed'])

export function emptyFingerprintStore(bankBuiltAt = ''): FingerprintDocument {
  return { version: 1, bankBuiltAt, records: {} }
}

/** 记录键。`\u0000` 在模型 id 与供应商 id 里都不可能出现。 */
export function recordKeyOf(provider: string, model: string): string {
  return `${provider}\u0000${model}`
}

export function fingerprintFilePath(home: string = harnessHome()): string {
  return join(home, 'dsh-model-think-level', 'fingerprint.json')
}

function finiteNumber(value: unknown, fallback: number): number {
  return typeof value === 'number' && Number.isFinite(value) ? value : fallback
}

function parseTop(raw: unknown): FingerprintTopEntry[] | undefined {
  if (!Array.isArray(raw)) return undefined
  const out: FingerprintTopEntry[] = []
  for (const item of raw) {
    if (typeof item !== 'object' || item === null) continue
    const record = item as Record<string, unknown>
    const model = record['model']
    if (typeof model !== 'string' || model.length === 0) continue
    out.push({
      model,
      probability: finiteNumber(record['probability'], 0),
      similarity: finiteNumber(record['similarity'], 0),
    })
    if (out.length === 3) break
  }
  return out.length === 0 ? undefined : out
}

function parseRecord(provider: string, model: string, raw: unknown): FingerprintRecord | undefined {
  if (typeof raw !== 'object' || raw === null) return undefined
  const record = raw as Record<string, unknown>
  const status = record['status']
  if (typeof status !== 'string' || !STATUSES.has(status)) return undefined
  const out: FingerprintRecord = {
    provider,
    model,
    status: status as FingerprintStatus,
    checkedAt: finiteNumber(record['checkedAt'], 0),
    usedOutputs: Math.max(0, Math.trunc(finiteNumber(record['usedOutputs'], 0))),
  }
  for (const key of ['prediction', 'predictionName', 'familyPrediction', 'error'] as const) {
    const value = record[key]
    if (typeof value === 'string' && value.length > 0) out[key] = value
  }
  for (const key of ['probability', 'familyProbability'] as const) {
    const value = record[key]
    if (typeof value === 'number' && Number.isFinite(value)) out[key] = value
  }
  const top = parseTop(record['top'])
  if (top !== undefined) out.top = top
  const calibration = record['calibration']
  if (typeof calibration === 'object' && calibration !== null) {
    const fields = calibration as Record<string, unknown>
    out.calibration = {
      queries: Math.trunc(finiteNumber(fields['queries'], 0)),
      cvAccuracy: finiteNumber(fields['cvAccuracy'], 0),
    }
  }
  // 失败的那次没有归属结论可谈：`prediction` 等字段只属于 identified / doubtful。
  if (status === 'failed') {
    delete out.prediction
    delete out.predictionName
    delete out.probability
    delete out.familyPrediction
    delete out.familyProbability
    delete out.top
    delete out.calibration
  }
  return out
}

/**
 * 解析已解码的文档。永远不抛错：银行换了、文件被手改坏、条目形状不对，
 * 代价最多是那一条被丢掉，不会让用户丢掉全部历史。
 * @param raw - 解码后的 JSON 值。
 * @param bankBuiltAt - 当前指纹库的 built_at；对不上就整体视为无历史。
 */
export function parseFingerprintStore(raw: unknown, bankBuiltAt = ''): FingerprintDocument {
  if (typeof raw !== 'object' || raw === null) return emptyFingerprintStore(bankBuiltAt)
  const root = raw as Record<string, unknown>
  if (root['bankBuiltAt'] !== undefined && root['bankBuiltAt'] !== bankBuiltAt) {
    return emptyFingerprintStore(bankBuiltAt)
  }
  const records = root['records']
  if (typeof records !== 'object' || records === null || Array.isArray(records)) {
    return emptyFingerprintStore(bankBuiltAt)
  }
  const out: Record<string, FingerprintRecord> = {}
  for (const [key, value] of Object.entries(records as Record<string, unknown>)) {
    const separator = key.indexOf('\u0000')
    if (separator <= 0 || separator === key.length - 1) continue
    const provider = key.slice(0, separator)
    const model = key.slice(separator + 1)
    const record = parseRecord(provider, model, value)
    if (record !== undefined) out[key] = record
  }
  return { version: 1, bankBuiltAt, records: out }
}

/** 读结果库；只有文件不存在才返回空库。 */
export function readFingerprintStore(
  bankBuiltAt = '',
  file: string = fingerprintFilePath(),
): FingerprintDocument {
  let text: string
  try {
    text = readFileSync(file, 'utf8')
  } catch (error) {
    if (typeof error === 'object' && error !== null && 'code' in error && error.code === 'ENOENT') {
      return emptyFingerprintStore(bankBuiltAt)
    }
    throw error
  }
  let raw: unknown
  try {
    raw = JSON.parse(text)
  } catch {
    return emptyFingerprintStore(bankBuiltAt)
  }
  return parseFingerprintStore(raw, bankBuiltAt)
}

/** 原子写库。 */
export function writeFingerprintStore(
  document: FingerprintDocument,
  file: string = fingerprintFilePath(),
): void {
  mkdirSync(dirname(file), { recursive: true })
  const temporary = `${file}.${process.pid}.tmp`
  writeFileSync(temporary, `${JSON.stringify(document, null, 2)}\n`, 'utf8')
  try {
    renameSync(temporary, file)
  } catch (error) {
    try {
      unlinkSync(temporary)
    } catch {
      // 临时文件尽力清理；rename 的失败才是正事。
    }
    throw error
  }
}

/** 一次读-改-写。返回的就是落盘后的文档。 */
export function updateFingerprintStore(
  mutate: (document: FingerprintDocument) => FingerprintDocument,
  bankBuiltAt = '',
  file: string = fingerprintFilePath(),
): FingerprintDocument {
  const current = readFingerprintStore(bankBuiltAt, file)
  const next = mutate(current)
  writeFingerprintStore(next, file)
  return next
}

/** 覆盖或新增一条记录。 */
export function withRecord(
  document: FingerprintDocument,
  record: FingerprintRecord,
): FingerprintDocument {
  return {
    ...document,
    records: { ...document.records, [recordKeyOf(record.provider, record.model)]: record },
  }
}

/** 删掉一条记录（供应商或模型被删掉时用）。 */
export function withoutRecord(
  document: FingerprintDocument,
  provider: string,
  model: string,
): FingerprintDocument {
  const key = recordKeyOf(provider, model)
  if (document.records[key] === undefined) return document
  const records = { ...document.records }
  delete records[key]
  return { ...document, records }
}

/** 一个供应商下的全部记录。 */
export function providerRecords(
  document: FingerprintDocument,
  provider: string,
): FingerprintRecord[] {
  return Object.values(document.records).filter((record) => record.provider === provider)
}
