---
name: spring-cleaning
description: Check the Claude setup and project folders for clutter and drift (unused skills and plugins, leftover folders, uncommitted git work, stale notes, settings, old sessions, scratch files), show what each finding costs in tokens and storage, and fix only what the user picks. Every delete is undoable for 30 days.
disable-model-invocation: true
---

# Spring cleaning

Find clutter and drift, show what it costs, fix only what the user picks, log everything, and make every delete undoable.

## Paths

`<skill>` means this skill's base directory, which is shown when the skill loads. `~` is the user's home folder.

| What | Where |
|---|---|
| Scripts | `<skill>/gather.js`, `render.js`, `hold.js`, `template.html` |
| Settings: folders to scan, log location | `~/.claude/spring-cleaning/config.json` |
| State: savings page link, schedule, removed plugins | `~/.claude/spring-cleaning/state.json` |
| Last run's findings | `~/.claude/spring-cleaning/last-findings.json` |
| Holding folder (undoable deletes) | `~/.claude/spring-cleaning/holding/<YYYY-MM-DD>/` |
| Change log | `logFile` in config.json; default `~/.claude/spring-cleaning/spring-cleaning-log.md` |

Run the scripts with `node "<skill>/<script>"`. They work from any folder.

## First run: setup

If `config.json` doesn't exist, ask the user two things before step 0:
1. **Which folders hold their projects?** Offer the current folder's parent and the current folder as options.
2. **Where should the change log live?** Default `~/.claude/spring-cleaning/spring-cleaning-log.md`; a folder they back up is a good alternative.

Then write the file:

```json
{ "projectRoots": ["~/path/to/projects"], "logFile": "~/path/to/spring-cleaning-log.md" }
```

## Which kind of run

Read the user's words (or the scheduled prompt) first:

- **"Scheduled run"** in the prompt → follow **Scheduled runs** below. Ask nothing.
- **"fix from the last report"** → skip to step 4, using `last-findings.json` and its numbers.
- **"undo item N"** (or "undo the last spring cleaning") → follow **Undo** below.
- **"schedule spring cleaning"** / "stop the schedule" → follow **Schedule** below.
- Otherwise → a normal run, starting at step 0.

## A normal run

### 0. Choose

Ask with the question tool: **Full run** or **Choose areas**.

If **Choose areas**, ask again with two multi-select questions in one call:
- **Claude setup:** Skills and plugins (`skills`), Settings files (`settings`), Notes drift (`notes`), Old sessions (`sessions`)
- **Folders:** Leftover files (`leftovers`), Uncommitted git work (`git`), Scratch and transcript clutter (`clutter`)

### 1. Gather

```
node "<skill>/gather.js" --areas <comma list> --out "<scratchpad>/spring-cleaning-findings.json"
```

Omit `--areas` for a full run. The script only reads. Its JSON has `findings` (candidates with savings estimates), `facts` per area, `usageBasis` and `couldntCheck`.

### 2. Look closer

The script flags candidates; you decide what's real. Edit the findings file directly, keeping its schema. Each finding has `area`, `title`, `detail`, `fix`, `label` (`safe` | `careful` | `you`), `kind` (`cost` | `risk` | `accuracy` | `info`), `paths`, `storageBytes`, `tokensPerSession`, `tokensPerMonth`, `tokenBasis`, `tokenNote`.

- **Drop false positives.** For example, a note that mentions `docs/superpowers/specs` is a folder name still in use, not a stale plugin reference. Read the file before deciding.
- **Sharpen the wording.** Say what the user would recognize, in plain language.
- **Add what the script can't see:**
  - **Notes drift in a reference page:** if `facts.notes.fieldGuideUrl` is set (a claude.ai artifact link found in CLAUDE.md or memory), read it with the Artifact tool (`action: "read"`). Flag places that describe removed plugins or skills as current.
  - **Old sessions:** list sessions with the session-management list tool, if available. Flag sessions that aren't archived and haven't been touched for 30+ days. The label is `safe`, the fix is "Archive it" (never delete), and there are no token or storage numbers.
  - **Account skills:** if a skills list tool is available, flag account skills that are switched on but that the user has said they don't use. These are `you` items.
  - **Never flag** this skill's own folder, `~/.claude/spring-cleaning/` or the change log.
- **Renumber `id` from 1** in display order after editing.
- Then copy the file to `last-findings.json`.

### 3. Report

1. Build the savings page:
   ```
   node "<skill>/render.js" "<scratchpad>/spring-cleaning-findings.json" "<scratchpad>/spring-cleaning-report.html" --mode "Full run"
   ```
   (`--mode "Chosen areas"` when areas were chosen.)
2. Publish it with the Artifact tool, if available. If `state.json` has an `artifactUrl`, publish with that `url` (read it first if this conversation hasn't). Otherwise publish new with `icon: "broom"` and save the returned link as `artifactUrl` in `state.json`.
3. In chat, give:
   - one line with the totals (tokens per session, tokens per month, storage), and the page link
   - a numbered list grouped by area, one line per finding: number, label, title, savings
   - the closing question: which numbers to fix ("do 1, 3, 5", "all safe ones", or "none")

Keep it scannable. The page has the detail.

### 4. You pick

Wait for the user's numbers. Never change anything before this.

### 5. Fix and confirm

Before any **careful** item, list exactly what will be deleted or committed and get one yes for the batch.

| Fix | How |
|---|---|
| Switch off a local skill | Add `disable-model-invocation: true` inside the SKILL.md frontmatter. |
| Delete a file or folder | `node "<skill>/hold.js" move "<path>" ...`. Never `rm`. Record each `from` → `to`. |
| Permanently remove an old holding folder | `node "<skill>/hold.js" purge "<holding/YYYY-MM-DD>"`. Only when that exact item was picked. |
| Commit git work | Read the diff, `git -C <repo> add <the listed files>`, then commit with a clear message in the repo's style, plus any co-author line the current instructions require. Never push, amend or skip hooks. |
| Edit a settings file | Edit the JSON by hand. Keep a copy of the original lines for the log. |
| Uninstall a switched-off local plugin | `claude plugin uninstall <key>`. Note the key for the log. |
| Fix a note | Edit the note so it describes reality. |
| Archive a session | The session-management archive tool. |
| Account plugin or skill (`you`) | Tell the user exactly what to switch off and where (claude.ai: the Plugins page, or Customize > Skills). |

After each fix, check it worked (the file changed, the folder moved, `git status` is clean, and so on). If a fix fails, report the error for that item and carry on with the rest.

### 6. Log

Add an entry at the **top** of the change log (create the file if missing, with the title `# Spring cleaning log`):

```
## YYYY-MM-DD HH:MM — Full run | Chosen areas (<areas>) | Scheduled run

Savings page: <link> · Totals: <tokens/session>, <tokens/month>, <storage>

| # | Finding | Label | Picked | Result | To undo |
|---|---|---|---|---|---|
| 1 | ... | safe | yes | Switched off (added disable-model-invocation) | Remove that line from <path>/SKILL.md |
| 4 | ... | careful | yes | Moved <from> → <holding path> | `node "<skill>/hold.js" restore "<holding path>"` |
| 6 | ... | careful | yes | Committed abc1234 in <repo> | `git -C <repo> revert abc1234` |
| 7 | ... | you | — | User to remove in claude.ai | Re-add it in claude.ai |
| 9 | ... | safe | no | — | — |
```

Then set `lastRun` in `state.json` to the current date and time.

### 7. Offer a schedule (once)

If `state.json` has no `scheduledTaskId` and `scheduleOffered` is not true, and a scheduled-task tool is available, ask once whether to run a report-only spring cleaning every 3 months. Set `scheduleOffered` to true either way. On yes, follow **Schedule**.

## Scheduled runs

The prompt contains "Scheduled run". No one is there to choose or approve, so:

1. Run `gather.js` for all areas, then do step 2 (look closer).
2. Build and publish the savings page with `--mode "Scheduled run"`. If the Artifact tool isn't available, skip it and say so in the log.
3. Copy the findings to `last-findings.json`.
4. Add a log entry marked **Scheduled run, nothing changed**, with every finding listed and "Picked" set to "—".
5. Finish with one short message: the number of findings, the totals, the page link, and "Run /spring-cleaning and say 'fix from the last report' to pick fixes."

Never change, move, delete, commit or archive anything in a scheduled run.

## Schedule

- **Create:** use the scheduled-task create tool with:
  - `taskId: "spring-cleaning"`, title "Spring cleaning (every 3 months)"
  - `cronExpression: "0 9 1 */3 *"`: 9 AM on the 1st of January, April, July and October, local time
  - `prompt`: "Scheduled run of /spring-cleaning. Follow <full path to this SKILL.md>, section 'Scheduled runs'. Report only; change nothing." (Write the real path in.)

  Save the task id as `scheduledTaskId` in `state.json`. Tell the user it runs while the app is open, or at the next launch if the app was closed.
- **Change or stop:** use the scheduled-task update or delete tool, then update `state.json`.

## Undo

1. Read the change log and find the entry and row. "The last spring cleaning" means the top entry.
2. Follow its **To undo** step: restore a held item with `hold.js restore`, remove an added line, revert a commit with a new commit, put back the original settings lines, or unarchive a session.
3. Check it worked, then add a short entry at the top of the log: "Undid item N from <date>: <what>".

## Rules

- Nothing changes before the user picks, and scheduled runs never change anything.
- Deletes go to the holding folder. Only `hold.js purge` removes for good, and only for a holding folder the user picked.
- Session transcripts are measured, never deleted. Usage counts and conversation-search tools depend on them.
- Account plugins and skills are reported for the user to change.
- Sessions are archived, never deleted.
- Token figures are estimates (characters ÷ 4) of what gets loaded, not what's billed. Say so if asked. Storage figures are exact.
- When a plugin is removed in a run, add its name to `removedPlugins` in `state.json`, so later runs can spot its leftovers.
- Cutoffs (30 days, 60 days, 50 MB) live in `CONFIG` at the top of `gather.js`.
