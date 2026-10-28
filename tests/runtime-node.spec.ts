/**
 * `resolveRuntimeNode()`'s four-level fallback. The MCP client spawns `command`
 * verbatim, so `process.execPath` (the Electron shell) would start a SECOND
 * Harness — every level below exists to avoid exactly that, and each is
 * existence-checked so a stale hint is skipped, not shipped.
 */

import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { resolveRuntimeNode } from '../src/image/runtime-node.js'

let home = ''

beforeEach(() => {
  home = mkdtempSync(join(tmpdir(), 'bre-runtime-node-'))
  vi.unstubAllEnvs()
})

afterEach(() => {
  rmSync(home, { recursive: true, force: true })
  vi.unstubAllEnvs()
})

/** The runtime-relative binary the resolver builds (platform-named). */
function runtimeBinary(runtimeDir: string): string {
  return join(runtimeDir, 'dependencies', 'node', 'bin', process.platform === 'win32' ? 'node.exe' : 'node')
}

describe('resolveRuntimeNode', () => {
  it('level 1 — DSH_PRIMARY_RUNTIME naming a direct binary wins', () => {
    const binary = join(home, 'my-node.exe')
    writeFileSync(binary, '', 'utf8')
    vi.stubEnv('DSH_PRIMARY_RUNTIME', binary)
    const resolved = resolveRuntimeNode(home, 'C:\\shell\\DeepSeek.exe')
    expect(resolved.command).toBe(binary)
    expect(resolved.source).toBe('env')
    expect(resolved.env).toBeUndefined()
  })

  it('level 1b — DSH_PRIMARY_RUNTIME naming a runtime DIRECTORY resolves its binary', () => {
    const runtimeDir = join(home, 'rt')
    mkdirSync(join(runtimeDir, 'dependencies', 'node', 'bin'), { recursive: true })
    writeFileSync(runtimeBinary(runtimeDir), '', 'utf8')
    vi.stubEnv('DSH_PRIMARY_RUNTIME', runtimeDir)
    const resolved = resolveRuntimeNode(home, 'C:\\shell\\DeepSeek.exe')
    expect(resolved.command).toBe(runtimeBinary(runtimeDir))
    expect(resolved.source).toBe('env')
  })

  it('a stale env hint is skipped, not shipped', () => {
    vi.stubEnv('DSH_PRIMARY_RUNTIME', join(home, 'does-not-exist'))
    const resolved = resolveRuntimeNode(home, 'C:\\shell\\DeepSeek.exe')
    expect(resolved.source).not.toBe('env')
  })

  it('level 2 — the DSH home\'s primary runtime (the desktop host\'s own path)', () => {
    const runtimeDir = join(home, 'dsh-runtimes', 'dsh-primary-runtime')
    mkdirSync(join(runtimeDir, 'dependencies', 'node', 'bin'), { recursive: true })
    writeFileSync(runtimeBinary(runtimeDir), '', 'utf8')
    const resolved = resolveRuntimeNode(home, 'C:\\shell\\DeepSeek.exe')
    expect(resolved.command).toBe(runtimeBinary(runtimeDir))
    expect(resolved.source).toBe('home')
  })

  it('level 3 — the install dir\'s bundled runtime, found beside the shell executable', () => {
    const shellDir = join(home, 'app')
    const runtimeDir = join(shellDir, 'resources', 'runtime', 'primary-runtime')
    mkdirSync(join(runtimeDir, 'dependencies', 'node', 'bin'), { recursive: true })
    writeFileSync(runtimeBinary(runtimeDir), '', 'utf8')
    const resolved = resolveRuntimeNode(home, join(shellDir, 'DeepSeek Harness.exe'))
    expect(resolved.command).toBe(runtimeBinary(runtimeDir))
    expect(resolved.source).toBe('install')
  })

  it('level 4 — the honest fallback: the running executable in ELECTRON_RUN_AS_NODE mode', () => {
    const shell = join(home, 'DeepSeek Harness.exe')
    const resolved = resolveRuntimeNode(home, shell)
    expect(resolved.command).toBe(shell)
    expect(resolved.source).toBe('exec')
    expect(resolved.env).toEqual({ ELECTRON_RUN_AS_NODE: '1' })
  })

  it('levels are tried in order: a home runtime beats the install dir', () => {
    const runtimeDir = join(home, 'dsh-runtimes', 'dsh-primary-runtime')
    mkdirSync(join(runtimeDir, 'dependencies', 'node', 'bin'), { recursive: true })
    writeFileSync(runtimeBinary(runtimeDir), '', 'utf8')
    const shellDir = join(home, 'app')
    const installRuntime = join(shellDir, 'resources', 'runtime', 'primary-runtime')
    mkdirSync(join(installRuntime, 'dependencies', 'node', 'bin'), { recursive: true })
    writeFileSync(runtimeBinary(installRuntime), '', 'utf8')
    const resolved = resolveRuntimeNode(home, join(shellDir, 'DeepSeek Harness.exe'))
    expect(resolved.source).toBe('home')
  })
})
