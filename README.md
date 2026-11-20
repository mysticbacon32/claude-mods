# claude-mods

A home for my Claude Code add-ons: skills that do a job for you, and mods that change how Claude Code looks or behaves. Each one lives in its own folder under `plugins/`, and this repository is a plugin marketplace, so anything here installs with one line.

## Skills

| Skill | What it does |
| --- | --- |
| [spring-cleaning](plugins/spring-cleaning) | Checks your Claude setup and project folders for unused skills and plugins, leftover folders, uncommitted git work, stale notes, settings clutter, old sessions and scratch files. It shows what each finding costs in tokens and storage on a savings page, then fixes only what you pick. Deletes go to a holding folder for 30 days, every run is logged with undo steps, and an optional report-only run can happen every 3 months. |

## Mods

| Mod | What it does |
| --- | --- |
| [ooze-gauge](plugins/ooze-gauge) | A **Usage** pane showing your plan limits as one device with two glass tubes: green ooze fills the left tube with your 5-hour usage, neon-red ooze fills the right tube with your weekly usage. Each tube shows the percent used and when the limit resets. Type `/ooze` to reopen the pane. |

## Install

Swap in the name of the skill or mod you want (`spring-cleaning`, `ooze-gauge`). At the prompt of a Claude Code terminal session:

```
/plugin install ooze-gauge --marketplace mysticbacon32/claude-mods
```

Answer `y` to add the marketplace, then press Enter to pick the user scope.

From a shell:

```
claude plugin install ooze-gauge --marketplace mysticbacon32/claude-mods
```

In the desktop app: click **+** next to the prompt box, then **Plugins**, **Add marketplace** with `mysticbacon32/claude-mods`, then **Add plugin**.

## Notes on ooze-gauge

- The canisters fill in after Claude's first reply in a session, and only on subscription plans, which have usage limits.
- The drawing shows in the desktop and mobile apps. The terminal shows two plain text bars instead.
- Motion (the moving ooze surface and rising sparks) stops when reduced motion is turned on.

## License

[MIT](LICENSE): use, change and share these skills and mods freely; keep the copyright notice with any copy.
