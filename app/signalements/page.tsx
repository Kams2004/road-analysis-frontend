"use client"

import { useState, useEffect, useMemo } from "react"
import Image from "next/image"
import { Sidebar } from "@/components/sidebar"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Textarea } from "@/components/ui/textarea"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog"
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from "@/components/ui/alert-dialog"
import { Card, CardContent } from "@/components/ui/card"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import {
  Search, Filter, MapPin, ImageIcon, Eye, Trash2,
  ChevronLeft, ChevronRight, MessageSquareWarning,
  CheckCircle, XCircle, Clock, Loader2, Ban, ShieldAlert,
} from "lucide-react"
import { cn } from "@/lib/utils"
import { format, formatDistanceToNow } from "date-fns"
import {
  fetchSignalements, moderateSignalement, deleteSignalement, resolveMinioUrl,
  type ApiSignalement, type SignalementType, type SignalementStatus,
} from "@/lib/api"

const PAGE_SIZE = 20

// ── Display helpers ────────────────────────────────────────────────────────────

const TYPE_LABELS: Record<string, string> = {
  embouteillage:    "Embouteillage",
  police:           "Police",
  accident:         "Accident",
  danger:           "Danger",
  route_fermee:     "Route fermée",
  voie_bloquee:     "Voie bloquée",
  probleme_de_carte:"Problème de carte",
  mauvais_temps:    "Mauvais temps",
  prix_carburant:   "Prix carburant",
  assistance_route: "Assistance route",
  debogage:         "Débogage",
}

const TYPE_COLORS: Record<string, string> = {
  embouteillage:    "bg-orange-500/10 text-orange-600 border-orange-400/30",
  police:           "bg-blue-500/10 text-blue-600 border-blue-400/30",
  accident:         "bg-red-500/10 text-red-600 border-red-400/30",
  danger:           "bg-yellow-500/10 text-yellow-700 border-yellow-400/30",
  route_fermee:     "bg-rose-500/10 text-rose-600 border-rose-400/30",
  voie_bloquee:     "bg-pink-500/10 text-pink-600 border-pink-400/30",
  probleme_de_carte:"bg-purple-500/10 text-purple-600 border-purple-400/30",
  mauvais_temps:    "bg-sky-500/10 text-sky-600 border-sky-400/30",
  prix_carburant:   "bg-green-500/10 text-green-600 border-green-400/30",
  assistance_route: "bg-teal-500/10 text-teal-600 border-teal-400/30",
  debogage:         "bg-muted text-muted-foreground border-border",
}

const STATUS_COLORS: Record<SignalementStatus, string> = {
  actif:  "bg-success/10 text-success border-success/30",
  annule: "bg-warning/10 text-warning border-warning/30",
  rejete: "bg-destructive/10 text-destructive border-destructive/30",
}

const STATUS_LABELS: Record<SignalementStatus, string> = {
  actif:  "Actif",
  annule: "Annulé",
  rejete: "Rejeté",
}

// ── Page ───────────────────────────────────────────────────────────────────────

export default function SignalementsPage() {
  const [items, setItems]       = useState<ApiSignalement[]>([])
  const [total, setTotal]       = useState(0)
  const [loading, setLoading]   = useState(true)
  const [error, setError]       = useState<string | null>(null)
  const [page, setPage]         = useState(1)

  // filters
  const [statusFilter, setStatusFilter] = useState<string>("all")
  const [typeFilter,   setTypeFilter]   = useState<string>("all")
  const [search,       setSearch]       = useState("")

  // detail modal
  const [selected, setSelected] = useState<ApiSignalement | null>(null)

  // moderation form
  const [modAction, setModAction]   = useState<"annule" | "rejete" | null>(null)
  const [modNote,   setModNote]     = useState("")
  const [modBusy,   setModBusy]     = useState(false)
  const [modError,  setModError]    = useState<string | null>(null)

  // delete confirm
  const [toDelete, setToDelete]   = useState<ApiSignalement | null>(null)
  const [delBusy,  setDelBusy]    = useState(false)

  // counts
  const [counts, setCounts] = useState({ actif: 0, annule: 0, rejete: 0 })

  // ── Load counts once / after mutations ─────────────────────────────────────
  async function loadCounts() {
    const [a, b, c] = await Promise.all([
      fetchSignalements({ status: "actif",  limit: 1 }),
      fetchSignalements({ status: "annule", limit: 1 }),
      fetchSignalements({ status: "rejete", limit: 1 }),
    ])
    setCounts({ actif: a.total, annule: b.total, rejete: c.total })
  }

  // ── Load page ───────────────────────────────────────────────────────────────
  useEffect(() => {
    setLoading(true)
    setError(null)
    fetchSignalements({
      status: statusFilter as SignalementStatus | "all",
      type:   typeFilter   as SignalementType   | "all",
      skip:   (page - 1) * PAGE_SIZE,
      limit:  PAGE_SIZE,
    })
      .then((d) => { setItems(d.items); setTotal(d.total) })
      .catch((e) => setError(e.message))
      .finally(() => setLoading(false))
  }, [page, statusFilter, typeFilter])

  useEffect(() => { loadCounts() }, [items])

  // ── Client-side search filter ───────────────────────────────────────────────
  const filtered = useMemo(() => {
    if (!search) return items
    const q = search.toLowerCase()
    return items.filter((s) =>
      s.id.toLowerCase().includes(q) ||
      TYPE_LABELS[s.type]?.toLowerCase().includes(q) ||
      (s.reported_by ?? "").toLowerCase().includes(q) ||
      (s.description ?? "").toLowerCase().includes(q)
    )
  }, [items, search])

  const totalPages = Math.ceil(total / PAGE_SIZE)

  // ── Moderation submit ───────────────────────────────────────────────────────
  async function handleModerate() {
    if (!selected || !modAction) return
    setModBusy(true)
    setModError(null)
    try {
      const updated = await moderateSignalement(selected.id, modAction, "admin", modNote || undefined)
      setItems((prev) => prev.map((s) => s.id === updated.id ? updated : s))
      setSelected(updated)
      setModAction(null)
      setModNote("")
    } catch (e: unknown) {
      setModError(e instanceof Error ? e.message : "Action failed")
    } finally {
      setModBusy(false)
    }
  }

  // ── Delete ──────────────────────────────────────────────────────────────────
  async function handleDelete() {
    if (!toDelete) return
    setDelBusy(true)
    try {
      await deleteSignalement(toDelete.id)
      setItems((prev) => prev.filter((s) => s.id !== toDelete.id))
      setTotal((t) => t - 1)
      if (selected?.id === toDelete.id) setSelected(null)
      setToDelete(null)
    } catch (e: unknown) {
      alert(e instanceof Error ? e.message : "Delete failed")
    } finally {
      setDelBusy(false)
    }
  }

  // ── Render ──────────────────────────────────────────────────────────────────
  return (
    <div className="min-h-screen bg-background">
      <Sidebar />
      <main className="lg:pl-64">
        <div className="px-4 py-8 sm:px-6 lg:px-8">

          {/* Header */}
          <div className="mb-8">
            <h1 className="text-3xl font-bold flex items-center gap-2">
              <MessageSquareWarning className="h-8 w-8 text-primary" />
              Signalements
            </h1>
            <p className="mt-1 text-muted-foreground">
              Signalements soumis par les utilisateurs mobiles — modération et gestion
            </p>
          </div>

          {/* KPI cards */}
          <div className="mb-8 grid gap-4 sm:grid-cols-3">
            {([
              { label: "Actifs",  value: counts.actif,  icon: CheckCircle, color: "bg-success/10",     ic: "text-success"     },
              { label: "Annulés", value: counts.annule, icon: Ban,         color: "bg-warning/10",     ic: "text-warning"     },
              { label: "Rejetés", value: counts.rejete, icon: XCircle,     color: "bg-destructive/10", ic: "text-destructive" },
            ] as const).map(({ label, value, icon: Icon, color, ic }) => (
              <Card key={label}>
                <CardContent className="flex items-center gap-4 p-6">
                  <div className={cn("flex h-12 w-12 items-center justify-center rounded-lg", color)}>
                    <Icon className={cn("h-6 w-6", ic)} />
                  </div>
                  <div>
                    <p className="text-2xl font-bold">{value}</p>
                    <p className="text-sm text-muted-foreground">{label}</p>
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>

          {/* Table card */}
          <div className="rounded-xl border bg-card p-6">

            {/* Filters */}
            <div className="mb-4 flex flex-col gap-3 sm:flex-row">
              <div className="relative flex-1">
                <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                <Input
                  placeholder="Rechercher par ID, type, utilisateur…"
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  className="pl-9"
                />
              </div>
              <Select value={statusFilter} onValueChange={(v) => { setStatusFilter(v); setPage(1) }}>
                <SelectTrigger className="w-36">
                  <Filter className="mr-2 h-4 w-4" /><SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">Tous statuts</SelectItem>
                  <SelectItem value="actif">Actif</SelectItem>
                  <SelectItem value="annule">Annulé</SelectItem>
                  <SelectItem value="rejete">Rejeté</SelectItem>
                </SelectContent>
              </Select>
              <Select value={typeFilter} onValueChange={(v) => { setTypeFilter(v); setPage(1) }}>
                <SelectTrigger className="w-44"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">Tous les types</SelectItem>
                  {Object.entries(TYPE_LABELS).map(([k, v]) => (
                    <SelectItem key={k} value={k}>{v}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="flex justify-between text-sm text-muted-foreground mb-2">
              <span>Affichage de {filtered.length} sur {total}</span>
              <span>Page {page} de {totalPages || 1}</span>
            </div>

            {error && <p className="text-destructive text-sm mb-3">{error}</p>}

            <div className="rounded-lg border overflow-hidden">
              <Table>
                <TableHeader>
                  <TableRow className="bg-muted/50 hover:bg-muted/50">
                    <TableHead>Type</TableHead>
                    <TableHead>Statut</TableHead>
                    <TableHead className="hidden md:table-cell">Localisation</TableHead>
                    <TableHead className="hidden lg:table-cell">Signalé par</TableHead>
                    <TableHead className="hidden lg:table-cell">Date</TableHead>
                    <TableHead className="text-right">Actions</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {loading && (
                    <TableRow>
                      <TableCell colSpan={6} className="h-32 text-center text-muted-foreground">
                        <Loader2 className="mx-auto h-5 w-5 animate-spin" />
                      </TableCell>
                    </TableRow>
                  )}
                  {!loading && filtered.map((s) => (
                    <TableRow key={s.id}>
                      <TableCell>
                        <Badge variant="outline" className={cn("text-xs capitalize", TYPE_COLORS[s.type] ?? "")}>
                          {TYPE_LABELS[s.type] ?? s.type}
                        </Badge>
                        <div className="text-xs text-muted-foreground mt-0.5">{s.id.slice(0, 8)}</div>
                      </TableCell>
                      <TableCell>
                        <Badge variant="outline" className={cn("text-xs", STATUS_COLORS[s.status])}>
                          {STATUS_LABELS[s.status]}
                        </Badge>
                      </TableCell>
                      <TableCell className="hidden md:table-cell">
                        <div className="flex items-center gap-1 text-sm">
                          <MapPin className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
                          <span className="tabular-nums text-xs">
                            {s.latitude.toFixed(4)}, {s.longitude.toFixed(4)}
                          </span>
                        </div>
                      </TableCell>
                      <TableCell className="hidden lg:table-cell text-sm">
                        {s.reported_by ?? <span className="text-muted-foreground">—</span>}
                      </TableCell>
                      <TableCell className="hidden lg:table-cell text-xs text-muted-foreground">
                        {formatDistanceToNow(new Date(s.reported_at + "Z"), { addSuffix: true })}
                      </TableCell>
                      <TableCell className="text-right">
                        <div className="flex items-center justify-end gap-1">
                          <Button
                            variant="ghost" size="icon" className="h-8 w-8"
                            onClick={() => { setSelected(s); setModAction(null); setModNote(""); setModError(null) }}
                          >
                            <Eye className="h-4 w-4" />
                          </Button>
                          <Button
                            variant="ghost" size="icon"
                            className="h-8 w-8 text-destructive hover:bg-destructive/10"
                            onClick={() => setToDelete(s)}
                          >
                            <Trash2 className="h-4 w-4" />
                          </Button>
                        </div>
                      </TableCell>
                    </TableRow>
                  ))}
                  {!loading && filtered.length === 0 && (
                    <TableRow>
                      <TableCell colSpan={6} className="h-32 text-center">
                        <MessageSquareWarning className="mx-auto h-8 w-8 text-muted-foreground/40" />
                        <p className="mt-2 text-sm text-muted-foreground">Aucun signalement trouvé</p>
                      </TableCell>
                    </TableRow>
                  )}
                </TableBody>
              </Table>
            </div>

            {totalPages > 1 && (
              <div className="mt-4 flex items-center justify-end gap-2">
                <Button variant="outline" size="icon" className="h-8 w-8"
                  onClick={() => setPage((p) => Math.max(1, p - 1))} disabled={page === 1}>
                  <ChevronLeft className="h-4 w-4" />
                </Button>
                <span className="text-sm text-muted-foreground">{page} / {totalPages}</span>
                <Button variant="outline" size="icon" className="h-8 w-8"
                  onClick={() => setPage((p) => Math.min(totalPages, p + 1))} disabled={page === totalPages}>
                  <ChevronRight className="h-4 w-4" />
                </Button>
              </div>
            )}
          </div>
        </div>
      </main>

      {/* ── Detail / Moderation Modal ── */}
      <Dialog open={!!selected} onOpenChange={(o) => { if (!o) setSelected(null) }}>
        <DialogContent className="sm:max-w-xl max-h-[90vh] overflow-y-auto">
          {selected && (
            <>
              <DialogHeader>
                <DialogTitle className="flex items-center gap-2">
                  <Badge variant="outline" className={cn(TYPE_COLORS[selected.type] ?? "")}>
                    {TYPE_LABELS[selected.type] ?? selected.type}
                  </Badge>
                  <Badge variant="outline" className={STATUS_COLORS[selected.status]}>
                    {STATUS_LABELS[selected.status]}
                  </Badge>
                </DialogTitle>
                <DialogDescription>ID: {selected.id.slice(0, 8)}</DialogDescription>
              </DialogHeader>

              <div className="space-y-4">

                {/* Image */}
                {resolveMinioUrl(selected.image_url) ? (
                  <div className="relative aspect-video rounded-lg overflow-hidden bg-muted">
                    <Image
                      src={resolveMinioUrl(selected.image_url)!}
                      alt="signalement"
                      fill
                      className="object-cover"
                      unoptimized
                    />
                  </div>
                ) : (
                  <div className="flex aspect-video items-center justify-center rounded-lg bg-muted">
                    <ImageIcon className="h-12 w-12 text-muted-foreground/40" />
                  </div>
                )}

                {/* Info grid */}
                <div className="grid gap-3 sm:grid-cols-2 text-sm rounded-lg border p-4">
                  <div>
                    <p className="text-xs text-muted-foreground">Localisation</p>
                    <p className="flex items-center gap-1">
                      <MapPin className="h-3.5 w-3.5 text-muted-foreground" />
                      {selected.latitude.toFixed(6)}, {selected.longitude.toFixed(6)}
                    </p>
                  </div>
                  <div>
                    <p className="text-xs text-muted-foreground">Signalé par</p>
                    <p>{selected.reported_by ?? "—"}</p>
                  </div>
                  <div>
                    <p className="text-xs text-muted-foreground">Date</p>
                    <p>{format(new Date(selected.reported_at + "Z"), "PPpp")}</p>
                  </div>
                  {selected.description && (
                    <div className="sm:col-span-2">
                      <p className="text-xs text-muted-foreground">Description</p>
                      <p className="italic">{selected.description}</p>
                    </div>
                  )}
                </div>

                {/* Moderation info (already moderated) */}
                {selected.moderated_at && (
                  <div className="rounded-lg border p-4 space-y-1 text-sm">
                    <p className="font-medium flex items-center gap-1">
                      <ShieldAlert className="h-4 w-4" /> Modération
                    </p>
                    <p>
                      Par <span className="font-medium">{selected.moderated_by}</span>
                      {" · "}
                      {format(new Date(selected.moderated_at + "Z"), "PPpp")}
                    </p>
                    {selected.moderation_note && (
                      <p className="text-muted-foreground italic">"{selected.moderation_note}"</p>
                    )}
                  </div>
                )}

                {/* Moderation actions — only when actif */}
                {selected.status === "actif" && (
                  <div className="border-t pt-4 space-y-3">
                    {modAction === null ? (
                      <div className="flex gap-3">
                        <Button
                          variant="outline"
                          className="flex-1 text-warning border-warning/30 hover:bg-warning/10"
                          onClick={() => setModAction("annule")}
                        >
                          <Ban className="mr-2 h-4 w-4" /> Annuler
                        </Button>
                        <Button
                          variant="outline"
                          className="flex-1 text-destructive border-destructive/30 hover:bg-destructive/10"
                          onClick={() => setModAction("rejete")}
                        >
                          <XCircle className="mr-2 h-4 w-4" /> Rejeter
                        </Button>
                      </div>
                    ) : (
                      <div className="space-y-3">
                        <p className="text-sm font-medium">
                          {modAction === "annule" ? "Annuler" : "Rejeter"} ce signalement
                        </p>
                        <div className="space-y-1">
                          <Label className="text-xs">Note (optionnel)</Label>
                          <Textarea
                            placeholder="Motif ou commentaire…"
                            value={modNote}
                            onChange={(e) => setModNote(e.target.value)}
                            rows={2}
                            className="text-sm"
                          />
                        </div>
                        {modError && <p className="text-xs text-destructive">{modError}</p>}
                        <div className="flex gap-3">
                          <Button
                            className={cn(
                              "flex-1",
                              modAction === "annule"
                                ? "bg-warning hover:bg-warning/90 text-warning-foreground"
                                : "bg-destructive hover:bg-destructive/90 text-white"
                            )}
                            disabled={modBusy}
                            onClick={handleModerate}
                          >
                            {modBusy
                              ? <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                              : modAction === "annule"
                                ? <Ban className="mr-2 h-4 w-4" />
                                : <XCircle className="mr-2 h-4 w-4" />
                            }
                            Confirmer
                          </Button>
                          <Button variant="outline" className="flex-1" onClick={() => { setModAction(null); setModNote(""); setModError(null) }}>
                            Annuler
                          </Button>
                        </div>
                      </div>
                    )}
                  </div>
                )}

                {/* Delete button always available */}
                <div className="flex justify-end border-t pt-3">
                  <Button
                    variant="ghost"
                    size="sm"
                    className="text-destructive hover:bg-destructive/10 gap-1.5"
                    onClick={() => { setToDelete(selected); setSelected(null) }}
                  >
                    <Trash2 className="h-4 w-4" /> Supprimer
                  </Button>
                </div>
              </div>
            </>
          )}
        </DialogContent>
      </Dialog>

      {/* ── Delete confirm ── */}
      <AlertDialog open={!!toDelete} onOpenChange={(o) => { if (!o) setToDelete(null) }}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Supprimer ce signalement ?</AlertDialogTitle>
            <AlertDialogDescription>
              Cette action est irréversible. Le signalement{" "}
              <span className="font-medium">{toDelete?.id.slice(0, 8)}</span> sera définitivement supprimé.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={delBusy}>Annuler</AlertDialogCancel>
            <AlertDialogAction
              className="bg-destructive hover:bg-destructive/90 text-white"
              disabled={delBusy}
              onClick={handleDelete}
            >
              {delBusy ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
              Supprimer
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  )
}
