/**
 * The boot-time migration: the retired image-MCP server's patch entry is
 * spliced out of the profile's cordis.patch.yml — and only that byte range, so
 * third-party marker blocks sharing the file survive untouched.
 */

import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { dirname, join } from 'node:path'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { MARK_BEGIN, MARK_END, removeLegacyImageMcpPatch, resolveLegacyPatchFile } from '../src/image/legacy-cleanup.js'
import { IMAGE_MCP_PATCH_ID } from '../src/constants.js'

let home = ''
let patchFile: string

beforeEach(() => {
  home = mkdtempSync(join(tmpdir(), 'bre-image-legacy-'))
  patchFile = join(home, 'profiles', 'web', 'cordis.patch.yml')
  mkdirSync(dirname(patchFile), { recursive: true })
  process.env['DSH_PROFILE'] = 'web'
})

afterEach(() => {
  delete process.env['DSH_PROFILE']
  rmSync(home, { recursive: true, force: true })
})

/** The marker block the retired installer wrote. */
function legacyBlock(): string {
  return [
    MARK_BEGIN,
    '- insert:',
    `    - id: ${IMAGE_MCP_PATCH_ID}`,
    '      name: "@deepseek-ai/dsh-mcp-client"',
    '      config:',
    '        serverName: dsh-image',
    '        transport: stdio',
    MARK_END,
    '',
  ].join('\n')
}

/** The same entry with the comment lines stripped (a panel re-serialized it). */
function markerlessBlock(): string {
  return [
    '- insert:',
    `    - id: ${IMAGE_MCP_PATCH_ID}`,
    '      name: "@deepseek-ai/dsh-mcp-client"',
    '      config:',
    '        serverName: dsh-image',
    '        transport: stdio',
    '',
  ].join('\n')
}

/** A third-party marker block that shares the file (the skill-mcp-panel precedent). */
function foreignBlock(): string {
  return [
    '# >>> some-other-plugin:begin',
    '- insert:',
    '    - id: other-plugin-row',
    '      name: other-plugin',
    '# <<< some-other-plugin:end',
    '',
  ].join('\n')
}

describe('removeLegacyImageMcpPatch', () => {
  it('splices exactly the marker block out, keeping foreign entries byte-identical', () => {
    writeFileSync(patchFile, ['- insert:', '    - id: keep-me', '      name: keep-me', '', legacyBlock(), foreignBlock()].join('\n'))
    const removed = removeLegacyImageMcpPatch(home, patchFile)
    expect(removed).toBe(patchFile)
    const after = readFileSync(patchFile, 'utf8')
    expect(after).not.toContain(MARK_BEGIN)
    expect(after).not.toContain(IMAGE_MCP_PATCH_ID)
    expect(after).toContain('keep-me')
    expect(after).toContain(foreignBlock())
    // The pre-write rollback copy exists.
    expect(existsSync(`${patchFile}.bak`)).toBe(true)
    expect(readFileSync(`${patchFile}.bak`, 'utf8')).toContain(MARK_BEGIN)
  })

  it('is idempotent: an absent block reports "nothing removed" and leaves the file alone', () => {
    writeFileSync(patchFile, foreignBlock())
    expect(removeLegacyImageMcpPatch(home, patchFile)).toBeUndefined()
    expect(readFileSync(patchFile, 'utf8')).toBe(foreignBlock())
  })

  it('an absent file is a no-op, not an error', () => {
    expect(removeLegacyImageMcpPatch(home, patchFile)).toBeUndefined()
  })

  it('a markerless leftover written by a third-party panel is still removed', () => {
    // The panel re-serializes the document and drops the comment lines: the
    // entry survives without markers, so the marker splice alone cannot see it.
    const header = ['- insert:', '    - id: keep-me', '      name: keep-me', ''].join('\n')
    writeFileSync(patchFile, header + markerlessBlock() + ['- id: after-me', '  name: after-me', ''].join('\n'))
    expect(removeLegacyImageMcpPatch(home, patchFile)).toBe(patchFile)
    const after = readFileSync(patchFile, 'utf8')
    expect(after).not.toContain(IMAGE_MCP_PATCH_ID)
    expect(after).toBe(header + ['- id: after-me', '  name: after-me', ''].join('\n'))
  })

  it('a markerless top-level bare row is removed as well', () => {
    const header = ['- id: keep-me', '  name: keep-me', ''].join('\n')
    const bare = ['- id: dsh-image-mcp', '  name: "@deepseek-ai/dsh-mcp-client"', ''].join('\n')
    writeFileSync(patchFile, header + bare)
    expect(removeLegacyImageMcpPatch(home, patchFile)).toBe(patchFile)
    expect(readFileSync(patchFile, 'utf8')).toBe(header)
  })

  it('a markerless insert list that also carries a foreign row is left alone', () => {
    const mixed = ['- insert:', '    - id: dsh-image-mcp', '      name: "@deepseek-ai/dsh-mcp-client"', '    - id: theirs', '      name: theirs', ''].join('\n')
    writeFileSync(patchFile, mixed)
    expect(removeLegacyImageMcpPatch(home, patchFile)).toBeUndefined()
    expect(readFileSync(patchFile, 'utf8')).toBe(mixed)
  })

  it('an unrelated markerless insert list naming another plugin is left alone', () => {
    const other = ['- insert:', '    - id: other-plugin-row', '      name: other-plugin', ''].join('\n')
    writeFileSync(patchFile, other)
    expect(removeLegacyImageMcpPatch(home, patchFile)).toBeUndefined()
    expect(readFileSync(patchFile, 'utf8')).toBe(other)
  })

  it('a foreign block that reuses the marker lines but not our id is untouched', () => {
    const foreign = [MARK_BEGIN, '- insert:', '    - id: someone-elses', '      name: x', MARK_END, ''].join('\n')
    writeFileSync(patchFile, foreign)
    expect(removeLegacyImageMcpPatch(home, patchFile)).toBeUndefined()
    expect(readFileSync(patchFile, 'utf8')).toBe(foreign)
  })

  it('the trailing blank seam goes with the block: the file reads as before the install', () => {
    const before = ['- insert:', '    - id: keep-me', '      name: keep-me', ''].join('\n')
    writeFileSync(patchFile, before + legacyBlock())
    removeLegacyImageMcpPatch(home, patchFile)
    expect(readFileSync(patchFile, 'utf8')).toBe(before)
  })

  it('resolveLegacyPatchFile honors DSH_PROFILE over mtime guessing', () => {
    expect(resolveLegacyPatchFile(home)).toBe(patchFile)
  })

  it('without DSH_PROFILE the most recently touched profile wins', () => {
    delete process.env['DSH_PROFILE']
    const older = join(home, 'profiles', 'web', 'cordis.patch.yml')
    const newer = join(home, 'profiles', 'desktop', 'cordis.patch.yml')
    mkdirSync(dirname(newer), { recursive: true })
    writeFileSync(older, foreignBlock())
    writeFileSync(newer, foreignBlock())
    expect(resolveLegacyPatchFile(home)).toBe(newer)
  })

  it('a home-level patch layer is found when no profile carries one', () => {
    delete process.env['DSH_PROFILE']
    rmSync(join(home, 'profiles'), { recursive: true, force: true })
    const topLevel = join(home, 'cordis.patch.yml')
    writeFileSync(topLevel, legacyBlock())
    expect(resolveLegacyPatchFile(home)).toBe(topLevel)
    expect(removeLegacyImageMcpPatch(home)).toBe(topLevel)
    expect(readFileSync(topLevel, 'utf8')).not.toContain(MARK_BEGIN)
  })
})
