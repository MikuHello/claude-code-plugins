import { expect, test } from 'claude-code/testing'

const HINT = {
  plugin: 'usage-band',
  component: 'PromptHint',
  props: { isDraft: false, isWorking: false, hint: '? for shortcuts' },
} as const

const BAND = {
  plugin: 'usage-band',
  component: 'AbovePrompt',
  props: {
    hasSurvey: false,
    isCollapsed: false,
    isWorking: false,
    maxRows: 10,
    bodyColumns: 120,
    scroll: { offset: 0, bodyRows: 10 },
    view: {},
  },
} as const

const cat = (name: string, tokens: number, color: string, kind: string) => ({
  name, tokens, color, kind, isDeferred: kind === 'deferred',
})

const USAGE = {
  startedAt: 0,
  context: {
    tokens: 49_100,
    window: 1_000_000,
    percent: 5,
    breakdown: {
      categories: [
        cat('System prompt', 3_100, 'promptBorder', 'used'),
        cat('System tools', 14_800, 'inactive', 'used'),
        cat('System tools (deferred)', 27_000, 'inactive', 'deferred'),
        cat('Messages', 19_800, 'permission', 'used'),
        cat('Free space', 917_900, 'inactive', 'free'),
        cat('Autocompact buffer', 33_000, 'inactive', 'buffer'),
      ],
      totalTokens: 49_100,
      maxTokens: 1_000_000,
      rawMaxTokens: 1_000_000,
      percentage: 5,
    },
  },
  rateLimits: [
    { kind: 'five_hour', percentUsed: 42, resetsAt: '2026-11-24T11:06:00Z' },
    { kind: 'seven_day', percentUsed: 18.5, resetsAt: '2026-11-28T06:00:00Z' },
  ],
  cost: { usd: 1.23 },
} as never

type Found = { text?: string } | undefined
const has = async (ui: { find: (q: { type: 'Text'; text: RegExp }) => Promise<Found> }, re: RegExp) =>
  (await ui.find({ type: 'Text', text: re }))?.text

for (const surface of ['terminal', 'desktop'] as const) {
  test(`under the prompt, zh, keeping the engine's hint, on ${surface}`, async ($, on) => {
    on('session.usage', () => ({ value: USAGE }))
    on('command.register', () => ({ value: { command: 'usage-band' } }))
    on('session.start', (_, e) => ({ cwd: e.cwd }))
    on('ui.render', ($, e) => {
      const { Text } = $.ui.resolve(e)
      return <Text>engine hint</Text>
    })
    await $.session.start({ cwd: '/', surface, isInteractive: true })

    const ui = await $.ui.mount({ ...HINT, surface })
    expect(await has(ui, /上下文/)).toBeTruthy()
    expect(await has(ui, /5小时/)).toBeTruthy()
    expect(await has(ui, /⟳/)).toBeTruthy()
    expect(await has(ui, /额度/)).toBeTruthy()
    expect(await has(ui, /系统工具/)).toBeTruthy()
    expect(await has(ui, /14\.8k/)).toBeTruthy()
    expect(await has(ui, /39\.3%/)).toBeTruthy()
    expect(await has(ui, /3\.8%/)).toBeTruthy()
    expect(await has(ui, /929\.3k/)).toBeTruthy()
    expect(await has(ui, /deferred/)).toBeFalsy()
    expect(await has(ui, /^ ≈ $/)).toBeTruthy()
    expect(await has(ui, /^\$1\.23$/)).toBeTruthy()
    expect(await has(ui, /▌/)).toBeTruthy()
    expect(await has(ui, /^可用$/)).toBeTruthy()
    expect(await has(ui, /空闲/)).toBeFalsy()
    expect(await has(ui, /engine hint/)).toBe('engine hint')
    await ui.unmount()
  })
}

test('the gear and /usage-band open the settings; hiding there leaves the hint', async ($, on) => {
  const opened: string[] = []
  on('ui.open', (_, e) => (opened.push(e.id), { value: { isPlaced: true } }))
  on('session.usage', () => ({ value: USAGE }))
  on('command.register', () => ({ value: { command: 'usage-band' } }))
  on('session.start', (_, e) => ({ cwd: e.cwd }))
  on('ui.render', ($, e) => {
    const { Text } = $.ui.resolve(e)
    return <Text>engine hint</Text>
  })
  await $.session.start({ cwd: '/', surface: 'terminal', isInteractive: true })
  const band = await $.ui.mount({ ...HINT, surface: 'terminal' })
  await band.press({ key: 'usage-band-gear' })
  await band.unmount()
  await $.command.run({ command: 'usage-band', args: '' } as never)
  expect(opened).toEqual(['usage-band-settings', 'usage-band-settings'])

  const pane = await $.ui.mount({
    plugin: 'usage-band',
    component: 'Pane',
    requestId: 'usage-band-settings',
    surface: 'terminal',
    props: { title: '用量栏设置', isFocused: true, bodyColumns: 80, placement: 'dock', scroll: { offset: 0, bodyRows: 30 }, view: {} },
  } as never)
  expect(await (pane as never as { find: (q: object) => Promise<unknown> }).find({ key: 'language-zh' })).toBeTruthy()
  await pane.press({ key: 'band-shown' })
  await pane.unmount()

  const ui = await $.ui.mount({ ...HINT, surface: 'terminal' })
  expect(await has(ui, /上下文/)).toBeFalsy()
  expect(await has(ui, /engine hint/)).toBe('engine hint')
  await ui.unmount()
})

test('en, above the prompt, without cost', { options: { language: 'en', position: 'above', showCost: false } }, async ($, on) => {
  on('session.usage', () => ({ value: USAGE }))
  on('command.register', () => ({ value: { command: 'usage-band' } }))
  on('session.start', (_, e) => ({ cwd: e.cwd }))
  await $.session.start({ cwd: '/', surface: 'terminal', isInteractive: true })

  const ui = await $.ui.mount({ ...BAND, surface: 'terminal' })
  expect(await has(ui, /Context/)).toBeTruthy()
  expect(await has(ui, /System tools/)).toBeTruthy()
  expect(await has(ui, /^Free$/)).toBeTruthy()
  expect(await has(ui, /Limits/)).toBeTruthy()
  expect(await has(ui, /\$1\.23/)).toBeFalsy()
  await ui.unmount()
})

test('list layout: one category per row', { options: { legendLayout: 'list' } }, async ($, on) => {
  on('session.usage', () => ({ value: USAGE }))
  on('command.register', () => ({ value: { command: 'usage-band' } }))
  on('session.start', (_, e) => ({ cwd: e.cwd }))
  await $.session.start({ cwd: '/', surface: 'terminal', isInteractive: true })

  const ui = await $.ui.mount({ ...HINT, surface: 'terminal' })
  expect(await has(ui, /消息/)).toBeTruthy()
  expect(await has(ui, /19\.8k/)).toBeTruthy()
  expect(await has(ui, /52\.5%/)).toBeTruthy()
  await ui.unmount()
})
