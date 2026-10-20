"use client"

/**
 * Image viewer of a list of detections (Detection Map → cluster): the full
 * frame with its bounding box or the clean crop, zoomable (buttons, wheel,
 * + / − / 0, double-click, drag) and previous / next across the list
 * (buttons or ← / →). Esc closes.
 */
import { useEffect, useState } from "react"
import { ChevronLeft, ChevronRight } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { ZoomableImage, type BBox } from "@/components/zoomable-image"
import { useT } from "@/lib/i18n"
import { cn } from "@/lib/utils"

export interface ViewerItem {
  id: string
  title: string
  subtitle?: string | null
  frame: string | null
  crop: string | null
  bbox: BBox | null
}

type Mode = "frame" | "crop"

export function DetectionImageViewer({ items, index, onIndexChange, onClose }: {
  items: ViewerItem[]
  /** Item shown; null = closed. */
  index: number | null
  onIndexChange: (i: number) => void
  onClose: () => void
}) {
  const t = useT()
  const [mode, setMode] = useState<Mode>("frame")
  const item = index != null ? items[index] : null
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

  // Keep the chosen view when it exists for this item, else show the other one.
  const shown: Mode = item ? (mode === "frame" ? (item.frame ? "frame" : "crop") : (item.crop ? "crop" : "frame")) : mode
  const src = item ? (shown === "frame" ? item.frame : item.crop) : null

  return (
    <Dialog open={!!item} onOpenChange={(o) => { if (!o) onClose() }}>
      <DialogContent className="max-h-[96vh] gap-0 overflow-y-auto p-0 sm:max-w-5xl">
        {item && (
          <>
            <DialogHeader className="flex-row flex-wrap items-center justify-between gap-3 space-y-0 border-b p-4 pr-12">
              <div className="min-w-0">
                <DialogTitle className="truncate text-base">{item.title}</DialogTitle>
                <DialogDescription className="truncate text-xs">{item.subtitle || t("pmap.img.title")}</DialogDescription>
              </div>
              <div className="flex items-center gap-2">
                {item.frame && item.crop && (
                  <div className="flex rounded-lg border p-0.5 text-xs" role="group" aria-label={t("pmap.img.view")}>
                    {(["frame", "crop"] as const).map((m) => (
                      <button key={m} type="button" onClick={() => setMode(m)} aria-pressed={shown === m}
                        className={cn("rounded-md px-2.5 py-1 transition", shown === m ? "bg-primary text-primary-foreground" : "text-muted-foreground hover:bg-muted")}>
                        {t(m === "frame" ? "pmap.img.frame" : "pmap.img.crop")}
                      </button>
                    ))}
                  </div>
                )}
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
              </div>
            </DialogHeader>
            <div className="p-4">
              <ZoomableImage
                src={src}
                alt={item.title}
                bbox={shown === "frame" ? item.bbox : null}
                keyboard
                imgClassName="max-h-[72vh]"
              />
            </div>
          </>
        )}
      </DialogContent>
    </Dialog>
  )
}
