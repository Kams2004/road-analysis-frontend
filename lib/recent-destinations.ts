export interface Destination {
  id: string
  name: string
  address: string
  lat: number
  lng: number
  visitedAt: string // ISO string
}

const STORAGE_KEY = "roadguard_recent_destinations"
const MAX_RECENT = 8

export function getRecentDestinations(): Destination[] {
  if (typeof window === "undefined") return []
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    if (!raw) return []
    return JSON.parse(raw) as Destination[]
  } catch {
    return []
  }
}

export function saveDestination(dest: Omit<Destination, "id" | "visitedAt">): Destination {
  const existing = getRecentDestinations()

  // Remove duplicate by lat/lng proximity (same place)
  const filtered = existing.filter(
    (d) => !(Math.abs(d.lat - dest.lat) < 0.0001 && Math.abs(d.lng - dest.lng) < 0.0001)
  )

  const newDest: Destination = {
    ...dest,
    id: crypto.randomUUID(),
    visitedAt: new Date().toISOString(),
  }

  const updated = [newDest, ...filtered].slice(0, MAX_RECENT)

  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(updated))
  } catch {
    // storage quota exceeded — ignore
  }

  return newDest
}

export function clearRecentDestinations(): void {
  if (typeof window === "undefined") return
  localStorage.removeItem(STORAGE_KEY)
}
