"use client"

/**
 * Cluster configuration (Module 6 — RRAP-06-009/010/011): the ONE
 * clustering configuration of the platform. Left: urban / out-of-
 * agglomeration profiles, zones (agglomerations, road sections, custom
 * polygons) and "test a point"; right: the map of every zone.
 * View: settings:view — changes: settings:edit.
 */
import { useCallback, useEffect, useMemo, useState } from "react"
import { toast } from "sonner"
import { Info, Loader2, RefreshCw, SlidersHorizontal, Shapes, Crosshair } from "lucide-react"
import { Sidebar } from "@/components/sidebar"
import { Topbar } from "@/components/topbar"
import { RequirePermission } from "@/components/require-permission"
import { PageHeader } from "@/components/page-header"
import { useAuth } from "@/components/auth-provider"
import { Alert, AlertDescription } from "@/components/ui/alert"
import { Button } from "@/components/ui/button"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter,
  AlertDialogHeader, AlertDialogTitle,
} from "@/components/ui/alert-dialog"
import { errorText } from "@/lib/auth-api"
import { useT } from "@/lib/i18n"
import {
  getClusteringConfig, listZones, rebuildHazards, resolvePoint, zonesGeoJSON,
  type ClusterZone, type ClusteringConfig, type Environment, type Geometry, type PointResolution, type ZoneCollection,
} from "@/lib/clustering-api"
import { ZonesMap, type Bounds, type LatLon, type MapMode } from "@/components/clustering/zones-map"
import { ProfilesPanel } from "@/components/clustering/profiles-panel"
import { ZonesPanel, type MapCtl } from "@/components/clustering/zones-panel"
import { TestPanel } from "@/components/clustering/test-panel"

export default function ClusteringPage() {
  return (
    <div className="min-h-screen bg-background">
      <Sidebar />
      <main className="lg:pl-64">
        <Topbar />
        <div className="px-4 py-6 sm:px-6 lg:px-8">
          <RequirePermission module="settings">
            <ClusteringScreen />
          </RequirePermission>
        </div>
      </main>
    </div>
  )
}

function ClusteringScreen() {
  const t = useT()
  const { can } = useAuth()
  const readOnly = !can("settings", "edit")
  const [config, setConfig] = useState<ClusteringConfig | null>(null)
  const [zones, setZones] = useState<ClusterZone[]>([])
  const [collection, setCollection] = useState<ZoneCollection | null>(null)
  const [loadError, setLoadError] = useState<string | null>(null)
  const [tab, setTab] = useState("profiles")
  const [mode, setMode] = useState<MapMode>("select")
  const [selectedId, setSelectedId] = useState<number | null>(null)
  const [hoveredId, setHoveredId] = useState<number | null>(null)
  const [preview, setPreviewState] = useState<{ g: Geometry[] | null; env: Environment }>({ g: null, env: "urban" })
  const [drawing, setDrawing] = useState<LatLon[] | null>(null)
  const [fit, setFit] = useState<{ key: number; bounds: Bounds | null }>({ key: 0, bounds: null })
  const [testPoint, setTestPoint] = useState<{ lat: number; lon: number } | null>(null)
  const [testResult, setTestResult] = useState<PointResolution | null>(null)
  const [testBusy, setTestBusy] = useState(false)
  const [rebuildOpen, setRebuildOpen] = useState(false)
  const [rebuilding, setRebuilding] = useState(false)

  const load = useCallback(async (refit = false) => {
    try {
      const [c, z, fc] = await Promise.all([getClusteringConfig(), listZones(), zonesGeoJSON()])
      setConfig(c); setZones(z); setCollection(fc); setLoadError(null)
      if (refit) setFit((f) => ({ key: f.key + 1, bounds: null }))
    } catch (e) {
      setLoadError(errorText(t, e, "cl"))
    }
  }, [t])

  useEffect(() => { load(true) }, [load])

  const ctl: MapCtl = useMemo(() => ({
    setPreview: (g, env = "urban") => setPreviewState({ g, env }),
    drawing,
    setDrawing,
    setMode,
    fitTo: (bounds) => bounds && setFit((f) => ({ key: f.key + 1, bounds })),
  }), [drawing])

  const onTab = (v: string) => {
    setTab(v)
    setPreviewState({ g: null, env: "urban" })
    setDrawing(null)
    setMode(v === "test" ? "test" : "select")
  }

  const onTestPoint = async (lat: number, lon: number) => {
    setTestPoint({ lat, lon })
    setTestBusy(true)
    try { setTestResult(await resolvePoint(lat, lon)) }
    catch (e) { toast.error(errorText(t, e, "cl")) }
    finally { setTestBusy(false) }
  }

  // Re-test the point after a configuration / zone change.
  useEffect(() => {
    if (testPoint) onTestPoint(testPoint.lat, testPoint.lon)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [config, zones])

  const doRebuild = async () => {
    setRebuilding(true)
    try {
      const r = await rebuildHazards()
      toast.success(t("cl.rebuildDone", { n: r.hazards }))
    } catch (e) { toast.error(errorText(t, e, "cl")) }
    finally { setRebuilding(false); setRebuildOpen(false) }
  }

  return (
    <>
      <PageHeader title={t("cl.title")} description={t("cl.subtitle")}
        actions={!readOnly && (
          <Button size="sm" variant="outline" onClick={() => setRebuildOpen(true)} disabled={rebuilding}>
            {rebuilding ? <Loader2 className="mr-1 h-3.5 w-3.5 animate-spin" /> : <RefreshCw className="mr-1 h-3.5 w-3.5" />}
            {t("cl.rebuild")}
          </Button>
        )} />

      {loadError && <Alert variant="destructive" className="mb-4"><AlertDescription>{loadError}</AlertDescription></Alert>}

      <div className="grid gap-4 lg:grid-cols-[minmax(360px,440px)_1fr]">
        <div className="order-2 min-w-0 rounded-xl border bg-card shadow-sm lg:order-1 lg:max-h-[calc(100vh-11rem)] lg:overflow-y-auto">
          <div className="space-y-3 p-4">
            {readOnly && <p className="rounded-md bg-muted px-2.5 py-1.5 text-[11px] text-muted-foreground">{t("cl.readOnly")}</p>}
            <div className="flex gap-2 rounded-md border border-blue-500/20 bg-blue-500/5 px-2.5 py-2 text-[11px] text-muted-foreground">
              <Info className="mt-0.5 h-3.5 w-3.5 shrink-0 text-blue-600" />
              <span>{t("cl.historyNote")}</span>
            </div>
            <Tabs value={tab} onValueChange={onTab}>
              <TabsList className="grid w-full grid-cols-3">
                <TabsTrigger value="profiles" className="gap-1 text-xs"><SlidersHorizontal className="h-3.5 w-3.5" />{t("cl.tab.profiles")}</TabsTrigger>
                <TabsTrigger value="zones" className="gap-1 text-xs"><Shapes className="h-3.5 w-3.5" />{t("cl.tab.zones")}</TabsTrigger>
                <TabsTrigger value="test" className="gap-1 text-xs"><Crosshair className="h-3.5 w-3.5" />{t("cl.tab.test")}</TabsTrigger>
              </TabsList>
              <TabsContent value="profiles" className="mt-3">
                {config ? <ProfilesPanel config={config} readOnly={readOnly} onSaved={setConfig} />
                  : <Loader2 className="mx-auto my-8 h-5 w-5 animate-spin text-muted-foreground" />}
              </TabsContent>
              <TabsContent value="zones" className="mt-3">
                <p className="mb-2 text-[11px] text-muted-foreground">{t("cl.zonesDesc")}</p>
                {config && (
                  <ZonesPanel zones={zones} config={config} readOnly={readOnly} selectedId={selectedId}
                    hoveredId={hoveredId} onSelect={setSelectedId} onHover={setHoveredId} ctl={ctl}
                    onChanged={() => load(false)} />
                )}
              </TabsContent>
              <TabsContent value="test" className="mt-3">
                <TestPanel point={testPoint} result={testResult} busy={testBusy} />
              </TabsContent>
            </Tabs>
          </div>
        </div>

        <div className="order-1 lg:order-2">
          <ZonesMap className="h-[55vh] lg:sticky lg:top-20 lg:h-[calc(100vh-11rem)]" collection={collection} mode={mode}
            selectedId={selectedId} hoveredId={hoveredId}
            onSelect={(id) => { setSelectedId(id); if (tab !== "zones") setTab("zones") }} onHover={setHoveredId}
            preview={preview.g} previewEnv={preview.env} drawing={drawing} onDrawingChange={setDrawing}
            testPoint={tab === "test" ? testPoint : null} onTestPoint={onTestPoint}
            fitKey={fit.key} fitBounds={fit.bounds} />
        </div>
      </div>

      <AlertDialog open={rebuildOpen} onOpenChange={setRebuildOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{t("cl.rebuildTitle")}</AlertDialogTitle>
            <AlertDialogDescription>{t("cl.rebuildDesc")}</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>{t("cl.form.cancel")}</AlertDialogCancel>
            <AlertDialogAction onClick={(e) => { e.preventDefault(); doRebuild() }} disabled={rebuilding}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90">
              {rebuilding && <Loader2 className="mr-1 h-3.5 w-3.5 animate-spin" />}{t("cl.rebuildConfirm")}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  )
}
