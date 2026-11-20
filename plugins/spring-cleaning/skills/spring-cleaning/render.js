#!/usr/bin/env node
// Builds the savings page from a findings JSON file.
//   node render.js <findings.json> <out.html> [--mode "Full run"|"Chosen areas"|"Scheduled run"]
const fs = require('fs');
const path = require('path');

const [input, output] = process.argv.slice(2);
const modeIdx = process.argv.indexOf('--mode');
if (!input || !output) { console.error('Usage: node render.js <findings.json> <out.html> [--mode ...]'); process.exit(2); }

const data = JSON.parse(fs.readFileSync(input, 'utf8'));
if (modeIdx > 0) data.mode = process.argv[modeIdx + 1];
// Keep only what the page shows, and make the JSON safe to embed in a <script>.
const slim = {
  generatedAt: data.generatedAt, mode: data.mode, areas: data.areas, config: data.config,
  usageBasis: data.usageBasis, couldntCheck: data.couldntCheck, findings: data.findings,
};
const json = JSON.stringify(slim).replace(/</g, '\\u003c').replace(new RegExp('\\u2028', 'g'), '\\u2028').replace(new RegExp('\\u2029', 'g'), '\\u2029');
const template = fs.readFileSync(path.join(__dirname, 'template.html'), 'utf8');
if (!template.includes('/*__DATA__*/null')) { console.error('template.html is missing the /*__DATA__*/null marker'); process.exit(1); }
fs.writeFileSync(output, template.replace('/*__DATA__*/null', json));
console.log(`Wrote ${output} (${data.findings.length} findings)`);
