import axios from 'axios'

export type DomainKey = 'a' | 'b'

export interface DomainMeta {
  key: DomainKey
  id: string
  label: string
  color: string
}

export const DOMAINS: Record<DomainKey, DomainMeta> = {
  a: { key: 'a', id: 'domain-a', label: 'Domain A', color: 'var(--color-domain-a)' },
  b: { key: 'b', id: 'domain-b', label: 'Domain B', color: 'var(--color-domain-b)' },
}

export const DOMAIN_KEYS: DomainKey[] = ['a', 'b']

export function domainById(id: string | null | undefined): DomainMeta | undefined {
  return DOMAIN_KEYS.map((k) => DOMAINS[k]).find((d) => d.id === id)
}

// Requests go through the Vite dev proxy (see vite.config.ts), which adds the admin key.
export const api: Record<DomainKey, ReturnType<typeof axios.create>> = {
  a: axios.create({ baseURL: '/proxy/a/api/v1', timeout: 20000 }),
  b: axios.create({ baseURL: '/proxy/b/api/v1', timeout: 20000 }),
}

export const root: Record<DomainKey, ReturnType<typeof axios.create>> = {
  a: axios.create({ baseURL: '/proxy/a', timeout: 5000 }),
  b: axios.create({ baseURL: '/proxy/b', timeout: 5000 }),
}

export function describeError(err: unknown): string {
  if (axios.isAxiosError(err)) {
    const body = err.response?.data as { detail?: unknown; error?: { message?: string } } | undefined
    if (typeof body?.detail === 'string') return body.detail
    if (body?.error?.message) return body.error.message
    if (err.response) return `Request failed with HTTP ${err.response.status}.`
    return 'The backend did not answer. Check that it is running.'
  }
  return err instanceof Error ? err.message : 'Unknown error.'
}
