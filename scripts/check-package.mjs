/** Check what npm will ship, after a successful build. No registry access required. */
import { readFileSync } from 'node:fs'
import ts from 'typescript'

const manifestPath = process.argv[2]
if (!manifestPath) throw new Error('Usage: npm run check:package (build first)')
const pkg = JSON.parse(readFileSync('package.json', 'utf8'))
const packs = JSON.parse(readFileSync(manifestPath, 'utf8').replace(/^\uFEFF/, ''))
if (packs.length !== 1 || packs[0].name !== pkg.name || packs[0].version !== pkg.version) {
  throw new Error('Package manifest does not match the current package name/version')
}
const shipped = new Set(packs[0].files.map(file => file.path))
const failures = []
const requireFile = (file, origin) => {
  const normalized = file.replace(/^\.\//, '')
  if (!shipped.has(normalized)) failures.push(`${origin}: missing ${normalized}`)
}
const globPattern = (pattern) => new RegExp('^' + pattern
  .replace(/[.+?^${}()|[\]\\]/g, '\\$&').replace(/\*/g, '[^/]*') + '$')

// Catch files allowlist entries that silently stopped matching after a refactor.
for (const entry of pkg.files ?? []) {
  const match = globPattern(entry)
  if (![...shipped].some(file => entry.endsWith('/') ? file.startsWith(entry) : match.test(file))) {
    failures.push(`files: ${entry} matches nothing in the package`)
  }
}
const checkExport = (value) => {
  if (typeof value === 'string') {
    if (value.includes('*')) {
      if (![...shipped].some(file => globPattern(value.replace(/^\.\//, '')).test(file))) {
        failures.push(`exports: ${value} matches nothing in the package`)
      }
    } else requireFile(value, 'exports')
  } else if (value && typeof value === 'object') Object.values(value).forEach(checkExport)
}
checkExport(pkg.exports)
for (const key of ['main', 'types', 'icon']) if (pkg[key]) requireFile(pkg[key], key)

const readme = readFileSync('README.md', 'utf8')
for (const match of readme.matchAll(/!\[[^\]]*\]\((?:<([^>]+)>|([^\s)]+))(?:\s+[^)]*)?\)/g)) {
  const image = match[1] ?? match[2]
  if (!/^(?:[a-z]+:|\/|#)/i.test(image)) requireFile(image.split(/[?#]/)[0], 'README image')
}
for (const screenshot of JSON.parse(readFileSync('screenshots.json', 'utf8'))) {
  requireFile(screenshot, 'screenshots')
}

// Every package referenced by published declarations must have a consumer contract.
// Optional host peers remain optional: this check does not install host plugins.
const declared = new Set(Object.keys({ ...pkg.dependencies, ...pkg.peerDependencies }))
for (const file of shipped) {
  if (!file.endsWith('.d.ts')) continue
  const source = ts.createSourceFile(file, readFileSync(file, 'utf8'), ts.ScriptTarget.Latest, true)
  const checkSpecifier = (specifier) => {
    if (!specifier || specifier.startsWith('.') || specifier.startsWith('node:')) return
    const parts = specifier.split('/')
    const name = parts[0].startsWith('@') ? parts.slice(0, 2).join('/') : parts[0]
    if (!declared.has(name)) failures.push(`${file}: undeclared type dependency ${name}`)
  }
  const visit = (node) => {
    if ((ts.isImportDeclaration(node) || ts.isExportDeclaration(node))
      && node.moduleSpecifier && ts.isStringLiteral(node.moduleSpecifier)) {
      checkSpecifier(node.moduleSpecifier.text)
    } else if (ts.isImportTypeNode(node) && ts.isLiteralTypeNode(node.argument)
      && ts.isStringLiteral(node.argument.literal)) {
      checkSpecifier(node.argument.literal.text)
    } else if (ts.isModuleDeclaration(node) && ts.isStringLiteral(node.name)) {
      checkSpecifier(node.name.text)
    }
    ts.forEachChild(node, visit)
  }
  visit(source)
}
for (const file of shipped) {
  if (/^(?:\.tmp|\.audit|\.deploy-backup|node_modules|tests|src)(?:\/|[-_.])/.test(file)) {
    failures.push(`unexpected development artifact: ${file}`)
  }
}
if (failures.length) throw new Error(`Package validation failed:\n${[...new Set(failures)].join('\n')}`)
console.log(`check-package: ${shipped.size} files; exports, screenshots and declaration dependencies verified`)
