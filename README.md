# claude-mods

A home for my Claude Code mods: small add-ons that change how Claude Code looks or behaves. Each mod lives in its own folder under `plugins/`, and this repository is a plugin marketplace, so any mod here installs with one line.

## Mods

| Mod | What it does |
| --- | --- |
| [ooze-gauge](plugins/ooze-gauge) | A **Usage** pane showing your plan limits as one device with two glass tubes: green ooze fills the left tube with your 5-hour usage, neon-red ooze fills the right tube with your weekly usage. Each tube shows the percent used and when the limit resets. Type `/ooze` to reopen the pane. |

## Install

This repository is private: you need read access on GitHub, and your computer needs a git login for github.com (for example `gh auth login`, then `gh auth setup-git`).

At the prompt of a Claude Code terminal session:

```
/plugin install ooze-gauge --marketplace mysticbacon32/claude-mods
```

Answer `y` to add the marketplace, then press Enter to pick the user scope.

From a shell:

```
claude plugin install ooze-gauge --marketplace mysticbacon32/claude-mods
```

In the desktop app: click **+** next to the prompt box, then **Plugins**, **Add marketplace** with `mysticbacon32/claude-mods`, then **Add plugin**.

## Notes

- The canisters fill in after Claude's first reply in a session, and only on subscription plans, which have usage limits.
- The drawing shows in the desktop and mobile apps. The terminal shows two plain text bars instead.
- Motion (the moving ooze surface and rising sparks) stops when reduced motion is turned on.
