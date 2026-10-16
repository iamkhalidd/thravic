#!/usr/bin/env node
// Copies the shared design tokens and logos from packages/ui into each app.
//
//   node scripts/sync-ui.mjs          copy them
//   node scripts/sync-ui.mjs --check  only report copies that are out of date
//                                     (exits 1), for a pre-commit hook or CI
//
// The apps deploy on their own (Vercel builds one app folder at a time), so
// each keeps a real copy instead of reaching outside its folder.

import { existsSync, mkdirSync, readFileSync, readdirSync, writeFileSync } from 'node:fs';
import { dirname, join, relative } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const ui = join(root, 'packages', 'ui');
const apps = ['apps/web', 'apps/admin'];
const check = process.argv.includes('--check');

const copies = [];
for (const app of apps) {
    copies.push([join(ui, 'tokens.css'), join(root, app, 'src', 'styles', 'tokens.css')]);
    for (const logo of readdirSync(join(ui, 'logos'))) {
        copies.push([join(ui, 'logos', logo), join(root, app, 'public', logo)]);
    }
}

let stale = 0;
for (const [from, to] of copies) {
    const want = readFileSync(from);
    const have = existsSync(to) ? readFileSync(to) : null;
    if (have && have.equals(want)) continue;
    stale++;
    if (check) {
        console.error(`out of date: ${relative(root, to)}`);
    } else {
        mkdirSync(dirname(to), { recursive: true });
        writeFileSync(to, want);
        console.log(`updated ${relative(root, to)}`);
    }
}

if (check && stale) {
    console.error('Run `node scripts/sync-ui.mjs` to copy packages/ui into the apps.');
    process.exit(1);
}
if (!stale) console.log('Shared styles and logos are up to date.');
