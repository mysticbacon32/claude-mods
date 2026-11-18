import { atom, read, update } from 'claude-code'
import type { Register } from 'claude-code'

import type { Gauge } from '../types'

// One device: two glass tubes joined side by side under a shared cap and base,
// each filled with glowing ooze to its percent used.

type Ooze = { core: string; light: string; deep: string }

const GREEN: Ooze = { core: '#7dff1f', light: '#d8ff96', deep: '#2c8a08' }
const RED: Ooze = { core: '#ff1f45', light: '#ff9cad', deep: '#8a0a20' }

const escape = (text: string) =>
  text.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')

const round = (n: number) => Math.round(n * 10) / 10
const clamp = (p: number) => Math.max(0, Math.min(100, p))

// The drawing is W x H; two tubes sit either side of a hairline spine.
const W = 248
const H = 288
const TOP = 62
const BOTTOM = 232
const TUBE_W = 96
const LEFT_X = 24
const SPINE_X = 121
const SPINE_W = 6
const RIGHT_X = 128
const MID = (TOP + BOTTOM) / 2
const FONT = 'font-family="system-ui, sans-serif"'

const riseFor = (percent: number) => round(((BOTTOM - TOP) * clamp(percent)) / 100)

function tube(id: string, x: number, percent: number, ooze: Ooze, label: string, sub: string): string {
  const p = clamp(percent)
  const height = BOTTOM - TOP
  const rise = riseFor(p)
  const level = round(BOTTOM - rise)
  const glow = round(0.3 + p / 180)
  const cx = x + TUBE_W / 2
  const isFull = p >= 100

  // Bubbles rise from the floor of the tube to the ooze surface.
  const bubbles =
    rise < 14
      ? ''
      : [8, 26, 44, 62, 80, 16, 70]
          .map((dx, i) => {
            const r = i % 3 === 0 ? 2.6 : 1.6
            const dur = 3.5 + (i % 4) * 1.3
            return `<circle class="${id}b" cx="${x + 6 + dx}" cy="${BOTTOM - 6}" r="${r}" fill="${ooze.light}" style="animation-duration:${dur}s;animation-delay:${-(i * 0.9)}s"/>`
          })
          .join('')

  return `<defs>
<linearGradient id="${id}ooze" x1="0" y1="0" x2="0" y2="1">
<stop offset="0" stop-color="${ooze.light}"/>
<stop offset="0.25" stop-color="${ooze.core}"/>
<stop offset="1" stop-color="${ooze.deep}"/>
</linearGradient>
<radialGradient id="${id}halo" cx="0.5" cy="0.55" r="0.5">
<stop offset="0" stop-color="${ooze.core}" stop-opacity="${glow}"/>
<stop offset="1" stop-color="${ooze.core}" stop-opacity="0"/>
</radialGradient>
<clipPath id="${id}tube"><rect x="${x}" y="${TOP}" width="${TUBE_W}" height="${height}" rx="10"/></clipPath>
</defs>
<ellipse class="${id}h" cx="${cx}" cy="${MID}" rx="${TUBE_W * 0.85}" ry="${round((BOTTOM - TOP) * 0.75)}" fill="url(#${id}halo)"/>
<g clip-path="url(#${id}tube)">
<rect x="${x}" y="${TOP}" width="${TUBE_W}" height="${height}" fill="#06100c" opacity="0.9"/>
<rect x="${x}" y="${level}" width="${TUBE_W}" height="${round(rise + 4)}" fill="url(#${id}ooze)"/>
<path class="${id}w" d="M${x - 70} ${level} q15 -5 30 0 t30 0 t30 0 t30 0 t30 0 t30 0 t30 0 t30 0 t30 0 V${round(level + 10)} H${x - 70} Z" fill="${ooze.light}" opacity="${rise > 3 ? 0.8 : 0}"/>
${bubbles}
</g>
<rect x="${x}" y="${TOP}" width="${TUBE_W}" height="${height}" rx="10" fill="url(#glass)" stroke="#9fd8c4" stroke-opacity="0.35" stroke-width="2"/>
<rect x="${x + 10}" y="${TOP + 8}" width="6" height="${height - 20}" rx="3" fill="#ffffff" opacity="0.12"/>
<text x="${cx}" y="${isFull ? MID - 4 : MID + 8}" text-anchor="middle" ${FONT} font-size="24" font-weight="800" fill="#f2fff0" stroke="#000000" stroke-opacity="0.55" stroke-width="4" paint-order="stroke">${round(p)}%</text>
${isFull ? `<text x="${cx}" y="${MID + 14}" text-anchor="middle" ${FONT} font-size="11" font-weight="700" fill="#ffffff" stroke="#000000" stroke-opacity="0.5" stroke-width="3" paint-order="stroke">AT LIMIT</text>` : ''}
<text x="${cx}" y="22" text-anchor="middle" ${FONT} font-size="14" font-weight="700" fill="${ooze.light}">${escape(label)}</text>
<text x="${cx}" y="${H - 10}" text-anchor="middle" ${FONT} font-size="11" fill="#b4d8bf">${escape(sub)}</text>`
}

function frame(): string {
  const bolts = (y: number) =>
    [26, 74, 124, 174, 222].map(bx => `<circle cx="${bx}" cy="${y}" r="3" fill="#0a0f0e" stroke="#5c6966" stroke-width="1"/>`).join('')
  return `<defs>
<linearGradient id="glass" x1="0" y1="0" x2="1" y2="0">
<stop offset="0" stop-color="#ffffff" stop-opacity="0.16"/>
<stop offset="0.18" stop-color="#ffffff" stop-opacity="0.04"/>
<stop offset="0.8" stop-color="#ffffff" stop-opacity="0.02"/>
<stop offset="1" stop-color="#ffffff" stop-opacity="0.14"/>
</linearGradient>
<linearGradient id="metal" x1="0" y1="0" x2="0" y2="1">
<stop offset="0" stop-color="#55625f"/>
<stop offset="0.5" stop-color="#2a3331"/>
<stop offset="1" stop-color="#161c1b"/>
</linearGradient>
<linearGradient id="spine" x1="0" y1="0" x2="1" y2="0">
<stop offset="0" stop-color="#161c1b"/>
<stop offset="0.5" stop-color="#46524f"/>
<stop offset="1" stop-color="#161c1b"/>
</linearGradient>
</defs>
<rect x="${SPINE_X}" y="${TOP - 2}" width="${SPINE_W}" height="${BOTTOM - TOP + 4}" fill="url(#spine)"/>
<rect x="14" y="36" width="${W - 28}" height="28" rx="6" fill="url(#metal)" stroke="#0a0f0e"/>
<rect x="14" y="${BOTTOM - 2}" width="${W - 28}" height="24" rx="6" fill="url(#metal)" stroke="#0a0f0e"/>
${bolts(50)}${bolts(BOTTOM + 10)}`
}

function styles(list: { id: string; rise: number }[]): string {
  const per = list
    .map(
      ({ id, rise }) => `
.${id}b { animation: ${id}up 4s linear infinite; opacity: 0.7; }
@keyframes ${id}up { 0% { transform: translateY(0); opacity: 0; } 15% { opacity: 0.85; } 90% { opacity: 0.6; } 100% { transform: translateY(-${Math.max(0, round(rise - 8))}px); opacity: 0; } }
.${id}w { animation: wave 6s linear infinite; }
.${id}h { animation: halo 7s ease-in-out infinite; }`,
    )
    .join('')
  return `<style>
@keyframes wave { from { transform: translateX(0); } to { transform: translateX(60px); } }
@keyframes halo { 0%, 100% { opacity: 0.8; } 50% { opacity: 1; } }
${per}
@media (prefers-reduced-motion: reduce) { * { animation: none !important; } }
</style>`
}

function resets(iso: string | undefined, isWeekly: boolean): string {
  if (iso === undefined) {
    return ''
  }
  const at = new Date(iso)
  if (Number.isNaN(at.getTime())) {
    return ''
  }
  try {
    const when = isWeekly
      ? at.toLocaleString(undefined, { weekday: 'short', hour: 'numeric', minute: '2-digit' })
      : at.toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit' })
    return `resets ${when}`
  } catch {
    return `resets ${iso.slice(0, 16).replace('T', ' ')}`
  }
}

export function drawing(five: Gauge | undefined, week: Gauge | undefined): string {
  const p5 = five?.percentUsed ?? 0
  const p7 = week?.percentUsed ?? 0
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${W} ${H}" width="${W}" height="${H}">
${styles([
  { id: 'g', rise: riseFor(p5) },
  { id: 'r', rise: riseFor(p7) },
])}
${tube('g', LEFT_X, p5, GREEN, '5-hour', five ? resets(five.resetsAt, false) : 'no reading yet')}
${tube('r', RIGHT_X, p7, RED, 'Weekly', week ? resets(week.resetsAt, true) : 'no reading yet')}
${frame()}
</svg>`
}

// Gauge state, kept for the session; change the tag when Gauge's fields change.
const gauges = atom({ plugin: 'ooze-gauge', key: 'gauges' } as const, [], { shape: 'gauges-1' })

type Reading = { kind: string; percentUsed: number; resetsAt?: string }

const pick = (list: readonly Reading[]): Gauge[] =>
  list.map(g =>
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

export const register: Register = on => {
  on('session.start', async ($, e, next) => {
    await $.command.register({ name: 'ooze', description: 'Show your usage limits as ooze canisters' })
    const now = await $.session.usage()
    await update($, gauges, () => pick(now.rateLimits))
    void $.ui.open({ id: PANE, title: TITLE })

    return next(e)
  })

  on('command.run', { command: 'ooze' }, async $ => {
    await $.ui.open({ id: PANE, title: TITLE })

    return { text: 'Usage canisters opened.' }
  })

  on('session.measure', async ($, e, next) => {
    if (e.changed.includes('rateLimits')) {
      await update($, gauges, () => pick(e.rateLimits))
    }

    return next(e)
  })

  on('ui.render', { component: 'Pane', requestId: PANE }, async ($, e) => {
    const list = await read($, gauges)
    const five = list.find(g => g.kind === 'five_hour')
    const week = list.find(g => g.kind === 'seven_day')
    const { Box, Text } = $.ui.resolve(e)

    if (e.surface === 'desktop' || e.surface === 'mobile') {
      const { Svg } = $.ui.resolve(e)
      const isSmall = e.props.placement === 'widget'
      const alt = `5-hour usage ${five?.percentUsed ?? 0}%, weekly usage ${week?.percentUsed ?? 0}%`

      return (
        <Box flexDirection="column">
          <Svg
            source={drawing(five, week)}
            alt={alt}
            width={isSmall ? W / 2 : W}
            height={isSmall ? H / 2 : H}
            isInteractive
          />
          {list.length === 0 && (
            <Text dimColor>Usage shows after Claude's next reply (subscription plans only).</Text>
          )}
        </Box>
      )
    }

    const cells = Math.max(6, Math.min(30, e.props.bodyColumns - 16))

    return (
      <Box flexDirection="column">
        {list.length === 0 && <Text dimColor>Usage shows after Claude's next reply.</Text>}
        <Text color="green">
          5-hour {bar(five?.percentUsed ?? 0, cells)} {five?.percentUsed ?? 0}%
        </Text>
        <Text color="red">
          Weekly {bar(week?.percentUsed ?? 0, cells)} {week?.percentUsed ?? 0}%
        </Text>
      </Box>
    )
  })
}
