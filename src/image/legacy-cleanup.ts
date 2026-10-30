/**
 * One-time migration: remove the retired image-MCP server's patch entry.
 *
 * The v2.0.3 image tool was an stdio MCP subprocess installed by splicing a
 * marker block into the current profile's `cordis.patch.yml`. That transport
 * is gone — `lib/image-mcp.mjs` is no longer built — so a leftover block would
 * make the loader spawn a missing file on every boot AND expose a duplicate
 * `mcp__dsh-image__generate_image` beside the native tool. The cleanup runs
 * unconditionally at apply(): absent block → no-op, present block → the exact
 * byte range is spliced out (never a re-serialization of the whole document,
 * because third-party marker blocks share this file), with a timestamped
 * `.bak`, an mtime-fenced retry, and a post-write re-read.
 *
 * The running process keeps whatever it loaded at boot; the removal takes
 * effect on the next start, which the caller's log line says.
 *
 * @module dsh-model-think-level/image/legacy-cleanup
 */

import { copyFileSync, existsSync, mkdirSync, readFileSync, readdirSync, statSync, writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { IMAGE_MCP_PATCH_ID, IMAGE_MCP_PATCH_MARK } from '../constants.js'
import { harnessHome } from '../key-index.js'

/** Marker lines the retired installer owned inside the patch file. */
export const MARK_BEGIN = `# >>> ${IMAGE_MCP_PATCH_MARK}:begin`
export const MARK_END = `# <<< ${IMAGE_MCP_PATCH_MARK}:end`

/** How the current profile's patch file is located (the installer's own order). */
export function resolveLegacyPatchFile(home: string = harnessHome()): string {
  const explicit = process.env['DSH_PROFILE']
  if (explicit !== undefined && explicit.length > 0) return join(home, 'profiles', explicit, 'cordis.patch.yml')
  // Auto-detect: the profile whose patch file was touched most recently is the
  // live one in every single-profile deployment, and the honest guess otherwise.
  const profilesDir = join(home, 'profiles')
  try {
    if (existsSync(profilesDir)) {
      const candidates: { readonly file: string; readonly mtime: number }[] = []
      for (const name of readdirSync(profilesDir)) {
        const file = join(profilesDir, name, 'cordis.patch.yml')
        if (!existsSync(file)) continue
        candidates.push({ file, mtime: statSync(file).mtimeMs })
      }
      if (candidates.length === 1) return candidates[0]!.file
      if (candidates.length > 1) return candidates.sort((a, b) => b.mtime - a.mtime)[0]!.file
    }
  } catch {
    // Fall through to the default below.
  }
  // A home-level patch layer (headless compositions) when no profile carries one.
  if (existsSync(join(home, 'cordis.patch.yml'))) return join(home, 'cordis.patch.yml')
  return join(home, 'profiles', 'desktop', 'cordis.patch.yml')
}

/** Range of the marker block, or undefined when absent. */
function markerRange(text: string): { start: number; end: number } | undefined {
  const start = text.indexOf(MARK_BEGIN)
  if (start === -1) return undefined
  const endMarker = text.indexOf(MARK_END, start)
  if (endMarker === -1) return undefined
  const lineEnd = text.indexOf('\n', endMarker)
  return { start, end: lineEnd === -1 ? text.length : lineEnd + 1 }
}

/** One line of the patch document plus its byte offset. */
interface PatchLine {
  readonly text: string
  readonly start: number
}

/** Split into lines while keeping each line's own start offset. */
function linesOf(text: string): readonly PatchLine[] {
  const out: PatchLine[] = []
  let start = 0
  for (const line of text.split('\n')) {
    out.push({ text: line, start })
    start += line.length + 1
  }
  return out
}

/**
 * Range of a leftover entry the RETIRED installer wrote but whose marker
 * comment lines were lost — by a hand edit, or by a third-party panel that
 * re-serialized the file. The marker splice above cannot see those, yet they
 * still make the loader spawn the removed `lib/image-mcp.mjs` on every boot and
 * keep a dead `dsh-image` MCP server in the host's client list.
 *
 * Two shapes count, and both must be owned by our id alone:
 *   - a top-level `- insert:` list whose `- id:` rows are all ours, and
 *   - a bare top-level `- id: dsh-image-mcp` row (the "silent non-install"
 *     shape the loader skips).
 * A block carrying anyone else's row is left untouched: a byte splice cannot
 * remove half of it, and guessing would delete a live plugin entry.
 * @returns the byte range to cut, or undefined when nothing of ours is there.
 */
function staleEntryRange(text: string): { start: number; end: number } | undefined {
  const lines = linesOf(text)
  const ownId = new RegExp(`^\\s*-\\s+id:\\s*['"]?${IMAGE_MCP_PATCH_ID}['"]?\\s*$`)
  const anyId = /^\s*-\s+id:/
  for (const [index, line] of lines.entries()) {
    if (!/^-(\s|$)/.test(line.text)) continue
    // A top-level item runs until the next top-level line (or EOF).
    let end = lines.length
    for (let probe = index + 1; probe < lines.length; probe += 1) {
      const candidate = lines[probe]!
      if (candidate.text.trim().length === 0) continue
      if (!/^\s/.test(candidate.text)) {
        end = probe
        break
      }
    }
    const body = lines.slice(index + 1, end)
    const owned = /^-\s*insert:\s*$/.test(line.text)
      // Every row inside the list must be ours — never cut a mixed block.
      ? body.some(entry => ownId.test(entry.text)) && !body.some(entry => anyId.test(entry.text) && !ownId.test(entry.text))
      : ownId.test(line.text)
    if (!owned) continue
    return { start: line.start, end: end < lines.length ? lines[end]!.start : text.length }
  }
  return undefined
}

/** The range to cut: the marked block when the markers survived, else the bare entry. */
function legacyRange(text: string): { start: number; end: number } | undefined {
  return markerRange(text) ?? staleEntryRange(text)
}

/** Whether a modified document still parses as "our markers, balanced, once". */
function validateAfterSplice(text: string): string | undefined {
  const begins = text.split(MARK_BEGIN).length - 1
  const ends = text.split(MARK_END).length - 1
  if (begins !== 0 || ends !== 0) return `marker block still present after the splice (${begins} begin / ${ends} end)`
  if (text.includes('\t')) return 'the patch file carries a tab character after the splice'
  return undefined
}

/** The file's mtime, or -1 when it does not exist (the fence's "no file yet"). */
function mtimeOf(patchFile: string): number {
  try {
    return statSync(patchFile).mtimeMs
  } catch {
    return -1
  }
}

class ModifiedError extends Error {}

/** One attempt of the fenced splice. Throws on mtime movement. */
function spliceOnce(patchFile: string, mtimeMs: number): void {
  const current = readFileSync(patchFile, 'utf8')
  const range = legacyRange(current)
  if (range === undefined) return // already gone: idempotent
  let next = current.slice(0, range.start) + current.slice(range.end)
  // The append seam's blank line goes with the block: when nothing but
  // whitespace follows, the file reads exactly as it did before the install.
  if (current.slice(range.end).trim().length === 0) next = next.replace(/\n+$/, '\n')
  const invalid = validateAfterSplice(next)
  if (invalid !== undefined) throw new Error(`refusing to write the patch file: ${invalid}`)
  if (mtimeOf(patchFile) !== mtimeMs) throw new ModifiedError()
  if (!existsSync(`${patchFile}.bak`)) {
    try {
      copyFileSync(patchFile, `${patchFile}.bak`)
    } catch {
      // The backup is a convenience; the write itself is the requirement.
    }
  }
  mkdirSync(dirname(patchFile), { recursive: true })
  writeFileSync(patchFile, next, 'utf8')
  const written = readFileSync(patchFile, 'utf8')
  if (written !== next) throw new Error('the patch file did not hold the written bytes after the write')
}

/**
 * Remove the retired MCP marker block if it is present.
 * @returns the patch file that was written, or undefined when there was
 *   nothing to remove (absent block, absent file, or an unreadable home).
 */
export function removeLegacyImageMcpPatch(home?: string, patchFile?: string): string | undefined {
  let file: string
  try {
    file = patchFile ?? resolveLegacyPatchFile(home)
  } catch {
    return undefined
  }
  let text: string
  try {
    text = readFileSync(file, 'utf8')
  } catch {
    return undefined
  }
  if (legacyRange(text) === undefined) return undefined
  if (!text.includes(`- id: ${IMAGE_MCP_PATCH_ID}`)) {
    // Only a marker block that no longer names our entry: not ours to touch.
    return undefined
  }
  let lastError: unknown
  for (let attempt = 0; attempt < 3; attempt += 1) {
    try {
      spliceOnce(file, mtimeOf(file))
      return file
    } catch (error) {
      if (!(error instanceof ModifiedError)) throw error
      lastError = error
    }
  }
  throw lastError ?? new Error('the patch file kept changing during the cleanup')
}
