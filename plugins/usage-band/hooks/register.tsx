import { atom, read, update } from 'claude-code'
import type { EngineInterface, Register, RenderChildren, SessionUsage } from 'claude-code'

import type { Category, Limit, Snapshot } from '../types'

const snapshot = atom({ plugin: 'usage-band', key: 'snapshot' } as const, null, {
  shape: 'snapshot-1',
})
const isHidden = atom({ plugin: 'usage-band', key: 'isHidden' } as const, false)

type Lang = 'zh' | 'en'

const CATEGORY_ZH: Record<string, string> = {
  'System prompt': '系统提示',
  'System tools': '系统工具',
  'MCP server instructions': 'MCP 说明',
  'MCP tools': 'MCP 工具',
  'Custom agents': '自定义代理',
  'Memory files': '记忆文件',
  Skills: '技能',
  'Slash commands': '斜杠命令',
  Messages: '消息',
  'Free space': '空闲',
  'Autocompact buffer': '压缩缓冲',
}

const WEEKDAY = {
  zh: ['周日', '周一', '周二', '周三', '周四', '周五', '周六'],
  en: ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'],
}

const RESET_ICON = '⟳'

const TEXT = {
  zh: {
    label: { context: '上下文', limits: '额度', cost: '花费' },
    labelWidth: 8,
    waiting: '等待首次回复…',
    freeName: '可用',
    nearCompactName: '将压缩 /compact',
    limit: { five_hour: '5小时', seven_day: '7天', spend_limit: '限额' } as Record<string, string>,
    command: '用量栏设置：语言、位置、模块开关、显示或隐藏',
    opened: '已打开用量栏设置。',
    settings: {
      title: '用量栏设置',
      language: '语言',
      position: '位置',
      layout: '明细排列',
      modules: '模块',
      band: '用量栏',
      langs: { zh: '中文', en: 'English' } as Record<string, string>,
      positions: { below: '输入框下方', above: '输入框上方' } as Record<string, string>,
      layouts: { grid: '网格', list: '列表', inline: '流式' } as Record<string, string>,
      mods: { showContext: '上下文', legend: '分类明细', showLimits: '额度', showCost: '花费' } as Record<string, string>,
      shown: '显示',
      hiddenNote: '隐藏后用 /usage-band 回到这里',
      close: '关闭',
    },
  },
  en: {
    label: { context: 'Context', limits: 'Limits', cost: 'Cost' },
    labelWidth: 9,
    waiting: 'waiting for the first reply…',
    freeName: 'Free',
    nearCompactName: 'Left · /compact',
    limit: { five_hour: '5h', seven_day: '7d', spend_limit: 'spend' } as Record<string, string>,
    command: 'Usage band settings: language, position, modules, show or hide',
    opened: 'Usage band settings opened.',
    settings: {
      title: 'Usage band settings',
      language: 'Language',
      position: 'Position',
      layout: 'Legend',
      modules: 'Modules',
      band: 'Band',
      langs: { zh: '中文', en: 'English' } as Record<string, string>,
      positions: { below: 'Under the prompt', above: 'Above the prompt' } as Record<string, string>,
      layouts: { grid: 'Grid', list: 'List', inline: 'Inline' } as Record<string, string>,
      mods: { showContext: 'Context', legend: 'Categories', showLimits: 'Limits', showCost: 'Cost' } as Record<string, string>,
      shown: 'Shown',
      hiddenNote: 'once hidden, /usage-band brings you back here',
      close: 'Close',
    },
  },
}

const catName = (name: string, lang: Lang) => (lang === 'zh' ? (CATEGORY_ZH[name] ?? name) : name)

const fmtTokens = (n: number) =>
  n >= 1_000_000 ? `${+(n / 1_000_000).toFixed(1)}M` : n >= 1000 ? `${(n / 1000).toFixed(1)}k` : `${n}`

/** A share to one decimal, `<0.1%` for a sliver. */
const pct = (part: number, whole: number) => {
  const p = whole > 0 ? (part / whole) * 100 : 0
  return p > 0 && p < 0.1 ? '<0.1%' : `${p.toFixed(1)}%`
}

/** Terminal cells a string takes: CJK and full-width forms take two. */
const cellWidth = (text: string) =>
  [...text].reduce((w, ch) => w + (/[\u2E80-\uA4CF\uAC00-\uD7A3\uF900-\uFAFF\uFE30-\uFE4F\uFF00-\uFF60\uFFE0-\uFFE6]/.test(ch) ? 2 : 1), 0)

const levelColor = (p: number) => (p < 50 ? 'success' : p < 80 ? 'warning' : 'error')

const pad = (n: number) => String(n).padStart(2, '0')

/** 5h window: the clock time; longer windows: the weekday too. */
function fmtReset(iso: string | undefined, kind: string, lang: Lang): string {
  if (!iso) return ''
  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) return ''
  const hm = `${pad(d.getHours())}:${pad(d.getMinutes())}`
  return kind === 'five_hour' ? hm : `${WEEKDAY[lang][d.getDay()]} ${hm}`
}

function toSnapshot(u: SessionUsage): Snapshot {
  const b = u.context.breakdown
  const categories: Category[] = (b?.categories ?? [])
    .filter(c => c.kind !== 'deferred' && c.tokens > 0)
    .map(c => ({ name: c.name, tokens: c.tokens, color: c.color, kind: c.kind as Category['kind'] }))
  const limits: Limit[] = u.rateLimits.map(r => ({
    kind: r.kind,
    percentUsed: r.percentUsed,
    resetsAt: r.resetsAt,
  }))
  return {
    tokens: u.context.tokens,
    window: u.context.window,
    percent: u.context.percent,
    categories,
    maxTokens: b?.rawMaxTokens ?? u.context.window,
    limits,
    costUsd: u.cost?.usd,
  }
}

async function refresh($: EngineInterface) {
  let u: SessionUsage
  try {
    u = await $.session.usage({ breakdown: 'summary' })
  } catch {
    u = await $.session.usage()
  }
  await update($, snapshot, () => toSnapshot(u))
}

type Config = {
  lang: Lang
  site: 'PromptHint' | 'AbovePrompt'
  legendLayout: 'grid' | 'list' | 'inline'
  showContext: boolean
  showLegend: boolean
  showLimits: boolean
  showCost: boolean
}
let cfg: Config = {
  lang: 'zh',
  site: 'PromptHint',
  legendLayout: 'grid',
  showContext: true,
  showLegend: true,
  showLimits: true,
  showCost: true,
}

type Ui = ReturnType<EngineInterface['ui']['resolve']>

const PANE = 'usage-band-settings'

async function openSettings($: EngineInterface) {
  await $.ui.open({ id: PANE, title: TEXT[cfg.lang].settings.title })
}

/** Writes one of this plugin's options as /config would; the module reloads with it. */
async function setOption($: EngineInterface, field: string, value: string | boolean) {
  const rows = await $.config.list()
  const row = rows.find(r => r.key.startsWith('usage-band') && r.key.split('.').pop() === field)
  if (row) await $.config.set({ key: row.key, value })
}

/**
 * The band, one module per row under a shared label column:
 *
 *   上下文  ███████▌▌░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░▒▒ 17.7% 177.1k / 1M
 *           ■ 消息     148.2k 83.7%    ■ 系统工具  14.6k  8.2%    ■ 技能      9.9k  5.6%    ■ 系统提示  3.2k  1.8%
 *           ■ MCP 说明   1.1k  0.6%    ■ 记忆文件    114 <0.1%    □ 可用    790.0k
 *   额度    5小时 ██░░░░░░░░ 27% ⟳ 00:00    7天 ░░░░░░░░░░ 4% ⟳ 周三 04:00    花费 $4.44
 *
 * Returns null when there is nothing to draw.
 */
async function buildRows($: EngineInterface, ui: Ui, cols: number) {
  const { lang } = cfg
  const t = TEXT[lang]
  const s = await read($, snapshot)
  if (s === null || (await read($, isHidden))) return null

  const { Box, Text, Button } = ui
  const indent = cfg.site === 'PromptHint' ? 3 : 0 // under the mode line's "▶▶ "
  const labelW = t.labelWidth
  const room = cols - indent - labelW - 6
  const label = (text: string) => (
    <Box width={labelW} flexShrink={0}>
      <Text bold>{text}</Text>
    </Box>
  )
  const modules = []

  // ── context ──
  // The bar is the window, left to right as it fills: the used categories,
  // biggest first, then the free space, then the compaction buffer reserved at the far end. It is drawn in half
  // cells (▌ with a foreground and a background colour), and every used
  // category gets at least one half, so a small one keeps its colour on the
  // bar however big the window: two small ones share a cell.
  const hasBreakdown = s.categories.length > 0
  if (cfg.showContext) {
    const used = s.categories.filter(c => c.kind === 'used').sort((a, b) => b.tokens - a.tokens)
    const usedTokens = hasBreakdown ? used.reduce((a, c) => a + c.tokens, 0) : (s.tokens ?? 0)
    const max = hasBreakdown ? s.maxTokens : s.window
    const bufferTokens = s.categories.find(c => c.kind === 'buffer')?.tokens ?? 0
    const usable = Math.max(1, max - bufferTokens)
    const left = Math.max(0, usable - usedTokens)
    const nearness = (usedTokens / usable) * 100 // how close auto-compact is
    const barWidth = Math.max(20, Math.min(60, room - 16))
    const isNear = hasBreakdown && nearness >= 80

    let bar
    if (hasBreakdown || s.tokens !== undefined) {
      const halves = barWidth * 2
      const unit = max / halves
      const parts: Array<{ scope?: string; color: string; units: number }> = hasBreakdown
        ? used.map(c => ({ scope: `cat-${c.name}`, color: c.color, units: Math.max(1, Math.round(c.tokens / unit)) }))
        : [{ color: levelColor(nearness), units: Math.max(1, Math.round(usedTokens / unit)) }]
      const usedUnits = parts.reduce((a, p) => a + p.units, 0)
      const bufferUnits = bufferTokens > 0 ? Math.max(2, Math.round(bufferTokens / unit)) : 0
      const freeUnits = Math.max(0, halves - usedUnits - bufferUnits)

      // One entry per half cell.
      type Half = { kind: 'used'; color: string; scope?: string } | { kind: 'free' } | { kind: 'buffer' }
      const seq: Half[] = []
      for (const p of parts) for (let k = 0; k < p.units; k++) seq.push({ kind: 'used', color: p.color, scope: p.scope })
      for (let k = 0; k < freeUnits; k++) seq.push({ kind: 'free' })
      for (let k = 0; k < bufferUnits; k++) seq.push({ kind: 'buffer' })

      // Pair the halves into cells, then merge equal neighbours into runs.
      type Cell = { ch: string; color?: string; bg?: string; dim?: boolean; scope?: string; isFree?: boolean }
      const cells: Cell[] = []
      for (let k = 0; k < seq.length; k += 2) {
        const a = seq[k]!
        const b = seq[k + 1] ?? a
        if (a.kind === 'used' && b.kind === 'used') {
          cells.push(
            a.color === b.color && a.scope === b.scope
              ? { ch: '█', color: a.color, scope: a.scope }
              : { ch: '▌', color: a.color, bg: b.color },
          )
        } else if (a.kind === 'used') {
          cells.push({ ch: '▌', color: a.color, scope: a.scope })
        } else if (a.kind === 'buffer' || b.kind === 'buffer') {
          cells.push({ ch: '▒', color: 'warning', dim: true })
        } else {
          cells.push({ ch: '░', dim: true, isFree: true })
        }
      }

      const runs: Array<{ cell: Cell; n: number }> = []
      for (const c of cells) {
        const last = runs[runs.length - 1]
        if (last && JSON.stringify(last.cell) === JSON.stringify(c)) last.n += 1
        else runs.push({ cell: c, n: 1 })
      }

      bar = runs.map(r => (
        <Text
          color={r.cell.color}
          backgroundColor={r.cell.bg}
          dimColor={r.cell.dim}
          hover={r.cell.scope ? { scope: r.cell.scope } : undefined}
        >
          {r.cell.ch.repeat(r.n)}
        </Text>
      ))
    }

    // Bar, then the share in the level colour, then the tokens: the same
    // rhythm as the limits row below (bar, share, detail).
    modules.push(
      <Box flexDirection="row">
        {label(t.label.context)}
        {bar === undefined ? (
          <Text dimColor>{t.waiting}</Text>
        ) : (
          <Box flexDirection="row">
            {bar}
            <Text color={levelColor(nearness)} bold>
              {' '}
              {pct(usedTokens, max)}
            </Text>
            <Text dimColor>
              {' '}
              {fmtTokens(usedTokens)} / {fmtTokens(max)}
            </Text>
          </Box>
        )}
      </Box>,
    )

    // Legend: what the bar is made of, in its order: the used categories,
    // biggest first, each with its tokens and its share of what is used; then
    // the free space (the bar's ░) with what is left before auto-compact.
    // Hovering an entry or its run on the bar lights the entry.
    //
    // grid (default): a table folded into as few rows as the width allows,
    //   names, tokens and shares each in an aligned column, read left to right
    //   as the bar is. Usually two rows: a list's legibility at a flow's height.
    // list: one entry per row, for a tall terminal.
    // inline: entries flowing one after another, wrapping where the row ends.
    if (cfg.showLegend && hasBreakdown) {
      type Entry = { key: string; swatch: string; color?: string; name: string; tokens: string; share: string; isFree?: boolean }
      const entries: Entry[] = used.map(c => ({
        key: `cat-${c.name}`,
        swatch: '■',
        color: c.color,
        name: catName(c.name, lang),
        tokens: fmtTokens(c.tokens),
        share: pct(c.tokens, usedTokens),
      }))
      entries.push({
        key: 'free',
        swatch: '□',
        name: isNear ? t.nearCompactName : t.freeName,
        tokens: fmtTokens(left),
        share: '',
        isFree: true,
      })

      const nameW = Math.max(...entries.map(e => cellWidth(e.name)))
      const tokW = Math.max(...entries.map(e => e.tokens.length))
      const shareW = Math.max(...entries.map(e => e.share.length))
      const gap = 4
      const entryW = 2 + nameW + 1 + tokW + 1 + shareW

      const drawEntry = (e: Entry, aligned: boolean) => {
        const warn = e.isFree && isNear
        return (
          <Box flexDirection="row" width={aligned ? entryW + gap : undefined} marginRight={aligned ? 0 : 3} flexShrink={0}>
            <Text color={warn ? 'warning' : e.color} dimColor={e.isFree && !warn}>
              {e.swatch}{' '}
            </Text>
            <Box width={aligned ? nameW + 1 : undefined}>
              <Text
                color={warn ? 'warning' : undefined}
                dimColor={!warn}
                hover={e.isFree ? undefined : { scope: e.key, dimColor: false, bold: true }}
              >
                {e.name}{aligned ? '' : ' '}
              </Text>
            </Box>
            <Text
              color={warn ? 'warning' : undefined}
              dimColor={e.isFree && !warn}
              hover={e.isFree ? undefined : { scope: e.key, bold: true }}
            >
              {aligned ? e.tokens.padStart(tokW) : e.tokens}
            </Text>
            {e.share ? <Text dimColor> {aligned ? e.share.padStart(shareW) : e.share}</Text> : null}
          </Box>
        )
      }

      const avail = Math.max(entryW, room)
      if (cfg.legendLayout === 'inline') {
        modules.push(
          <Box flexDirection="row" flexWrap="wrap" marginLeft={labelW}>
            {entries.map(e => drawEntry(e, false))}
          </Box>,
        )
      } else {
        const perRow = cfg.legendLayout === 'list' ? 1 : Math.max(1, Math.floor((avail + gap) / (entryW + gap)))
        const rowsN = Math.ceil(entries.length / perRow)
        // Balance the rows: 7 entries in a width for 5 go 4 + 3, not 5 + 2.
        const per = Math.ceil(entries.length / rowsN)
        for (let r = 0; r < rowsN; r++) {
          modules.push(
            <Box flexDirection="row" marginLeft={labelW}>
              {entries.slice(r * per, r * per + per).map(e => drawEntry(e, true))}
            </Box>,
          )
        }
      }
    }
  }

  // ── plan limits (Pro / Max only, after the first reply), the session's cost at the right ──
  const limitsShown = cfg.showLimits ? s.limits : []
  const costShown = cfg.showCost && s.costUsd !== undefined
  if (limitsShown.length > 0 || costShown) {
    const w = 10
    modules.push(
      <Box flexDirection="row">
        {label(limitsShown.length > 0 ? t.label.limits : t.label.cost)}
        <Box flexDirection="row" flexWrap="wrap">
          {limitsShown.map(l => {
            const filled = Math.min(w, Math.round((l.percentUsed / 100) * w))
            const reset = fmtReset(l.resetsAt, l.kind, lang)
            return (
              <Box flexDirection="row" marginRight={4}>
                <Text>{t.limit[l.kind] ?? l.kind} </Text>
                <Text color={levelColor(l.percentUsed)}>{'█'.repeat(filled)}</Text>
                <Text dimColor>{'░'.repeat(w - filled)}</Text>
                <Text color={levelColor(l.percentUsed)} bold>
                  {' '}
                  {Math.round(l.percentUsed)}%
                </Text>
                {reset ? (
                  <Text dimColor>
                    {' '}
                    {RESET_ICON} {reset}
                  </Text>
                ) : null}
              </Box>
            )
          })}
          {costShown ? (
            <Box flexDirection="row">
              {limitsShown.length > 0 ? <Text>{t.label.cost}</Text> : null}
              <Text>{limitsShown.length > 0 ? ' ≈ ' : '≈ '}</Text>
              <Text>${(s.costUsd ?? 0).toFixed(2)}</Text>
            </Box>
          ) : null}
        </Box>
      </Box>,
    )
  }

  if (modules.length === 0) return null
  // The way into the settings, at the right of the band's last row.
  const gear = (
    <Box marginLeft={4}>
      <Button key="usage-band-gear" label="⚙" plain dimColor onPress={() => openSettings($)} />
    </Box>
  )
  const last = modules.pop()
  modules.push(
    <Box flexDirection="row">
      {last}
      {gear}
    </Box>,
  )
  return (
    <Box flexDirection="column" paddingLeft={indent}>
      {modules}
    </Box>
  )
}

export const register: Register = (on, options) => {
  cfg = {
    lang: options.language === 'en' ? 'en' : 'zh',
    site: options.position === 'above' ? 'AbovePrompt' : 'PromptHint',
    legendLayout: options.legendLayout === 'list' ? 'list' : options.legendLayout === 'inline' ? 'inline' : 'grid',
    showContext: options.showContext !== false,
    showLegend: options.legend !== false,
    showLimits: options.showLimits !== false,
    showCost: options.showCost !== false,
  }
  const t = TEXT[cfg.lang]

  on('session.start', async ($, e, next) => {
    await $.command.register({ name: 'usage-band', description: t.command })
    const out = await next(e)
    await refresh($)
    return out
  })

  on('command.run', { command: 'usage-band' }, async $ => {
    await openSettings($)
    return { text: t.opened }
  })

  // The settings panel: each choice a row of buttons, the one in force marked;
  // a press writes the option and the band redraws with it.
  on('ui.render', { component: 'Pane', requestId: PANE }, async ($, e) => {
    const { Box, Text, Button } = $.ui.resolve(e)
    const st = t.settings
    const hidden = await read($, isHidden)
    const labelW = cfg.lang === 'zh' ? 10 : 11
    const row = (name: string, body: RenderChildren) => (
      <Box flexDirection="row" marginBottom={1}>
        <Box width={labelW} flexShrink={0}>
          <Text dimColor>{name}</Text>
        </Box>
        <Box flexDirection="row" flexWrap="wrap">
          {body}
        </Box>
      </Box>
    )
    // A single choice: ● in the accent colour and bold text for the one in
    // force, ○ and dim text for the others.
    const choice = (field: string, labels: Record<string, string>, current: string) =>
      Object.entries(labels).map(([value, text]) => {
        const isOn = value === current
        return (
          <Box marginRight={3}>
            <Button
              key={`${field}-${value}`}
              label={text}
              plain
              onPress={() => (isOn ? undefined : setOption($, field, value))}
            >
              <Text color={isOn ? 'suggestion' : undefined} dimColor={!isOn}>
                {isOn ? '●' : '○'}
              </Text>{' '}
              <Text bold={isOn} dimColor={!isOn}>
                {text}
              </Text>
            </Button>
          </Box>
        )
      })
    // A switch: [✓] in green when on, [ ] dim when off. Brackets and a tick
    // are plain text, the same width in every monospaced font.
    const toggle = (key: string, text: string, isOn: boolean, press: () => unknown) => (
      <Box marginRight={3}>
        <Button key={key} label={text} plain onPress={press}>
          <Text dimColor>[</Text>
          <Text color="success">{isOn ? '✓' : ' '}</Text>
          <Text dimColor>]</Text>{' '}
          <Text dimColor={!isOn}>{text}</Text>
        </Button>
      </Box>
    )
    const isModuleOn: Record<string, boolean> = {
      showContext: cfg.showContext,
      legend: cfg.showLegend,
      showLimits: cfg.showLimits,
      showCost: cfg.showCost,
    }
    return (
      <Box flexDirection="column" paddingX={1} paddingY={1}>
        {row(st.language, choice('language', st.langs, cfg.lang))}
        {row(st.position, choice('position', st.positions, cfg.site === 'AbovePrompt' ? 'above' : 'below'))}
        {row(st.layout, choice('legendLayout', st.layouts, cfg.legendLayout))}
        {row(
          st.modules,
          Object.entries(st.mods).map(([field, text]) =>
            toggle(`mod-${field}`, text, isModuleOn[field] ?? true, () => setOption($, field, !isModuleOn[field])),
          ),
        )}
        {row(st.band, [
          toggle('band-shown', st.shown, !hidden, () => update($, isHidden, v => !v)),
          <Text dimColor>{st.hiddenNote}</Text>,
        ])}
        <Box>
          <Button key="close" label={st.close} role="dismiss" onPress={() => $.ui.close({ id: PANE })} />
        </Box>
      </Box>
    )
  })

  on('session.measure', async ($, e, next) => {
    const out = await next(e)
    await refresh($)
    return out
  })

  // Under the prompt (default): the engine's own line (permission mode,
  // shortcuts) first, as it draws it, then the band indented beneath it.
  on('ui.render', { component: 'PromptHint' }, async ($, e, next) => {
    if (cfg.site !== 'PromptHint') return next(e)
    const ui = $.ui.resolve(e)
    const rows = await buildRows($, ui, e.viewport?.columns ?? 100)
    if (rows === null) return next(e)
    const hint = await next(e)
    const { Box } = ui
    return (
      <Box flexDirection="column">
        {hint}
        {rows}
      </Box>
    )
  })

  on('ui.render', { component: 'AbovePrompt' }, async ($, e, next) => {
    if (cfg.site !== 'AbovePrompt' || e.props.hasSurvey) return next(e)
    const rows = await buildRows($, $.ui.resolve(e), e.props.bodyColumns)
    return rows ?? next(e)
  })
}
