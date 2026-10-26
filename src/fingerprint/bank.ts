// ModelTrace 数字指纹：指纹库（unified_bank.json）的加载与校验。
//
// 出处：https://github.com/xqy2006/ModelTrace  (MIT, Copyright (c) 2026 xqy2006)
// 银行是数据集而非代码，按 MIT 随附，来源与构建时间见 assets/NOTICE.md。
//
// 这个模块是宿主侧（Node）专用：它要读包里的 assets/unified_bank.json。
// 前端只需要 summarizeBank() 的产物，走 /fingerprint-state 拿。

import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

import { DIMENSION, type Bank, type BankModel } from './core.js';

const REQUIRED_CALIBRATION_KEYS = ['1', '2', '3'] as const;

export interface BankModelSummary {
  id: string;
  displayName: string;
  family: string;
  familyName: string;
}

export interface BankSummary {
  builtAt: string;
  schema: string;
  models: BankModelSummary[];
  families: Array<{ family: string; name: string; models: number }>;
  recommendedQueries: number;
}

function isNumberArray(value: unknown, length?: number): value is number[] {
  return Array.isArray(value) && value.every((item) => typeof item === 'number' && Number.isFinite(item))
    && (length === undefined || value.length === length);
}

function isNumberMatrix(value: unknown, rows?: number, columns?: number): value is number[][] {
  return Array.isArray(value) && value.every((row) => isNumberArray(row, columns))
    && (rows === undefined || value.length === rows);
}

function isNumberCube(value: unknown, depth1?: number, depth2?: number, depth3?: number): value is number[][][] {
  return Array.isArray(value) && value.every((plane) => isNumberMatrix(plane, depth2, depth3))
    && (depth1 === undefined || value.length === depth1);
}

function fail(message: string): never {
  throw new Error(`fingerprint bank: ${message}`);
}

/** 只做形状校验并收窄成 `Bank`；不改任何数值。 */
export function parseBank(raw: unknown): Bank {
  if (typeof raw !== 'object' || raw === null) fail('root must be an object');
  const source = raw as Record<string, unknown>;

  const models = source.models;
  if (!Array.isArray(models) || models.length === 0) fail('models must be a non-empty array');
  models.forEach((model, index) => {
    if (typeof model !== 'object' || model === null) fail(`models[${index}] must be an object`);
    const entry = model as Record<string, unknown>;
    if (typeof entry.id !== 'string' || entry.id.length === 0) fail(`models[${index}].id must be a non-empty string`);
    if (typeof entry.display_name !== 'string') fail(`models[${index}].display_name must be a string`);
    if (typeof entry.family !== 'string') fail(`models[${index}].family must be a string`);
    if (!isNumberArray(entry.counts, DIMENSION)) fail(`models[${index}].counts must be ${DIMENSION} numbers`);
  });

  const robust = source.robust;
  if (typeof robust !== 'object' || robust === null) fail('robust must be an object');
  const artifacts = robust as Record<string, unknown>;
  for (const key of ['hellinger', 'ordered_blocks'] as const) {
    const artifact = artifacts[key];
    if (typeof artifact !== 'object' || artifact === null) fail(`robust.${key} must be an object`);
    const fields = artifact as Record<string, unknown>;
    const columns = key === 'hellinger' ? DIMENSION : undefined;
    if (!isNumberArray(fields.feature_mean, columns)) fail(`robust.${key}.feature_mean has the wrong shape`);
    if (!isNumberArray(fields.feature_scale, columns)) fail(`robust.${key}.feature_scale has the wrong shape`);
    if (!isNumberMatrix(fields.nuisance_basis, undefined, columns)) fail(`robust.${key}.nuisance_basis has the wrong shape`);
    if (!isNumberMatrix(fields.centroids, models.length, columns)) {
      fail(`robust.${key}.centroids must be ${models.length} rows aligned with models`);
    }
    if (key === 'ordered_blocks' && !isNumberCube(fields.environment_centroids, undefined, models.length)) {
      fail('robust.ordered_blocks.environment_centroids has the wrong shape');
    }
  }

  const calibration = source.calibration;
  if (typeof calibration !== 'object' || calibration === null) fail('calibration must be an object');
  const groups = calibration as Record<string, unknown>;
  for (const key of REQUIRED_CALIBRATION_KEYS) {
    const group = groups[key];
    if (typeof group !== 'object' || group === null) fail(`calibration.${key} is missing`);
    const fields = group as Record<string, unknown>;
    if (typeof fields.beta !== 'number' || !Number.isFinite(fields.beta)) fail(`calibration.${key}.beta must be a number`);
    if (typeof fields.cv_accuracy !== 'number') fail(`calibration.${key}.cv_accuracy must be a number`);
  }

  return raw as Bank;
}

function bankPath(): string {
  // 打包后这里位于 <pkg>/lib/fingerprint/bank.js，银行在 <pkg>/assets/unified_bank.json。
  return join(dirname(fileURLToPath(import.meta.url)), '..', '..', 'assets', 'unified_bank.json');
}

let cached: Bank | undefined;

/** 同步读包内的指纹库。结果只解析一次。 */
export function loadBankSync(): Bank {
  if (cached !== undefined) return cached;
  cached = parseBank(JSON.parse(readFileSync(bankPath(), 'utf8')));
  return cached;
}

export function summarizeBank(bank: Bank): BankSummary {
  const families = new Map<string, { family: string; name: string; models: number }>();
  for (const model of bank.models) {
    const family = model.family || 'models';
    const known = families.get(family);
    if (known !== undefined) known.models += 1;
    else families.set(family, { family, name: model.family_name || family, models: 1 });
  }
  return {
    builtAt: String(bank.built_at ?? ''),
    schema: String(bank.schema ?? ''),
    models: bank.models.map((model: BankModel) => ({
      id: model.id,
      displayName: model.display_name,
      family: model.family || 'models',
      familyName: model.family_name || model.family || 'models',
    })),
    families: [...families.values()],
    recommendedQueries: Number(bank.recommended_queries ?? 3),
  };
}

export function bankBuiltAt(bank: Bank): string {
  return String(bank.built_at ?? '');
}
