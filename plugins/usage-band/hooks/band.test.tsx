import type { On } from 'claude-code'
import { expect, test } from 'claude-code/testing'
import type { Engine } from 'claude-code/testing'

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

/** A /context breakdown of `window` tokens; `used` maps each used category to its tokens. */
const usage = (window: number, used: Record<string, number>, buffer = 33_000) => {
  const total = Object.values(used).reduce((a, n) => a + n, 0)
  return {
    startedAt: 0,
    context: {
      tokens: total,
      window,
      percent: (total / window) * 100,
      breakdown: {
        categories: [
          ...Object.entries(used).map(([name, n]) => cat(name, n, 'permission', 'used')),
          cat('Free space', window - total - buffer, 'inactive', 'free'),
          cat('Autocompact buffer', buffer, 'inactive', 'buffer'),
        ],
        totalTokens: total,
        maxTokens: window,
        rawMaxTokens: window,
        percentage: (total / window) * 100,
      },
    },
    rateLimits: [],
  } as never
}

type Found = { text?: string } | undefined
const has = async (ui: { find: (q: { type: 'Text'; text: RegExp }) => Promise<Found> }, re: RegExp) =>
  (await ui.find({ type: 'Text', text: re }))?.text

type Element = { type: string; text: string; props: Record<string, unknown>; children: unknown[] }
type Query = { findAll: (q: { type: string }) => Promise<Element[]> }

/** Cells the bar takes: every run of bar glyphs (with the limits row off, the context bar's alone). */
const barCells = async (ui: unknown) =>
  (await (ui as Query).findAll({ type: 'Text' }))
    .filter(t => /^[█▌░▒]+$/.test(t.text))
    .reduce((a, t) => a + [...t.text].length, 0)

/** The legend's rows (indented under the label column), each its entries' count. */
const legendRows = async (ui: unknown, labelW = 8) =>
  (await (ui as Query).findAll({ type: 'Box' }))
    .filter(b => b.props.marginLeft === labelW)
    .map(b => b.children.filter(c => typeof c === 'object' && c !== null).length)

/** Starts a terminal session whose usage is `value`. */
const start = async ($: Engine, on: On, value: never) => {
  on('session.usage', () => ({ value }))
  on('command.register', () => ({ value: { command: 'usage-band' } }))
  on('session.start', (_, e) => ({ cwd: e.cwd }))
  await $.session.start({ cwd: '/', surface: 'terminal', isInteractive: true })
}

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
    expect(await has(ui, /▒/)).toBeTruthy()
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

const NO_LIMITS = { showLimits: false, showCost: false }

test('the bar spans its width exactly', { options: NO_LIMITS }, async ($, on) => {
  await start($, on, USAGE)
  // 100 columns: 100 - 3 (indent) - 8 (label) - 6 = 83 of room, less 19 for the tail.
  const ui = await $.ui.mount({ ...HINT, surface: 'terminal' })
  expect(await barCells(ui)).toBe(60)
  await ui.unmount()
})

test('near compaction the floors and the buffer still fit the bar', { options: NO_LIMITS }, async ($, on) => {
  // 200k window, 33k buffer: 150.4k used of 167k is 90%. At 20 cells (40 halves of
  // 5k) the eight small categories take a half each and the buffer seven, 43 in all.
  await start(
    $,
    on,
    usage(200_000, {
      Messages: 140_000,
      'System tools': 3_000,
      'MCP tools': 2_000,
      'System prompt': 1_500,
      Skills: 1_200,
      'MCP server instructions': 900,
      'Memory files': 800,
      'Custom agents': 600,
      'Slash commands': 400,
    }),
  )
  const ui = await $.ui.mount({ ...HINT, surface: 'terminal', viewport: { columns: 60, rows: 30 } })
  expect(await barCells(ui)).toBe(20)
  expect(await has(ui, /▒/)).toBeTruthy()
  expect(await has(ui, /^将压缩 \/compact$/)).toBeTruthy()
  expect(await has(ui, /^可用$/)).toBeFalsy()
  expect(await has(ui, /16\.6k/)).toBeTruthy()
  await ui.unmount()
})

test('grid: seven entries in a width for five go 4 + 3', { options: NO_LIMITS }, async ($, on) => {
  await start(
    $,
    on,
    usage(1_000_000, {
      Messages: 148_200,
      'System tools': 14_600,
      Skills: 9_900,
      'System prompt': 3_200,
      'MCP server instructions': 1_100,
      'Memory files': 114,
    }),
  )
  // Entries are 23 cells, 27 with the gap: 160 columns leave 143, room for five.
  const ui = await $.ui.mount({ ...HINT, surface: 'terminal', viewport: { columns: 160, rows: 30 } })
  expect(await legendRows(ui)).toEqual([4, 3])
  await ui.unmount()
})

test('inline: the entries flow in one wrapping row', { options: { ...NO_LIMITS, legendLayout: 'inline' } }, async ($, on) => {
  await start($, on, USAGE)
  const ui = await $.ui.mount({ ...HINT, surface: 'terminal' })
  expect(await legendRows(ui)).toEqual([4])
  const flow = (await (ui as never as Query).findAll({ type: 'Box' })).find(b => b.props.marginLeft === 8)
  expect(flow?.props.flexWrap).toBe('wrap')
  expect(await has(ui, /^消息 $/)).toBeTruthy()
  expect(await has(ui, /^19\.8k$/)).toBeTruthy()
  await ui.unmount()
})

test('without a breakdown: one bar in the level colour, no legend', { options: NO_LIMITS }, async ($, on) => {
  await start($, on, {
    startedAt: 0,
    context: { tokens: 850_000, window: 1_000_000, percent: 85 },
    rateLimits: [],
  } as never)
  const ui = await $.ui.mount({ ...HINT, surface: 'terminal' })
  const runs = (await (ui as never as Query).findAll({ type: 'Text' })).filter(t => /^█+$/.test(t.text))
  expect(runs.map(t => t.props.color)).toEqual(['error'])
  expect(await barCells(ui)).toBe(60)
  expect(await has(ui, /85\.0%/)).toBeTruthy()
  expect(await has(ui, /^可用$/)).toBeFalsy()
  expect(await has(ui, /将压缩/)).toBeFalsy()
  await ui.unmount()
})

test('a setting is written under its own key alone', async ($, on) => {
  const rows = ['usage-band-legacy.language', 'usage-band.language'].map(key => ({
    key, label: key, kind: 'choice', value: 'zh', options: ['zh', 'en'], provider: { kind: 'plugin', name: key.split('.')[0] }, isLocked: false,
  }))
  const written: Array<[string, unknown]> = []
  on('config.list', () => ({ value: rows }) as never)
  on('config.set', (_, e) => (written.push([e.key, e.value]), { value: e.value }) as never)
  await start($, on, USAGE)
  const pane = await $.ui.mount({
    plugin: 'usage-band',
    component: 'Pane',
    requestId: 'usage-band-settings',
    surface: 'terminal',
    props: { title: '用量栏设置', isFocused: true, bodyColumns: 80, placement: 'dock', scroll: { offset: 0, bodyRows: 30 }, view: {} },
  } as never)
  await pane.press({ key: 'language-en' })
  expect(written).toEqual([['usage-band.language', 'en']])
  await pane.unmount()
})
