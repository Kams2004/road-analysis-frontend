"use client"

/** Settings → Platform → E-mail (SMTP). */
import { SettingsShell } from "@/components/settings/settings-shell"
import { PlatformSettingsSection } from "@/components/platform-settings"

export default function Page() {
  return (
    <SettingsShell readOnlyNotice={false}>
      <PlatformSettingsSection heading={false} only={["smtp"]} />
    </SettingsShell>
  )
}
