import { create } from 'zustand'
import { api, describeError } from '../api/client'
import type { Pace, RunStatus, ScenarioEvent, ScenarioName, ScenarioRun } from '../api/types'

type UiStatus = 'idle' | 'starting' | RunStatus

interface ReplayState {
  runId: string
  speed: number
  playing: boolean
  duration: number
  position: number
}

interface ScenarioState {
  scenario: ScenarioName
  revokeAfter: number
  topic: string
  pace: Pace
  runId: string | null
  startedAt: number | null
  status: UiStatus
  exitCode: number | null
  error: string | null
  events: ScenarioEvent[]
  waiting: string | null
  replay: ReplayState | null
  setScenario: (s: ScenarioName) => void
  setRevokeAfter: (n: number) => void
  setTopic: (t: string) => void
  setPace: (p: Pace) => Promise<void>
  start: () => Promise<void>
  next: () => Promise<void>
  revoke: (role: string) => Promise<void>
  reset: () => void
  playReplay: (runId: string) => Promise<void>
  setReplaySpeed: (speed: number) => void
  toggleReplay: () => void
}

let generation = 0
let replayTimer: ReturnType<typeof setInterval> | null = null
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms))

function stopTimer() {
  if (replayTimer) clearInterval(replayTimer)
  replayTimer = null
}

// The run lives in this store, not in the page, so navigating away does not stop it.
export const useScenario = create<ScenarioState>((set, get) => ({
  scenario: 'team',
  revokeAfter: 1,
  topic: '',
  pace: 'slow',
  runId: null,
  startedAt: null,
  status: 'idle',
  exitCode: null,
  error: null,
  events: [],
  waiting: null,
  replay: null,
  setScenario: (scenario) => set({ scenario }),
  setRevokeAfter: (revokeAfter) => set({ revokeAfter }),
  setTopic: (topic) => set({ topic }),

  setPace: async (pace) => {
    set({ pace })
    const { runId, status, replay } = get()
    if (replay || !runId || status !== 'running') return
    try {
      await api.a.post(`/scenarios/runs/${runId}/control`, { mode: pace })
    } catch (err) {
      set({ error: describeError(err) })
    }
  },

  next: async () => {
    const { runId, status } = get()
    if (!runId || status !== 'running') return
    try {
      await api.a.post(`/scenarios/runs/${runId}/next`)
      set({ waiting: null })
    } catch (err) {
      set({ error: describeError(err) })
    }
  },

  revoke: async (role) => {
    const { runId, status } = get()
    if (!runId || status !== 'running') return
    try {
      await api.a.post(`/scenarios/runs/${runId}/revoke`, { role })
    } catch (err) {
      set({ error: describeError(err) })
    }
  },

  reset: () => {
    generation += 1
    stopTimer()
    set({
      runId: null,
      startedAt: null,
      status: 'idle',
      exitCode: null,
      error: null,
      events: [],
      waiting: null,
      replay: null,
    })
  },

  start: async () => {
    const gen = ++generation
    stopTimer()
    set({
      status: 'starting',
      error: null,
      events: [],
      exitCode: null,
      runId: null,
      waiting: null,
      replay: null,
    })
    const { scenario, revokeAfter, topic, pace } = get()
    try {
      const started = await api.a.post<{ run_id: string }>('/scenarios/run', {
        scenario,
        revoke_after: revokeAfter,
        topic: topic.trim() || null,
        pace,
      })
      const runId = started.data.run_id
      set({ runId, status: 'running', startedAt: Date.now() })
      let after = -1
      while (gen === generation) {
        const res = await api.a.get<ScenarioRun>(`/scenarios/runs/${runId}`, { params: { after } })
        if (gen !== generation) return
        const fresh = res.data.events
        if (fresh.length > 0) after = fresh[fresh.length - 1].seq
        set((s) => ({
          events: [...s.events, ...fresh],
          status: res.data.status,
          exitCode: res.data.exit_code,
          error: res.data.error,
          waiting: res.data.waiting,
          pace: res.data.mode,
          startedAt: res.data.started_at * 1000,
        }))
        if (res.data.status !== 'running') return
        await sleep(300)
      }
    } catch (err) {
      if (gen !== generation) return
      set({ status: 'failed', error: describeError(err) })
    }
  },

  // Replays a saved run at its recorded timing, so the jury can watch it again.
  playReplay: async (runId) => {
    const gen = ++generation
    stopTimer()
    set({ status: 'starting', error: null, events: [], waiting: null, replay: null, runId })
    try {
      const res = await api.a.get<ScenarioRun>(`/scenarios/runs/${runId}`)
      if (gen !== generation) return
      const all = res.data.events
      const duration = all.length ? all[all.length - 1].t : 0
      let position = 0
      let cursor = 0
      set({
        status: 'running',
        scenario: res.data.scenario,
        topic: res.data.topic,
        startedAt: res.data.started_at * 1000,
        replay: { runId, speed: 1, playing: true, duration, position: 0 },
      })
      replayTimer = setInterval(() => {
        const rp = get().replay
        if (!rp || gen !== generation) return stopTimer()
        if (!rp.playing) return
        position += 0.1 * rp.speed
        const fresh: ScenarioEvent[] = []
        while (cursor < all.length && all[cursor].t <= position) fresh.push(all[cursor++])
        const finished = cursor >= all.length
        set((s) => ({
          events: fresh.length ? [...s.events, ...fresh] : s.events,
          replay: { ...rp, position: Math.min(position, duration) },
          ...(finished
            ? { status: res.data.status === 'failed' ? ('failed' as const) : ('completed' as const), exitCode: res.data.exit_code }
            : {}),
        }))
        if (finished) stopTimer()
      }, 100)
    } catch (err) {
      if (gen !== generation) return
      set({ status: 'failed', error: describeError(err) })
    }
  },

  setReplaySpeed: (speed) => set((s) => (s.replay ? { replay: { ...s.replay, speed } } : {})),
  toggleReplay: () =>
    set((s) => (s.replay ? { replay: { ...s.replay, playing: !s.replay.playing } } : {})),
}))
