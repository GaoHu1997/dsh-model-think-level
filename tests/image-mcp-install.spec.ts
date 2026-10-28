/**
 * The image MCP install lifecycle over `cordis.patch.yml`: the `- insert:`
 * structure (the loader skips a bare `- id:`), idempotent replacement, the
 * `.bak` rollback copy, surgical removal beside third-party marker blocks,
 * the mtime-fenced retry, refusals that leave the original file intact, and
 * the status the config page renders.
 */

import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import {
  MARK_BEGIN,
  MARK_END,
  installPatch,
  isPatchInstalled,
  markerBlock,
  patchStatus,
  resolvePatchFile,
  uninstallPatch,
  validatePatchText,
} from '../src/image/mcp-install.js'
import { IMAGE_MCP_PATCH_ID, IMAGE_MCP_SERVER_NAME } from '../src/constants.js'

let home = ''
let patchFile = ''

beforeEach(() => {
  home = mkdtempSync(join(tmpdir(), 'bre-mcp-install-'))
  patchFile = join(home, 'profiles', 'desktop', 'cordis.patch.yml')
  mkdirSync(join(home, 'profiles', 'desktop'), { recursive: true })
})

afterEach(() => {
  rmSync(home, { recursive: true, force: true })
  vi.restoreAllMocks()
})

const NODE = '/rt/node'
const SERVER = '/p/lib/image-mcp.mjs'

function install(): void {
  installPatch({ home, patchFile, nodeCommand: NODE, serverPath: SERVER })
}

/** A third-party block, byte-for-byte the shape the local profile carries. */
const THIRD_PARTY = [
  '# >>> dsh-skill-mcp-panel:mcp:begin',
  '- insert:',
  '    - id: panel-mcp-obsidian_mcp',
  '      name: "@deepseek-ai/dsh-mcp-client"',
  '      config:',
  '        serverName: obsidian_mcp',
  '        transport: stdio',
  '# <<< dsh-skill-mcp-panel:mcp:end',
  '',
].join('\n')

describe('markerBlock', () => {
  it('wraps the entry in an `- insert:` list (the loader skips a bare `- id:`)', () => {
    const block = markerBlock({ home, nodeCommand: NODE, serverPath: SERVER })
    expect(block).toContain(MARK_BEGIN)
    expect(block).toContain(MARK_END)
    expect(block).toContain('- insert:')
    expect(block).toContain(`- id: ${IMAGE_MCP_PATCH_ID}`)
    expect(block).toContain('"@deepseek-ai/dsh-mcp-client"')
    expect(block).toContain(`serverName: ${IMAGE_MCP_SERVER_NAME}`)
    // Backslashes survive as YAML escapes, so a Windows path stays one scalar.
    expect(markerBlock({ home, nodeCommand: 'C:\\rt\\node.exe', serverPath: SERVER })).toContain('C:\\\\rt\\\\node.exe')
    // No tab anywhere: the patch file is whitespace-sensitive YAML.
    expect(block.includes('\t')).toBe(false)
  })

  it('carries the config path and the home in the explicit env (the subprocess reads both)', () => {
    const block = markerBlock({ home, nodeCommand: NODE, serverPath: SERVER })
    expect(block).toContain('DSH_IMAGE_CONFIG:')
    expect(block).toContain(join(home, 'dsh-model-think-level', 'image.json').replace(/\\/g, '\\\\'))
    expect(block).toContain('DSH_HOME:')
    // No secret ever rides the env line: only paths do.
    expect(block.toLowerCase()).not.toContain('api_key')
  })
})

describe('installPatch', () => {
  it('creates the profile patch file with the block when none exists', () => {
    install()
    expect(existsSync(patchFile)).toBe(true)
    expect(isPatchInstalled(patchFile)).toBe(true)
    const text = readFileSync(patchFile, 'utf8')
    expect(text.indexOf(MARK_BEGIN)).toBeLessThan(text.indexOf('- insert:'))
  })

  it('is idempotent: reinstalling replaces the whole block (exactly one marker pair)', () => {
    install()
    const first = readFileSync(patchFile, 'utf8')
    installPatch({ home, patchFile, nodeCommand: `${NODE}x`, serverPath: SERVER })
    const second = readFileSync(patchFile, 'utf8')
    expect(second.split(MARK_BEGIN)).toHaveLength(2)
    expect(second.split(MARK_END)).toHaveLength(2)
    expect(second).toContain(`command: "${NODE}x"`)
    expect(second).not.toContain(`command: "${NODE}"
`)
    // Everything outside our block stayed byte-identical.
    const strip = (text: string): string => text.slice(text.indexOf(MARK_END) + MARK_END.length)
    expect(strip(second)).toBe(strip(first))
  })

  it('splices around third-party marker blocks without touching them', () => {
    writeFileSync(patchFile, THIRD_PARTY, 'utf8')
    install()
    const text = readFileSync(patchFile, 'utf8')
    expect(text).toContain(THIRD_PARTY.trimEnd())
    expect(isPatchInstalled(patchFile)).toBe(true)
    // And the third-party block survives OUR uninstall too.
    expect(uninstallPatch({ home, patchFile })).toBe(patchFile)
    expect(readFileSync(patchFile, 'utf8')).toBe(THIRD_PARTY)
    expect(isPatchInstalled(patchFile)).toBe(false)
  })

  it('leaves a .bak the first time it modifies an existing file', () => {
    writeFileSync(patchFile, THIRD_PARTY, 'utf8')
    install()
    expect(existsSync(`${patchFile}.bak`)).toBe(true)
    expect(readFileSync(`${patchFile}.bak`, 'utf8')).toBe(THIRD_PARTY)
  })

  it('retries when the file moves between the read and the write (third-party write wins the race, we still land)', async () => {
    writeFileSync(patchFile, THIRD_PARTY, 'utf8')
    // Simulate a third-party writer landing between our read and the fence
    // check: the FIRST fence stat on the patch file mutates the file, so the
    // mtime no longer matches and the attempt retries on fresh bytes.
    const { raceOnce } = await import('../src/image/mcp-install.js') as { raceOnce?: (file: string) => void }
    let races = 0
    const { mcpInstallTestHooks } = await import('../src/image/mcp-install.js') as {
      mcpInstallTestHooks?: { race: (file: string, mutate: () => void) => void }
    }
    void raceOnce
    expect(mcpInstallTestHooks).toBeDefined()
    mcpInstallTestHooks!.race(patchFile, () => {
      races += 1
      writeFileSync(patchFile, `${THIRD_PARTY}# touch from another plugin\n`, 'utf8')
    })
    install()
    expect(races).toBe(1)
    const text = readFileSync(patchFile, 'utf8')
    expect(isPatchInstalled(patchFile)).toBe(true)
    expect(text).toContain('# touch from another plugin')
  })

  it('refuses to install over a same-named server entry outside our block — the original file stays', () => {
    // A hand- or third-party-written entry that already claims serverName
    // dsh-image: registering ours beside it would collide on the
    // mcp__dsh-image__* tool namespace.
    const hostile = [
      '- insert:',
      '    - id: someone-elses-image-mcp',
      '      name: "@deepseek-ai/dsh-mcp-client"',
      '      config:',
      '        serverName: dsh-image',
      '        transport: stdio',
      '',
    ].join('\n')
    writeFileSync(patchFile, hostile, 'utf8')
    expect(() => install()).toThrow(/已存在同名的 MCP 服务器条目/)
    expect(readFileSync(patchFile, 'utf8')).toBe(hostile)
    expect(isPatchInstalled(patchFile)).toBe(false)
  })

  it('refuses to write when the result would be malformed — the original file stays', () => {
    // A hand-broken file: our begin marker with no end (a truncated past edit).
    const broken = `${THIRD_PARTY}${MARK_BEGIN}\n- insert:\n`
    writeFileSync(patchFile, broken, 'utf8')
    expect(() => install()).toThrow(/refusing to write/)
    expect(readFileSync(patchFile, 'utf8')).toBe(broken)
  })
})

describe('uninstallPatch', () => {
  it('removes only the marker block, idempotently', () => {
    writeFileSync(patchFile, THIRD_PARTY, 'utf8')
    install()
    expect(uninstallPatch({ home, patchFile })).toBe(patchFile)
    // Uninstalling again is a no-op (undefined = nothing changed).
    expect(uninstallPatch({ home, patchFile })).toBeUndefined()
  })

  it('returns undefined on a file that never carried the block', () => {
    expect(uninstallPatch({ home, patchFile })).toBeUndefined()
  })
})

describe('patchStatus', () => {
  it('derives from the file: installed, tool name, and the stored command/server', () => {
    expect(patchStatus({ home, patchFile }).installed).toBe(false)
    install()
    const status = patchStatus({ home, patchFile })
    expect(status.installed).toBe(true)
    expect(status.serverName).toBe(IMAGE_MCP_SERVER_NAME)
    expect(status.toolName).toBe(`mcp__${IMAGE_MCP_SERVER_NAME}__generate_image`)
    expect(status.nodeCommand).toBe(NODE)
    expect(status.serverPath).toBe(SERVER)
    expect(status.malformed).toBe(false)
  })

  it('flags a malformed block (an entry the loader would skip)', () => {
    writeFileSync(patchFile, [
      MARK_BEGIN,
      `- id: ${IMAGE_MCP_PATCH_ID}`, // NOT wrapped in - insert:
      MARK_END,
      '',
    ].join('\n'), 'utf8')
    const status = patchStatus({ home, patchFile })
    expect(status.installed).toBe(true)
    expect(status.malformed).toBe(true)
  })
})

describe('resolvePatchFile', () => {
  it('honours an explicit profile, then env, then the freshest profile, then defaults', () => {
    // The suite may run under a harness that exports DSH_PROFILE (the plugin's
    // own host does): this test asserts the UNSET fallback chain, so clear it
    // first and restore it after.
    const ambient = process.env['DSH_PROFILE']
    delete process.env['DSH_PROFILE']
    try {
      expect(resolvePatchFile(home, 'tauri')).toBe(join(home, 'profiles', 'tauri', 'cordis.patch.yml'))
      vi.stubEnv('DSH_PROFILE', 'web')
      expect(resolvePatchFile(home)).toBe(join(home, 'profiles', 'web', 'cordis.patch.yml'))
      vi.unstubAllEnvs()
      // Auto-detect: the most recently touched profile wins.
      mkdirSync(join(home, 'profiles', 'web'), { recursive: true })
      writeFileSync(join(home, 'profiles', 'desktop', 'cordis.patch.yml'), '- []\n', 'utf8')
      writeFileSync(join(home, 'profiles', 'web', 'cordis.patch.yml'), '- []\n', 'utf8')
      const detected = resolvePatchFile(home)
      expect([join(home, 'profiles', 'desktop', 'cordis.patch.yml'), join(home, 'profiles', 'web', 'cordis.patch.yml')])
        .toContain(detected)
      // No profile carries a patch file, no home layer: the desktop default.
      rmSync(join(home, 'profiles'), { recursive: true, force: true })
      expect(resolvePatchFile(home)).toBe(join(home, 'profiles', 'desktop', 'cordis.patch.yml'))
      // A home-level patch layer (headless compositions) is used when present.
      writeFileSync(join(home, 'cordis.patch.yml'), '- []\n', 'utf8')
      expect(resolvePatchFile(home)).toBe(join(home, 'cordis.patch.yml'))
    } finally {
      if (ambient === undefined) delete process.env['DSH_PROFILE']
      else process.env['DSH_PROFILE'] = ambient
    }
  })
})

describe('validatePatchText', () => {
  it('accepts the module\'s own block and rejects duplicates, tabs, and missing pieces', () => {
    const good = markerBlock({ home, nodeCommand: NODE, serverPath: SERVER })
    expect(validatePatchText(good)).toBeUndefined()
    // Zero blocks is the uninstalled state — valid.
    expect(validatePatchText(THIRD_PARTY)).toBeUndefined()
    expect(validatePatchText(`${good}${good}`)).toMatch(/marker block appears/)
    expect(validatePatchText(good.replace('- insert:', '- id: x'))).toMatch(/- insert:/)
    expect(validatePatchText(good.replace(`serverName: ${IMAGE_MCP_SERVER_NAME}`, 'serverName: other'))).toMatch(/does not name the server/)
  })
})
