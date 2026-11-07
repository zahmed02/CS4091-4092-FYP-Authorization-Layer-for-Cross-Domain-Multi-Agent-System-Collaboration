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
  if (left <= 0) return 'expired'
  const m = Math.floor(left / 60)
  return `${m}m ${String(left % 60).padStart(2, '0')}s left`
}
