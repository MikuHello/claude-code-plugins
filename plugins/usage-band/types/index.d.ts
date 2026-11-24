export type Category = {
  name: string
  tokens: number
  color: string
  kind: 'used' | 'free' | 'buffer'
}

export type Limit = { kind: string; percentUsed: number; resetsAt?: string }

export type Snapshot = {
  /** Input tokens of the last response, and the model's window. */
  tokens?: number
  window: number
  percent?: number
  /** The /context breakdown, measured against maxTokens. */
  categories: Category[]
  maxTokens: number
  limits: Limit[]
  costUsd?: number
}

declare module 'claude-code' {
  interface PluginState {
    'usage-band': { snapshot: Shaped<Snapshot | null>; isHidden: boolean }
  }
}
