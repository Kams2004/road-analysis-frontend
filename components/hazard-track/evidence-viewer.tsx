"use client"

/**
 * Evidence viewer — level 3 of the Hazard Track hierarchy: one detection's
 * evidence. Large frame with the bounding box (zoom, pan, zoom-to-box,
 * full size), context clip when there is one, readable place, times, model
 * and AI reasoning, review history, and previous / next across the
 * detections of the same cluster (buttons or ← / → keys).
 */
import { useEffect, useState } from "react"
import { BrainCircuit, ChevronLeft, ChevronRight, Loader2, Video } from "lucide-react"
import { Button } from "@/components/ui/button"
import { LightboxTrigger } from "@/components/image-lightbox"
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { VideoPlayer } from "@/components/video-player"
import { AiBadges, VerifierScore } from "@/components/ai-badges"
import { AiReasoningPanel } from "@/components/ai-reasoning"
import { ConfidenceBar, HistoryTimeline, Info, LocationBadge, useM6Labels } from "@/components/m6-shared"
import { resolveMinioUrl } from "@/lib/api"
import { errorText } from "@/lib/auth-api"
import { bboxOf, ZoomableImage } from "@/components/zoomable-image"
import { getDetection, type DetectionDetail, type M6Detection } from "@/lib/module6-api"
import { CoordsCopy, placeParts, TypeTile } from "./shared"
import { reviewTone } from "./cluster-detail"
import { StatusBadge as Pill } from "@/components/status-badge"

export function EvidenceViewer({ detectionId, siblings, onNavigate, onClose, onOpenCluster }: {
  detectionId: string | null
  /** Ordered detection ids of the cluster (prev / next); null = standalone. */
  siblings: string[] | null
  onNavigate: (id: string) => void
  onClose: () => void
  onOpenCluster?: (hazardId: string) => void
}) {
  return (
    <Dialog open={!!detectionId} onOpenChange={(o) => { if (!o) onClose() }}>
      <DialogContent className="max-h-[94vh] gap-0 overflow-y-auto p-0 sm:max-w-5xl">
        {detectionId && (
          <EvidenceBody key={detectionId} id={detectionId} siblings={siblings} onNavigate={onNavigate} onOpenCluster={onOpenCluster} />
        )}
      </DialogContent>
    </Dialog>
  )
}

function EvidenceBody({ id, siblings, onNavigate, onOpenCluster }: {
  id: string
  siblings: string[] | null
  onNavigate: (id: string) => void
  onOpenCluster?: (hazardId: string) => void
}) {
  const L = useM6Labels()
  const { t } = L
  const [d, setD] = useState<DetectionDetail | null>(null)
  const [error, setError] = useState<string | null>(null)
  useEffect(() => {
    getDetection(id).then(setD).catch((err) => setError(errorText(t, err, "m6")))
  }, [id]) // eslint-disable-line react-hooks/exhaustive-deps

  const idx = siblings ? siblings.indexOf(id) : -1
  const prev = idx > 0 ? siblings![idx - 1] : null
  const next = idx >= 0 && idx < siblings!.length - 1 ? siblings![idx + 1] : null
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const tag = (e.target as HTMLElement | null)?.tagName
      if (tag === "INPUT" || tag === "TEXTAREA") return
      if (e.key === "ArrowLeft" && prev) onNavigate(prev)
      if (e.key === "ArrowRight" && next) onNavigate(next)
    }
    window.addEventListener("keydown", onKey)
    return () => window.removeEventListener("keydown", onKey)
  }, [prev, next, onNavigate])

  const nav = siblings && idx >= 0 && (
    <div className="flex items-center gap-1">
      <Button variant="outline" size="icon" className="h-8 w-8" disabled={!prev} onClick={() => prev && onNavigate(prev)}
        title={t("ht.ev.prev")} aria-label={t("ht.ev.prev")}><ChevronLeft className="h-4 w-4" /></Button>
      <span className="min-w-14 text-center text-xs tabular-nums text-muted-foreground">{t("ht.ev.of", { i: idx + 1, n: siblings.length })}</span>
      <Button variant="outline" size="icon" className="h-8 w-8" disabled={!next} onClick={() => next && onNavigate(next)}
        title={t("ht.ev.next")} aria-label={t("ht.ev.next")}><ChevronRight className="h-4 w-4" /></Button>
    </div>
  )

  if (error || !d) {
    return (
      <>
        <DialogHeader className="border-b p-4"><DialogTitle>{t("ht.ev.title")}</DialogTitle><DialogDescription className="sr-only">{t("ht.ev.title")}</DialogDescription></DialogHeader>
        <div className="flex h-60 items-center justify-center p-6">
          {error ? <p className="text-sm text-destructive">{error}</p> : <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />}
        </div>
        {nav && <div className="flex justify-center border-t p-3">{nav}</div>}
      </>
    )
  }

  const clip = resolveMinioUrl(d.context_clip_url)
  const place = placeParts(d)
  const hazardCode = d.hazard?.code ?? d.hazard_code
  return (
    <>
      <DialogHeader className="sticky top-0 z-10 flex-row flex-wrap items-center justify-between gap-3 space-y-0 border-b bg-background/95 p-4 pr-12 backdrop-blur">
        <div className="flex min-w-0 items-center gap-3">
          <TypeTile type={d.type} />
          <div className="min-w-0">
            <DialogTitle className="flex flex-wrap items-center gap-2 text-base">
              {t("ht.ev.title")} · {L.typeLabel(d.type)}
              {d.subtype && <span className="text-sm font-normal text-muted-foreground">{L.subtypeLabel(d.type, d.subtype)}</span>}
              <Pill tone={reviewTone(d.review_status)} className="text-[10px]">{L.statusLabel(d.review_status)}</Pill>
            </DialogTitle>
            <DialogDescription className="flex flex-wrap items-center gap-x-2 font-mono text-xs">
              {t("m6.val.idLine", { id: d.id.slice(0, 8), frame: d.frame_number })}
              {hazardCode && d.hazard_id && (
                onOpenCluster
                  ? <button type="button" className="font-sans text-primary hover:underline" onClick={() => onOpenCluster(d.hazard_id!)}>{t("ht.ev.cluster", { code: hazardCode })}</button>
                  : <span className="font-sans">{t("ht.ev.cluster", { code: hazardCode })}</span>
              )}
            </DialogDescription>
          </div>
        </div>
        {nav}
      </DialogHeader>

      <div className="grid gap-4 p-4 lg:grid-cols-[minmax(0,1fr)_340px]">
        {/* Evidence */}
        <div className="space-y-3">
          <ZoomableFrame d={d} />
          {clip && (
            <div className="rounded-lg border p-2">
              <p className="mb-1.5 flex items-center gap-1 text-xs font-medium text-muted-foreground"><Video className="h-3.5 w-3.5" />{t("m6.ev.clip")}</p>
              <VideoPlayer src={clip} className="max-h-64 w-full" />
            </div>
          )}
          {d.crop_url && (
            <div className="flex items-center gap-3 rounded-lg border p-2">
              <LightboxTrigger item={{ src: resolveMinioUrl(d.crop_url), title: t("ht.ev.crop") }} className="rounded">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={resolveMinioUrl(d.crop_url) ?? ""} alt="" className="h-16 w-16 rounded object-cover" />
              </LightboxTrigger>
              <p className="text-xs text-muted-foreground">{t("ht.ev.crop")}</p>
            </div>
          )}
        </div>

        {/* Facts + AI reasoning */}
        <aside className="space-y-3">
          <section className="space-y-3 rounded-lg border p-3">
            <Info label={t("pmap.val.thLocation")}>
              <p className="font-medium">{place.primary ?? <span className="italic text-muted-foreground">{t("ht.place.unknown")}</span>}</p>
              {place.secondary && <p className="text-xs text-muted-foreground">{place.secondary}</p>}
              <div className="mt-1 flex flex-wrap items-center gap-2">
                <LocationBadge status={d.location_status} source={d.location_source} />
              </div>
              <CoordsCopy lat={d.latitude} lon={d.longitude} className="mt-1" />
            </Info>
            <div className="grid grid-cols-2 gap-3">
              <Info label={t("pmap.val.thConfidence")}><ConfidenceBar value={d.confidence} /></Info>
              {d.verifier_score != null && <Info label={t("ht.det.verifier")}><VerifierScore value={d.verifier_score} /></Info>}
              {d.recorded_at && <Info label={t("pv.time.recorded")}><span title={t("pv.time.recordedHint")}>{L.fmtDate(d.recorded_at)}</span></Info>}
              {!d.recorded_at && d.captured_at && <Info label={t("pmap.val.captured")}>{L.fmtDate(d.captured_at)}</Info>}
              <Info label={t("pv.time.processed")}>{L.fmtDate(d.created_at)}</Info>
              {d.speed_kmh != null && <Info label={t("ht.ev.speed")}>{Math.round(d.speed_kmh)} km/h</Info>}
              {d.video_time_s != null && <Info label={t("ht.ev.videoTime")}>{d.video_time_s.toFixed(1)} s</Info>}
            </div>
            <Info label={t("m6.ev.model")}>
              {d.model_name ?? "—"}
              {d.model_version && <p className="break-all font-mono text-[11px] text-muted-foreground">{d.model_version}</p>}
            </Info>
          </section>

          <section className="space-y-2 rounded-lg border p-3">
            <p className="flex items-center gap-1.5 text-sm font-medium"><BrainCircuit className="h-4 w-4 text-muted-foreground" />{t("ht.ev.ai")}</p>
            <AiBadges d={d} />
            {d.ai_decision_reason
              ? <p className="rounded-md bg-muted/60 px-2 py-1.5 text-xs">{d.ai_decision_reason}</p>
              : !d.ai_details && <p className="text-xs text-muted-foreground">{t("ht.ev.noReason")}</p>}
            {d.class_candidates && d.class_candidates.length > 0 && (
              <ul className="space-y-0.5 text-xs">
                {d.class_candidates.map((c) => (
                  <li key={c.code} className="flex justify-between gap-2">
                    <span className="truncate">{L.subtypeLabel(d.type, c.code)}</span><span className="tabular-nums text-muted-foreground">{L.pct(c.score)}</span>
                  </li>
                ))}
              </ul>
            )}
          </section>
          <AiReasoningPanel d={d} />

          <details className="rounded-lg border p-3">
            <summary className="cursor-pointer select-none text-sm font-medium">{t("m6.hist.title")}</summary>
            <div className="mt-3"><HistoryTimeline items={d.history ?? []} /></div>
          </details>
        </aside>
      </div>
    </>
  )
}

/** Frame with the bounding box (box only on the full frame, not on a crop fallback). */
function ZoomableFrame({ d }: { d: Pick<M6Detection, "image_url" | "crop_url" | "bbox_x1" | "bbox_y1" | "bbox_x2" | "bbox_y2"> }) {
  const { t } = useM6Labels()
  return (
    <ZoomableImage
      src={resolveMinioUrl(d.image_url ?? d.crop_url)}
      alt={t("m6.ev.frame")}
      bbox={d.image_url ? bboxOf(d) : null}
      keyboard
    />
  )
}
