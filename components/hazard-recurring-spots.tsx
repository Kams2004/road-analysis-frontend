"use client"

/**
 * "Recurring spots" view of the Hazard Track page: places where hazards of
 * a type keep coming back (GET /hazards/recurring-spots), as a map + table.
 * Hazard codes open the hazard drawer through `onOpenHazard`.
 */
import { useEffect, useMemo, useState } from "react"
import { AlertTriangle, Loader2, MapPin, RotateCcw } from "lucide-react"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import { DataToolbar, TOOLBAR_SELECT } from "@/components/data-toolbar"
import { M6Map } from "@/components/m6-map"
import { StatusBadge as Pill } from "@/components/status-badge"
import { useHzlLabels, useNow } from "@/components/hazard-lifecycle"
import { cn } from "@/lib/utils"
import { errorText } from "@/lib/auth-api"
import { DETECTION_TYPES, listRecurringSpots, type RecurringSpotList } from "@/lib/module6-api"

const MAX_CODES = 6
const spotKey = (s: { type: string; latitude: number; longitude: number }) => `${s.type}:${s.latitude}:${s.longitude}`

export function RecurringSpotsView({ onOpenHazard, reloadKey }: { onOpenHazard: (id: string) => void; reloadKey?: number }) {
  const L = useHzlLabels()
  const { t } = L
  const now = useNow(60_000)
  const [type, setType] = useState("all")
  const [windowDays, setWindowDays] = useState("")
  const [minOcc, setMinOcc] = useState("")
  const [q, setQ] = useState({ type: "all", windowDays: "", minOcc: "" })
  const [data, setData] = useState<RecurringSpotList | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [selected, setSelected] = useState<string | null>(null)

  // Debounce the numeric inputs.
  useEffect(() => {
    const id = setTimeout(() => setQ({ type, windowDays, minOcc }), 350)
    return () => clearTimeout(id)
  }, [type, windowDays, minOcc])

  useEffect(() => {
    let alive = true
    setLoading(true)
    setError(null)
    const wd = parseInt(q.windowDays, 10)
    const mo = parseInt(q.minOcc, 10)
    listRecurringSpots({
      type: q.type,
      window_days: wd >= 1 ? wd : undefined,
      min_occurrences: mo >= 2 ? mo : undefined,
    })
      .then((r) => { if (alive) setData(r) })
      .catch((err) => { if (alive) { setError(errorText(t, err, "m6")); setData(null) } })
      .finally(() => alive && setLoading(false))
    return () => { alive = false }
  }, [q, reloadKey]) // eslint-disable-line react-hooks/exhaustive-deps

  const items = useMemo(() => data?.items ?? [], [data])
  const markers = useMemo(() => items.map((s) => ({
    lat: s.latitude, lon: s.longitude,
    color: s.active ? "#ef4444" : "#64748b",
    label: `${L.typeLabel(s.type)} · ×${s.occurrences}${s.location_name ? ` · ${s.location_name}` : ""}`,
  })), [items]) // eslint-disable-line react-hooks/exhaustive-deps
  const sel = items.find((s) => spotKey(s) === selected) ?? null
  const fitKey = useMemo(() => items.map(spotKey).join("|"), [items])
  const td = "py-1.5"

  return (
    <>
      <DataToolbar
        actions={
          <Button variant="ghost" size="sm" className="h-9" onClick={() => { setType("all"); setWindowDays(""); setMinOcc("") }}>
            <RotateCcw className="h-3.5 w-3.5" />{t("m6.filter.reset")}
          </Button>
        }
      >
        <Select value={type} onValueChange={setType}>
          <SelectTrigger className={TOOLBAR_SELECT} aria-label={t("m6.filter.type")}><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">{t("hzl.rs.allTypes")}</SelectItem>
            {DETECTION_TYPES.map((ty) => <SelectItem key={ty} value={ty}>{L.typeLabel(ty)}</SelectItem>)}
          </SelectContent>
        </Select>
        <div className="flex items-center gap-1.5">
          <Label htmlFor="rs-window" className="shrink-0 text-xs text-muted-foreground">{t("hzl.rs.windowDays")}</Label>
          <Input id="rs-window" type="number" min={1} max={3650} className="h-9 w-20" value={windowDays}
            placeholder={data ? String(data.window_days) : ""} onChange={(e) => setWindowDays(e.target.value)} />
        </div>
        <div className="flex items-center gap-1.5">
          <Label htmlFor="rs-min" className="shrink-0 text-xs text-muted-foreground">{t("hzl.rs.minOccurrences")}</Label>
          <Input id="rs-min" type="number" min={2} max={1000} className="h-9 w-20" value={minOcc}
            placeholder={data ? String(data.min_occurrences) : ""} onChange={(e) => setMinOcc(e.target.value)} />
        </div>
      </DataToolbar>

      {data && (
        <p className="px-4 pt-3 text-xs text-muted-foreground">
          {t("hzl.rs.summary", { n: data.total, days: data.window_days, min: data.min_occurrences })}
        </p>
      )}
      {error && <p className="px-4 pt-3 text-sm text-destructive">{error}</p>}

      <div className="px-4 py-3">
        <M6Map
          className="h-72"
          markers={markers}
          circles={sel ? [{ lat: sel.latitude, lon: sel.longitude, radius_m: 40, color: sel.active ? "#ef4444" : "#64748b" }] : undefined}
          pin={sel ? { lat: sel.latitude, lon: sel.longitude } : null}
          fitKey={fitKey}
        />
      </div>

      <Table>
        <TableHeader>
          <TableRow className="bg-muted/40 hover:bg-muted/40">
            <TableHead className="pl-4">{t("pmap.val.thType")}</TableHead>
            <TableHead className="hidden md:table-cell">{t("pmap.val.thLocation")}</TableHead>
            <TableHead>{t("hzl.rs.occurrences")}</TableHead>
            <TableHead className="hidden sm:table-cell">{t("common.status")}</TableHead>
            <TableHead className="hidden lg:table-cell">{t("hzl.rs.lastOccurrence")}</TableHead>
            <TableHead className="pr-4">{t("hzl.rs.hazards")}</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {loading ? (
            <TableRow><TableCell colSpan={6} className="h-32 text-center text-muted-foreground"><Loader2 className="mx-auto h-5 w-5 animate-spin" /></TableCell></TableRow>
          ) : !items.length ? (
            <TableRow>
              <TableCell colSpan={6} className="h-32 text-center">
                <AlertTriangle className="mx-auto h-8 w-8 text-muted-foreground/50" />
                <p className="mt-2 text-sm text-muted-foreground">{t("hzl.rs.empty")}</p>
              </TableCell>
            </TableRow>
          ) : items.map((s) => {
            const k = spotKey(s)
            const codes = s.hazard_codes.map((c, i) => ({ code: c, id: s.hazard_ids[i] }))
            return (
              <TableRow key={k} className={cn("h-11 cursor-pointer", selected === k && "bg-primary/5")}
                onClick={() => setSelected(selected === k ? null : k)}>
                <TableCell className={cn(td, "pl-4 font-medium")}>{L.typeLabel(s.type)}</TableCell>
                <TableCell className={cn(td, "hidden md:table-cell")}>
                  <div className="flex max-w-[260px] items-center gap-1">
                    <MapPin className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
                    <span className="truncate">{s.location_name ?? `${s.latitude.toFixed(5)}, ${s.longitude.toFixed(5)}`}</span>
                  </div>
                  {s.location_name && <div className="font-mono text-xs text-muted-foreground">{s.latitude.toFixed(5)}, {s.longitude.toFixed(5)}</div>}
                </TableCell>
                <TableCell className={cn(td, "tabular-nums font-medium")}>×{s.occurrences}</TableCell>
                <TableCell className={cn(td, "hidden sm:table-cell")}>
                  <Pill tone={s.active ? "red" : "slate"}>{s.active ? t("hzl.rs.active") : t("hzl.rs.inactive")}</Pill>
                </TableCell>
                <TableCell className={cn(td, "hidden lg:table-cell text-xs text-muted-foreground")}>
                  {L.fmtShort(s.last_occurrence_at)}
                  {s.last_occurrence_at && <div>{L.ago(s.last_occurrence_at, now)}</div>}
                </TableCell>
                <TableCell className={cn(td, "pr-4")} onClick={(e) => e.stopPropagation()}>
                  <div className="flex max-w-[320px] flex-wrap gap-1">
                    {codes.slice(0, MAX_CODES).map(({ code, id }) => (
                      <button key={id ?? code} type="button" disabled={!id} onClick={() => id && onOpenHazard(id)}>
                        <Badge variant="outline" className="font-mono text-[10px] text-primary hover:bg-primary/10">{code}</Badge>
                      </button>
                    ))}
                    {codes.length > MAX_CODES && (
                      <Badge variant="secondary" className="text-[10px]">+{codes.length - MAX_CODES}</Badge>
                    )}
                  </div>
                </TableCell>
              </TableRow>
            )
          })}
        </TableBody>
      </Table>
    </>
  )
}
