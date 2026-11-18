import { atom, read, update } from 'claude-code'
import type { EngineInterface, Register } from 'claude-code'

import type { Gauge } from '../types'
import { WIDGET_SVG } from './widget-svg.js'

// The drawing is the approved Claude Capacity V10 design, kept as its own
// component: widget-svg.ts holds V10's markup, CSS and animation as one
// pure-vector SVG, with the artwork traced to paths (the app leaves embedded
// pictures blank). design/build_widget.py generates it from the original V10
// HTML. This module only fills in real usage.

// The app refuses a drawn tree past 100,000 serialized characters (quotes
// count twice, as \"). Stay under this, or draw the text fallback instead.
export const TREE_BUDGET = 95_000

// V10's geometry, in the template's units (V10 laid out 320 px wide).
const ART_W = 320
const ART_H = 280.02
const VIAL_BOTTOM = 187.84
const VIAL_H = 120.59

const round2 = (n: number) => Math.round(n * 100) / 100
const clamp = (p: number) => Math.max(0, Math.min(100, Number(p) || 0))

const escape = (text: string) =>
  text.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;')

function resetLabel(iso: string | undefined, isWeekly: boolean): string {
  if (iso === undefined) {
    return ''
  }
  const at = new Date(iso)
  if (Number.isNaN(at.getTime())) {
    return ''
  }
  try {
    return isWeekly
      ? at.toLocaleString(undefined, { weekday: 'short', hour: 'numeric', minute: '2-digit' })
      : at.toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit' })
  } catch {
    return iso.slice(0, 16).replace('T', ' ')
  }
}

// Time left until a reset, as the caption shows it: "4D 6H", "2H 14M", "9M",
// "<1M". Whole minutes, rounded down, so it never claims more time than is left.
export function untilLabel(ms: number): string {
  const minutes = Math.floor(ms / 60_000)
  if (minutes < 1) {
    return '<1M'
  }
  const d = Math.floor(minutes / 1440)
  const h = Math.floor((minutes % 1440) / 60)
  const m = minutes % 60
  if (d > 0) {
    return `${d}D ${h}H`
  }
  return h > 0 ? `${h}H ${m}M` : `${m}M`
}

// What one canister shows: a live reading, a window that has reset since the
// last reading, or no reading at all.
type Side = { level: number; value: string; reset: string; tip: string }

export function side(name: string, g: Gauge | undefined, now: number, isWeekly: boolean): Side {
  if (g === undefined) {
    return { level: 0, value: '—', reset: 'NO DATA YET', tip: `${name}: no reading yet; shows after Claude's next reply` }
  }
  const resetAt = g.resetsAt === undefined ? NaN : new Date(g.resetsAt).getTime()
  if (!Number.isNaN(resetAt) && resetAt <= now) {
    return { level: 0, value: '—', reset: 'RESET · UPDATES SOON', tip: `${name}: the window reset; the new reading comes with Claude's next reply` }
  }
  const p = clamp(g.percentUsed)
  const when = resetLabel(g.resetsAt, isWeekly)
  return {
    level: p,
    value: `${Math.round(p)}%`,
    reset: Number.isNaN(resetAt) ? 'RESET TIME UNKNOWN' : `RESETS IN ${untilLabel(resetAt - now)}`,
    tip: `${name}: ${Math.round(p)}% used${when ? `, resets ${when}` : ''}`,
  }
}

const levelOf = (g: Gauge | undefined, now: number, isWeekly: boolean) => side('', g, now, isWeekly).level

// Fills the V10 template: liquid height, the percentage inside each canister,
// the reset countdown and tooltips, and where each level moves from.
export function fillCapacity(
  template: string,
  list: readonly Gauge[],
  previous: readonly Gauge[],
  now: number,
): string {
  const values: Record<string, string> = {}
  const sides: [string, string, string, boolean][] = [
    ['WEEK', 'seven_day', 'Weekly limit', true],
    ['FIVE', 'five_hour', '5-hour limit', false],
  ]
  for (const [key, kind, name, isWeekly] of sides) {
    const s = side(name, list.find(g => g.kind === kind), now, isWeekly)
    const from = levelOf(previous.find(g => g.kind === kind), now, isWeekly)
    const h = round2((VIAL_H * s.level) / 100)
    const h0 = round2((VIAL_H * from) / 100)
    values[`${key}_FH`] = `${h}`
    values[`${key}_FY`] = `${round2(VIAL_BOTTOM - h)}`
    values[`${key}_FH0`] = `${h0}`
    values[`${key}_FY0`] = `${round2(VIAL_BOTTOM - h0)}`
    values[`${key}_VALUE`] = escape(s.value)
    values[`${key}_RESET`] = escape(s.reset)
    values[`${key}_TIP`] = escape(s.tip)
  }
  return template.replace(/\{\{([A-Z0-9_]+)\}\}/g, (whole, name: string) => values[name] ?? whole)
}

// Usage state, kept for the session; change a tag when Gauge's fields change.
const gauges = atom({ plugin: 'ooze-gauge', key: 'gauges' } as const, [], { shape: 'gauges-1' })
const previous = atom({ plugin: 'ooze-gauge', key: 'previous' } as const, [], { shape: 'gauges-1' })
// Bumped once a minute so the reset countdown redraws.
const minute = atom({ plugin: 'ooze-gauge', key: 'minute' } as const, 0, { shape: 'minute-1' })

type Reading = { kind: string; percentUsed: number; resetsAt?: string }

const pick = (list: readonly Reading[]): Gauge[] =>
  list
    .filter(g => g.kind === 'five_hour' || g.kind === 'seven_day')
    .map(g =>
      g.resetsAt === undefined
        ? { kind: g.kind, percentUsed: g.percentUsed }
        : { kind: g.kind, percentUsed: g.percentUsed, resetsAt: g.resetsAt },
    )

const bar = (p: number, cells: number) => {
  const filled = Math.round((clamp(p) / 100) * cells)
  return '█'.repeat(filled) + '░'.repeat(cells - filled)
}

const PANE = 'ooze-gauge'
const TITLE = 'Usage'

let resetTimer: { cancel: () => void } | undefined
let ticker: { cancel: () => void } | undefined

// Stores a new reading, keeping the old one to animate from. Readings arrive
// with Claude's replies (session.measure), so nothing here polls.
async function store($: EngineInterface, list: readonly Reading[]): Promise<void> {
  const fresh = pick(list)
  const old = await read($, gauges)
  if (JSON.stringify(old) === JSON.stringify(fresh)) {
    return
  }
  await update($, previous, () => old)
  await update($, gauges, () => fresh)
  await schedule($, fresh)
}

// Wakes once at the next window reset, so the canister shows it on time.
async function schedule($: EngineInterface, list: readonly Gauge[]): Promise<void> {
  resetTimer?.cancel()
  resetTimer = undefined
  const now = await $.clock.now()
  const times = list
    .map(g => (g.resetsAt === undefined ? NaN : new Date(g.resetsAt).getTime()))
    .filter(t => !Number.isNaN(t) && t > now)
  if (times.length === 0) {
    return
  }
  try {
    resetTimer = $.clock.after(Math.min(...times) - now + 1000, () => {
      void onReset($)
    })
  } catch {
    // No timer: the reset shows with the next reading instead.
  }
}

async function onReset($: EngineInterface): Promise<void> {
  // A write redraws the canisters, which now read the window as reset.
  const held = await read($, gauges)
  await update($, previous, () => held.map(g => ({ ...g })))
  const latest = await $.session.usage()
  await store($, latest.rateLimits)
  await schedule($, await read($, gauges))
}

// Redraws once a minute so the reset countdown stays current. The levels are
// marked as already drawn first, so the liquid doesn't replay its rise.
function startTicker($: EngineInterface): void {
  ticker?.cancel()
  try {
    ticker = $.clock.every(60_000, () => {
      void (async () => {
        const held = await read($, gauges)
        if (held.length === 0) {
          return
        }
        await update($, previous, () => held.map(g => ({ ...g })))
        await update($, minute, n => n + 1)
      })()
    })
  } catch {
    // No timer: the countdown updates with the next reading instead.
  }
}

// The pane asks to start as a widget (the small corner form); the app decides
// the seat, and in testing it docked the pane on the right instead.
const OPEN = { id: PANE, title: TITLE, placement: 'widget' } as const

export const register: Register = on => {
  on('session.start', async ($, e, next) => {
    await $.command.register({ name: 'ooze', description: 'Show your usage limits as ooze canisters' })
    const now = await $.session.usage()
    await store($, now.rateLimits)
    await schedule($, await read($, gauges))
    startTicker($)
    void $.ui.open(OPEN)

    return next(e)
  })

  on('command.run', { command: 'ooze' }, async $ => {
    await $.ui.open(OPEN)

    return { text: 'Usage canisters opened.' }
  })

  on('session.measure', async ($, e, next) => {
    if (e.changed.includes('rateLimits')) {
      await store($, e.rateLimits)
    }

    return next(e)
  })

  on('ui.render', { component: 'Pane', requestId: PANE }, async ($, e) => {
    const list = await read($, gauges)
    const before = await read($, previous)
    await read($, minute) // redraw on the minute tick
    const now = await $.clock.now()
    const week = side('Weekly', list.find(g => g.kind === 'seven_day'), now, true)
    const five = side('5-hour', list.find(g => g.kind === 'five_hour'), now, false)
    const { Box, Text } = $.ui.resolve(e)

    if (e.surface === 'desktop' || e.surface === 'mobile') {
      const { Svg } = $.ui.resolve(e)
      const alt = `Weekly usage ${week.value}, 5-hour usage ${five.value}`
      // 240 px in a widget or a narrow dock (about 28 columns), 320 px when wider.
      const width = e.props.placement === 'widget' || e.props.bodyColumns < 40 ? 240 : ART_W
      const fallback = (why: string) => (
        <Box flexDirection="column">
          <Text dimColor>{why}</Text>
          <Text>
            Weekly {week.value} · 5-hour {five.value}
          </Text>
        </Box>
      )
      const source = fillCapacity(WIDGET_SVG, list, before, now)
      if (JSON.stringify(source).length > TREE_BUDGET - 1_000) {
        return fallback('The capacity artwork is too large to draw.')
      }

      return (
        <Box flexDirection="column">
          <Svg source={source} alt={alt} width={width} height={Math.round((width * ART_H) / ART_W)} isInteractive />
          {list.length === 0 && <Text dimColor>Usage shows after Claude's next reply (subscription plans only).</Text>}
        </Box>
      )
    }

    const cells = Math.max(6, Math.min(30, e.props.bodyColumns - 22))

    return (
      <Box flexDirection="column">
        {list.length === 0 && <Text dimColor>Usage shows after Claude's next reply.</Text>}
        <Text color="magenta">
          Weekly {bar(week.level, cells)} {week.value} · {week.reset.toLowerCase()}
        </Text>
        <Text color="green">
          5-hour {bar(five.level, cells)} {five.value} · {five.reset.toLowerCase()}
        </Text>
      </Box>
    )
  })
}
