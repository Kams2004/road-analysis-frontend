"use client"

/**
 * Dashboard date range, chosen in the top bar and read by the dashboard.
 * A tiny module-level store (no provider needed): the value is remembered
 * per browser and mirrored into the `?period=` URL param on the dashboard
 * so a shared link opens on the same range.
 */
import { useSyncExternalStore } from "react"

export const PERIODS = ["7d", "30d", "90d", "12m"] as const
export type Period = (typeof PERIODS)[number]

const STORAGE_KEY = "rr_dashboard_period"
const DEFAULT: Period = "30d"
const listeners = new Set<() => void>()
let current: Period | null = null

const isPeriod = (v: unknown): v is Period => typeof v === "string" && (PERIODS as readonly string[]).includes(v)

function read(): Period {
  if (current) return current
  let p: Period = DEFAULT
  try {
    const fromUrl = new URLSearchParams(window.location.search).get("period")
    const stored = localStorage.getItem(STORAGE_KEY)
    if (isPeriod(fromUrl)) p = fromUrl
    else if (isPeriod(stored)) p = stored
  } catch { /* storage / URL unavailable */ }
  current = p
  return p
}

export function setPeriod(p: Period) {
  current = p
  try { localStorage.setItem(STORAGE_KEY, p) } catch { /* ignore */ }
  try {
    if (window.location.pathname === "/") {
      const url = new URL(window.location.href)
      url.searchParams.set("period", p)
      window.history.replaceState(window.history.state, "", url)
    }
  } catch { /* ignore */ }
  listeners.forEach((l) => l())
}

function subscribe(l: () => void) {
  listeners.add(l)
  return () => { listeners.delete(l) }
}

export function usePeriod(): Period {
  return useSyncExternalStore(subscribe, read, () => DEFAULT)
}
