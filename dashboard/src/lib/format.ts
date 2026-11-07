export function shortId(id: string | null | undefined, n = 8): string {
  return id ? id.slice(0, n) : 'n/a'
}

export function ms(value: number | null | undefined): string {
  if (value === null || value === undefined) return 'n/a'
  return value < 10 ? `${value.toFixed(2)} ms` : `${value.toFixed(0)} ms`
}

export function clock(iso: string): string {
  return new Date(iso).toLocaleTimeString([], { hour12: false })
}

export function megabytes(bytes: number): string {
  return `${(bytes / 1024 / 1024).toFixed(1)} MB`
}

export function countdown(iso: string, now: number): string {
  const left = Math.round((new Date(iso).getTime() - now) / 1000)
  if (left <= 0) return 'lifetime over'
  const m = Math.floor(left / 60)
  return `${m}m ${String(left % 60).padStart(2, '0')}s left`
}

export function wallClock(epochMs: number): string {
  return new Date(epochMs).toLocaleTimeString([], { hour12: false })
}

export function seconds(t: number): string {
  return `${t.toFixed(1)} s`
}

export function median(values: number[]): number | null {
  if (values.length === 0) return null
  const s = [...values].sort((a, b) => a - b)
  const mid = Math.floor(s.length / 2)
  return s.length % 2 ? s[mid] : (s[mid - 1] + s[mid]) / 2
}

export function percentile(values: number[], p: number): number | null {
  if (values.length === 0) return null
  const s = [...values].sort((a, b) => a - b)
  return s[Math.min(s.length - 1, Math.ceil((p / 100) * s.length) - 1)]
}
