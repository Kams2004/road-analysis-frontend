"use client"

/**
 * Zoomable image with an optional bounding box overlay — shared by the
 * Hazard Track evidence viewer and the Detection Map image viewer.
 *
 * Zoom: buttons, mouse wheel (towards the cursor), keyboard (+ / − / 0 when
 * `keyboard` is set), double-click (zoom to the box, or ×2 at the cursor;
 * double-click again resets). Drag to pan once zoomed.
 */
import { useCallback, useEffect, useRef, useState } from "react"
import { Crosshair, ExternalLink, ImageIcon, Maximize, Minimize2, Minus, Plus, ScanSearch } from "lucide-react"
import { useT } from "@/lib/i18n"
import { cn } from "@/lib/utils"

export interface BBox { x1: number; y1: number; x2: number; y2: number }

/** Bounding box of a detection when all four coordinates are known. */
export function bboxOf(d: {
  bbox_x1?: number | null; bbox_y1?: number | null; bbox_x2?: number | null; bbox_y2?: number | null
}): BBox | null {
  return d.bbox_x1 != null && d.bbox_y1 != null && d.bbox_x2 != null && d.bbox_y2 != null
    ? { x1: d.bbox_x1, y1: d.bbox_y1, x2: d.bbox_x2, y2: d.bbox_y2 }
    : null
}

const MIN_ZOOM = 1
const MAX_ZOOM = 8

type ZoomableImageProps = {
  src: string | null
  alt: string
  /** Box in the image's natural pixels (drawn over it, togglable). */
  bbox?: BBox | null
  /** Bind + / − / 0 on the window (only one instance on screen should). */
  keyboard?: boolean
  /** Size limits of the image (default max-h-[60vh]). */
  imgClassName?: string
  className?: string
  /** Show the box toggle + hint line under the image. */
  footer?: boolean
}

/** A new image starts fitted (fresh zoom / pan / size state per src). */
export function ZoomableImage(props: ZoomableImageProps) {
  return <ZoomableImageInner key={props.src ?? ""} {...props} />
}

function ZoomableImageInner({
  src, alt, bbox = null, keyboard = false, imgClassName, className, footer = true,
}: ZoomableImageProps) {
  const t = useT()
  const boxRef = useRef<HTMLDivElement>(null)
  const innerRef = useRef<HTMLDivElement>(null)
  const imgRef = useRef<HTMLImageElement>(null)
  const [size, setSize] = useState<{ w: number; h: number } | null>(null)
  const [zoom, setZoom] = useState(1)
  const [pan, setPan] = useState({ x: 0, y: 0 })
  const [dragging, setDragging] = useState(false)
  const [showBox, setShowBox] = useState(true)
  const drag = useRef<{ x: number; y: number; px: number; py: number } | null>(null)
  // Latest values for the native wheel / key listeners.
  const state = useRef({ zoom, pan })
  state.current = { zoom, pan }
  const hasBox = !!bbox

  const reset = useCallback(() => { state.current = { zoom: 1, pan: { x: 0, y: 0 } }; setZoom(1); setPan({ x: 0, y: 0 }) }, [])

  /** Point of the container (client coords, or its centre) in the inner box's untransformed frame. */
  const localPoint = useCallback((clientX?: number, clientY?: number) => {
    const box = boxRef.current, inner = innerRef.current
    if (!box || !inner) return { x: 0, y: 0 }
    const r = box.getBoundingClientRect()
    const cx = clientX != null ? clientX - r.left : r.width / 2
    const cy = clientY != null ? clientY - r.top : r.height / 2
    return { x: cx - inner.offsetLeft, y: cy - inner.offsetTop }
  }, [])

  /** Zoom to `nz`, keeping the image point under (clientX, clientY) — or the centre — in place. */
  const zoomTo = useCallback((nz: number, clientX?: number, clientY?: number) => {
    const { zoom: z, pan: p } = state.current
    const next = Math.min(MAX_ZOOM, Math.max(MIN_ZOOM, nz))
    if (next === MIN_ZOOM) { reset(); return }
    const c = localPoint(clientX, clientY)
    const np = { x: c.x - (c.x - p.x) * (next / z), y: c.y - (c.y - p.y) * (next / z) }
    // Several wheel events can arrive before the next render.
    state.current = { zoom: next, pan: np }
    setPan(np)
    setZoom(next)
  }, [localPoint, reset])
  const zoomBy = useCallback((f: number, clientX?: number, clientY?: number) =>
    zoomTo(state.current.zoom * f, clientX, clientY), [zoomTo])

  /** Natural pixels (1:1). */
  const actualSize = () => {
    const img = imgRef.current
    if (!img || !size || !img.clientWidth) return
    zoomTo(size.w / img.clientWidth)
  }

  const zoomToBox = () => {
    const img = imgRef.current
    if (!bbox || !size || !img) return
    const bw = (bbox.x2 - bbox.x1) / size.w, bh = (bbox.y2 - bbox.y1) / size.h
    const nz = Math.min(MAX_ZOOM, Math.max(1.5, 0.55 / Math.max(bw, bh, 0.01)))
    // Box centre in the image's rendered (untransformed) pixels.
    const b = { x: ((bbox.x1 + bbox.x2) / 2 / size.w) * img.clientWidth, y: ((bbox.y1 + bbox.y2) / 2 / size.h) * img.clientHeight }
    const c = localPoint()
    setPan({ x: c.x - nz * b.x, y: c.y - nz * b.y })
    setZoom(nz)
  }

  // Wheel zoom needs a non-passive listener to stop the page from scrolling.
  useEffect(() => {
    const el = boxRef.current
    if (!el) return
    const onWheel = (e: WheelEvent) => {
      e.preventDefault()
      zoomBy(e.deltaY < 0 ? 1.2 : 1 / 1.2, e.clientX, e.clientY)
    }
    el.addEventListener("wheel", onWheel, { passive: false })
    return () => el.removeEventListener("wheel", onWheel)
  }, [zoomBy])

  useEffect(() => {
    if (!keyboard) return
    const onKey = (e: KeyboardEvent) => {
      const tag = (e.target as HTMLElement | null)?.tagName
      if (tag === "INPUT" || tag === "TEXTAREA" || e.ctrlKey || e.metaKey || e.altKey) return
      if (e.key === "+" || e.key === "=") { e.preventDefault(); zoomBy(1.4) }
      else if (e.key === "-" || e.key === "_") { e.preventDefault(); zoomBy(1 / 1.4) }
      else if (e.key === "0") { e.preventDefault(); reset() }
    }
    window.addEventListener("keydown", onKey)
    return () => window.removeEventListener("keydown", onKey)
  }, [keyboard, zoomBy, reset])

  if (!src) {
    return (
      <div className={cn("flex aspect-video flex-col items-center justify-center gap-2 rounded-xl bg-muted text-muted-foreground", className)}>
        <ImageIcon className="h-10 w-10" /><span className="text-xs">{t("ht.ev.noImage")}</span>
      </div>
    )
  }
  const controls = [
    { Icon: Plus, label: `${t("ht.ev.zoomIn")} (+)`, on: () => zoomBy(1.4), off: zoom >= MAX_ZOOM },
    { Icon: Minus, label: `${t("ht.ev.zoomOut")} (−)`, on: () => zoomBy(1 / 1.4), off: zoom <= MIN_ZOOM },
    { Icon: Minimize2, label: `${t("ht.ev.fit")} (0)`, on: reset, off: zoom === 1 },
    { Icon: ScanSearch, label: t("ht.ev.actual"), on: actualSize, off: !size },
    ...(hasBox ? [{ Icon: Crosshair, label: t("ht.ev.zoomBox"), on: zoomToBox, off: !size }] : []),
    { Icon: Maximize, label: t("pmap.val.fullScreen"), on: () => window.open(src, "_blank"), off: false },
  ]
  return (
    <div className={cn("space-y-1.5", className)}>
      <div
        ref={boxRef}
        className={cn("relative touch-none overflow-hidden rounded-xl bg-slate-950", zoom > 1 ? "cursor-grab active:cursor-grabbing" : "cursor-zoom-in")}
        onPointerDown={(e) => {
          if (zoom <= 1 || e.button !== 0) return
          drag.current = { x: e.clientX, y: e.clientY, px: pan.x, py: pan.y }
          setDragging(true)
          e.currentTarget.setPointerCapture?.(e.pointerId)
        }}
        onPointerMove={(e) => { const s = drag.current; if (s) setPan({ x: s.px + (e.clientX - s.x), y: s.py + (e.clientY - s.y) }) }}
        onPointerUp={() => { drag.current = null; setDragging(false) }}
        onPointerCancel={() => { drag.current = null; setDragging(false) }}
        onDoubleClick={(e) => {
          if ((e.target as HTMLElement).closest("button")) return
          if (zoom > 1) reset()
          else if (hasBox && size && showBox) zoomToBox()
          else zoomBy(2, e.clientX, e.clientY)
        }}
      >
        <div
          ref={innerRef}
          className={cn("relative mx-auto w-fit select-none", !dragging && "transition-transform duration-150")}
          style={{ transform: `translate(${pan.x}px, ${pan.y}px) scale(${zoom})`, transformOrigin: "0 0" }}
        >
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img ref={imgRef} src={src} alt={alt} draggable={false}
            className={cn("block w-auto max-w-full", imgClassName ?? "max-h-[60vh]")}
            onLoad={(e) => setSize({ w: e.currentTarget.naturalWidth, h: e.currentTarget.naturalHeight })} />
          {bbox && size && showBox && (
            <div className="pointer-events-none absolute rounded-sm border-2 border-red-500 shadow-[0_0_0_1px_rgba(0,0,0,.6),0_0_18px_rgba(239,68,68,.45)]"
              style={{
                left: `${(bbox.x1 / size.w) * 100}%`, top: `${(bbox.y1 / size.h) * 100}%`,
                width: `${((bbox.x2 - bbox.x1) / size.w) * 100}%`, height: `${((bbox.y2 - bbox.y1) / size.h) * 100}%`,
              }} />
          )}
        </div>
        <div className="absolute right-2 top-2 flex flex-col gap-1" onPointerDown={(e) => e.stopPropagation()}>
          {controls.map(({ Icon, label, on, off }) => (
            <button key={label} type="button" onClick={on} disabled={off} title={label} aria-label={label}
              className="flex h-8 w-8 items-center justify-center rounded-lg bg-black/55 text-white backdrop-blur transition hover:bg-black/75 disabled:opacity-35">
              <Icon className="h-4 w-4" />
            </button>
          ))}
        </div>
        <span className="pointer-events-none absolute bottom-2 left-2 rounded bg-black/60 px-1.5 py-0.5 text-[10px] tabular-nums text-white">
          ×{zoom.toFixed(1)}
        </span>
      </div>
      {footer && (
        <div className="flex flex-wrap items-center justify-between gap-2 text-xs text-muted-foreground">
          {bbox ? (
            <label className="flex items-center gap-2">
              <input type="checkbox" checked={showBox} onChange={(e) => setShowBox(e.target.checked)} />
              {t("m6.ev.showBox")}
              <span className="font-mono">[{Math.round(bbox.x1)}, {Math.round(bbox.y1)}, {Math.round(bbox.x2)}, {Math.round(bbox.y2)}]</span>
            </label>
          ) : <span />}
          <span className="flex items-center gap-1"><ExternalLink className="h-3 w-3" />{t(keyboard ? "ht.ev.zoomHintKeys" : "ht.ev.zoomHintWheel")}</span>
        </div>
      )}
    </div>
  )
}
