#!/usr/bin/env node
// spring-cleaning fact gatherer. READ-ONLY: it never changes, moves or deletes anything.
// Usage: node gather.js [--areas skills,leftovers,git,notes,settings,sessions,clutter] [--out file.json]
// Prints (or writes) one JSON object: facts per area plus candidate findings with savings estimates.

const fs = require('fs');
const path = require('path');
const os = require('os');
const { execFileSync } = require('child_process');

// ---- Settings (change cutoffs here) ----
const CONFIG = {
  staleDays: 30,          // leftovers, notes, sessions, holding folder
  unusedSkillDays: 60,    // a switched-on skill unused this long is flagged
  bigFileMB: 50,          // files larger than this are flagged
  charsPerToken: 4,       // rough conversion for token estimates
  listingCapChars: 1536,  // Claude Code truncates description + when_to_use at this length
};

const HOME = os.homedir();
const CLAUDE = path.join(HOME, '.claude');
// Folders to scan come from config.json (written on first run). Without it, the current folder is used.
const USER_CONFIG_FILE = path.join(CLAUDE, 'spring-cleaning', 'config.json');
const USER_CONFIG = (() => { try { return JSON.parse(fs.readFileSync(USER_CONFIG_FILE, 'utf8')); } catch { return {}; } })();
const ROOTS = (Array.isArray(USER_CONFIG.projectRoots) && USER_CONFIG.projectRoots.length ? USER_CONFIG.projectRoots : [process.cwd()])
  .map(p => path.resolve(p.replace(/^~(?=$|[\\/])/, HOME)));
const LOCALAPPDATA = process.env.LOCALAPPDATA || path.join(HOME, 'AppData', 'Local');
const CLAUDE_DATA = path.join(LOCALAPPDATA, 'Claude-Data');
const TEMP_CLAUDE = path.join(os.tmpdir(), 'claude');
const STATE_DIR = path.join(CLAUDE, 'spring-cleaning');
const STATE_FILE = path.join(STATE_DIR, 'state.json');
const ALL_AREAS = ['skills', 'leftovers', 'git', 'notes', 'settings', 'sessions', 'clutter'];
const DAY = 864e5;
const NOW = Date.now();

// ---- Args ----
const args = process.argv.slice(2);
function argVal(name) { const i = args.indexOf(name); return i >= 0 ? args[i + 1] : null; }
const areas = (argVal('--areas') || ALL_AREAS.join(',')).split(',').map(s => s.trim()).filter(a => ALL_AREAS.includes(a));
const outFile = argVal('--out');

// ---- Helpers ----
const couldntCheck = [];
function safe(label, fn, fallback) {
  try { return fn(); } catch (e) { couldntCheck.push({ what: label, why: String(e.message || e).slice(0, 200) }); return fallback; }
}
function exists(p) { try { fs.accessSync(p); return true; } catch { return false; } }
function readText(p) { try { return fs.readFileSync(p, 'utf8'); } catch { return null; } }
function readJSON(p) { const t = readText(p); if (t == null) return null; try { return JSON.parse(t); } catch { return null; } }
function ls(p) { try { return fs.readdirSync(p, { withFileTypes: true }); } catch { return []; } }
function statSafe(p) { try { return fs.statSync(p); } catch { return null; } }
function lstatSafe(p) { try { return fs.lstatSync(p); } catch { return null; } }
function tokens(chars) { return Math.round(chars / CONFIG.charsPerToken); }
function daysAgo(ms) { return Math.floor((NOW - ms) / DAY); }

// Size and newest-file time of a path (follows no symlinks).
function dirInfo(p, limit = 200000) {
  let bytes = 0, files = 0, newest = 0, seen = 0;
  const stack = [p];
  while (stack.length && seen < limit) {
    const cur = stack.pop();
    const st = lstatSafe(cur);
    if (!st || st.isSymbolicLink()) continue;
    seen++;
    if (st.isDirectory()) { for (const e of ls(cur)) stack.push(path.join(cur, e.name)); }
    else { bytes += st.size; files++; if (st.mtimeMs > newest) newest = st.mtimeMs; }
  }
  return { bytes, files, newestMs: newest || (statSafe(p) || {}).mtimeMs || 0, truncated: seen >= limit };
}

// Frontmatter of a SKILL.md: name, description (single or folded line), disable flag.
function frontmatter(text) {
  const m = /^---\r?\n([\s\S]*?)\r?\n---/.exec(text || '');
  const fm = { name: null, description: '', disabled: false, userInvocable: true };
  if (!m) return fm;
  const lines = m[1].split(/\r?\n/);
  for (let i = 0; i < lines.length; i++) {
    const kv = /^([A-Za-z_-]+):\s*(.*)$/.exec(lines[i]);
    if (!kv) continue;
    const key = kv[1], val = kv[2].trim();
    if (key === 'name') fm.name = val.replace(/^["']|["']$/g, '');
    if (key === 'description' || key === 'when_to_use') {
      let v = val.replace(/^["']|["']$/g, '');
      if (v === '>' || v === '|' || v === '>-' || v === '|-' || v === '') {
        v = '';
        while (i + 1 < lines.length && /^\s+/.test(lines[i + 1])) { v += ' ' + lines[++i].trim(); }
      }
      fm.description += (fm.description ? ' ' : '') + v.trim();
    }
    if (key === 'disable-model-invocation') fm.disabled = /^true$/i.test(val);
    if (key === 'user-invocable') fm.userInvocable = !/^false$/i.test(val);
  }
  return fm;
}

function listingChars(fm) { return Math.min((fm.name || '').length + fm.description.length + 4, CONFIG.listingCapChars); }

const PUSHY = /\b(EVERY|ALWAYS|MUST|ANY prose|before ANY|1% chance)\b/;
const NON_WINDOWS = /\b(tmux|docker|launchctl|osascript|brew install|apt-get)\b/i;

// ---- Shared data: transcripts (usage, sessions, hook output) ----
let transcriptCache = null;
function transcripts() {
  if (transcriptCache) return transcriptCache;
  const files = [];
  const stack = [path.join(CLAUDE, 'projects')];
  while (stack.length) {
    const d = stack.pop();
    for (const e of ls(d)) {
      const p = path.join(d, e.name);
      if (e.isDirectory()) stack.push(p);
      else if (e.name.endsWith('.jsonl')) files.push(p);
    }
  }
  const usage = {};               // skill -> {d14,d30,d60,all,last}
  const hookOut = {};             // command -> {event, count30, chars}
  const sessions = {};            // file -> {project, lastMs}
  let earliest = Infinity;
  for (const f of files) {
    const text = readText(f);
    if (!text) continue;
    let last = 0;
    for (const line of text.split('\n')) {
      if (!line) continue;
      let o; try { o = JSON.parse(line); } catch { continue; }
      const ts = o.timestamp ? Date.parse(o.timestamp) : NaN;
      if (!isNaN(ts)) { if (ts > last) last = ts; if (ts < earliest) earliest = ts; }
      const age = isNaN(ts) ? Infinity : (NOW - ts) / DAY;
      const hit = (name) => {
        if (!name) return;
        name = String(name).replace(/^\//, '').trim();
        const u = usage[name] || (usage[name] = { d14: 0, d30: 0, d60: 0, all: 0, last: null });
        u.all++; if (age <= 14) u.d14++; if (age <= 30) u.d30++; if (age <= 60) u.d60++;
        const day = isNaN(ts) ? null : new Date(ts).toISOString().slice(0, 10);
        if (day && (!u.last || day > u.last)) u.last = day;
      };
      const c = o.message && o.message.content;
      if (Array.isArray(c)) for (const b of c) {
        if (b && b.type === 'tool_use' && b.name === 'Skill' && b.input) hit(b.input.skill);
        if (b && b.type === 'text' && o.type === 'user' && b.text) for (const m of b.text.matchAll(/<command-name>\/?([^<]+)<\/command-name>/g)) hit(m[1]);
      }
      if (typeof c === 'string' && o.type === 'user') for (const m of c.matchAll(/<command-name>\/?([^<]+)<\/command-name>/g)) hit(m[1]);
      const a = o.attachment;
      if (a && a.type === 'hook_success' && a.command && age <= 30) {
        const h = hookOut[a.command] || (hookOut[a.command] = { event: a.hookEvent, count30: 0, chars: 0 });
        h.count30++; h.chars += (a.stdout || a.content || '').length;
      }
    }
    sessions[f] = { project: path.basename(path.dirname(f)), lastMs: last || (statSafe(f) || {}).mtimeMs || 0 };
  }
  const sessions30 = Object.values(sessions).filter(s => NOW - s.lastMs <= 30 * DAY).length;
  transcriptCache = { files, usage, hookOut, sessions, sessions30, earliest: isFinite(earliest) ? new Date(earliest).toISOString().slice(0, 10) : null };
  return transcriptCache;
}

// ---- Shared data: plugins (account + local) ----
let pluginCache = null;
function plugins() {
  if (pluginCache) return pluginCache;
  const list = [];
  // Account plugins: the desktop app keeps a manifest next to the downloaded plugin folders.
  const manifests = [];
  for (const acct of ls(CLAUDE_DATA)) {
    const rpm = path.join(CLAUDE_DATA, acct.name, 'rpm');
    for (const a of ls(rpm)) for (const b of ls(path.join(rpm, a.name))) {
      const m = path.join(rpm, a.name, b.name, 'manifest.json');
      if (exists(m)) manifests.push(m);
    }
  }
  if (!manifests.length) couldntCheck.push({ what: 'account plugins', why: `no manifest.json found under ${CLAUDE_DATA}; ask the app for the plugin list instead` });
  for (const m of manifests) {
    const j = readJSON(m) || {};
    for (const p of j.plugins || []) {
      list.push({ name: p.name, scope: 'account', id: p.id, enabled: true, dir: path.join(path.dirname(m), p.id) });
    }
  }
  // Local plugins.
  const settings = readJSON(path.join(CLAUDE, 'settings.json')) || {};
  const enabled = settings.enabledPlugins || {};
  const installed = (readJSON(path.join(CLAUDE, 'plugins', 'installed_plugins.json')) || {}).plugins || {};
  for (const [key, entries] of Object.entries(installed)) {
    const e = entries[entries.length - 1] || {};
    list.push({ name: key.split('@')[0], key, scope: 'local', enabled: enabled[key] === true, dir: e.installPath, installedAt: e.installedAt });
  }
  // Skills and hooks inside each plugin.
  for (const p of list) {
    p.skills = [];
    p.hooks = [];
    p.extraCallHooks = [];
    p.nonWindows = false;
    if (!p.dir || !exists(p.dir)) { p.missingDir = true; continue; }
    for (const s of ls(path.join(p.dir, 'skills'))) {
      const f = path.join(p.dir, 'skills', s.name, 'SKILL.md');
      const t = readText(f); if (t == null) continue;
      const fm = frontmatter(t);
      p.skills.push({ name: fm.name || s.name, listingChars: fm.disabled ? 0 : listingChars(fm), bytes: Buffer.byteLength(t), pushy: PUSHY.test(fm.description), disabled: fm.disabled });
      if (NON_WINDOWS.test(t)) p.nonWindows = true;
    }
    const hookFiles = [path.join(p.dir, 'hooks', 'hooks.json')];
    const pj = readJSON(path.join(p.dir, '.claude-plugin', 'plugin.json')) || readJSON(path.join(p.dir, 'plugin.json')) || {};
    if (Array.isArray(pj.hooks)) for (const h of pj.hooks) hookFiles.push(path.join(p.dir, h));
    for (const hf of hookFiles) {
      const hj = readJSON(hf); if (!hj || !hj.hooks) continue;
      for (const [event, groups] of Object.entries(hj.hooks)) for (const g of groups || []) for (const h of g.hooks || []) {
        p.hooks.push({ event, command: h.command || '' });
        // A hook script that starts its own Claude run costs an extra model call each time it fires.
        const m = /hooks[\\/][\w.-]+/.exec(h.command || '');
        const scriptNames = (h.command || '').match(/[\w.-]+(?=\s*$)|[\w-]+\.(?:js|sh|py|cjs|mjs)/g) || [];
        let body = '';
        for (const sn of scriptNames) { const t = readText(path.join(p.dir, 'hooks', sn)); if (t) body += t; }
        if (m) { const t = readText(path.join(p.dir, m[0])); if (t) body += t; }
        if (/\bclaude\s+(--print|-p)\b/.test(body)) p.extraCallHooks.push(event);
      }
    }
  }
  pluginCache = { list, settings, enabled, installed };
  return pluginCache;
}

// Average per-session text a plugin's session-start hooks added, from recent transcripts.
function hookCharsPerSession(p) {
  const t = transcripts();
  let chars = 0;
  for (const [cmd, h] of Object.entries(t.hookOut)) {
    if (h.event !== 'SessionStart' || !h.count30) continue;
    const tail = cmd.replace(/\$\{?CLAUDE_PLUGIN_ROOT\}?|\$\{PLUGIN_ROOT[^}]*\}/g, '').slice(-60);
    if (p.hooks.some(x => x.command && (x.command.includes(tail) || tail.includes(x.command.slice(-40))))) chars += h.chars / h.count30;
  }
  return Math.round(chars);
}

// ---- Findings ----
const findings = [];
function add(f) {
  findings.push(Object.assign({
    area: null, title: '', detail: '', fix: '', label: 'safe',   // safe | careful | you
    kind: 'cost',                                                // cost | risk | accuracy | info
    paths: [],
    storageBytes: 0, storageExact: true,
    tokensPerSession: 0, tokensPerMonth: 0, tokenBasis: '', tokenNote: '',
  }, f));
}

function areaSkills() {
  const t = transcripts();
  const sessions30 = t.sessions30;
  const facts = { localSkills: [], plugins: [] };
  // Local skills.
  for (const e of ls(path.join(CLAUDE, 'skills'))) {
    const dir = path.join(CLAUDE, 'skills', e.name);
    const text = readText(path.join(dir, 'SKILL.md'));
    if (text == null) { add({ area: 'skills', title: `Skill folder "${e.name}" has no SKILL.md`, detail: 'It loads nothing and only adds clutter.', fix: `Move ${dir} to the holding folder.`, label: 'careful', paths: [dir], storageBytes: dirInfo(dir).bytes }); continue; }
    const fm = frontmatter(text);
    const name = fm.name || e.name;
    // Count uses under the plain name and any "plugin:name" form, so a skill copied out of a plugin keeps its history.
    const u = { d14: 0, d30: 0, d60: 0, all: 0, last: null };
    for (const [k, v] of Object.entries(t.usage)) {
      if (k !== name && !k.endsWith(':' + name)) continue;
      u.d14 += v.d14; u.d30 += v.d30; u.d60 += v.d60; u.all += v.all;
      if (v.last && (!u.last || v.last > u.last)) u.last = v.last;
    }
    const link = lstatSafe(dir); const isLink = link && link.isSymbolicLink();
    const s = { name, on: !fm.disabled, listingTokens: fm.disabled ? 0 : tokens(listingChars(fm)), sizeTokens: tokens(text.length), usage: u, pushy: PUSHY.test(fm.description), symlink: isLink ? safe('readlink ' + dir, () => fs.readlinkSync(dir), null) : null };
    facts.localSkills.push(s);
    if (s.on && u.d60 === 0) {
      add({ area: 'skills', title: `Local skill "${name}" is on but unused in ${CONFIG.unusedSkillDays} days`,
        detail: `Last used: ${u.last || 'never (in transcripts back to ' + (t.earliest || '?') + ')'}. Its description loads into every session.`,
        fix: `Add "disable-model-invocation: true" to ${path.join(dir, 'SKILL.md')}. It stays available as /${name}.`,
        label: 'safe', paths: [path.join(dir, 'SKILL.md')],
        tokensPerSession: s.listingTokens, tokensPerMonth: s.listingTokens * sessions30, tokenBasis: 'description length' });
    }
    if (s.on && s.pushy) {
      add({ area: 'skills', title: `Local skill "${name}" tells Claude to use it on (nearly) every task`,
        detail: `Its description uses words like EVERY/MUST/ALWAYS, so the full skill (${s.sizeTokens} tokens) loads often. Loaded ${u.d30} times in 30 days.`,
        fix: `Switch it off (disable-model-invocation) and call /${name} when wanted, or soften its description.`,
        label: 'safe', paths: [path.join(dir, 'SKILL.md')],
        tokensPerSession: 0, tokensPerMonth: s.sizeTokens * u.d30, tokenBasis: 'full skill size x loads in 30 days' });
    }
    if (s.on && NON_WINDOWS.test(text)) {
      add({ area: 'skills', title: `Local skill "${name}" needs tools that may not run on Windows`, kind: 'accuracy',
        detail: 'It mentions tmux, Docker or another Mac/Linux tool.', fix: 'Check it works here; switch it off if not.', label: 'safe', paths: [path.join(dir, 'SKILL.md')],
        tokensPerSession: s.listingTokens, tokensPerMonth: s.listingTokens * sessions30, tokenBasis: 'description length' });
    }
  }
  // Plugins.
  const P = plugins();
  const localNames = new Set(facts.localSkills.map(s => s.name));
  for (const p of P.list) {
    const skillUse = p.skills.map(s => ({ name: s.name, usage: t.usage[`${p.name}:${s.name}`] || t.usage[s.name] || { d60: 0, d30: 0, d14: 0, last: null } }));
    const used60 = skillUse.filter(s => s.usage.d60 > 0);
    const listingTok = p.enabled ? p.skills.reduce((a, s) => a + tokens(s.listingChars), 0) : 0;
    const hookTok = p.enabled ? tokens(hookCharsPerSession(p)) : 0;
    const perSession = listingTok + hookTok;
    const fact = { name: p.name, scope: p.scope, enabled: p.enabled, skills: p.skills.length, skillsUsed60: used60.map(s => s.name), hooks: [...new Set(p.hooks.map(h => h.event))], extraCallHooks: p.extraCallHooks, listingTokens: listingTok, hookTokens: hookTok, missingDir: !!p.missingDir };
    facts.plugins.push(fact);
    if (!p.enabled) continue;
    const who = p.scope === 'account' ? 'you' : 'safe';
    const how = p.scope === 'account' ? 'Remove it on the claude.ai Plugins page (Customize).' : `Set "${p.key}": false under enabledPlugins in ${path.join(CLAUDE, 'settings.json')}.`;
    if (p.extraCallHooks.length) {
      add({ area: 'skills', title: `Plugin "${p.name}" starts an extra Claude call on ${p.extraCallHooks.join(', ')}`,
        detail: 'One of its hooks runs `claude --print`, which is a separate model call each time the hook fires.', fix: how, label: who,
        tokensPerSession: perSession, tokensPerMonth: perSession * sessions30, tokenBasis: 'skill descriptions + session-start text',
        tokenNote: 'plus one extra Claude call per hook firing (not counted)' });
    } else if (p.skills.length && used60.length === 0) {
      add({ area: 'skills', title: `Plugin "${p.name}" (${p.skills.length} skill${p.skills.length > 1 ? 's' : ''}) unused in ${CONFIG.unusedSkillDays} days`,
        detail: `Hooks: ${fact.hooks.join(', ') || 'none'}.`, fix: how, label: who,
        tokensPerSession: perSession, tokensPerMonth: perSession * sessions30, tokenBasis: hookTok ? 'skill descriptions + session-start text' : 'skill descriptions' });
    } else if (p.skills.length > 3 && used60.length <= p.skills.length / 3) {
      add({ area: 'skills', title: `Plugin "${p.name}": only ${used60.length} of ${p.skills.length} skills used in ${CONFIG.unusedSkillDays} days`,
        detail: `Used: ${used60.map(s => s.name).join(', ')}. Plugins are all-or-nothing, so the unused skills still load.`,
        fix: `Copy the used skills to ${path.join(CLAUDE, 'skills')} (keep the license), then ${how.charAt(0).toLowerCase() + how.slice(1)}`, label: who,
        tokensPerSession: perSession, tokensPerMonth: perSession * sessions30, tokenBasis: 'all skill descriptions + session-start text', tokenNote: 'the copied skills keep a small cost' });
    }
    for (const s of p.skills) {
      if (!s.disabled && s.pushy && (t.usage[`${p.name}:${s.name}`] || {}).d30 > 0) {
        const n = t.usage[`${p.name}:${s.name}`].d30;
        add({ area: 'skills', title: `"${p.name}:${s.name}" tells Claude to use it on (nearly) every task`, detail: `Loaded ${n} times in 30 days.`,
          fix: how, label: who, tokensPerMonth: tokens(s.bytes) * n, tokenBasis: 'full skill size x loads in 30 days' });
      }
      if (localNames.has(s.name)) {
        add({ area: 'skills', title: `Skill "${s.name}" exists both locally and in plugin "${p.name}"`, detail: 'Both copies load.', fix: `Keep one. ${how}`, label: who,
          tokensPerSession: tokens(s.listingChars), tokensPerMonth: tokens(s.listingChars) * sessions30, tokenBasis: 'description length' });
      }
    }
    if (p.nonWindows) add({ area: 'skills', kind: 'accuracy', title: `Plugin "${p.name}" mentions tools that may not run on Windows`, detail: 'tmux, Docker or another Mac/Linux tool appears in its skills.', fix: `Check it works here. ${how}`, label: who });
  }
  return facts;
}

function knownPluginNames() {
  const P = plugins();
  const active = new Set(P.list.map(p => p.name));
  const seen = new Set();
  for (const e of ls(path.join(CLAUDE, 'plugins', 'data'))) seen.add(e.name.replace(/-(inline|[a-z0-9]+)$/, ''));
  for (const m of ls(path.join(CLAUDE, 'plugins', 'cache'))) for (const p of ls(path.join(CLAUDE, 'plugins', 'cache', m.name))) seen.add(p.name);
  const state = readJSON(STATE_FILE) || {};
  for (const n of state.removedPlugins || []) seen.add(n);
  const removed = [...seen].filter(n => !active.has(n));
  return { active, removed };
}

function walkDirs(root, maxDepth, cb) {
  const stack = [[root, 0]];
  while (stack.length) {
    const [d, depth] = stack.pop();
    for (const e of ls(d)) {
      if (!e.isDirectory() || e.name === '.git' || e.name === 'node_modules') continue;
      const p = path.join(d, e.name);
      if (cb(p, e.name, depth + 1) === false) continue;
      if (depth + 1 < maxDepth) stack.push([p, depth + 1]);
    }
  }
}

function areaLeftovers() {
  const facts = { pluginFolders: [], backups: [], empty: [] };
  const { removed, active } = knownPluginNames();
  const P = plugins();
  // Plugin work folders left in projects (".superpowers", ".impeccable", ...).
  for (const ROOT of ROOTS) walkDirs(ROOT, 4, (p, name) => {
    const bare = name.replace(/^\./, '').toLowerCase();
    if (name.startsWith('.') && removed.some(r => r.toLowerCase() === bare)) {
      const info = dirInfo(p); facts.pluginFolders.push(p);
      add({ area: 'leftovers', title: `Leftover "${name}" folder from a removed plugin`, detail: `${p} — ${info.files} files, last changed ${daysAgo(info.newestMs)} days ago.`,
        fix: 'Move it to the holding folder.', label: 'careful', paths: [p], storageBytes: info.bytes });
      return false;
    }
    if (/backup|probe-results|^tmp$|^temp$|-old$/i.test(name)) {
      const info = dirInfo(p);
      if (daysAgo(info.newestMs) >= CONFIG.staleDays) {
        facts.backups.push(p);
        add({ area: 'leftovers', title: `Old backup or test-output folder "${name}"`, detail: `${p} — ${info.files} files, untouched for ${daysAgo(info.newestMs)} days. Claude should confirm it's not still needed.`,
          fix: 'Move it to the holding folder if you no longer need it.', label: 'careful', paths: [p], storageBytes: info.bytes });
      }
      return false;
    }
    if (ls(p).length === 0) { facts.empty.push(p); add({ area: 'leftovers', title: `Empty folder "${name}"`, detail: p, fix: 'Remove it.', label: 'safe', paths: [p] }); }
  });
  // Plugin data and cache folders for plugins that are gone.
  for (const e of ls(path.join(CLAUDE, 'plugins', 'data'))) {
    const base = e.name.replace(/-(inline|[a-z0-9]+)$/, '');
    if (!active.has(base)) {
      const p = path.join(CLAUDE, 'plugins', 'data', e.name); const info = dirInfo(p);
      add({ area: 'leftovers', title: `Plugin data folder for removed plugin "${base}"`, detail: p, fix: 'Move it to the holding folder.', label: 'careful', paths: [p], storageBytes: info.bytes });
    }
  }
  const installedPaths = new Set(P.list.filter(p => p.scope === 'local').map(p => path.resolve(String(p.dir || ''))));
  for (const m of ls(path.join(CLAUDE, 'plugins', 'cache'))) for (const pl of ls(path.join(CLAUDE, 'plugins', 'cache', m.name))) {
    const p = path.join(CLAUDE, 'plugins', 'cache', m.name, pl.name);
    const live = [...installedPaths].some(ip => ip.toLowerCase().startsWith(p.toLowerCase()));
    if (!live) {
      const info = dirInfo(p);
      add({ area: 'leftovers', title: `Cached copy of uninstalled plugin "${pl.name}"`, detail: p, fix: 'Move it to the holding folder.', label: 'careful', paths: [p], storageBytes: info.bytes });
    }
  }
  // Holding-folder items past their keep date.
  for (const d of ls(path.join(STATE_DIR, 'holding'))) {
    const p = path.join(STATE_DIR, 'holding', d.name); const t = Date.parse(d.name);
    if (!isNaN(t) && NOW - t > CONFIG.staleDays * DAY) {
      add({ area: 'leftovers', title: `Holding folder from ${d.name} is past its ${CONFIG.staleDays}-day keep date`, detail: `${p}. Items here were removed in an earlier spring cleaning.`,
        fix: 'Delete it permanently (cannot be undone).', label: 'careful', paths: [p], storageBytes: dirInfo(p).bytes });
    }
  }
  return facts;
}

function areaGit() {
  const repos = [];
  for (const ROOT of ROOTS) {
    if (exists(path.join(ROOT, '.git'))) { repos.push(ROOT); continue; }
    walkDirs(ROOT, 3, (p) => { if (exists(path.join(p, '.git'))) { repos.push(p); return false; } });
  }
  const facts = [];
  for (const r of repos) {
    const out = safe('git status ' + r, () => execFileSync('git', ['-C', r, 'status', '--porcelain'], { encoding: 'utf8' }), null);
    if (out == null) continue;
    const lines = out.split('\n').filter(Boolean);
    const changed = lines.filter(l => !l.startsWith('??')).length, untracked = lines.length - changed;
    const lastIso = safe('git log ' + r, () => execFileSync('git', ['-C', r, 'log', '-1', '--format=%cI'], { encoding: 'utf8' }).trim(), '');
    const last = lastIso ? daysAgo(Date.parse(lastIso)) : null;
    facts.push({ repo: r, changed, untracked, daysSinceCommit: last });
    if (lines.length) add({ area: 'git', kind: 'risk', title: `Uncommitted work in ${path.basename(r)}`,
      detail: `${changed} changed and ${untracked} new file(s); last commit ${last == null ? 'never' : last + ' days ago'}. Files: ${lines.slice(0, 8).map(l => l.slice(3)).join(', ')}${lines.length > 8 ? ', ...' : ''}`,
      fix: 'Review the changes and commit them (no push).', label: 'careful', paths: [r] });
  }
  return { repos: facts };
}

function areaNotes() {
  const { removed } = knownPluginNames();
  const removedRe = removed.length ? new RegExp(`\\b(${removed.map(n => n.replace(/[-/\\^$*+?.()|[\]{}]/g, '\\$&')).join('|')})\\b`, 'i') : null;
  const files = [];
  for (const p of ls(path.join(CLAUDE, 'projects'))) {
    const mem = path.join(CLAUDE, 'projects', p.name, 'memory');
    for (const f of ls(mem)) if (f.name.endsWith('.md')) files.push({ file: path.join(mem, f.name), type: f.name === 'MEMORY.md' ? 'memory-index' : 'memory', dir: mem });
  }
  if (exists(path.join(CLAUDE, 'CLAUDE.md'))) files.push({ file: path.join(CLAUDE, 'CLAUDE.md'), type: 'claude-md' });
  const claudeMd = (p) => { const c = path.join(p, 'CLAUDE.md'); if (exists(c)) files.push({ file: c, type: 'claude-md' }); };
  for (const ROOT of ROOTS) { claudeMd(ROOT); walkDirs(ROOT, 2, claudeMd); }
  const facts = { files: files.length, fieldGuideUrl: null };
  for (const f of files) {
    const text = readText(f.file) || '';
    if (!facts.fieldGuideUrl) { const m = /Field Guide[\s\S]{0,300}?(https:\/\/claude\.ai\/artifact\/[A-Za-z0-9]+)/.exec(text); if (m) facts.fieldGuideUrl = m[1]; }
    // Memory index lines pointing at missing notes.
    if (f.type === 'memory-index') for (const m of text.matchAll(/\]\(([^)]+\.md)\)/g)) {
      if (!exists(path.join(f.dir, m[1]))) add({ area: 'notes', kind: 'accuracy', title: `Memory index points to a missing note "${m[1]}"`, detail: f.file, fix: 'Remove that line from MEMORY.md.', label: 'safe', paths: [f.file] });
    }
    // Absolute Windows paths that no longer exist.
    // Paths can contain spaces ("My Projects"), so take the rest of the line and try ever-shorter
    // versions (dropping trailing words); the path counts as present if any version exists.
    const seenPaths = new Set();
    for (const m of text.matchAll(/[A-Z]:\\[^`"'<>|*?\r\n]+/g)) {
      const words = m[0].split(' ');
      const clean = s => s.replace(/[\\.,;:)\]]+$/, '');
      if (/[<{]|\.\.\./.test(words[0])) continue;
      let found = false;
      for (let k = Math.min(words.length, 8); k >= 1 && !found; k--) if (exists(clean(words.slice(0, k).join(' ')))) found = true;
      const shown = clean(words[0]);
      if (!found && !seenPaths.has(shown)) {
        seenPaths.add(shown);
        add({ area: 'notes', kind: 'accuracy', title: `Note mentions a path that no longer exists`, detail: `${f.file} mentions ${shown}${words.length > 1 ? ' (the path may continue past a space)' : ''}`, fix: 'Update or remove the reference.', label: 'safe', paths: [f.file] });
      }
    }
    // Mentions of plugins that are no longer installed (Claude judges if it's a real problem).
    if (removedRe) {
      const hits = [...new Set((text.match(new RegExp(removedRe.source, 'gi')) || []).map(s => s.toLowerCase()))];
      if (hits.length) add({ area: 'notes', kind: 'accuracy', title: `${path.basename(f.file)} mentions removed plugin(s): ${hits.join(', ')}`, detail: `${f.file}. Some mentions may be fine (for example a folder still named after a plugin); Claude should check each.`, fix: 'Update the wording where it describes the plugin as current.', label: 'safe', paths: [f.file] });
    }
    // Status notes that look stale.
    if (f.type === 'memory' && /\b(in progress|next step|status|todo|pending)\b/i.test(text)) {
      const age = daysAgo((statSafe(f.file) || {}).mtimeMs || NOW);
      if (age >= CONFIG.staleDays) add({ area: 'notes', kind: 'accuracy', title: `Status note unchanged for ${age} days: ${path.basename(f.file)}`, detail: f.file, fix: 'Claude checks whether it still describes reality and updates or removes it.', label: 'safe', paths: [f.file] });
    }
  }
  return facts;
}

function areaSettings() {
  const P = plugins();
  const s = P.settings;
  for (const [key, on] of Object.entries(P.enabled)) {
    if (on === false && P.installed[key]) {
      const e = P.installed[key][P.installed[key].length - 1] || {};
      add({ area: 'settings', title: `Plugin "${key}" is installed but switched off`, detail: `Installed ${(e.installedAt || '').slice(0, 10)}.`, fix: `Uninstall it with "claude plugin uninstall ${key}" if you no longer need it.`, label: 'careful', storageBytes: e.installPath ? dirInfo(e.installPath).bytes : 0, paths: e.installPath ? [e.installPath] : [] });
    }
  }
  const usedMarkets = new Set(Object.keys(P.installed).map(k => k.split('@')[1]));
  for (const m of Object.keys(s.extraKnownMarketplaces || {})) {
    if (!usedMarkets.has(m)) add({ area: 'settings', title: `Plugin source "${m}" is registered but nothing installed uses it`, detail: path.join(CLAUDE, 'settings.json'), fix: `Remove "${m}" from extraKnownMarketplaces.`, label: 'safe', paths: [path.join(CLAUDE, 'settings.json')] });
  }
  const permFiles = [path.join(CLAUDE, 'settings.local.json')];
  const projSettings = (p) => { for (const n of ['settings.json', 'settings.local.json']) { const f = path.join(p, '.claude', n); if (exists(f)) permFiles.push(f); } };
  for (const ROOT of ROOTS) { projSettings(ROOT); walkDirs(ROOT, 2, projSettings); }
  const facts = { permissionFiles: [] };
  for (const f of permFiles) {
    const j = readJSON(f); if (!j || !j.permissions) continue;
    const allow = j.permissions.allow || [];
    const oneOff = allow.filter(r => !/\*/.test(r) && /["'\\/]|\d{3,}/.test(r));
    facts.permissionFiles.push({ file: f, allow: allow.length, oneOff });
    if (oneOff.length) add({ area: 'settings', title: `${oneOff.length} one-off permission approval(s) in ${path.basename(path.dirname(path.dirname(f)))}`,
      detail: `${f}: ${oneOff.slice(0, 6).join(' | ')}${oneOff.length > 6 ? ' | ...' : ''}`, fix: 'Remove approvals for single old commands.', label: 'safe', paths: [f] });
  }
  return facts;
}

function areaSessions() {
  const t = transcripts();
  const byProject = {};
  for (const s of Object.values(t.sessions)) {
    const p = byProject[s.project] || (byProject[s.project] = { total: 0, stale: 0 });
    p.total++; if (NOW - s.lastMs > CONFIG.staleDays * DAY) p.stale++;
  }
  // Archiving status lives in the app, so Claude confirms with its session tools before suggesting anything.
  return { byProject, note: 'Counts come from transcript files. Use the session list tool to see which are still in the sidebar (not archived) before suggesting archives.' };
}

function areaClutter() {
  const facts = { sizes: {} };
  const t = transcripts();
  const proj = dirInfo(path.join(CLAUDE, 'projects'));
  facts.sizes.transcripts = proj.bytes;
  add({ area: 'clutter', kind: 'info', title: `Session transcripts: ${t.files.length} files`, detail: `${path.join(CLAUDE, 'projects')}. Kept on purpose: usage counts and episodic-memory search rely on them.`, fix: 'None (never deleted).', label: 'safe', storageBytes: proj.bytes });
  for (const sub of ['file-history', 'shell-snapshots', 'debug', 'todos', 'paste-cache']) {
    const p = path.join(CLAUDE, sub); if (!exists(p)) continue;
    const info = dirInfo(p); facts.sizes[sub] = info.bytes;
  }
  // Old per-session scratch folders.
  let scratchBytes = 0; const oldScratch = [];
  for (const a of ls(TEMP_CLAUDE)) for (const b of ls(path.join(TEMP_CLAUDE, a.name))) {
    const p = path.join(TEMP_CLAUDE, a.name, b.name); const info = dirInfo(p);
    if (daysAgo(info.newestMs) >= CONFIG.staleDays) { scratchBytes += info.bytes; oldScratch.push(p); }
  }
  facts.sizes.oldScratch = scratchBytes;
  if (oldScratch.length) add({ area: 'clutter', title: `${oldScratch.length} old session scratch folder(s)`, detail: `Under ${TEMP_CLAUDE}, untouched for ${CONFIG.staleDays}+ days. Temporary files from finished sessions${scratchBytes ? '' : ' (all empty)'}.`, fix: 'Move them to the holding folder.', label: 'safe', paths: oldScratch, storageBytes: scratchBytes });
  // Big files.
  const limit = CONFIG.bigFileMB * 1024 * 1024;
  for (const root of [...ROOTS, CLAUDE]) {
    const stack = [root];
    while (stack.length) {
      const d = stack.pop();
      for (const e of ls(d)) {
        const p = path.join(d, e.name);
        if (e.isDirectory()) { if (e.name !== '.git' && e.name !== 'node_modules') stack.push(p); continue; }
        const st = statSafe(p);
        if (st && st.size > limit) add({ area: 'clutter', title: `Large file: ${e.name} (${Math.round(st.size / 1048576)} MB)`, detail: `${p}, last changed ${daysAgo(st.mtimeMs)} days ago.`, fix: 'Move it to the holding folder if you no longer need it.', label: 'careful', paths: [p], storageBytes: st.size });
      }
    }
  }
  return facts;
}

// ---- Run ----
const runners = { skills: areaSkills, leftovers: areaLeftovers, git: areaGit, notes: areaNotes, settings: areaSettings, sessions: areaSessions, clutter: areaClutter };
const facts = {};
for (const a of areas) facts[a] = safe(`area ${a}`, runners[a], null);

const t = (areas.includes('skills') || areas.includes('sessions') || areas.includes('clutter')) ? transcripts() : null;
findings.forEach((f, i) => { f.id = i + 1; });
const totals = findings.reduce((acc, f) => { acc.storageBytes += f.storageBytes || 0; acc.tokensPerSession += f.tokensPerSession || 0; acc.tokensPerMonth += f.tokensPerMonth || 0; return acc; }, { storageBytes: 0, tokensPerSession: 0, tokensPerMonth: 0 });
// Transcripts are info only and never removed, so leave them out of the storage total.
totals.storageBytes -= findings.filter(f => f.kind === 'info').reduce((a, f) => a + f.storageBytes, 0);

const result = {
  generatedAt: new Date().toISOString(),
  areas, config: CONFIG,
  paths: { claude: CLAUDE, projectRoots: ROOTS, logFile: USER_CONFIG.logFile || null, configFile: exists(USER_CONFIG_FILE) ? USER_CONFIG_FILE : null, stateDir: STATE_DIR, holding: path.join(STATE_DIR, 'holding') },
  usageBasis: t ? { sessionsLast30Days: t.sessions30, transcriptFiles: t.files.length, transcriptsSince: t.earliest } : null,
  totals, findings, facts, couldntCheck,
};
const json = JSON.stringify(result, null, 2);
if (outFile) { fs.writeFileSync(outFile, json); console.log(`Wrote ${findings.length} findings to ${outFile}`); }
else process.stdout.write(json + '\n');
