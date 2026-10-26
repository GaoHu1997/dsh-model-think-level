# 第三方随附物 · ModelTrace 指纹库

## `unified_bank.json`

- **来源**：<https://github.com/xqy2006/ModelTrace>
- **文件**：`static/data/unified_bank.json`（与 `codex-plugin/modeltrace-guard/assets/unified_bank.json` 为同一份，blob `24cc43f171bf1f374cf7e6da3915b35c99d6e60d`）
- **许可证**：MIT，Copyright (c) 2026 xqy2006
- **构建时间**：见文件内 `built_at` 字段
- **schema**：`robust-number-fingerprint-bank`
- **方法**：`Ordered-block + nuisance-Hellinger`，`alpha=0.5`，`ordered_block_weight=0.25`
- **内容**：2 个家族、18 个候选模型的数字分布统计量（355 维计数、质心、干扰基、环境质心、校准温度）
- **用途**：本插件的「指纹检测」把模型的取值序列与这份银行比对，给出归属概率

这是数据集而非代码，按 MIT 原样随附，未做任何修改。换银行时 `built_at` 会变，
本插件此前保存的检测结果会整体作废（这是有意的：结论只对生成它的那份银行有意义）。
