import type { TestBody } from 'claude-code/testing'
import { expect, test } from 'claude-code/testing'

import { fillCapacity, side, TREE_BUDGET } from '../hooks/register.js'
import { WIDGET_SVG } from '../hooks/widget-svg.js'

declare const console: { log: (...args: unknown[]) => void }

type Engine = Parameters<TestBody>[0]
type On = Parameters<TestBody>[1]

type PaneProps = {
  title: string
  isFocused: boolean
  bodyColumns: number
  placement: 'dock' | 'inline' | 'widget'
  scroll: { offset: number; bodyRows: number }
  view: Record<string, never>
}

// What the desktop app gave the docked pane in live testing.
const PROPS: PaneProps = {
  title: 'Usage',
  isFocused: false,
  bodyColumns: 28,
  placement: 'dock',
  scroll: { offset: 0, bodyRows: 45 },
  view: {},
}
const PANE = { plugin: 'ooze-gauge', component: 'Pane', requestId: 'ooze-gauge', props: PROPS } as const

const NOW = Date.parse('2026-11-18T12:00:00Z')
const LATER = '2099-12-31T23:59:00Z'
const PAST = '2026-11-18T11:00:00Z'

type Reading = { kind: string; percentUsed: number; resetsAt?: string }
const reading = (weekly: number, fiveHour: number, resetsAt = LATER): Reading[] => [
  { kind: 'five_hour', percentUsed: fiveHour, resetsAt },
  { kind: 'seven_day', percentUsed: weekly, resetsAt },
]

// The liquid (nested svg) and bar of each canister, read out of a filled widget.
const VIAL_X = { weekly: '64.95', fiveHour: '192.31' }
function level(svg: string, which: keyof typeof VIAL_X): { height: number; y: number } {
  const m = svg.match(new RegExp(`<svg class="liquid-body lvl" x="${VIAL_X[which]}" y="([\\d.]+)" width="63.36" height="([\\d.]+)"`))
  if (!m) throw new Error(`no liquid body for ${which}`)
  return { y: Number(m[1]), height: Number(m[2]) }
}
function bar(svg: string, cls: 'wk' | 'fv'): number {
  const at = svg.indexOf(`<g clip-path="url(#${cls}Inner)"><rect class="bar"`)
  const m = svg.slice(at).match(/width="([\d.]+)"/)
  if (at < 0 || !m) throw new Error(`no bar for ${cls}`)
  return Number(m[1])
}

// Mounts the pane on desktop with these readings and returns the drawn tree.
async function drawn($: Engine, on: On, rl: Reading[], props: Partial<PaneProps> = {}) {
  on('clock.now', () => ({ value: NOW }))
  on('clock.after', () => ({ deny: 'no timers in tests' }))
  on('command.register', () => ({ value: { command: 'ooze' } }))
  on('ui.open', () => ({ value: { isPlaced: true } }))
  on('session.usage', () => ({ value: { startedAt: 0, context: { window: 200000 }, rateLimits: rl } }))
  on('session.start', (_, e) => ({ cwd: e.cwd }))
  await $.session.start({ cwd: '/', surface: 'desktop', isInteractive: true })
  const ui = await $.ui.mount({ ...PANE, props: { ...PANE.props, ...props }, surface: 'desktop' })
  const tree = await ui.drawn()
  const svg = await ui.find({ type: 'Svg' })
  await ui.unmount()
  return { tree, svg }
}

test('the canisters show both windows from real usage', async ($, on) => {
  const { svg } = await drawn($, on, reading(70, 30))
  expect(svg?.props.alt).toBe('Weekly usage 70%, 5-hour usage 30%')
  expect(svg?.props.width).toBe(240)
  expect(String(svg?.props.source)).toContain('>70%</text>')
  expect(String(svg?.props.source)).toContain('>30% REMAINING</text>')

  const term = await $.ui.mount({ ...PANE, surface: 'terminal' })
  expect((await term.find({ type: 'Text', text: /Weekly/ }))?.text).toContain('30% remaining')
  expect((await term.find({ type: 'Text', text: /5-hour/ }))?.text).toContain('70% remaining')
  await term.unmount()
})

test('a wider pane draws the widget at 320 px', async ($, on) => {
  const { svg } = await drawn($, on, reading(70, 30), { bodyColumns: 60 })
  expect(svg?.props.width).toBe(320)
})

test('/ooze reopens the pane', async ($, on) => {
  const opened: unknown[] = []
  on('command.register', () => ({ value: { command: 'ooze' } }))
  on('ui.open', (_, e) => {
    opened.push(e)
    return { value: { isPlaced: true } }
  })
  on('clock.now', () => ({ value: NOW }))
  on('clock.after', () => ({ deny: 'no timers in tests' }))
  on('session.usage', () => ({ value: { startedAt: 0, context: { window: 200000 }, rateLimits: [] } }))
  on('session.start', (_, e) => ({ cwd: e.cwd }))
  await $.session.start({ cwd: '/', surface: 'desktop', isInteractive: true })
  const result = await $.command.run({
    command: 'ooze',
    args: '',
    origin: { kind: 'composer' },
    presentation: { isFullscreen: false, columns: 80 },
  })
  expect(JSON.stringify(result)).toContain('Usage canisters opened.')
  // Opened at session start and again by /ooze. The widget seat is only asked
  // for: the app decides, and it docked the pane in live testing.
  expect(opened.length).toBe(2)
  expect(JSON.stringify(opened[1])).toContain('"id":"ooze-gauge"')
})

test('with no reading yet, the pane says so', async ($, on) => {
  const { svg } = await drawn($, on, [])
  expect(svg?.props.alt).toBe('Weekly usage —, 5-hour usage —')
  expect(String(svg?.props.source)).toContain('NO DATA YET')

  const term = await $.ui.mount({ ...PANE, surface: 'terminal' })
  expect((await term.find({ type: 'Text', text: /Usage shows/ }))?.text).toContain('next reply')
  await term.unmount()
})

// The app refuses a drawn tree past 100,000 serialized characters; the mod
// keeps 5,000 in hand. Each state is measured as the whole tree, wrappers,
// alt text and escaping included.
const sizes: Record<string, number> = {}
const STATES: [string, Reading[], Partial<PaneProps>][] = [
  ['typical 70/30, docked 240 px', reading(70, 30), {}],
  ['typical 70/30, wide 320 px', reading(70, 30), { bodyColumns: 60 }],
  ['both full', reading(100, 100), {}],
  ['both empty', reading(0, 0), {}],
  ['one decimal', reading(33.3, 66.7), {}],
  ['windows reset', reading(80, 90, PAST), {}],
  ['no data', [], {}],
]
for (const [name, rl, props] of STATES) {
  test(`serialized widget tree within budget: ${name}`, async ($, on) => {
    const { tree } = await drawn($, on, rl, props)
    const size = JSON.stringify(tree).length
    sizes[name] = size
    expect(size).toBeLessThanOrEqual(TREE_BUDGET)
    expect(size).toBeGreaterThan(80_000) // the real artwork was drawn, not a fallback
  })
}

test('peak serialized widget tree', () => {
  expect(Object.keys(sizes).length).toBe(STATES.length)
  const peak = Math.max(...Object.values(sizes))
  console.log(`peak serialized tree: ${peak} of ${TREE_BUDGET} (${JSON.stringify(sizes)})`)
  expect(peak).toBeLessThanOrEqual(TREE_BUDGET)
})

test('each canister fills to its own level at 0, 25, 50, 75 and 100%', () => {
  const pairs: [number, number][] = [[0, 100], [25, 75], [50, 50], [75, 25], [100, 0]]
  for (const [w, f] of pairs) {
    const svg = fillCapacity(WIDGET_SVG, reading(w, f), [], NOW)
    const wk = level(svg, 'weekly')
    const fv = level(svg, 'fiveHour')
    expect(wk.height).toBe(Math.round(120.59 * w) / 100)
    expect(fv.height).toBe(Math.round(120.59 * f) / 100)
    // Every level sits on the vial floor.
    expect(Math.round((wk.y + wk.height) * 100) / 100).toBe(187.84)
    expect(Math.round((fv.y + fv.height) * 100) / 100).toBe(187.84)
    expect(bar(svg, 'wk')).toBe(Math.round(134.17 * w) / 100)
    expect(bar(svg, 'fv')).toBe(Math.round(134.17 * f) / 100)
    expect(svg).toContain(`>${w}%</text>`)
    expect(svg).toContain(`>${100 - f}% REMAINING</text>`)
  }
})

test('weekly is magenta and 5-hour is green', () => {
  const svg = fillCapacity(WIDGET_SVG, reading(70, 30), [], NOW)
  const liquid = (x: string) =>
    svg.match(new RegExp(`<svg class="liquid-body lvl" x="${x}"[^>]*>\\s*<path class="liquid-shape" fill="(#[0-9a-f]{6})"`))?.[1]
  expect(liquid(VIAL_X.weekly)).toBe('#ff36d7')
  expect(liquid(VIAL_X.fiveHour)).toBe('#a8ff35')
  expect(svg).toMatch(/fill="#ff36d7">WEEKLY LIMIT</)
  expect(svg).toMatch(/fill="#a8ff35">5-HOUR LIMIT</)
})

test('the widget is well-formed, pure-vector SVG', () => {
  const svg = fillCapacity(WIDGET_SVG, reading(70, 30), [], NOW)
  expect(svg.startsWith('<svg xmlns="http://www.w3.org/2000/svg"')).toBe(true)
  expect(svg.includes('{{')).toBe(false)
  for (const banned of ['data:', '<image', 'feImage', 'foreignObject', 'base64', '<script', '<!DOCTYPE', '<![CDATA[']) {
    expect(svg.includes(banned)).toBe(false)
  }
  expect(/href="(?!#)|url\((?!#)/.test(svg)).toBe(false)
  // Every tag closes in order (comments and the <style> body skipped).
  const body = svg.replace(/<!--[\s\S]*?-->/g, '').replace(/<style>[\s\S]*?<\/style>/g, '<style></style>')
  const stack: string[] = []
  for (const m of body.matchAll(/<(\/?)([a-zA-Z]+)[^>]*?(\/?)>/g)) {
    const [, closing, name, selfClosing] = m
    if (selfClosing) continue
    if (closing) expect(stack.pop()).toBe(name)
    else stack.push(name as string)
  }
  expect(stack.length).toBe(0)
})

test('one liquid body and one matching surface highlight per canister', () => {
  expect(WIDGET_SVG.match(/class="liquid-shape"/g)?.length).toBe(2)
  expect(WIDGET_SVG.match(/class="liquid-surface"/g)?.length).toBe(2)
  // The highlight follows the body's own wave: same keyframes, minus the fill's closing edge.
  for (const m of WIDGET_SVG.matchAll(/<path class="liquid-shape"[^>]*><animate[^>]*values="([^"]+)"[\s\S]*?<path class="liquid-surface"[^>]*><animate[^>]*values="([^"]+)"/g)) {
    expect(m[1]?.split(';').map(v => v.replace(' L400 400 L0 400Z', ''))).toEqual(m[2]?.split(';'))
  }
})

test('reduced motion stops the bubbles, the wave and the level changes', () => {
  expect(WIDGET_SVG).toContain(
    '@media (prefers-reduced-motion:reduce){.bubble{animation:none}.liquid-body animate{display:none}.lvl,.fclip,.bar{animation:none}}',
  )
})

test('a reset window waits for the next reading instead of showing old usage', () => {
  const past = side('5-hour', { kind: 'five_hour', percentUsed: 80, resetsAt: PAST }, NOW, false)
  expect(past.level).toBe(0)
  expect(past.value).toBe('—')
  expect(past.remaining).toBe('RESET · AWAITING UPDATE')
  expect(side('Weekly', undefined, NOW, true).remaining).toBe('NO DATA YET')
})
