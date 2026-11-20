# claude-mods

A home for my Claude Code add-ons: skills that do a job for you, and mods that change how Claude Code looks or behaves. Each one lives in its own folder under `plugins/`, and this repository is a plugin marketplace, so anything here installs with one line.

## Skills

| Skill | What it does |
| --- | --- |
| [spring-cleaning](plugins/spring-cleaning) | Checks your Claude setup and project folders for unused skills and plugins, leftover folders, uncommitted git work, stale notes, settings clutter, old sessions and scratch files. It shows what each finding costs in tokens and storage on a savings page, then fixes only what you pick. Deletes go to a holding folder for 30 days, every run is logged with undo steps, and an optional report-only run can happen every 3 months. |

## Mods

None right now. The ooze-gauge usage pane is archived at the tag [`archive/ooze-gauge-v10`](https://github.com/mysticbacon32/claude-mods/tree/archive/ooze-gauge-v10).

## Install

Swap in the name of the skill or mod you want. At the prompt of a Claude Code terminal session:

```
/plugin install spring-cleaning --marketplace mysticbacon32/claude-mods
```

Answer `y` to add the marketplace, then press Enter to pick the user scope.

From a shell:

```
claude plugin install spring-cleaning --marketplace mysticbacon32/claude-mods
```

In the desktop app: click **+** next to the prompt box, then **Plugins**, **Add marketplace** with `mysticbacon32/claude-mods`, then **Add plugin**.

## License

[MIT](LICENSE): use, change and share these skills and mods freely; keep the copyright notice with any copy.
