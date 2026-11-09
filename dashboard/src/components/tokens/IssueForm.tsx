import { useMutation, useQueryClient } from '@tanstack/react-query'
import { KeyRound } from 'lucide-react'
import { useState } from 'react'
import { DOMAIN_KEYS, DOMAINS, describeError } from '../../api/client'
import type { DomainKey } from '../../api/client'
import { createTeam, issueToken, useTeams } from '../../api/tokens'
import type { IssuedToken } from '../../api/tokens'
import { cn } from '../../lib/cn'
import { ROLE_META } from '../../lib/roles'
import { Button } from '../../ui/Button'
import { Panel } from '../../ui/Panel'

export interface IssuedHere {
  domain: DomainKey
  role: string
  token: IssuedToken
}

const ACTIONS = ['task:contribute', 'demo:read']
const ROLES = ['researcher', 'analyst', 'writer', 'reviewer', 'auditor']
const TTLS = [
  { label: '15 seconds', value: 15 },
  { label: '1 minute', value: 60 },
  { label: '15 minutes', value: 900 },
  { label: '1 hour', value: 3600 },
]
const NEW_TEAM = '__new__'

const field = 'w-full rounded-lg border border-line bg-raised px-3 py-2 text-sm text-fg outline-none focus:border-accent'

function Chip({ on, onClick, children, color }: { on: boolean; onClick: () => void; children: string; color?: string }) {
  return (
    <button
      type="button"
      aria-pressed={on}
      onClick={onClick}
      className={cn(
        'rounded-full border px-3 py-1 text-xs font-semibold transition',
        on ? 'bg-accent/15 text-fg' : 'border-line text-dim hover:text-fg',
      )}
      style={on ? { borderColor: color ?? 'var(--accent)' } : undefined}
    >
      {children}
    </button>
  )
}

export function IssueForm({ onIssued }: { onIssued: (t: IssuedHere) => void }) {
  const [domain, setDomain] = useState<DomainKey>('a')
  const [teamId, setTeamId] = useState(NEW_TEAM)
  const [teamName, setTeamName] = useState('demo-team')
  const [role, setRole] = useState('researcher')
  const [actions, setActions] = useState<string[]>(['task:contribute'])
  const [custom, setCustom] = useState('')
  const [audience, setAudience] = useState<DomainKey[]>(['a', 'b'])
  const [ttl, setTtl] = useState(900)
  const teams = useTeams(domain)
  const qc = useQueryClient()
  const hasTeams = (teams.data?.length ?? 0) > 0
  const chosenTeam = hasTeams && teams.data?.some((t) => t.team_id === teamId) ? teamId : hasTeams && teamId !== NEW_TEAM ? teams.data![0].team_id : NEW_TEAM

  const all = [...actions, ...custom.split(',').map((s) => s.trim()).filter(Boolean)]
  const issue = useMutation({
    mutationFn: async (): Promise<IssuedHere> => {
      let tid = chosenTeam
      if (tid === NEW_TEAM) {
        tid = (await createTeam(domain, teamName.trim() || 'demo-team')).team_id
        await qc.invalidateQueries({ queryKey: ['teams', domain] })
        setTeamId(tid)
      }
      const token = await issueToken(domain, {
        team_id: tid,
        role,
        permitted_actions: [...new Set(all)],
        audience_domains: audience.map((k) => DOMAINS[k].id),
        ttl_seconds: ttl,
      })
      return { domain, role, token }
    },
    onSuccess: (r) => {
      onIssued(r)
      void qc.invalidateQueries({ queryKey: ['token-ledger'] })
    },
  })

  const toggle = <T,>(list: T[], v: T) => (list.includes(v) ? list.filter((x) => x !== v) : [...list, v])

  return (
    <Panel title="Issue a token" icon={<KeyRound size={16} />}>
      <form
        className="space-y-4"
        onSubmit={(e) => {
          e.preventDefault()
          issue.mutate()
        }}
      >
        <div>
          <p className="mb-1.5 text-xs text-dim">Issued and signed by</p>
          <div className="flex gap-2">
            {DOMAIN_KEYS.map((k) => (
              <Chip
                key={k}
                on={domain === k}
                color={DOMAINS[k].color}
                onClick={() => {
                  setDomain(k)
                  setTeamId(NEW_TEAM)
                }}
              >
                {DOMAINS[k].label}
              </Chip>
            ))}
          </div>
        </div>
        <div className="grid gap-3 sm:grid-cols-2">
          <label className="block text-xs text-dim">
            Team
            <select className={cn(field, 'mt-1')} value={chosenTeam} onChange={(e) => setTeamId(e.target.value)}>
              {teams.data?.map((t) => (
                <option key={t.team_id} value={t.team_id}>
                  {t.name}
                </option>
              ))}
              <option value={NEW_TEAM}>New team…</option>
            </select>
          </label>
          {chosenTeam === NEW_TEAM ? (
            <label className="block text-xs text-dim">
              New team name
              <input className={cn(field, 'mt-1')} value={teamName} onChange={(e) => setTeamName(e.target.value)} />
            </label>
          ) : (
            <div />
          )}
        </div>
        <div>
          <p className="mb-1.5 text-xs text-dim">Role</p>
          <div className="flex flex-wrap gap-2">
            {ROLES.map((r) => (
              <Chip key={r} on={role === r} color={ROLE_META[r]?.color} onClick={() => setRole(r)}>
                {r}
              </Chip>
            ))}
          </div>
        </div>
        <div>
          <p className="mb-1.5 text-xs text-dim">Allowed actions</p>
          <div className="flex flex-wrap gap-2">
            {ACTIONS.map((a) => (
              <Chip key={a} on={actions.includes(a)} onClick={() => setActions(toggle(actions, a))}>
                {a}
              </Chip>
            ))}
          </div>
          <input
            className={cn(field, 'mt-2')}
            placeholder="Other actions, comma separated"
            value={custom}
            onChange={(e) => setCustom(e.target.value)}
            aria-label="Other actions"
          />
        </div>
        <div>
          <p className="mb-1.5 text-xs text-dim">Accepted by</p>
          <div className="flex flex-wrap gap-2">
            {DOMAIN_KEYS.map((k) => (
              <Chip
                key={k}
                on={audience.includes(k)}
                color={DOMAINS[k].color}
                onClick={() => setAudience(toggle(audience, k))}
              >
                {DOMAINS[k].label}
              </Chip>
            ))}
          </div>
          {DOMAIN_KEYS.filter((k) => !audience.includes(k)).map((k) => (
            <p key={k} className="mt-1.5 text-xs text-warn">{DOMAINS[k].label} will refuse it: it is not in the audience.</p>
          ))}
        </div>
        <div>
          <p className="mb-1.5 text-xs text-dim">Valid for</p>
          <div className="flex flex-wrap gap-2">
            {TTLS.map((t) => (
              <Chip key={t.value} on={ttl === t.value} onClick={() => setTtl(t.value)}>
                {t.label}
              </Chip>
            ))}
          </div>
        </div>
        {issue.isError && <p className="text-sm text-bad">{describeError(issue.error)}</p>}
        <Button type="submit" disabled={issue.isPending || all.length === 0 || audience.length === 0}>
          {issue.isPending ? 'Issuing…' : `Issue token from ${DOMAINS[domain].label}`}
        </Button>
      </form>
    </Panel>
  )
}
