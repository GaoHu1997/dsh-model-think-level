/**
 * Resolve the Node.js runtime the image MCP server runs on.
 *
 * The packaged install dir ships only the Electron shell (`DeepSeek Harness.exe`)
 * — there is no node.exe beside it — and the JS runtime lives under the DSH home
 * (`<DSH_HOME>/dsh-runtimes/dsh-primary-runtime/dependencies/node/bin/node.exe`,
 * the path dsh-desktop-host resolves). The MCP client spawns `command` verbatim,
 * so `process.execPath` would start a SECOND Harness instance — the failure this
 * module exists to prevent. Four levels, first existing wins; the last level is
 * the honest fallback (Electron in node mode) rather than a guess.
 *
 * @module dsh-model-think-level/image/runtime-node
 */

import { existsSync } from 'node:fs'
import { dirname, join } from 'node:path'

/** Where the resolved command came from — the status line shows it. */
export type RuntimeNodeSource =
  | 'env' // DSH_PRIMARY_RUNTIME supplied it
  | 'home' // <DSH_HOME>/dsh-runtimes/dsh-primary-runtime/...
  | 'install' // <install dir>/resources/runtime/primary-runtime/...
  | 'exec' // the running executable in ELECTRON_RUN_AS_NODE mode

export interface RuntimeNode {
  readonly command: string
  readonly source: RuntimeNodeSource
  /** Extra env the spawn needs; non-empty only for the Electron fallback. */
  readonly env?: Readonly<Record<string, string>>
}

const ELECTRON_FALLBACK_ENV = { ELECTRON_RUN_AS_NODE: '1' } as const

/** The node executable name for the current platform. */
function nodeBin(): string {
  return process.platform === 'win32' ? 'node.exe' : 'node'
}

/** The runtime-relative binary path inside a primary-runtime dir. */
function runtimeBinary(runtimeDir: string): string {
  return join(runtimeDir, 'dependencies', 'node', 'bin', nodeBin())
}

/**
 * Resolve the runtime node. Every candidate is existence-checked, so a stale
 * env var or a moved runtime dir is skipped rather than shipped to the MCP
 * client. Never throws.
 * @param home - the DSH home (defaults to the harness home).
 * @param execPath - the running executable (defaults to `process.execPath`).
 */
export function resolveRuntimeNode(
  home: string = process.env['DSH_HOME'] ?? '',
  execPath: string = process.execPath,
): RuntimeNode {
  // 1. An explicit override: DSH_PRIMARY_RUNTIME names the runtime DIR (the
  //    same shape dsh-desktop-host hands around), or a direct binary path.
  const envRuntime = process.env['DSH_PRIMARY_RUNTIME']
  if (typeof envRuntime === 'string' && envRuntime.length > 0) {
    const direct = /\.(exe|node)$/i.test(envRuntime) || !existsSync(envRuntime)
      ? envRuntime
      : runtimeBinary(envRuntime)
    if (existsSync(direct)) return { command: direct, source: 'env' }
  }
  // 2. The DSH home's primary runtime — the path the desktop host itself uses.
  if (home.length > 0) {
    const candidate = runtimeBinary(join(home, 'dsh-runtimes', 'dsh-primary-runtime'))
    if (existsSync(candidate)) return { command: candidate, source: 'home' }
  }
  // 3. The install dir's bundled runtime (a layout some distributions ship).
  if (execPath.length > 0) {
    const candidate = runtimeBinary(join(dirname(execPath), 'resources', 'runtime', 'primary-runtime'))
    if (existsSync(candidate)) return { command: candidate, source: 'install' }
  }
  // 4. The honest fallback: run the Electron binary itself in node mode. The
  //    install self-check will prove or refute it; the diagnostics line shows
  //    exactly what was chosen either way. A PATH lookup is deliberately NOT a
  //    level: it would make the result machine-dependent in a way no test can
  //    pin, and `ELECTRON_RUN_AS_NODE` is the documented equivalent.
  return { command: execPath, source: 'exec', env: ELECTRON_FALLBACK_ENV }}
