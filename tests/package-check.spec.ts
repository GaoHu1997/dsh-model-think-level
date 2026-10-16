import { afterEach, describe, expect, it } from 'vitest'
import { mkdtempSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { spawnSync } from 'node:child_process'

const checker = fileURLToPath(new URL('../scripts/check-package.mjs', import.meta.url))
const directories: string[] = []
afterEach(() => {
  for (const directory of directories.splice(0)) rmSync(directory, { recursive: true, force: true })
})

function fixture() {
  const directory = mkdtempSync(join(tmpdir(), 'dsh-package-check-'))
  directories.push(directory)
  const pkg = {
    name: 'package-check-fixture', version: '1.0.0',
    main: 'lib/index.js', types: 'lib/index.d.ts',
    exports: { '.': { types: './lib/index.d.ts', default: './lib/index.js' } },
    files: ['lib/', 'README.md', 'docs/image*.png'],
    peerDependencies: { react: '^18.2.0' },
  }
  const files = new Map([
    ['lib/index.js', 'export {}'],
    ['lib/index.d.ts', "export type { ReactNode } from 'react'"],
    ['README.md', '![example](./docs/image.png)'],
    ['docs/image.png', 'fixture'],
  ])
  const run = (omitted: string[] = []) => {
    writeFileSync(join(directory, 'package.json'), JSON.stringify(pkg))
    writeFileSync(join(directory, 'screenshots.json'), JSON.stringify(['docs/image.png']))
    for (const [name, content] of files) {
      mkdirSync(dirname(join(directory, name)), { recursive: true })
      writeFileSync(join(directory, name), content)
    }
    const manifest = [{ name: pkg.name, version: pkg.version,
      files: [...files.keys()].filter(name => !omitted.includes(name)).map(path => ({ path })) }]
    writeFileSync(join(directory, 'manifest.json'), JSON.stringify(manifest))
    const result = spawnSync(process.execPath, [checker, 'manifest.json'], { cwd: directory, stdio: 'ignore' })
    if (result.error) throw result.error
    return result.status
  }
  return { directory, pkg, files, run }
}

describe('published package validation', () => {
  it('accepts complete exports, local images and declared type peers', () => {
    const { directory, run } = fixture()
    expect(run()).toBe(0)
    expect(JSON.parse(readFileSync(join(directory, 'package.json'), 'utf8')).version).toBe('1.0.0')
  })

  it('rejects screenshots excluded from the actual package', () => {
    const { run } = fixture()
    expect(run(['docs/image.png'])).toBe(1)
  })

  it('rejects an export pointing at a missing build output', () => {
    const { run } = fixture()
    expect(run(['lib/index.js'])).toBe(1)
  })

  it('rejects undeclared imports in the published type declarations', () => {
    const { files, run } = fixture()
    files.set('lib/index.d.ts', "export type Entry = import('missing-host-plugin/client').Entry")
    expect(run()).toBe(1)
  })

  it('rejects stale allowlist entries and leaked scratch files', () => {
    const { pkg, files, run } = fixture()
    pkg.files.push('docs/*.svg')
    expect(run()).toBe(1)
    pkg.files.pop()
    files.set('.deploy-backup/index.js', 'old build')
    expect(run()).toBe(1)
  })
})
