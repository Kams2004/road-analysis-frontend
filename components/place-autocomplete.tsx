"use client"

/**
 * Place field with autocomplete (Nominatim, biased to Cameroon / the current
 * map view): suggestions while typing (debounced), ↑/↓ + Enter or click to
 * pick, Escape to close; each suggestion shows the name and a secondary
 * address line. Optional "My position" button that fills the field with the
 * reverse-geocoded place name ("Ndoghem, Douala").
 *
 *   <PlaceAutocomplete id="from" label="Départ" value={from} onChange={setFrom} withMyPosition />
 */
import { useEffect, useId, useRef, useState } from "react"
import { Crosshair, Loader2, MapPin, X } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { usePlaceSearch, PLACE_SEARCH_MIN_CHARS } from "@/hooks/use-place-search"
import { useI18n } from "@/lib/i18n"
import { reversePlace, type Place, type ViewBox } from "@/lib/routes-api"
import { cn } from "@/lib/utils"

export type { Place } from "@/lib/routes-api"

export function PlaceAutocomplete({
  id, label, value, onChange, placeholder, withMyPosition, viewbox, className, compact, autoFocus,
}: {
  id?: string
  label?: string
  value: Place | null
  onChange: (p: Place | null) => void
  placeholder?: string
  withMyPosition?: boolean
  /** Preferred search area (e.g. the visible map); Cameroon when omitted. */
  viewbox?: ViewBox | null
  className?: string
  /** Smaller input (toolbars). */
  compact?: boolean
  autoFocus?: boolean
}) {
  const { t, lang } = useI18n()
  const autoId = useId()
  const inputId = id ?? `place-${autoId}`
  const listId = `${inputId}-list`
  const [text, setText] = useState(value?.label ?? "")
  const [typing, setTyping] = useState(false)
  const [open, setOpen] = useState(false)
  const [active, setActive] = useState(-1)
  const [locating, setLocating] = useState(false)
  const [geoErr, setGeoErr] = useState<string | null>(null)
  const typingRef = useRef(false)
  typingRef.current = typing

  const { items, busy, doneFor } = usePlaceSearch(text, typing, viewbox)

  // Value set from outside (pick, swap, road section, "My position", clear).
  useEffect(() => {
    if (value) {
      setText(value.label)
      setTyping(false)
      setOpen(false)
    } else if (!typingRef.current) {
      setText("")
    }
  }, [value])

  useEffect(() => { setActive(items.length ? 0 : -1) }, [items])

  const pick = (p: Place) => {
    setTyping(false)
    setText(p.label)
    setOpen(false)
    onChange(p)
  }

  const onKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === "ArrowDown") {
      e.preventDefault()
      if (!open) setOpen(true)
      if (items.length) setActive((i) => (i + 1) % items.length)
    } else if (e.key === "ArrowUp") {
      e.preventDefault()
      if (items.length) setActive((i) => (i <= 0 ? items.length - 1 : i - 1))
    } else if (e.key === "Enter") {
      // Pick the highlighted suggestion instead of submitting the form.
      if (open && items.length && typing) {
        e.preventDefault()
        pick(items[Math.max(0, active)])
      }
    } else if (e.key === "Escape") {
      if (open) { e.preventDefault(); setOpen(false) }
    }
  }

  const useMyPosition = () => {
    if (!navigator.geolocation) { setGeoErr(t("hist.route.geoError")); return }
    setLocating(true)
    setGeoErr(null)
    navigator.geolocation.getCurrentPosition(
      async (pos) => {
        const { latitude: lat, longitude: lon } = pos.coords
        setText(t("rt.locatingName"))
        const place = await reversePlace(lat, lon, lang)
        setLocating(false)
        pick(place)
      },
      () => { setLocating(false); setGeoErr(t("hist.route.geoError")) },
      { enableHighAccuracy: true, timeout: 10000, maximumAge: 60000 },
    )
  }

  const q = text.trim()
  const showList = open && typing && q.length >= PLACE_SEARCH_MIN_CHARS && (items.length > 0 || doneFor === q)
  const h = compact ? "h-8" : "h-9"

  return (
    <div className={cn("relative min-w-0 space-y-1", className)}>
      {label && <Label htmlFor={inputId} className="text-xs">{label}</Label>}
      <div className="flex gap-2">
        <div className="relative min-w-0 flex-1">
          <MapPin className={cn("pointer-events-none absolute left-2.5 h-3.5 w-3.5 text-muted-foreground", compact ? "top-2.5" : "top-3")} />
          <Input
            id={inputId}
            value={text}
            placeholder={placeholder}
            autoComplete="off"
            autoFocus={autoFocus}
            spellCheck={false}
            onChange={(e) => {
              setTyping(true)
              setText(e.target.value)
              setOpen(true)
              if (value) onChange(null)
            }}
            onFocus={() => { if (typing) setOpen(true) }}
            onBlur={() => window.setTimeout(() => setOpen(false), 150)}
            onKeyDown={onKeyDown}
            className={cn(h, "pl-7 pr-8", compact && "text-xs md:text-xs")}
            role="combobox"
            aria-autocomplete="list"
            aria-expanded={showList}
            aria-controls={listId}
            aria-activedescendant={showList && active >= 0 ? `${listId}-${active}` : undefined}
          />
          {busy ? (
            <Loader2 className={cn("absolute right-2 h-4 w-4 animate-spin text-muted-foreground", compact ? "top-2" : "top-2.5")} />
          ) : text ? (
            <button
              type="button"
              className={cn("absolute right-1.5 rounded p-0.5 text-muted-foreground hover:text-foreground", compact ? "top-1.5" : "top-2")}
              aria-label={t("rt.clearField")}
              title={t("rt.clearField")}
              onMouseDown={(e) => e.preventDefault()}
              onClick={() => { setTyping(false); setText(""); setOpen(false); onChange(null) }}
            >
              <X className="h-3.5 w-3.5" />
            </button>
          ) : null}
          {showList && (
            <ul
              id={listId}
              role="listbox"
              className="absolute left-0 z-[3000] mt-1 max-h-72 w-full min-w-[16rem] overflow-auto rounded-md border border-border bg-popover py-1 text-sm text-popover-foreground shadow-lg"
            >
              {items.length === 0 ? (
                <li className="px-3 py-2 text-xs text-muted-foreground">{t("rt.noPlaces")}</li>
              ) : items.map((p, i) => (
                <li
                  key={`${p.lat},${p.lon},${i}`}
                  id={`${listId}-${i}`}
                  role="option"
                  aria-selected={i === active}
                  className={cn("flex cursor-pointer items-start gap-2 px-3 py-1.5", i === active ? "bg-muted" : "hover:bg-muted/60")}
                  onMouseDown={(e) => e.preventDefault()}
                  onMouseEnter={() => setActive(i)}
                  onClick={() => pick(p)}
                >
                  <MapPin className="mt-0.5 h-3.5 w-3.5 shrink-0 text-muted-foreground" />
                  <span className="min-w-0">
                    <span className="block truncate font-medium">{p.label}</span>
                    {p.secondary && <span className="block truncate text-xs text-muted-foreground">{p.secondary}</span>}
                  </span>
                </li>
              ))}
            </ul>
          )}
        </div>
        {withMyPosition && (
          <Button
            type="button" variant="outline" size="sm"
            className={cn(h, "shrink-0 gap-1.5")}
            onClick={useMyPosition} disabled={locating}
            title={t("hist.route.myPosition")} aria-label={t("hist.route.myPosition")}
          >
            {locating ? <Loader2 className="h-4 w-4 animate-spin" /> : <Crosshair className="h-4 w-4" />}
            {!compact && <span className="hidden sm:inline">{locating ? t("hist.route.locating") : t("hist.route.myPosition")}</span>}
          </Button>
        )}
      </div>
      {geoErr && <p className="text-xs text-destructive">{geoErr}</p>}
    </div>
  )
}
