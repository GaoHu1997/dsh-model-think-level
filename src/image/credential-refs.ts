/**
 * The DSH credential store's `refs` table, read with a minimal YAML scanner.
 *
 * `<DSH_HOME>/.credentials.yaml` is `{version, refs, records}`; `refs` is the
 * PLAINTEXT `名称 → 密钥值` mapping the host's credential service resolves
 * from. The `records` member is a different, grant-shaped structure and is
 * deliberately never read — a same-named entry there must not answer.
 *
 * The scanner is intentionally narrow (this module is also compiled into the
 * zero-dependency MCP subprocess): a top-level `refs:` key, then deeper-
 * indented `key: value` lines until the first non-indented line. Quoted
 * values, escaped quotes and trailing comments are handled; block lists and
 * anything nested deeper than a scalar are not the refs shape and are skipped.
 *
 * @module dsh-model-think-level/image/credential-refs
 */

import { readFileSync } from 'node:fs'

/**
 * Parse the refs table of an already-read credentials document.
 * @returns the `名称 → 值` map, possibly empty — never throws.
 */
export function parseCredentialRefs(text: string): Readonly<Record<string, string>> {
  const refs: Record<string, string> = {}
  const lines = text.split(/\r?\n/)
  let inRefs = false
  let refsIndent = -1
  for (const line of lines) {
    if (!inRefs) {
      // The top-level key: column 0, exactly `refs:` (the records/`refsFoo`
      // spellings must not match).
      if (/^refs:\s*(?:#.*)?$/.test(line)) {
        inRefs = true
        refsIndent = -1
      }
      continue
    }
    if (line.trim().length === 0 || /^\s*#/.test(line)) continue
    const indent = line.length - line.trimStart().length
    if (indent === 0) break // back at top level: the table ended
    if (refsIndent === -1) refsIndent = indent
    if (indent !== refsIndent) continue // nested deeper than a scalar entry
    const entry = /^([^:]+):\s*(.*)$/.exec(line.trim())
    if (entry === null) continue
    const key = unquote(entry[1]!.trim())
    const value = unquote(stripComment(entry[2]!.trim()))
    if (key.length > 0 && value.length > 0) refs[key] = value
  }
  return refs
}

/** Read one credentials file's refs table; missing file → empty map. */
export function readCredentialRefs(file: string): Readonly<Record<string, string>> {
  try {
    return parseCredentialRefs(readFileSync(file, 'utf8'))
  } catch {
    return {}
  }
}

/** Strip an unquoted value's trailing comment (` # ...`). */
function stripComment(value: string): string {
  if (value.startsWith('"') || value.startsWith("'")) return value
  const at = value.indexOf(' #')
  return at === -1 ? value : value.slice(0, at).trimEnd()
}

/** Remove one level of matching quotes and unescape what they wrapped. */
function unquote(value: string): string {
  if (value.length >= 2 && value.startsWith('"') && value.endsWith('"')) {
    return value.slice(1, -1).replace(/\\"/g, '"').replace(/\\\\/g, '\\')
  }
  if (value.length >= 2 && value.startsWith("'") && value.endsWith("'")) {
    return value.slice(1, -1).replace(/''/g, "'")
  }
  return value
}
