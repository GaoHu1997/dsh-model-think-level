/**
 * Plugin display-metadata declarations.
 *
 * The Host reads these without activating the plugin, and every miss falls
 * back SILENTLY — a card that loses its icon or its localized title reports
 * nothing. So the declarations, the files they point at, and the publication
 * list that has to carry those files are pinned together here.
 *
 * The ceilings and shapes mirror the author contract in the official
 * `docs/cookbook/adding-a-package.md` ("Add optional plugin display metadata");
 * this spec asserts the declarations, not a reimplementation of the Host's
 * reader.
 */

import { readFileSync, statSync } from 'node:fs'
import { describe, expect, it } from 'vitest'

const root = new URL('../', import.meta.url)
const read = (path: string): string => readFileSync(new URL(path, root), 'utf8')

/** One dictionary's `meta` object, exactly as the Host's reader digs it out. */
const metaOf = (language: string): Record<string, unknown> | undefined =>
  (JSON.parse(read(`locale/${language}.json`)) as { meta?: Record<string, unknown> }).meta

/** The Host's icon ceiling, in bytes. */
const ICON_BYTE_LIMIT = 256 * 1024

const manifest = JSON.parse(read('package.json')) as {
  icon?: string
  exports?: Record<string, unknown>
  files?: readonly string[]
}

describe('plugin display metadata', () => {
  it('declares an icon the published manifest also carries', () => {
    expect(manifest.icon).toBe('./icon.svg')
    expect(manifest.files).toContain('icon.svg')
  })

  it('exports the locale entry the Host looks up first', () => {
    expect(manifest.exports?.['./locale/*.json']).toBe('./locale/*.json')
    expect(manifest.files).toContain('locale/*.json')
  })

  it('keeps both dictionaries non-empty and JSON-parseable', () => {
    for (const language of ['en', 'zh']) {
      const meta = metaOf(language)
      // `readPluginMeta` reads exactly two display fields out of a dictionary:
      // `meta.title` and `meta.description`. A field it does not know is dead
      // weight; a non-string one is worse than dead weight, because `textOf`
      // throws and the reader then returns that error INSTEAD of the display
      // text — one bad value costs the card both its title and its description.
      expect(Object.keys(meta ?? {}).every(key => key === 'title' || key === 'description')).toBe(true)
      for (const value of Object.values(meta ?? {})) {
        expect(typeof value).toBe('string')
        expect((value as string).trim()).not.toBe('')
      }
    }
  })

  it('carries the Chinese card title and its matching English description', () => {
    // `localizedText` seeds the `en` slot from `manifest.name` the moment ANY
    // dictionary declares `title`, so a Chinese-only title is enough: English
    // keeps showing the raw package name while 中文 gets the friendly one.
    expect(metaOf('zh')?.title).toBe('模型思考等级')
    expect(metaOf('en')?.title).toBeUndefined()
    // The English blurb fell behind once request headers and the composer rows
    // shipped, so pin that both languages still describe the current feature set.
    expect(String(metaOf('en')?.description)).toContain('request headers')
    expect(String(metaOf('zh')?.description)).toContain('自定义请求头')
  })

  it('keeps the icon self-contained and under the Host byte ceiling', () => {
    const source = read('icon.svg')
    expect(source).toMatch(/<svg[\s>]/)
    expect(statSync(new URL('icon.svg', root)).size).toBeLessThanOrEqual(ICON_BYTE_LIMIT)
    // Rendered as an image: it reaches nothing outside its own file.
    expect(source).not.toMatch(/(?:xlink:)?href\s*=\s*["'](?:https?:|\/\/|\.\.)/)
  })
})
