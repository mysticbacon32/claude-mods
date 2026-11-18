import { expect, test } from 'claude-code/testing'

const PANE = {
  plugin: 'ooze-gauge',
  component: 'Pane',
  requestId: 'ooze-gauge',
  props: {
    title: 'Usage',
    isFocused: false,
    bodyColumns: 40,
    placement: 'dock',
    scroll: { offset: 0, bodyRows: 20 },
    view: {},
  },
} as const

const READING = [
  { kind: 'five_hour', percentUsed: 42, resetsAt: '2026-11-18T20:00:00Z' },
  { kind: 'seven_day', percentUsed: 18, resetsAt: '2026-11-21T09:00:00Z' },
]

test('the canisters show both windows', async ($, on) => {
  on('command.register', () => ({ value: { command: 'ooze' } }))
  on('ui.open', () => ({ value: { isPlaced: true } }))
  on('session.usage', () => ({
    value: { startedAt: 0, context: { window: 200000 }, rateLimits: READING },
  }))
  on('session.start', (_, e) => ({ cwd: e.cwd }))

  await $.session.start({ cwd: '/', surface: 'desktop', isInteractive: true })

  const desk = await $.ui.mount({ ...PANE, surface: 'desktop' })
  const svg = await desk.find({ type: 'Svg' })
  expect(svg?.props.alt).toBe('5-hour usage 42%, weekly usage 18%')
  await desk.unmount()

  const term = await $.ui.mount({ ...PANE, surface: 'terminal' })
  expect((await term.find({ type: 'Text', text: /5-hour/ }))?.text).toContain('42%')
  expect((await term.find({ type: 'Text', text: /Weekly/ }))?.text).toContain('18%')
  await term.unmount()
})

test('with no reading yet, the pane says so', async ($, on) => {
  const ui = await $.ui.mount({ ...PANE, surface: 'desktop' })

  expect((await ui.find({ type: 'Text', text: /Usage shows/ }))?.text).toContain('next reply')
  await ui.unmount()
})
