import type { AxiosInstance } from 'axios'
import { useSyncExternalStore } from 'react'

/**
 * Tracks requests in flight so the app can say what is going on when the API
 * is slow (Render's free tier sleeps and takes up to ~1 minute to wake up).
 */
const SLOW_AFTER_MS = 5000

let inFlight = 0
let slow = false
let slowTimer: ReturnType<typeof setTimeout> | null = null
const listeners = new Set<() => void>()
const emit = () => listeners.forEach((l) => l())

function started() {
  inFlight += 1
  if (inFlight === 1) {
    slowTimer = setTimeout(() => {
      slow = true
      emit()
    }, SLOW_AFTER_MS)
  }
}

function finished() {
  inFlight = Math.max(0, inFlight - 1)
  if (inFlight === 0) {
    if (slowTimer) clearTimeout(slowTimer)
    slowTimer = null
    if (slow) {
      slow = false
      emit()
    }
  }
}

export function trackRequests(client: AxiosInstance): void {
  client.interceptors.request.use((config) => {
    started()
    return config
  })
  client.interceptors.response.use(
    (response) => {
      finished()
      return response
    },
    (error) => {
      finished()
      return Promise.reject(error)
    },
  )
}

/** True while some request has been waiting for more than a few seconds. */
export function useServerSlow(): boolean {
  return useSyncExternalStore(
    (cb) => {
      listeners.add(cb)
      return () => listeners.delete(cb)
    },
    () => slow,
    () => false,
  )
}
