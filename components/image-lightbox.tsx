"use client"

/**
 * In-app media lightbox — every picture (and clip) of the console opens here,
 * never in a new browser tab.
 *
 * - `ImageLightboxProvider` (mounted once in the root layout) renders the
 *   dialog and exposes `useImageLightbox().open(items, index)`.
 * - Code that only has an HTML string (Leaflet popups, …) can dispatch
 *   `openLightbox(items, index)` (a window CustomEvent) instead.
 * - `ImageLightbox` is the controlled dialog itself: zoom (wheel, buttons,
 *   + / − / 0, double-click), pan (drag), fit / 1:1, ← / → across a list,
 *   Esc closes. Videos play in an inline <video controls> player.
 */
import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from "react"
import { ChevronLeft, ChevronRight } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { ZoomableImage, type BBox } from "@/components/zoomable-image"
import { useT } from "@/lib/i18n"

export interface LightboxItem {
  src: string | null
  title?: string | null
  subtitle?: string | null
  /** Box in the image's natural pixels, drawn over it. */
  bbox?: BBox | null
  kind?: "image" | "video"
}

export const LIGHTBOX_EVENT = "viasafe:lightbox"

/** Open the lightbox from anywhere (also from non-React HTML, e.g. map popups). */
export function openLightbox(items: LightboxItem | LightboxItem[], index = 0) {
  if (typeof window === "undefined") return
  const list = Array.isArray(items) ? items : [items]
  window.dispatchEvent(new CustomEvent(LIGHTBOX_EVENT, { detail: { items: list, index } }))
}

type Ctx = { open: (items: LightboxItem | LightboxItem[], index?: number) => void }
const LightboxContext = createContext<Ctx>({ open: openLightbox })

export function useImageLightbox(): Ctx {
  return useContext(LightboxContext)
}

export function ImageLightboxProvider({ children }: { children: ReactNode }) {
  const [items, setItems] = useState<LightboxItem[]>([])
  const [index, setIndex] = useState<number | null>(null)

  const open = useCallback((it: LightboxItem | LightboxItem[], i = 0) => {
    const list = (Array.isArray(it) ? it : [it]).filter((x) => !!x.src)
    if (!list.length) return
    setItems(list)
    setIndex(Math.min(Math.max(0, i), list.length - 1))
  }, [])

  useEffect(() => {
    const onEvent = (e: Event) => {
      const d = (e as CustomEvent<{ items: LightboxItem[]; index?: number }>).detail
      if (d?.items) open(d.items, d.index ?? 0)
    }
    window.addEventListener(LIGHTBOX_EVENT, onEvent)
    return () => window.removeEventListener(LIGHTBOX_EVENT, onEvent)
  }, [open])

  const value = useMemo(() => ({ open }), [open])
  return (
    <LightboxContext.Provider value={value}>
      {children}
      <ImageLightbox items={items} index={index} onIndexChange={setIndex} onClose={() => setIndex(null)} />
    </LightboxContext.Provider>
  )
}

export function ImageLightbox({ items, index, onIndexChange, onClose }: {
  items: LightboxItem[]
  /** Item shown; null = closed. */
  index: number | null
  onIndexChange: (i: number) => void
  onClose: () => void
}) {
  const t = useT()
  const item = index != null ? items[index] ?? null : null
  const prev = index != null && index > 0 ? index - 1 : null
  const next = index != null && index < items.length - 1 ? index + 1 : null

  useEffect(() => {
    if (index == null) return
    const onKey = (e: KeyboardEvent) => {
      const tag = (e.target as HTMLElement | null)?.tagName
      if (tag === "INPUT" || tag === "TEXTAREA") return
      if (e.key === "ArrowLeft" && prev != null) { e.preventDefault(); onIndexChange(prev) }
      if (e.key === "ArrowRight" && next != null) { e.preventDefault(); onIndexChange(next) }
    }
    window.addEventListener("keydown", onKey)
    return () => window.removeEventListener("keydown", onKey)
  }, [index, prev, next, onIndexChange])

  const isVideo = item?.kind === "video"
  const title = item?.title || t(isVideo ? "m6.ev.clip" : "pmap.img.title")

  return (
    <Dialog open={!!item} onOpenChange={(o) => { if (!o) onClose() }}>
      <DialogContent className="max-h-[96vh] gap-0 overflow-y-auto p-0 sm:max-w-5xl" data-lightbox="">
        {item && (
          <>
            <DialogHeader className="flex-row flex-wrap items-center justify-between gap-3 space-y-0 border-b p-4 pr-12">
              <div className="min-w-0">
                <DialogTitle className="truncate text-base">{title}</DialogTitle>
                <DialogDescription className="truncate text-xs">{item.subtitle || t("pmap.val.fullScreen")}</DialogDescription>
              </div>
              {items.length > 1 && (
                <div className="flex items-center gap-1">
                  <Button variant="outline" size="icon" className="h-8 w-8" disabled={prev == null}
                    onClick={() => prev != null && onIndexChange(prev)} title={t("ht.ev.prev")} aria-label={t("ht.ev.prev")}>
                    <ChevronLeft className="h-4 w-4" />
                  </Button>
                  <span className="min-w-14 text-center text-xs tabular-nums text-muted-foreground">
                    {t("ht.ev.of", { i: (index ?? 0) + 1, n: items.length })}
                  </span>
                  <Button variant="outline" size="icon" className="h-8 w-8" disabled={next == null}
                    onClick={() => next != null && onIndexChange(next)} title={t("ht.ev.next")} aria-label={t("ht.ev.next")}>
                    <ChevronRight className="h-4 w-4" />
                  </Button>
                </div>
              )}
            </DialogHeader>
            <div className="p-4">
              {isVideo ? (
                <video key={item.src ?? ""} src={item.src ?? undefined} controls autoPlay playsInline
                  className="mx-auto block max-h-[72vh] w-full rounded-xl bg-black" />
              ) : (
                <ZoomableImage src={item.src} alt={title} bbox={item.bbox ?? null} keyboard expandable={false}
                  imgClassName="max-h-[72vh]" />
              )}
            </div>
          </>
        )}
      </DialogContent>
    </Dialog>
  )
}

/**
 * Wraps a picture so a click opens it in the lightbox (instead of a new tab).
 * Stops propagation so a clickable table row / card under it is not triggered.
 */
export function LightboxTrigger({ item, items, index = 0, className, children, label }: {
  item?: LightboxItem
  items?: LightboxItem[]
  index?: number
  className?: string
  children: ReactNode
  label?: string
}) {
  const t = useT()
  const { open } = useImageLightbox()
  const text = label ?? t("pmap.map.openImage")
  return (
    <button type="button" title={text} aria-label={text}
      onClick={(e) => { e.stopPropagation(); e.preventDefault(); open(items ?? (item ? [item] : []), index) }}
      className={`block cursor-zoom-in focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary ${className ?? ""}`}>
      {children}
    </button>
  )
}
