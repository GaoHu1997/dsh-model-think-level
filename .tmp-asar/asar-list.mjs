// Minimal asar reader: list/extract entries whose path matches a pattern.
// Standalone (no @electron/asar dependency); asar stores files uncompressed
// with a JSON directory header at the front of the archive.
import { readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { dirname, join, resolve } from "node:path";

const archive = process.argv[2];
const pattern = new RegExp(process.argv[3] ?? ".");
const outDir = process.argv[4] ?? null;

const fd = readFileSync(archive);
// Pickle header: [uint32 payloadSize=4][uint32 headerStringSize][uint32 jsonSize]
const jsonSize = fd.readUInt32LE(12);
const headerJson = fd.subarray(16, 16 + jsonSize).toString("utf8");
const header = JSON.parse(headerJson);
const baseOffset = 8 + fd.readUInt32LE(4);

const found = [];
function walk(node, prefix) {
  for (const [name, entry] of Object.entries(node.files ?? {})) {
    const path = prefix === "" ? name : `${prefix}/${name}`;
    if (entry.files) walk(entry, path);
    else if (pattern.test(path)) found.push({ path, ...entry });
  }
}
walk(header, "");

if (outDir === null) {
  for (const entry of found) console.log(`${String(entry.size).padStart(9)}  ${entry.path}`);
  console.log(`\n${found.length} matches`);
} else {
  for (const entry of found) {
    const target = resolve(join(outDir, entry.path.replace(/^\/+/, "")));
    mkdirSync(dirname(target), { recursive: true });
    const start = baseOffset + Number(entry.offset);
    writeFileSync(target, fd.subarray(start, start + entry.size));
  }
  console.log(`extracted ${found.length} entries to ${outDir}`);
}
