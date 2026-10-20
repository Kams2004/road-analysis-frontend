"use client"

/**
 * Debounced place autocomplete (Nominatim through GET /routes/geocode/search,
 * biased to Cameroon or to the given view box).
 *
 *   const { items, busy } = usePlaceSearch(text, enabled, viewbox)
 */
import { useEffect, useState } from "react"
import { useI18n } from "@/lib/i18n"
import { searchPlaces, type Place, type ViewBox } from "@/lib/routes-api"

export const PLACE_SEARCH_DEBOUNCE_MS = 350
export const PLACE_SEARCH_MIN_CHARS = 2

export function usePlaceSearch(text: string, enabled: boolean, viewbox?: ViewBox | null) {
  const { lang } = useI18n()
  const [items, setItems] = useState<Place[]>([])
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState(false)
  const [doneFor, setDoneFor] = useState<string | null>(null)   // query the current items answer
  const vbKey = viewbox ? viewbox.map((n) => n.toFixed(2)).join(",") : ""

  useEffect(() => {
    const q = text.trim()
    if (!enabled || q.length < PLACE_SEARCH_MIN_CHARS) {
      setItems([])
      setBusy(false)
      setDoneFor(null)
      return
    }
    const ctrl = new AbortController()
    const timer = window.setTimeout(() => {
      setBusy(true)
      setError(false)
      searchPlaces(q, lang, ctrl.signal, viewbox)
        .then((r) => { if (!ctrl.signal.aborted) { setItems(r); setDoneFor(q) } })
        .catch((e) => { if ((e as Error).name !== "AbortError") { setItems([]); setError(true) } })
        .finally(() => { if (!ctrl.signal.aborted) setBusy(false) })
    }, PLACE_SEARCH_DEBOUNCE_MS)
    return () => { window.clearTimeout(timer); ctrl.abort() }
    // viewbox is tracked through vbKey (a new array each render must not re-trigger).
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [text, enabled, lang, vbKey])

  return { items, busy, error, doneFor }
}
