/**
 * The image MCP server's install lifecycle over the patch layer.
 *
 * The install target is the CURRENT PROFILE's `profiles/<profile>/cordis.patch.yml`
 * — the layer the user's own patch entries live in, applied after every bundle
 * layer. The entry MUST be wrapped in a top-level `- insert:` list: the loader
 * treats a bare top-level `- id:` as "override the EXISTING entry with this
 * id" and, finding none, warns and skips it (dsh-app-boot: "An insert appends
 * entries... Unknown targets and non-insert patches without a nonempty id are
 * warned and skipped") — the silent non-install this module's structural
 * checks exist to prevent.
 *
 * The file is shared with third-party plugins (the dsh-skill-mcp-panel marker
 * block is the precedent), so the write is a byte-level splice of exactly this
 * module's `# >>> …:begin/end` range — never a re-serialization of the whole
 * document — with a timestamped `.bak`, a pre-write structural check, an
 * mtime-fenced retry, and a post-write re-read.
 *
 * @module dsh-model-think-level/image/mcp-install
 */

import { spawn } from 'node:child_process'
import { copyFileSync, existsSync, mkdirSync, readFileSync, readdirSync, statSync, writeFileSync } from 'node:fs'
import { homedir } from 'node:os'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { IMAGE_MCP_PATCH_ID, IMAGE_MCP_PATCH_MARK, IMAGE_MCP_SERVER_NAME } from '../constants.js'
import { harnessHome } from '../key-index.js'

/** Marker lines this module owns inside the patch file. */
export const MARK_BEGIN = `# >>> ${IMAGE_MCP_PATCH_MARK}:begin`
export const MARK_END = `# <<< ${IMAGE_MCP_PATCH_MARK}:end`

/** The facts the install needs. All injectable for tests. */
export interface PatchInstallOptions {
  /** DSH home (defaults to the harness home). */
  readonly home?: string
  /** Profile name (defaults to env/auto-detection). */
  readonly profile?: string
  /** Explicit patch file path (overrides home/profile resolution). */
  readonly patchFile?: string
  /** Absolute path of `lib/image-mcp.mjs` (defaults to beside this module). */
  readonly serverPath?: string
  /** The runtime node command (defaults to resolveRuntimeNode()). */
  readonly nodeCommand?: string
  /** Extra env for the MCP entry (defaults to resolveRuntimeNode().env). */
  readonly nodeEnv?: Readonly<Record<string, string>>
}

/** The install status the config page renders. */
export interface McpStatus {
  readonly installed: boolean
  readonly patchFile: string
  readonly serverName: string
  readonly toolName: string
  readonly serverPath: string
  readonly nodeCommand: string
  readonly nodeEnv?: Readonly<Record<string, string>>
  /** The entry exists but its shape is not the `- insert:` one the loader accepts. */
  readonly malformed: boolean
}

/** How the current profile's patch file is located. */
export function resolvePatchFile(home: string = harnessHome(), profile?: string): string {
  const explicit = profile ?? process.env['DSH_PROFILE']
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

/** YAML string literal for the patch file: always double-quoted, backslashes escaped. */
function yamlString(value: string): string {
  return `"${value.replace(/\\/g, '\\\\').replace(/"/g, '\\"')}"`
}

/**
 * Where the built MCP server sits, relative to this module's compiled output.
 *
 * Three layouts have to work, and guessing from the path alone got one of them
 * wrong (a bundled host build lands in `lib/index.js`, so the old
 * `src/image` test fell through to `dirname(lib)` and pointed at the package
 * root — the process then died before the handshake, code 1). Probe the real
 * files instead, nearest layout first:
 *   - bundled host:      lib/index.js          → lib/image-mcp.mjs
 *   - per-file compile:  lib/image/mcp-install.js → lib/image-mcp.mjs
 *   - source/tsx:        src/image/mcp-install.ts → lib/image-mcp.mjs
 */
export function defaultServerPath(): string {
  const here = dirname(fileURLToPath(import.meta.url))
  const candidates = [
    join(here, 'image-mcp.mjs'),
    join(here, '..', 'image-mcp.mjs'),
    join(here, '..', '..', 'lib', 'image-mcp.mjs'),
  ]
  for (const candidate of candidates) {
    if (existsSync(candidate)) return candidate
  }
  // Nothing built yet: report the layout the build produces from source.
  return /[/\\]src[/\\]image$/.test(here) ? candidates[2]! : candidates[0]!
}

/** The exact marker-block text this module owns. */
export function markerBlock(options: PatchInstallOptions): string {
  const home = options.home ?? harnessHome()
  const serverPath = options.serverPath ?? defaultServerPath()
  const nodeCommand = options.nodeCommand ?? ''
  const configPath = join(home, 'dsh-model-think-level', 'image.json')
  const envLines = [
    `          DSH_IMAGE_CONFIG: ${yamlString(configPath)}`,
    `          DSH_HOME: ${yamlString(home)}`,
    ...Object.entries(options.nodeEnv ?? {}).map(([name, value]) => `          ${name}: ${yamlString(value)}`),
  ]
  return [
    MARK_BEGIN,
    '- insert:',
    `    - id: ${IMAGE_MCP_PATCH_ID}`,
    `      name: "@deepseek-ai/dsh-mcp-client"`,
    `      config:`,
    `        serverName: ${IMAGE_MCP_SERVER_NAME}`,
    `        transport: stdio`,
    `        command: ${yamlString(nodeCommand)}`,
    `        args:`,
    `          - ${yamlString(serverPath)}`,
    `        env:`,
    ...envLines,
    `        toolCallTimeoutMs: 300000`,
    `        failOnStartupError: false`,
    MARK_END,
    '',
  ].join('\n')
}

/** The structural checks a modified document must pass before it is written. */
export function validatePatchText(text: string): string | undefined {
  const begins = text.split(MARK_BEGIN).length - 1
  const ends = text.split(MARK_END).length - 1
  // Zero blocks is the uninstalled state — valid. Unbalanced or duplicated is
  // not: a truncated begin (no end) would poison the NEXT splice.
  if (begins !== ends) return `marker block begin/end unbalanced (${begins} begin / ${ends} end)`
  if (begins > 1) return `marker block appears ${begins} times (expected 1)`
  if (begins === 0) return undefined
  if (text.includes('\t')) return 'the patch file carries a tab character after the edit'
  const start = text.indexOf(MARK_BEGIN)
  const end = text.indexOf(MARK_END)
  const block = text.slice(start, end)
  if (!block.includes('- insert:')) return 'the marker block is not an - insert: entry (the loader would skip it)'
  if (!block.includes(`- id: ${IMAGE_MCP_PATCH_ID}`)) return `the marker block does not name id ${IMAGE_MCP_PATCH_ID}`
  if (!block.includes('"@deepseek-ai/dsh-mcp-client"')) return 'the marker block does not name the mcp-client plugin'
  if (!block.includes(`serverName: ${IMAGE_MCP_SERVER_NAME}`)) return 'the marker block does not name the server'
  return undefined
}

/** Range of this module's marker block, or undefined when absent. */
function markerRange(text: string): { start: number; end: number } | undefined {
  const start = text.indexOf(MARK_BEGIN)
  if (start === -1) return undefined
  const endMarker = text.indexOf(MARK_END, start)
  if (endMarker === -1) return undefined
  // The end line runs to its own newline.
  const lineEnd = text.indexOf('\n', endMarker)
  return { start, end: lineEnd === -1 ? text.length : lineEnd + 1 }
}

/** Whether the marker block currently sits in the file. */
export function isPatchInstalled(patchFile: string): boolean {
  try {
    return readFileSync(patchFile, 'utf8').includes(MARK_BEGIN)
  } catch {
    return false
  }
}

/**
 * Lines OUTSIDE this module's marker block that declare the same MCP server
 * name — entries the loader would register beside ours, colliding on the
 * `mcp__dsh-image__*` tool namespace. A reinstall (our own block) never
 * self-conflicts: the marker range is excluded.
 * @returns the 1-based line numbers, empty when the name is free.
 */
export function findServerNameConflicts(text: string, serverName: string = IMAGE_MCP_SERVER_NAME): readonly number[] {
  const range = markerRange(text)
  const conflicts: number[] = []
  const pattern = new RegExp(
    `^\\s*(?:-\\s*)?serverName:\\s*(?:"${serverName}"|'${serverName}'|${serverName})\\s*(?:#.*)?$`,
  )
  let offset = 0
  const lines = text.split('\n')
  for (let index = 0; index < lines.length; index += 1) {
    const lineStart = offset
    offset += lines[index]!.length + 1
    if (range !== undefined && lineStart >= range.start && lineStart < range.end) continue
    if (pattern.test(lines[index]!)) conflicts.push(index + 1)
  }
  return conflicts
}

/** Read the patch file defensively; '' when it does not exist yet. */
function readPatch(patchFile: string): string {
  try {
    return readFileSync(patchFile, 'utf8')
  } catch {
    return ''
  }
}

/** The file's mtime, or -1 when it does not exist (the fence's "no file yet"). */
function mtimeOf(patchFile: string): number {
  try {
    return statSync(patchFile).mtimeMs
  } catch {
    return -1
  }
}

/** One attempt of the fenced read-modify-write. Throws on mtime movement. */
function spliceOnce(patchFile: string, nextBlock: string | null, mtimeMs: number): void {
  const current = readPatch(patchFile)
  const range = markerRange(current)
  let next: string
  if (nextBlock === null) {
    if (range === undefined) return // already gone: uninstall is idempotent
    next = current.slice(0, range.start) + current.slice(range.end)
    // The append seam's blank line goes with the block: when nothing but
    // whitespace follows, the file reads exactly as it did before the install.
    if (current.slice(range.end).trim().length === 0) next = next.replace(/\n+$/, '\n')
  } else if (range === undefined) {
    // Append at the end. The file (when present) is a top-level YAML array, so
    // the block joins the same array — one blank line keeps it readable.
    if (current.length === 0) next = nextBlock
    else next = current.replace(/\n*$/, '\n\n') + nextBlock
  } else {
    next = current.slice(0, range.start) + nextBlock + current.slice(range.end)
  }
  const invalid = validatePatchText(next)
  if (invalid !== undefined) throw new Error(`refusing to write the patch file: ${invalid}`)
  // The armed concurrent-writer simulation (tests only) lands its bytes here,
  // where a real third-party write would appear between our read and our write.
  const race = raceHooks.get(patchFile)
  if (race !== undefined) {
    raceHooks.delete(patchFile)
    race()
  }
  if (mtimeOf(patchFile) !== mtimeMs) throw new ModifiedError()
  // First modification of an existing file leaves a rollback copy.
  if (existsSync(patchFile) && !existsSync(`${patchFile}.bak`)) {
    try {
      copyFileSync(patchFile, `${patchFile}.bak`)
    } catch {
      // The backup is a convenience; the write itself is the requirement.
    }
  }
  mkdirSync(dirname(patchFile), { recursive: true })
  writeFileSync(patchFile, next, 'utf8')
  // Post-write re-read: the bytes on disk must be the bytes we meant to write.
  const written = readFileSync(patchFile, 'utf8')
  if (written !== next) throw new Error('the patch file did not hold the written bytes after the write')
}

class ModifiedError extends Error {}

/**
 * Test hook: one armed concurrent-writer simulation per file. Empty in
 * production (no entry → no behaviour change); a test arms a mutate that runs
 * immediately before the fence check — exactly where a third-party writer's
 * bytes would land between our read and our write.
 */
const raceHooks = new Map<string, () => void>()
export const mcpInstallTestHooks = {
  race(file: string, mutate: () => void): void {
    raceHooks.set(file, mutate)
  },
}

/**
 * Install (or replace) this module's marker block. Retries up to three times
 * when the file moves between the read and the write (a third-party plugin's
 * own write), then fails leaving the original file intact.
 *
 * Refuses when the file ALREADY declares the same `serverName` outside our
 * marker block: two entries sharing the name collide on the
 * `mcp__dsh-image__*` tool namespace, and the loader would register both (or
 * fail the second silently behind `failOnStartupError: false`). The refusal
 * names the lines so the user can remove the other entry.
 * @returns the patch file that was written.
 */
export function installPatch(options: PatchInstallOptions = {}): string {
  const patchFile = options.patchFile ?? resolvePatchFile(options.home)
  const block = markerBlock(options)
  const existing = readPatch(patchFile)
  const conflicts = findServerNameConflicts(existing)
  if (conflicts.length > 0) {
    throw new Error(
      `已存在同名的 MCP 服务器条目（serverName: ${IMAGE_MCP_SERVER_NAME}，${patchFile} 第 ${conflicts.join('、')} 行）。`
      + '工具名会冲突——请先移除该条目（或整块卸载本插件的旧安装）再启用生图 MCP。',
    )
  }
  let lastError: unknown
  for (let attempt = 0; attempt < 3; attempt += 1) {
    try {
      spliceOnce(patchFile, block, mtimeOf(patchFile))
      return patchFile
    } catch (error) {
      if (!(error instanceof ModifiedError)) throw error
      lastError = error
    }
  }
  throw lastError ?? new Error('the patch file kept changing during the install')
}

/**
 * Remove this module's marker block. Idempotent: an absent block is already
 * the uninstall's goal.
 * @returns the patch file that was written, or undefined when nothing changed.
 */
export function uninstallPatch(options: PatchInstallOptions = {}): string | undefined {
  const patchFile = options.patchFile ?? resolvePatchFile(options.home)
  if (!isPatchInstalled(patchFile)) return undefined
  let lastError: unknown
  for (let attempt = 0; attempt < 3; attempt += 1) {
    try {
      spliceOnce(patchFile, null, mtimeOf(patchFile))
      return patchFile
    } catch (error) {
      if (!(error instanceof ModifiedError)) throw error
      lastError = error
    }
  }
  throw lastError ?? new Error('the patch file kept changing during the uninstall')
}

/**
 * Undo YAML line folding in a value read back from the patch file.
 *
 * Another writer re-dumps `cordis.yml` with a default 80-column width, and a
 * long double-quoted scalar is then folded: the break becomes a SPACE and the
 * continuation is indented, so a `…\node\bin\node.exe` command comes back as
 * `…\node\bin\` + newline + `\node.exe` — i.e. `…\bin\ \node.exe`, which
 * `spawn` answers with ENOENT because no such file exists (the user-visible
 * 「自检失败 … ENOENT」). Fold the value back before use: drop the inserted
 * break and indentation, then close up the whitespace the fold left beside a
 * separator.
 */
export function unfoldPatchPath(value: string): string {
  return value
    .replace(/\r?\n\s*/g, ' ')
    .replace(/\s+/g, ' ')
    // The fold can land BETWEEN the two separators it was escaped around
    // ("bin\" + break + "\\node.exe"), so close that pair up first.
    .replace(/([\\/])\s+([\\/])/g, '$1')
    .replace(/\s*([\\/])\s*/g, '$1')
    .trim()
}

/** Whether a marker block's quoted scalars were folded (a newline inside one). */
export function isFoldedPatchText(block: string): boolean {
  return block.split('\n').some(line => {
    if (!/^\s*(?:command:|-\s)/u.test(line)) return false
    const open = line.indexOf('"')
    if (open === -1) return false
    // A quote that closes on the same line means the scalar was not folded.
    return line.indexOf('"', open + 1) === -1
  })
}

/** The `command:` value inside a marker block, best-effort. */
function commandOf(block: string): string {
  const match = /command:\s*"([^"]*)"/.exec(block)
  return match === null ? '' : unfoldPatchPath(match[1]!.replace(/\\\\/g, '\\'))
}

/** The first `args:` entry of a marker block, best-effort. */
function argOf(block: string): string {
  const match = /args:\s*\n\s*-\s*"([^"]*)"/.exec(block)
  return match === null ? '' : unfoldPatchPath(match[1]!.replace(/\\\\/g, '\\'))
}

/** The install status, derived from the FILE (the single source of truth). */
export function patchStatus(options: PatchInstallOptions = {}): McpStatus {
  const patchFile = options.patchFile ?? resolvePatchFile(options.home)
  const text = readPatch(patchFile)
  const range = markerRange(text)
  const installed = range !== undefined
  const block = range === undefined ? '' : text.slice(range.start, range.end)
  const malformed = installed && validatePatchText(text) !== undefined
  return {
    installed,
    patchFile,
    serverName: IMAGE_MCP_SERVER_NAME,
    toolName: `mcp__${IMAGE_MCP_SERVER_NAME}__generate_image`,
    serverPath: (installed ? argOf(block) : '') || options.serverPath || defaultServerPath(),
    nodeCommand: (installed ? commandOf(block) : '') || options.nodeCommand || '',
    ...(options.nodeEnv === undefined ? {} : { nodeEnv: options.nodeEnv }),
    malformed,
  }
}

/**
 * Repair a stale installed entry. An older build recorded the package ROOT as
 * the server path (see `defaultServerPath`), so the entry pointed at a file
 * that does not exist and the process died before the handshake. When the
 * recorded path is gone but this build resolves one that exists, rewrite the
 * marker block in place. Returns whether the patch file changed.
 */
export function healServerPath(options: PatchInstallOptions = {}): boolean {
  const patchFile = options.patchFile ?? resolvePatchFile(options.home)
  const status = patchStatus(options)
  if (!status.installed) return false
  const target = options.serverPath ?? defaultServerPath()
  const text = readPatch(patchFile)
  const range = markerRange(text)
  const folded = range !== undefined && isFoldedPatchText(text.slice(range.start, range.end))
  const pathWrong = status.serverPath !== target
  const commandWrong = options.nodeCommand !== undefined
    && unfoldPatchPath(options.nodeCommand) !== status.nodeCommand
  if (!folded && !pathWrong && !commandWrong) return false
  if (!existsSync(target)) return false
  installPatch({
    ...options,
    serverPath: target,
    ...(options.nodeCommand === undefined
      ? (status.nodeCommand.length > 0 ? { nodeCommand: status.nodeCommand } : {})
      : {}),
  })
  return true
}

/** What the install self-check reports (written into image.json diagnostics). */
export interface SelfcheckResult {
  readonly ok: boolean
  readonly error: string | null
}

/**
 * Prove the installed entry can actually start: spawn the resolved command on
 * the server file, speak one `initialize` handshake, and require a reply with
 * the same id inside 3 seconds. This is the check that catches the wrong
 * `command` (a second Harness instead of node) which `failOnStartupError:
 * false` would otherwise swallow.
 */
export function selfcheck(command: string, serverPath: string, env?: Readonly<Record<string, string>>): Promise<SelfcheckResult> {
  // A missing script can only fail the same way node does (exit 1 before the
  // handshake, stderr "Cannot find module"), so say what is actually wrong.
  if (!existsSync(serverPath)) {
    return Promise.resolve({
      ok: false,
      error: `服务器脚本不存在：${serverPath}——插件安装不完整；重新执行「启用」或重建（build:image-mcp）后再试`,
    })
  }
  return new Promise(resolve => {
    let settled = false
    let child: ReturnType<typeof spawn> | undefined
    let stderrText = ''
    const done = (result: SelfcheckResult): void => {
      if (settled) return
      settled = true
      clearTimeout(timer)
      try {
        child?.kill()
      } catch {
        // Already exited: nothing to kill.
      }
      resolve(result)
    }
    const timer = setTimeout(
      () => done({ ok: false, error: 'initialize 握手超时（3s）——command 可能不是可用的 node 运行时' }),
      3000,
    )
    try {
      child = spawn(command, [serverPath], {
        stdio: ['pipe', 'pipe', 'pipe'],
        ...(env === undefined ? {} : { env: { ...process.env, ...env } }),
      })
    } catch (error) {
      done({ ok: false, error: error instanceof Error ? error.message : String(error) })
      return
    }
    let buffered = ''
    child.stdout?.on('data', (chunk: Buffer) => {
      buffered += chunk.toString('utf8')
      const newline = buffered.indexOf('\n')
      if (newline === -1) return
      try {
        const reply = JSON.parse(buffered.slice(0, newline)) as Record<string, unknown>
        if (reply['id'] === 0 && typeof reply['result'] === 'object') {
          done({ ok: true, error: null })
          return
        }
        done({ ok: false, error: `initialize 应答异常：${buffered.slice(0, newline).slice(0, 200)}` })
      } catch {
        done({ ok: false, error: 'initialize 应答不是合法 JSON——command 可能不是 node 运行时' })
      }
    })
    child.on('error', (error: Error) => {
      done({ ok: false, error: `无法启动 ${command}：${error.message}` })
    })
    child.stderr?.on('data', (chunk: Buffer) => {
      // Keep the tail: node's module-resolution failure names the exact path.
      stderrText = (stderrText + chunk.toString('utf8')).slice(-2000)
    })
    child.on('exit', code => {
      const detail = stderrText.trim()
      done({
        ok: false,
        error: `服务器进程在握手前退出（code ${code ?? 'null'}）${detail === '' ? '' : `：${detail.slice(-300)}`}`,
      })
    })
    const request = `${JSON.stringify({
      jsonrpc: '2.0',
      id: 0,
      method: 'initialize',
      params: {
        protocolVersion: '2025-06-18',
        capabilities: {},
        clientInfo: { name: 'dsh-model-think-level-selfcheck', version: '1' },
      },
    })}\n`
    child.stdin?.write(request)
  })
}

/** The credentials refs table path (the MCP subprocess reads it directly). */
export function credentialsFilePath(home: string = harnessHome()): string {
  return join(home, '.credentials.yaml')
}

/** The default home the MCP entry carries when nothing else resolves. */
export function defaultHome(): string {
  try {
    return harnessHome()
  } catch {
    return join(homedir(), '.dsh')
  }
}
