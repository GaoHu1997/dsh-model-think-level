/** Parse the stylesheet declaration so extra literals/comments cannot fool fence checks. */
import { readFileSync } from 'node:fs'
import ts from 'typescript'

const path = new URL('../src/client/styles.ts', import.meta.url)
const source = ts.createSourceFile('styles.ts', readFileSync(path, 'utf8'), ts.ScriptTarget.Latest, true)
if (source.parseDiagnostics.length > 0) {
  throw new Error(ts.formatDiagnosticsWithColorAndContext(source.parseDiagnostics, {
    getCanonicalFileName: file => file,
    getCurrentDirectory: () => process.cwd(),
    getNewLine: () => '\n',
  }))
}
const declaration = source.statements
  .filter(ts.isVariableStatement)
  .filter(statement => statement.modifiers?.some(modifier => modifier.kind === ts.SyntaxKind.ExportKeyword))
  .flatMap(statement => [...statement.declarationList.declarations])
  .find(node => ts.isIdentifier(node.name) && node.name.text === 'STYLES')
if (!declaration?.initializer || !ts.isNoSubstitutionTemplateLiteral(declaration.initializer)) {
  throw new Error('styles.ts: exported STYLES must be a single template literal without interpolation')
}
console.log('check-styles: STYLES is a valid static template literal')
