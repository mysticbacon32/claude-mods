# spring-cleaning

A Claude Code skill that checks your Claude setup and project folders for clutter and drift. It shows what each finding costs in tokens and storage, then fixes only the items you pick. Every delete can be undone for 30 days.

## What it checks

You can run all seven areas or choose some of them.

| Area | What it flags |
| --- | --- |
| **Skills and plugins** | Where each skill lives and whether it's on; 14/30/60-day usage from your session history; hooks; skills that tell Claude to load them on every task; duplicates; tools that may not run on your system; skills unused for 60 days |
| **Leftover files** | Folders left behind by removed plugins, old backups and test output, empty folders, and holding-folder items past their 30 days |
| **Uncommitted git work** | Changed and new files in every git repo under your project folders |
| **Notes drift** | Memory notes and CLAUDE.md files that point to missing paths, missing notes or removed plugins, and status notes that haven't changed in 30+ days |
| **Settings files** | Plugins installed but switched off, plugin sources nothing uses, and one-off permission approvals |
| **Old sessions** | Sessions untouched for 30+ days that could be archived |
| **Scratch and transcript clutter** | Old scratch folders, large files, and how much space transcripts use (measured, never deleted) |

## How a run goes

1. **Choose.** A full run, or pick areas.
2. **Gather.** A read-only script collects the facts.
3. **Look closer.** Claude reads the actual files and drops false alarms.
4. **Savings page.** A private claude.ai artifact lists every finding with its estimated tokens per session and per month, plus exact storage. It's updated at the same link each run.
5. **You pick.** Reply with numbers: "do 1, 3, 5" or "all safe ones".
6. **Fix and confirm.** Claude does only those and checks each one worked. Deletes and commits are confirmed once more first.
7. **Log.** Every run is written to a change log, with the steps to undo each change.

Each finding is labeled **safe** (easy to undo), **careful** (a delete or a commit), or **you** (an account change only you can make on claude.ai).

## Safety

- Nothing changes until you pick.
- Deletes move to a holding folder (`~/.claude/spring-cleaning/holding/<date>/`) for 30 days. To undo, say "undo item 3 from the last spring cleaning".
- Commits are never pushed. A commit is undone with a new commit that reverses it, never by rewriting history.
- Session transcripts are never deleted, because usage counts and conversation search rely on them.
- Sessions are archived, never deleted.

## Optional schedule

After the first run, it offers to run every 3 months (9 AM on the 1st of January, April, July and October) as a desktop app scheduled task. Scheduled runs are report-only: they update the savings page and the log, change nothing, and send you a summary. To act on one, run the skill and say "fix from the last report".

## Install

**As a plugin**, from this marketplace:

```
claude plugin install spring-cleaning --marketplace mysticbacon32/claude-mods
```

In the desktop app: click **+** next to the prompt box, then **Plugins**, **Add marketplace** with `mysticbacon32/claude-mods`, then **Add plugin**.

**As a plain skill:** copy `skills/spring-cleaning/` into `~/.claude/skills/`.

The skill is switched off by default (`disable-model-invocation: true`), so it costs nothing until you run it. As a plain skill, run it with `/spring-cleaning`. As a plugin, skills are named after their plugin, so look for `spring-cleaning` in the `/` menu.

## First run

It asks two questions and saves the answers to `~/.claude/spring-cleaning/config.json`:

```json
{ "projectRoots": ["~/Projects"], "logFile": "~/.claude/spring-cleaning/spring-cleaning-log.md" }
```

- `projectRoots`: the folders that hold your projects. Subfolders are scanned up to a few levels deep.
- `logFile`: where the change log lives. A folder you back up is a good choice.

## Requirements

- Claude Code with Node.js on your path.
- `git` for the git check.
- Built and tested on Windows. The scripts use cross-platform paths, but the macOS and Linux paths for desktop-app plugins aren't confirmed yet. If those can't be found, the report lists them under "Couldn't check".

## About the numbers

- **Token figures are estimates:** text length ÷ 4 characters per token. They show what gets loaded into each session, not what you're billed. Prompt caching makes the billed effect smaller.
- **Monthly figures** multiply the per-session cost by your real session count over the last 30 days.
- **Storage figures are exact** file sizes.
- **Some findings are about risk or accuracy,** not cost: uncommitted work, notes that no longer match, and hooks that start extra Claude calls. The page shows these without a number.

## Files

| File | Job |
| --- | --- |
| `SKILL.md` | The instructions Claude follows |
| `gather.js` | Read-only fact collector; cutoffs live in `CONFIG` at the top |
| `render.js` + `template.html` | Build the savings page |
| `hold.js` | Moves deletes into the holding folder, restores them, and purges old holding folders |

## License

[MIT](LICENSE)
