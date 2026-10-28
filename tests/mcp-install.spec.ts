// The MCP install plumbing: where the built server actually lives, the repair
// of a stale entry that pointed at the package root instead of
// lib/image-mcp.mjs (reported live as 「服务器进程在握手前退出（code 1）」,
// because node was handed a file that does not exist), and the self-check's
// preflight that names a missing script instead of guessing.

import { afterEach, describe, expect, it } from 'vitest'
import { existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import {
  defaultServerPath,
  healServerPath,
  installPatch,
  isFoldedPatchText,
  MARK_BEGIN,
  MARK_END,
  patchStatus,
  resolvePatchFile,
  selfcheck,
  unfoldPatchPath,
} from '../src/image/mcp-install.js'

const made: string[] = []

afterEach(() => {
  for (const dir of made.splice(0)) rmSync(dir, { recursive: true, force: true })
})

function tempHome(): string {
  const home = mkdtempSync(join(tmpdir(), 'dsh-image-mcp-'))
  made.push(home)
  return home
}

describe('defaultServerPath', () => {
  it('always points at lib/image-mcp.mjs, never at the package root', () => {
    const path = defaultServerPath()
    expect(path.replace(/\\/g, '/')).toMatch(/\/lib\/image-mcp\.mjs$/)
  })
})

describe('healServerPath', () => {
  it('rewrites an entry that points at a file which does not exist', () => {
    const home = tempHome()
    const stale = join(home, 'image-mcp.mjs')
    installPatch({ home, serverPath: stale, nodeCommand: 'node' })
    const patchFile = resolvePatchFile(home)
    expect(readFileSync(patchFile, 'utf8')).toContain(stale.replace(/\\/g, '\\\\'))

    expect(existsSync(defaultServerPath())).toBe(true)
    expect(healServerPath({ home })).toBe(true)

    const healed = readFileSync(patchFile, 'utf8').replace(/\\\\/g, '\\')
    expect(healed).toContain(defaultServerPath())
    expect(healed).not.toContain(stale)
    // Idempotent: a second pass finds nothing to repair.
    expect(healServerPath({ home })).toBe(false)
  })

  it('leaves a healthy entry alone and does nothing when nothing is installed', () => {
    const home = tempHome()
    installPatch({ home, serverPath: defaultServerPath(), nodeCommand: 'node' })
    expect(healServerPath({ home })).toBe(false)
    expect(healServerPath({ home: tempHome() })).toBe(false)
  })
})

describe('folded YAML scalars (the desktop app re-dumps cordis.yml at 80 columns)', () => {
  // The live report said the spawn failed with ENOENT on a path ending in
  // "bin\ \node.exe". The dumper broke the long value at a separator and
  // folded the break into a SPACE, so the spawned file cannot exist.
  const BREAK = String.fromCharCode(10)
  const FOLDED = [
    '        command: "D:\\devlop\\DeepSeek',
    "          Harness\\runtime\\node\\bin\\",
    '          \\node.exe"',
  ].join(BREAK)

  it('unfolds the break and the whitespace it left beside a separator', () => {
    expect(unfoldPatchPath(`D:\\a\\bin\\${BREAK}          \\node.exe`))
      .toBe('D:\\a\\bin\\node.exe')
    expect(unfoldPatchPath(`D:\\devlop\\DeepSeek${BREAK}          Harness\\node.exe`))
      .toBe('D:\\devlop\\DeepSeek Harness\\node.exe')
    expect(isFoldedPatchText(FOLDED)).toBe(true)
    expect(isFoldedPatchText('        command: "node"')).toBe(false)
  })

  it('reports the unfolded command and repairs the block once', () => {
    const home = tempHome()
    installPatch({ home, serverPath: defaultServerPath(), nodeCommand: 'node' })
    const patchFile = resolvePatchFile(home)
    const healthy = readFileSync(patchFile, 'utf8')
    const begin = healthy.indexOf(MARK_BEGIN)
    const end = healthy.indexOf(MARK_END)
    const folded = healthy.slice(0, begin)
      + healthy.slice(begin, end).replace(/        command: ".*"/u, FOLDED)
      + healthy.slice(end)
    writeFileSync(patchFile, folded)

    expect(patchStatus({ home }).nodeCommand).not.toContain(BREAK)
    expect(healServerPath({ home })).toBe(true)
    expect(readFileSync(patchFile, 'utf8')).not.toMatch(/command: "[^"\n]*$/mu)
    expect(healServerPath({ home })).toBe(false)
  })
})
describe('selfcheck', () => {
  it('names a missing server script instead of reporting a bare exit code', async () => {
    const missing = join(tempHome(), 'not-built.mjs')
    const result = await selfcheck(process.execPath, missing)
    expect(result.ok).toBe(false)
    expect(result.error).toContain('服务器脚本不存在')
    expect(result.error).toContain('not-built.mjs')
  })
})
