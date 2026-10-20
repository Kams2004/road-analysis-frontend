"use client"

/** Settings → Platform → Maps (tile providers, Google key). */
import { SettingsShell } from "@/components/settings/settings-shell"
import { PlatformSettingsSection } from "@/components/platform-settings"

export default function Page() {
  return (
    <SettingsShell readOnlyNotice={false}>
      <PlatformSettingsSection heading={false} only={["maps"]} />
    </SettingsShell>
  )
}
