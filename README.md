# claude-mods

A home for my Claude Code mods: small add-ons that change how Claude Code looks or behaves. Each mod lives in its own folder under `plugins/`, and this repository is a plugin marketplace, so any mod here installs with one line.

## Mods

| Mod | What it does |
| --- | --- |
| [ooze-gauge](plugins/ooze-gauge) | A **Usage** pane showing your plan limits as two cinematic neon canisters: electric-magenta ooze fills the left canister with your weekly usage, radioactive-green ooze fills the right one with your 5-hour usage. Under each: the percent used, what's left, and a bar. Hover a canister to see when it resets. Type `/ooze` to reopen the pane. |

## Install

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

- The canisters fill in after Claude's first reply in a session, and only on subscription plans, which have usage limits. Until then each shows "—" and **NO DATA YET**; when a limit's window resets, its canister empties and shows **RESET · AWAITING UPDATE** until the next reading.
- The pane opens on its own when a session starts. It asks to sit as a small corner widget, but the desktop app decides where it goes; in testing it docked on the right.
- The drawing shows in the desktop and mobile apps. The terminal shows two plain text bars instead.
- Motion (the moving ooze surface, rising bubbles and level changes) stops when reduced motion is turned on.
- The design comes from [design/](design), which rebuilds the widget from the original V10 mock-up.

## License

[MIT](LICENSE): use, change and share these mods freely; keep the copyright notice with any copy.
