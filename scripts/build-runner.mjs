#!/usr/bin/env node
/* Inlines the runner bundle + a bank into one standalone HTML file.
 *
 *   node scripts/build-runner.mjs [bank.json] [-o out.html]
 *
 * The output has no dependencies and no server: open it and it runs. */

import { readFile, writeFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import { build } from 'esbuild';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const TEMPLATE = path.join(ROOT, 'app/mapam-runner.template.html');
const ENTRY = path.join(ROOT, 'src/presentation/web/main.ts');

const BANK_MARKER = '/*__EXAMPLE_BANK__*/';
const BUNDLE_MARKER = '/*__RUNNER_BUNDLE__*/';

const args = process.argv.slice(2);
const outIndex = args.findIndex((a) => a === '-o' || a === '--out');
const out = outIndex > -1 ? args[outIndex + 1] : path.join(ROOT, 'mapam-runner.html');
const bankPath =
  args.filter((a, i) => !a.startsWith('-') && i !== outIndex + 1)[0] ??
  path.join(ROOT, 'data/example-winter-2023.json');

/** JSON is embedded in a <script>, so no literal `<` may survive. */
const embed = (value) => JSON.stringify(value).replace(/</g, '\\u003c');

const [template, bank, bundled] = await Promise.all([
  readFile(TEMPLATE, 'utf8'),
  readFile(bankPath, 'utf8').then(JSON.parse),
  build({
    entryPoints: [ENTRY],
    bundle: true,
    format: 'iife',
    target: 'es2020',
    platform: 'browser',
    write: false,
    legalComments: 'none',
  }).then((result) => result.outputFiles[0].text),
]);

for (const marker of [BANK_MARKER, BUNDLE_MARKER]) {
  if (!template.includes(marker)) throw new Error(`התבנית חסרה את הסימן ${marker}`);
}

const html = template
  .replace(BANK_MARKER, `window.EXAMPLE_BANK = ${embed(bank)};`)
  .replace(BUNDLE_MARKER, bundled.replace(/<\/script/gi, '<\\/script'));

await writeFile(out, html, 'utf8');

const kb = (Buffer.byteLength(html, 'utf8') / 1024).toFixed(0);
console.log(`✓ ${path.relative(ROOT, out)} — ${kb} KB, bank: ${path.relative(ROOT, bankPath)}`);
