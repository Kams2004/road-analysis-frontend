"use client"

/**
 * Location review (RRAP-06-012/06-014): place the detection on the map with a
 * draggable pin, pick a point of the vehicle trajectory, accept the proposed
 * (interpolated) position, or type the OCR GPS text by hand. Saving confirms
 * the location; a `location_pending` detection then moves to Pending review.
 */
import { useEffect, useMemo, useState } from "react"
import { toast } from "sonner"
import { Check, Crosshair, Loader2, MapPin, Route, Type } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { M6Map, type MapPoint } from "@/components/m6-map"
import { LocationBadge } from "@/components/m6-shared"
import { errorText } from "@/lib/auth-api"
import { useI18n } from "@/lib/i18n"
import {
  getTrajectory, setDetectionLocation, type DetectionDetail, type LocationFix, type M6Detection, type TrackPoint,
} from "@/lib/module6-api"

export function LocationReview({ d, canEdit, onSaved }: {
  d: DetectionDetail
  canEdit: boolean
  onSaved: (updated: M6Detection) => void
}) {
  const { t } = useI18n()
  const hasCoords = d.latitude != null && d.longitude != null
  const [points, setPoints] = useState<TrackPoint[]>([])
  const [eventTime, setEventTime] = useState<number | null>(d.video_time_s)
  const [trackLoading, setTrackLoading] = useState(true)
  const [trackError, setTrackError] = useState<string | null>(null)
  const [pin, setPin] = useState<MapPoint | null>(hasCoords ? { lat: d.latitude!, lon: d.longitude! } : null)
  const [pinDirty, setPinDirty] = useState(false)
  const [selectedId, setSelectedId] = useState<string | number | null>(null)
  const [ocrText, setOcrText] = useState(d.raw_gps_text ?? "")
  const [note, setNote] = useState("")
  const [busy, setBusy] = useState<LocationFix["method"] | null>(null)

  useEffect(() => {
    let alive = true
    setTrackLoading(true)
    setTrackError(null)
    getTrajectory(d.id, 60)
      .then((tr) => {
        if (!alive) return
        setPoints(tr.points ?? [])
        if (tr.detection_time_s != null) setEventTime(tr.detection_time_s)
      })
      .catch((err) => alive && setTrackError(errorText(t, err, "m6")))
      .finally(() => alive && setTrackLoading(false))
    return () => { alive = false }
  }, [d.id]) // eslint-disable-line react-hooks/exhaustive-deps

  const nearest = useMemo(() => {
    if (!points.length) return null
    if (eventTime == null) return points[Math.floor(points.length / 2)]
    return points.reduce((best, p) =>
      Math.abs(p.video_time_s - eventTime) < Math.abs(best.video_time_s - eventTime) ? p : best, points[0])
  }, [points, eventTime])

  // No coordinates at all: start the pin on the nearest trajectory point.
  useEffect(() => {
    if (!pin && nearest) setPin({ lat: nearest.latitude, lon: nearest.longitude })
  }, [nearest]) // eslint-disable-line react-hooks/exhaustive-deps

  const selected = points.find((p) => p.id === selectedId) ?? null
  const rel = (p: TrackPoint) => (eventTime == null ? "" : `${p.video_time_s - eventTime >= 0 ? "+" : ""}${(p.video_time_s - eventTime).toFixed(1)} s`)
  const track = useMemo(() => points.map((p) => ({
    id: p.id, lat: p.latitude, lon: p.longitude,
    label: `${rel(p)}${p.speed_kmh != null ? ` · ${Math.round(p.speed_kmh)} km/h` : ""}`,
  })), [points, eventTime]) // eslint-disable-line react-hooks/exhaustive-deps

  const save = async (fix: LocationFix) => {
    setBusy(fix.method)
    try {
      const body = note.trim() ? { ...fix, note: note.trim() } : fix
      const updated = await setDetectionLocation(d.id, body)
      toast.success(d.review_status === "location_pending" ? t("m6.loc.savedMoved") : t("m6.loc.saved"))
      setPinDirty(false)
      onSaved(updated)
    } catch (err) {
      toast.error(errorText(t, err, "m6"))
    } finally {
      setBusy(null)
    }
  }

  const spin = (m: LocationFix["method"]) => busy === m ? <Loader2 className="h-4 w-4 animate-spin" /> : null

  return (
    <div className="space-y-3 rounded-lg border p-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="flex items-center gap-2 text-sm font-medium"><MapPin className="h-4 w-4" />{t("m6.loc.reviewTitle")}</p>
        <LocationBadge status={d.location_status} source={d.location_source} />
      </div>
      <p className="text-xs text-muted-foreground">{canEdit ? t("m6.loc.reviewHint") : t("m6.loc.readOnly")}</p>

      <M6Map
        className="h-72"
        pin={pin}
        draggablePin={canEdit}
        clickToPlace={canEdit}
        onPinChange={(p) => { setPin(p); setPinDirty(true) }}
        proposed={d.location_status === "approximate" && hasCoords ? { lat: d.latitude!, lon: d.longitude! } : null}
        track={track}
        nearestPointId={nearest?.id ?? null}
        selectedPointId={selectedId}
        onPointClick={setSelectedId}
        fitKey={`${d.id}:${points.length}`}
      />

      <div className="flex flex-wrap gap-x-4 gap-y-1 text-xs text-muted-foreground">
        <span className="inline-flex items-center gap-1"><span className="h-2.5 w-2.5 rounded-full bg-red-500" />{t("m6.loc.legendPin")}</span>
        <span className="inline-flex items-center gap-1"><span className="h-2.5 w-2.5 rounded-full bg-blue-500" />{t("m6.loc.legendTrack")}</span>
        <span className="inline-flex items-center gap-1"><span className="h-2.5 w-2.5 rounded-full bg-amber-400" />{t("m6.loc.legendNearest")}</span>
        <span className="inline-flex items-center gap-1"><span className="h-2.5 w-2.5 rounded-full bg-green-500" />{t("m6.loc.legendSelected")}</span>
        {d.location_status === "approximate" && hasCoords && (
          <span className="inline-flex items-center gap-1"><span className="h-2.5 w-2.5 rounded-full border border-dashed border-amber-500" />{t("m6.loc.legendProposed")}</span>
        )}
      </div>

      {trackLoading ? (
        <p className="flex items-center gap-2 text-xs text-muted-foreground"><Loader2 className="h-3 w-3 animate-spin" />{t("m6.loc.trackLoading")}</p>
      ) : trackError ? (
        <p className="text-xs text-destructive">{trackError}</p>
      ) : !points.length ? (
        <p className="text-xs text-muted-foreground">{t("m6.loc.noTrack")}</p>
      ) : (
        <p className="text-xs text-muted-foreground">{t("m6.loc.trackCount", { n: points.length })}</p>
      )}

      <div className="grid gap-2 text-xs sm:grid-cols-2">
        <div className="rounded-md bg-muted/40 p-2">
          <p className="text-muted-foreground">{t("m6.loc.pinPosition")}</p>
          <p className="font-mono">{pin ? `${pin.lat.toFixed(6)}, ${pin.lon.toFixed(6)}` : "—"}</p>
        </div>
        <div className="rounded-md bg-muted/40 p-2">
          <p className="text-muted-foreground">{t("m6.loc.selectedPoint")}</p>
          {selected ? (
            <p className="font-mono">
              {selected.latitude.toFixed(6)}, {selected.longitude.toFixed(6)}
              <span className="ml-1 font-sans text-muted-foreground">{rel(selected)}{selected.speed_kmh != null ? ` · ${Math.round(selected.speed_kmh)} km/h` : ""}</span>
            </p>
          ) : <p className="text-muted-foreground">{t("m6.loc.clickPoint")}</p>}
        </div>
      </div>

      {canEdit && (
        <>
          <div className="space-y-1.5">
            <Label htmlFor="loc-note" className="text-xs">{t("m6.common.noteOptional")}</Label>
            <Input id="loc-note" value={note} onChange={(e) => setNote(e.target.value)} className="h-8 text-sm" />
          </div>
          <div className="flex flex-wrap gap-2">
            <Button size="sm" disabled={!!busy || !pin || (!pinDirty && d.location_status === "confirmed")}
              onClick={() => pin && save({ method: "map_pin", latitude: pin.lat, longitude: pin.lon })}>
              {spin("map_pin") ?? <Crosshair className="h-4 w-4" />}{t("m6.loc.savePin")}
            </Button>
            <Button size="sm" variant="outline" disabled={!!busy || !selected}
              onClick={() => selected && save({ method: "trajectory_point", track_point_id: selected.id, latitude: selected.latitude, longitude: selected.longitude })}>
              {spin("trajectory_point") ?? <Route className="h-4 w-4" />}{t("m6.loc.usePoint")}
            </Button>
            {d.location_status === "approximate" && hasCoords && (
              <Button size="sm" variant="outline" disabled={!!busy} onClick={() => save({ method: "accept_proposed" })}>
                {spin("accept_proposed") ?? <Check className="h-4 w-4" />}{t("m6.loc.acceptProposed")}
              </Button>
            )}
          </div>

          <div className="space-y-1.5 border-t pt-3">
            <Label htmlFor="loc-ocr" className="flex items-center gap-1 text-xs"><Type className="h-3.5 w-3.5" />{t("m6.loc.ocrFallback")}</Label>
            <p className="text-xs text-muted-foreground">{t("pmap.val.rawGpsExample")}</p>
            <div className="flex gap-2">
              <Input id="loc-ocr" value={ocrText} onChange={(e) => setOcrText(e.target.value)}
                placeholder="DDMM.MMMM,N,DDDMM.MMMM,E,SSSKMH" className="h-8 font-mono text-xs" />
              <Button size="sm" variant="secondary" disabled={!!busy || !ocrText.trim()}
                onClick={() => save({ method: "ocr_text", raw_gps_text: ocrText.trim() })}>
                {spin("ocr_text")}{t("common.save")}
              </Button>
            </div>
          </div>
        </>
      )}
    </div>
  )
}
