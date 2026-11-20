#!/usr/bin/env node
// spring-cleaning holding folder: deletes become moves, so they can be undone.
//   node hold.js move <path> [<path> ...]   move items into holding/<today>/<drive>/<original path>
//   node hold.js restore <held path>        move one held item back to where it came from
//   node hold.js purge <holding/YYYY-MM-DD> permanently delete one dated holding folder
// Prints JSON describing what happened. Exits non-zero if any item failed.

const fs = require('fs');
const path = require('path');
const os = require('os');

const HOLDING = path.join(os.homedir(), '.claude', 'spring-cleaning', 'holding');
const [cmd, ...items] = process.argv.slice(2);
const today = new Date().toLocaleDateString('en-CA'); // local YYYY-MM-DD
const results = [];
let failed = false;

function move(from, to) {
  fs.mkdirSync(path.dirname(to), { recursive: true });
  try { fs.renameSync(from, to); }
  catch (e) {
    if (e.code !== 'EXDEV' && e.code !== 'EPERM') throw e;
    fs.cpSync(from, to, { recursive: true, preserveTimestamps: true });
    fs.rmSync(from, { recursive: true, force: true });
  }
}

// C:\Users\x\file -> holding\2026-11-19\C\Users\x\file
function heldPathFor(original) {
  const abs = path.resolve(original);
  const parsed = path.parse(abs);
  const drive = parsed.root.replace(/[:\\/]/g, '') || '_root'; // '_root' on macOS/Linux
  return path.join(HOLDING, today, drive, abs.slice(parsed.root.length));
}

// holding\2026-11-19\C\Users\x\file -> C:\Users\x\file
function originalFor(held) {
  const rel = path.relative(HOLDING, path.resolve(held)).split(path.sep);
  if (rel.length < 3 || rel[0].startsWith('..')) throw new Error('not inside the holding folder');
  const [, drive, ...rest] = rel;
  return drive === '_root' ? path.join(path.sep, ...rest) : path.join(drive + ':' + path.sep, ...rest);
}

if (!['move', 'restore', 'purge'].includes(cmd) || !items.length) {
  console.error('Usage: node hold.js move|restore|purge <path> [...]');
  process.exit(2);
}

for (const item of items) {
  try {
    if (cmd === 'move') {
      if (!fs.existsSync(item)) throw new Error('path does not exist');
      if (path.resolve(item).toLowerCase().startsWith(HOLDING.toLowerCase())) throw new Error('already in the holding folder');
      let to = heldPathFor(item);
      if (fs.existsSync(to)) to += '-' + Date.now();
      move(item, to);
      results.push({ ok: true, from: path.resolve(item), to });
    } else if (cmd === 'restore') {
      const original = originalFor(item.replace(/-\d{13}$/, ''));
      if (fs.existsSync(original)) throw new Error(`something already exists at ${original}`);
      move(item, original);
      results.push({ ok: true, from: path.resolve(item), to: original });
    } else if (cmd === 'purge') {
      const abs = path.resolve(item);
      if (path.dirname(abs).toLowerCase() !== HOLDING.toLowerCase() || !/^\d{4}-\d{2}-\d{2}$/.test(path.basename(abs))) throw new Error('purge only accepts a dated folder directly inside the holding folder');
      fs.rmSync(abs, { recursive: true, force: true });
      results.push({ ok: true, purged: abs });
    }
  } catch (e) {
    failed = true;
    results.push({ ok: false, item, error: e.message });
  }
}
console.log(JSON.stringify(results, null, 2));
process.exit(failed ? 1 : 0);
