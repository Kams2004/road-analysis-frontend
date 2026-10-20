"use client"

/**
 * Cloud sources — an input source of the platform next to manual upload and
 * live streams (Module 7, RRAP-07-002/004): connect Google Drive / OneDrive
 * accounts or SFTP servers, browse their folders, import a selection of
 * videos / images and follow every file from download to processed job. The
 * OAuth *client* credentials stay in Settings → Jobs; SFTP passwords in
 * api/secrets/sftp.env; the connections live here. An SFTP server also shows
 * its FileZilla-style connection log under the browser.
 *
 * URL: ?connection=<id> selects a drive (the OAuth callback lands here),
 *      ?tab=imports opens the imports, ?batch=<id> highlights one.
 */
import { Suspense, useCallback, useEffect, useMemo, useState } from "react"
import Link from "next/link"
import { usePathname, useRouter, useSearchParams } from "next/navigation"
import { Cloud, Download, FolderOpen, Loader2, Settings2, UploadCloud, CheckCircle2, HardDrive } from "lucide-react"
import { Sidebar } from "@/components/sidebar"
import { Topbar } from "@/components/topbar"
import { PageHeader } from "@/components/page-header"
import { StatCard } from "@/components/stat-card"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { Alert, AlertDescription } from "@/components/ui/alert"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { RequirePermission } from "@/components/require-permission"
import { useAuth } from "@/components/auth-provider"
import { errorText } from "@/lib/auth-api"
import { useT } from "@/lib/i18n"
import { listCloudConnections } from "@/lib/module7-api"
import {
  listProviders, type CloudConnection, type CloudProviderInfo, type ImportBatch, type SftpLinkState,
} from "@/lib/cloud-sources-api"
import { ConnectionsPanel } from "@/components/cloud-sources/connections-panel"
import { FileBrowser } from "@/components/cloud-sources/file-browser"
import { ImportsPanel } from "@/components/cloud-sources/imports-panel"
import { ProviderIcon } from "@/components/cloud-sources/provider-icon"
import { SftpLogPanel } from "@/components/cloud-sources/sftp-log-panel"

const S = "cs"

function CloudSourcesInner() {
  const t = useT()
  const { can } = useAuth()
  const router = useRouter()
  const pathname = usePathname()
  const params = useSearchParams()
  const canImport = can("jobs", "add")
  const [connections, setConnections] = useState<CloudConnection[]>([])
  const [providers, setProviders] = useState<CloudProviderInfo[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [activeImports, setActiveImports] = useState(0)
  const [importsKey, setImportsKey] = useState(0)
  const [linkStates, setLinkStates] = useState<Record<string, SftpLinkState>>({})
  const [linkErrors, setLinkErrors] = useState<Record<string, string | null>>({})
  const selectedId = params.get("connection")
  const tab = params.get("tab") === "imports" ? "imports" : "browse"
  const highlight = params.get("batch")

  const setQuery = useCallback((patch: Record<string, string | null>) => {
    const q = new URLSearchParams(params.toString())
    for (const [k, v] of Object.entries(patch)) { if (v == null) q.delete(k); else q.set(k, v) }
    router.replace(`${pathname}${q.toString() ? `?${q}` : ""}`, { scroll: false })
  }, [params, pathname, router])

  const load = useCallback(async () => {
    setLoading(true)
    try {
      const [conns, provs] = await Promise.all([listCloudConnections(), listProviders().catch(() => [] as CloudProviderInfo[])])
      setConnections(conns)
      setProviders(provs)
      setError(null)
    } catch (e) {
      setError(errorText(t, e, S))
    } finally {
      setLoading(false)
    }
  }, [t])

  useEffect(() => { load() }, [load])

  // Select the first usable drive when none (or a removed one) is selected.
  useEffect(() => {
    if (loading || !connections.length) return
    if (selectedId && connections.some((c) => c.id === selectedId)) return
    const first = connections.find((c) => c.status === "active" && c.enabled) ?? connections[0]
    setQuery({ connection: first.id })
  }, [loading, connections, selectedId, setQuery])

  const selected = useMemo(() => connections.find((c) => c.id === selectedId) ?? null, [connections, selectedId])
  const provider = useMemo(() => providers.find((p) => p.id === selected?.provider) ?? null, [providers, selected])
  const isSftp = selected?.provider === "sftp"
  const usable = !!selected && selected.enabled && (isSftp || selected.status === "active")

  const onLinkState = useCallback((id: string, state: SftpLinkState, message: string | null) => {
    setLinkStates((m) => (m[id] === state ? m : { ...m, [id]: state }))
    setLinkErrors((m) => (m[id] === message ? m : { ...m, [id]: message }))
  }, [])

  // Cards read the freshest link message too.
  const shown = useMemo(() => connections.map((c) => (c.sftp && c.id in linkErrors
    ? { ...c, sftp: { ...c.sftp, link_message: linkErrors[c.id] ?? null } } : c)), [connections, linkErrors])

  const onChanged = (c?: CloudConnection | null, removedId?: string) => {
    if (c) setConnections((prev) => prev.map((x) => (x.id === c.id ? c : x)))
    else if (removedId) setConnections((prev) => prev.filter((x) => x.id !== removedId))
    else load()
  }

  const onImported = (b: ImportBatch) => {
    setImportsKey((k) => k + 1)
    setQuery({ tab: "imports", batch: b.id })
    load()
  }

  const totalImported = connections.reduce((s, c) => s + (c.files_imported_total ?? 0), 0)
  const connectedCount = connections.filter((c) => c.status === "active" && c.enabled).length

  return (
    <div className="px-4 py-6 sm:px-6 lg:px-8">
      <PageHeader
        title={t(`${S}.title`)}
        description={t(`${S}.subtitle`)}
        actions={<>
          <Button asChild variant="outline" size="sm" className="gap-1.5">
            <Link href="/upload"><UploadCloud className="h-4 w-4" />{t(`${S}.manualUpload`)}</Link>
          </Button>
          {can("settings") && (
            <Button asChild variant="ghost" size="sm" className="gap-1.5">
              <Link href="/settings/jobs#cloud"><Settings2 className="h-4 w-4" />{t(`${S}.oauthSettings`)}</Link>
            </Button>
          )}
        </>}
      />

      <div className="mb-5 grid grid-cols-2 gap-3 lg:grid-cols-4">
        <StatCard icon={HardDrive} tone="teal" value={connectedCount} label={t(`${S}.kpi.connected`)} />
        <StatCard icon={Download} tone="blue" value={activeImports} label={t(`${S}.kpi.active`)}
          onClick={() => setQuery({ tab: "imports" })} />
        <StatCard icon={CheckCircle2} tone="green" value={totalImported} label={t(`${S}.kpi.imported`)} />
        <StatCard icon={Cloud} tone="purple" value={providers.filter((p) => p.configured).length} label={t(`${S}.kpi.providers`)} />
      </div>

      {error && <Alert variant="destructive" className="mb-4"><AlertDescription>{error}</AlertDescription></Alert>}

      <div className="grid gap-5 lg:grid-cols-[300px_minmax(0,1fr)]">
        <aside>
          <ConnectionsPanel
            connections={shown}
            linkStates={linkStates}
            providers={providers}
            selectedId={selectedId}
            loading={loading}
            onSelect={(c) => setQuery({ connection: c.id, tab: null, batch: null })}
            onChanged={onChanged}
          />
        </aside>

        <section className="min-w-0">
          <Tabs value={tab} onValueChange={(v) => setQuery({ tab: v === "imports" ? "imports" : null })} className="gap-3">
            <TabsList>
              <TabsTrigger value="browse" className="gap-2 text-sm"><FolderOpen className="h-4 w-4" />{t(`${S}.tab.browse`)}</TabsTrigger>
              <TabsTrigger value="imports" className="gap-2 text-sm">
                <Download className="h-4 w-4" />{t(`${S}.tab.imports`)}
                {activeImports > 0 && <Badge variant="secondary" className="h-5 px-1.5 text-[10px]">{activeImports}</Badge>}
              </TabsTrigger>
            </TabsList>

            <TabsContent value="browse">
              {loading && !connections.length ? (
                <div className="flex min-h-[40vh] items-center justify-center text-muted-foreground"><Loader2 className="h-6 w-6 animate-spin" /></div>
              ) : !selected ? (
                <div className="flex min-h-[40vh] flex-col items-center justify-center gap-3 rounded-xl border border-dashed border-border text-center">
                  <div className="flex gap-2"><ProviderIcon provider="google_drive" className="h-8 w-8" /><ProviderIcon provider="onedrive" className="h-8 w-8" /><ProviderIcon provider="sftp" className="h-8 w-8" /></div>
                  <p className="text-sm font-medium">{t(`${S}.pickConnection`)}</p>
                  <p className="max-w-sm text-xs text-muted-foreground">{t(`${S}.pickConnectionHint`)}</p>
                </div>
              ) : !usable ? (
                <div className="flex min-h-[40vh] flex-col items-center justify-center gap-2 rounded-xl border border-dashed border-border px-4 text-center">
                  <ProviderIcon provider={selected.provider} className="h-8 w-8" />
                  <p className="text-sm font-medium">{selected.name}</p>
                  <p className="max-w-sm text-xs text-muted-foreground">
                    {!selected.enabled ? (isSftp ? t(`${S}.sftp.unusableHint`) : t(`${S}.disabledHint`))
                      : selected.status === "pending_auth" ? t(`${S}.pendingAuth`) : t(`${S}.errorHint`)}
                  </p>
                </div>
              ) : (
                <>
                  <FileBrowser connection={selected} provider={provider} canImport={canImport} onImported={onImported} />
                  {isSftp && (
                    <SftpLogPanel connectionId={selected.id} canClear={can("jobs", "edit")}
                      onState={(st, msg) => onLinkState(selected.id, st, msg)} />
                  )}
                </>
              )}
            </TabsContent>

            <TabsContent value="imports" forceMount className="data-[state=inactive]:hidden">
              <ImportsPanel refreshKey={importsKey} onActiveChange={setActiveImports} highlight={highlight} />
            </TabsContent>
          </Tabs>
        </section>
      </div>
    </div>
  )
}

export default function CloudSourcesPage() {
  return (
    <div className="min-h-screen bg-background">
      <Sidebar />
      <main className="lg:pl-64">
        <Topbar />
        <RequirePermission module="jobs" action="view">
          <Suspense fallback={<div className="flex min-h-[40vh] items-center justify-center text-muted-foreground"><Loader2 className="h-6 w-6 animate-spin" /></div>}>
            <CloudSourcesInner />
          </Suspense>
        </RequirePermission>
      </main>
    </div>
  )
}
