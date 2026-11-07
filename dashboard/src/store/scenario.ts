import axios from 'axios'
import { create } from 'zustand'
import { api, describeError } from '../api/client'
import type { RunStatus, ScenarioEvent, ScenarioName, ScenarioRun } from '../api/types'

type UiStatus = 'idle' | 'starting' | RunStatus

interface ScenarioState {
  scenario: ScenarioName
  revokeAfter: number
  runId: string | null
  status: UiStatus
  exitCode: number | null
  error: string | null
  events: ScenarioEvent[]
  setScenario: (s: ScenarioName) => void
  setRevokeAfter: (n: number) => void
  start: () => Promise<void>
  reset: () => void
}

let generation = 0
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms))

// The run lives in this store, not in the page, so navigating away does not stop it.
export const useScenario = create<ScenarioState>((set, get) => ({
  scenario: 'revoke',
  revokeAfter: 1,
  runId: null,
  status: 'idle',
  exitCode: null,
  error: null,
  events: [],
  setScenario: (scenario) => set({ scenario }),
  setRevokeAfter: (revokeAfter) => set({ revokeAfter }),
  reset: () => {
    generation += 1
    set({ runId: null, status: 'idle', exitCode: null, error: null, events: [] })
  },
  start: async () => {
    const gen = ++generation
    set({ status: 'starting', error: null, events: [], exitCode: null, runId: null })
    const { scenario, revokeAfter } = get()
    try {
      const started = await api.a.post<{ run_id: string }>('/scenarios/run', {
        scenario,
        revoke_after: revokeAfter,
      })
      const runId = started.data.run_id
      set({ runId, status: 'running' })
      let after = -1
      while (gen === generation) {
        const res = await api.a.get<ScenarioRun>(`/scenarios/runs/${runId}`, {
          params: { after },
        })
        if (gen !== generation) return
        const fresh = res.data.events
        if (fresh.length > 0) after = fresh[fresh.length - 1].seq
        set((s) => ({
          events: [...s.events, ...fresh],
          status: res.data.status,
          exitCode: res.data.exit_code,
          error: res.data.error,
        }))
        if (res.data.status !== 'running') return
        await sleep(350)
      }
    } catch (err) {
      if (gen !== generation) return
      const conflict = axios.isAxiosError(err) && err.response?.status === 409
      set({ status: 'failed', error: conflict ? describeError(err) : describeError(err) })
    }
  },
}))
