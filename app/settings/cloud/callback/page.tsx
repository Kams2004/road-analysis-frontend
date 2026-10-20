"use client"

/**
 * OAuth redirect target for cloud storage connections (Google Drive /
 * OneDrive). The provider sends `code` + `state` (or `error`); we hand them
 * to POST /cloud-connections/oauth/complete, show the outcome and continue to
 * Cloud sources (/cloud-sources). The URL stays /settings/cloud/callback: it
 * is the redirect URI registered at Google / Microsoft (cloud.redirect_uri).
 */
import { Suspense, useEffect, useRef, useState } from "react"
import Link from "next/link"
import { useRouter, useSearchParams } from "next/navigation"
import { ArrowLeft, CheckCircle2, Cloud, Loader2, XCircle } from "lucide-react"
import { Sidebar } from "@/components/sidebar"
import { Topbar } from "@/components/topbar"
import { Button } from "@/components/ui/button"
import { Card, CardContent } from "@/components/ui/card"
import { errorText } from "@/lib/auth-api"
import { useT } from "@/lib/i18n"
import { completeCloudOAuth, type CloudConnection } from "@/lib/module7-api"

const SCOPE = "m7.callback"

const sourcesHref = (connectionId?: string | null) =>
  connectionId ? `/cloud-sources?connection=${encodeURIComponent(connectionId)}` : "/cloud-sources"

type State =
  | { kind: "working" }
  | { kind: "ok"; connection: CloudConnection | null }
  | { kind: "error"; message: string }

function CallbackInner() {
  const t = useT()
  const params = useSearchParams()
  const router = useRouter()
  const [state, setState] = useState<State>({ kind: "working" })
  const started = useRef(false)

  useEffect(() => {
    if (started.current) return
    started.current = true
    const providerError = params.get("error")
    const code = params.get("code")
    const st = params.get("state")
    if (providerError) {
      setState({ kind: "error", message: params.get("error_description") || t(`${SCOPE}.denied`, { error: providerError }) })
      return
    }
    if (!code || !st) {
      setState({ kind: "error", message: t(`${SCOPE}.missing`) })
      return
    }
    completeCloudOAuth(code, st)
      .then((connection) => {
        setState({ kind: "ok", connection: connection ?? null })
        // Drop the one-time code from the address bar, then open the drive.
        window.history.replaceState(null, "", window.location.pathname)
        setTimeout(() => router.replace(sourcesHref(connection?.id)), 1500)
      })
      .catch((err) => setState({ kind: "error", message: errorText(t, err, "cs") }))
  }, [params, t, router])

  return (
    <Card className="mx-auto max-w-lg">
      <CardContent className="flex flex-col items-center gap-4 py-10 text-center">
        {state.kind === "working" && (
          <>
            <div className="flex h-14 w-14 items-center justify-center rounded-full bg-primary/10">
              <Loader2 className="h-7 w-7 animate-spin text-primary" />
            </div>
            <p className="font-medium">{t(`${SCOPE}.working`)}</p>
          </>
        )}
        {state.kind === "ok" && (
          <>
            <div className="flex h-14 w-14 items-center justify-center rounded-full bg-success/10">
              <CheckCircle2 className="h-7 w-7 text-success" />
            </div>
            <div className="space-y-1">
              <p className="text-lg font-semibold">{t(`${SCOPE}.success`)}</p>
              {state.connection && (
                <p className="text-sm text-muted-foreground">
                  {state.connection.name}
                  {state.connection.account_email ? ` · ${state.connection.account_email}` : ""}
                </p>
              )}
              <p className="text-sm text-muted-foreground">{t("cs.callback.next")}</p>
            </div>
          </>
        )}
        {state.kind === "error" && (
          <>
            <div className="flex h-14 w-14 items-center justify-center rounded-full bg-destructive/10">
              <XCircle className="h-7 w-7 text-destructive" />
            </div>
            <div className="space-y-1">
              <p className="text-lg font-semibold">{t(`${SCOPE}.failed`)}</p>
              <p className="break-words text-sm text-muted-foreground">{state.message}</p>
            </div>
          </>
        )}
        {state.kind !== "working" && (
          <Button asChild variant={state.kind === "ok" ? "default" : "outline"} className="gap-2">
            <Link href={sourcesHref(state.kind === "ok" ? state.connection?.id : undefined)}>
              <ArrowLeft className="h-4 w-4" />{t("cs.callback.back")}
            </Link>
          </Button>
        )}
      </CardContent>
    </Card>
  )
}

export default function CloudCallbackPage() {
  const t = useT()
  return (
    <div className="min-h-screen bg-background">
      <Sidebar />
      <main className="lg:pl-64">
        <Topbar />
        <div className="px-4 py-8 sm:px-6 lg:px-8">
          <div className="mb-8 flex items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-primary/10">
              <Cloud className="h-5 w-5 text-primary" />
            </div>
            <h1 className="text-2xl font-bold text-foreground">{t(`${SCOPE}.title`)}</h1>
          </div>
          <Suspense fallback={
            <div className="flex justify-center py-10 text-muted-foreground"><Loader2 className="h-6 w-6 animate-spin" /></div>
          }>
            <CallbackInner />
          </Suspense>
        </div>
      </main>
    </div>
  )
}
