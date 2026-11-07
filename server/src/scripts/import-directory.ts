import fs from 'node:fs';
import path from 'node:path';
import { connectDb, disconnectDb } from '../db.ts';
import { importDirectory } from '../services/directory.ts';

/**
 * Loads a government list of licensed blood centres into the directory.
 *
 *   npm run import:directory -- <file.csv|file.json> [--source "label"] [--state Maharashtra] [--replace state] [--dry-run]
 *
 * --source   label shown on the site, e.g. "National Health Portal, Mar 2026" (default: the file name)
 * --state    for single-state files without a State column, such as an SBTC list
 * --replace  "source" (default) replaces earlier rows with the same label; "state" replaces every row of the states in the file
 * --dry-run  checks the file and prints what would be imported, without saving
 */
const args = process.argv.slice(2);
const file = args.find((a) => !a.startsWith('--') && !['--source', '--state', '--replace'].includes(args[args.indexOf(a) - 1] ?? ''));
const opt = (name: string) => { const i = args.indexOf(`--${name}`); return i >= 0 ? args[i + 1] : undefined; };
if (!file || !fs.existsSync(file)) {
  console.error('Usage: npm run import:directory -- <file.csv|file.json> [--source "label"] [--state Maharashtra] [--replace state] [--dry-run]');
  process.exit(1);
}

await connectDb();
try {
  const r = await importDirectory(fs.readFileSync(file, 'utf8'), {
    source: opt('source') ?? path.basename(file),
    defaultState: opt('state'),
    replace: opt('replace') === 'state' ? 'state' : 'source',
    dryRun: args.includes('--dry-run'),
  });
  console.log(`[directory] ${args.includes('--dry-run') ? 'would import' : 'imported'} ${r.total} centres (${r.skipped} rows skipped) in ${r.states.length} state(s): ${r.states.join(', ')}`);
  for (const s of r.sample) console.log(`  · ${s.name}, ${[s.district, s.state].filter(Boolean).join(', ')}${s.license ? ` · licence ${s.license}` : ''}`);
} catch (e) {
  console.error(`[directory] ${(e as Error).message}`);
  process.exitCode = 1;
} finally {
  await disconnectDb();
}
