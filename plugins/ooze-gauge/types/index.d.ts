export type Gauge = { kind: string; percentUsed: number; resetsAt?: string }

declare module 'claude-code' {
  interface PluginState {
    'ooze-gauge': { gauges: Shaped<Gauge[]> }
  }
}
