/** Build the zero-dependency image MCP server: src/image/mcp-server.ts → lib/image-mcp.mjs. */
import { build } from 'esbuild'

await build({
  entryPoints: ['src/image/mcp-server.ts'],
  bundle: true,
  format: 'esm',
  platform: 'node',
  target: 'es2022',
  sourcemap: false,
  // The subprocess gets the runtime node, not a package tree: everything is
  // inlined, node builtins stay external (they exist in any node).
  external: ['node:*'],
  outfile: 'lib/image-mcp.mjs',
  banner: {
    // The ESM shim the runtime node needs when the file is invoked directly.
    js: '#!/usr/bin/env node',
  },
})
console.log('built lib/image-mcp.mjs')
