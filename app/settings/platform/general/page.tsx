"use client"

/** Settings → Platform → Integrations & data (in development, nothing persisted yet). */
import { SettingsShell } from "@/components/settings/settings-shell"
import { PlatformGeneralCards } from "@/components/settings/platform/general"

export default function Page() {
  return (
    <SettingsShell>
      <PlatformGeneralCards />
    </SettingsShell>
  )
}
