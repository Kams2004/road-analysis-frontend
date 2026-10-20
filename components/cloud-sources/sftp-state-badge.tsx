"use client"

import { Loader2 } from "lucide-react"
import { StatusBadge, type BadgeTone } from "@/components/status-badge"
import { useI18n } from "@/lib/i18n"
import type { SftpLinkState } from "@/lib/cloud-sources-api"

const TONE: Record<SftpLinkState, BadgeTone> = { connected: "green", connecting: "blue", error: "red", disconnected: "slate" }

/** Live link state of an SFTP server: disconnected / connecting / connected / error. */
export function SftpStateBadge({ state, title }: { state: SftpLinkState; title?: string }) {
  const { t } = useI18n()
  return (
    <span title={title}>
      <StatusBadge tone={TONE[state] ?? "slate"}>
        {state === "connecting" && <Loader2 className="mr-1 h-3 w-3 animate-spin" />}
        {t(`cs.sftp.state.${state}`)}
      </StatusBadge>
    </span>
  )
}
