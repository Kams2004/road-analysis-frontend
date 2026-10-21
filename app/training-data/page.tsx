"use client"

import { useCallback, useEffect, useState } from "react"
import { toast } from "sonner"
import { Download, Loader2, RefreshCw } from "lucide-react"
import { Sidebar } from "@/components/sidebar"
import { Topbar } from "@/components/topbar"
import { RequirePermission } from "@/components/require-permission"
import { PageHeader } from "@/components/page-header"
import { DataCard } from "@/components/data-toolbar"
import { useAuth } from "@/components/auth-provider"
import { Button } from "@/components/ui/button"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import { errorText } from "@/lib/auth-api"
import {
  downloadTrainingExport, getTrainingSummary, syncTrainingData, type TrainingTypeSummary,
} from "@/lib/training-data-api"
import { useI18n } from "@/lib/i18n"

export default function TrainingDataPage() {
  const { t } = useI18n()
  return (
    <div className="min-h-screen bg-background">
      <Sidebar />
      <main className="lg:pl-64">
        <Topbar />
        <div className="px-4 py-6 sm:px-6 lg:px-8">
          <PageHeader title={t("td.title")} description={t("td.subtitle")} />
          <RequirePermission module="datasets">
            <TrainingData />
          </RequirePermission>
        </div>
      </main>
    </div>
  )
}

function Line({ children, muted }: { children: React.ReactNode; muted?: boolean }) {
  return <div className={muted ? "text-xs text-muted-foreground" : "text-sm"}>{children}</div>
}

function TrainingData() {
  const { t, locale } = useI18n()
  const { can } = useAuth()
  const [rows, setRows] = useState<TrainingTypeSummary[] | null>(null)
  const [loading, setLoading] = useState(false)
  const [syncing, setSyncing] = useState(false)
  const [downloading, setDownloading] = useState<string | null>(null)

  const load = useCallback(async () => {
    setLoading(true)
    try {
      setRows(await getTrainingSummary())
    } catch (err) {
      toast.error(t("td.loadFailed"), { description: errorText(t, err) })
    } finally {
      setLoading(false)
    }
  }, [t])

  useEffect(() => { void load() }, [load])

  const when = (iso: string | null) =>
    iso ? new Date(iso.endsWith("Z") || iso.includes("+") ? iso : `${iso}Z`).toLocaleString(locale) : "—"

  const sync = async () => {
    setSyncing(true)
    try {
      const r = await syncTrainingData()
      toast.success(t("td.syncDone", { synced: r.synced, failed: r.failed }))
      await load()
    } catch (err) {
      toast.error(errorText(t, err))
    } finally {
      setSyncing(false)
    }
  }

  const download = async (type: string) => {
    setDownloading(type)
    try {
      await downloadTrainingExport(type)
    } catch (err) {
      toast.error(errorText(t, err))
    } finally {
      setDownloading(null)
    }
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-end gap-2">
        <Button variant="outline" size="sm" onClick={() => void load()} disabled={loading}>
          <RefreshCw className={loading ? "h-4 w-4 animate-spin" : "h-4 w-4"} />
        </Button>
        {can("datasets", "add") && (
          <Button variant="outline" size="sm" onClick={() => void sync()} disabled={syncing}>
            {syncing && <Loader2 className="mr-1 h-4 w-4 animate-spin" />}
            {t("td.syncNow")}
          </Button>
        )}
      </div>
      <DataCard>
        <div className="overflow-x-auto">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>{t("td.type")}</TableHead>
                <TableHead>{t("td.decisions")}</TableHead>
                <TableHead>{t("td.detector")}</TableHead>
                <TableHead>{t("td.classifier")}</TableHead>
                <TableHead>{t("td.review")}</TableHead>
                <TableHead>{t("td.sync")}</TableHead>
                <TableHead className="text-right" />
              </TableRow>
            </TableHeader>
            <TableBody>
              {rows === null ? (
                <TableRow><TableCell colSpan={7} className="py-8 text-center"><Loader2 className="mx-auto h-5 w-5 animate-spin" /></TableCell></TableRow>
              ) : rows.length === 0 ? (
                <TableRow><TableCell colSpan={7} className="py-8 text-center text-sm text-muted-foreground">{t("td.empty")}</TableCell></TableRow>
              ) : rows.map((r) => (
                <TableRow key={r.detection_type} className="align-top">
                  <TableCell>
                    <Line>{t(`td.type.${r.detection_type}`) === `td.type.${r.detection_type}` ? r.detection_type : t(`td.type.${r.detection_type}`)}</Line>
                    <Line muted>{r.classes.join(", ")}</Line>
                  </TableCell>
                  <TableCell>
                    <Line>{r.accepted} {t("td.accepted")} · {r.corrected} {t("td.corrected")} · {r.rejected} {t("td.rejected")}</Line>
                    {r.by_system > 0 && <Line muted>{t("td.auto", { n: r.by_system })}</Line>}
                    {(r.redundant_positive ?? 0) > 0 && (
                      <Line muted><span title={t("td.redundantPositive.help")} className="cursor-help underline decoration-dotted">{t("td.redundantPositive", { n: r.redundant_positive ?? 0 })}</span></Line>
                    )}
                    {(r.excluded ?? 0) > 0 && (
                      <Line muted><span title={t("td.excluded.help")} className="cursor-help underline decoration-dotted">{t("td.excluded", { n: r.excluded ?? 0 })}</span></Line>
                    )}
                  </TableCell>
                  <TableCell>
                    <Line>{r.detector_frames}</Line>
                    <Line muted>{t("td.positive", { n: r.positive_frames, b: r.boxes })} · {t("td.background", { n: r.background_frames })}</Line>
                    {r.frames_without_image > 0 && <Line muted>{t("td.noImage", { n: r.frames_without_image })}</Line>}
                  </TableCell>
                  <TableCell>
                    <Line>{r.classifier_crops}</Line>
                    <Line muted>{Object.entries(r.crops_by_class).map(([c, n]) => `${c} ${n}`).join(" · ")}</Line>
                  </TableCell>
                  <TableCell>
                    <Line>{t("td.reviewed", { n: r.box_reviewed })}</Line>
                    <Line muted>{t("td.toReview", { n: r.needs_box_review })}</Line>
                  </TableCell>
                  <TableCell>
                    <Line>
                      {r.sync_failed > 0
                        ? <span className="text-destructive">{t("td.failed", { n: r.sync_failed })}</span>
                        : r.sync_pending > 0 ? t("td.pending", { n: r.sync_pending }) : t("td.synced")}
                    </Line>
                    <Line muted>{t("td.lastSync", { when: when(r.last_synced_at) })}</Line>
                  </TableCell>
                  <TableCell className="text-right">
                    <Button size="sm" variant="outline" onClick={() => void download(r.detection_type)}
                            disabled={downloading !== null || r.detector_frames + r.classifier_crops === 0}>
                      {downloading === r.detection_type
                        ? <Loader2 className="mr-1 h-4 w-4 animate-spin" />
                        : <Download className="mr-1 h-4 w-4" />}
                      {downloading === r.detection_type ? t("td.downloading") : t("td.download")}
                    </Button>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      </DataCard>
      <p className="text-xs text-muted-foreground">{t("td.hint")}</p>
    </div>
  )
}
