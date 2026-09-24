/** Injected time, so pacing is real in production and instant in tests. */
export interface Clock {
  now(): number;
  sleep(ms: number): Promise<void>;
}
