export type Gauge = { kind: string; percentUsed: number; resetsAt?: string }

declare module 'claude-code' {
  interface PluginState {
    'ooze-gauge': {
      // The readings the last response reported.
      gauges: Shaped<Gauge[]>
      // The readings drawn before them: where the liquid rises or falls from.
      previous: Shaped<Gauge[]>
      // Bumped once a minute so the reset countdown redraws.
      minute: Shaped<number>
    }
  }
}
