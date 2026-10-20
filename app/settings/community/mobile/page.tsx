"use client"

/** Settings → Community & mobile → Mobile app (section mobile). */
import { SettingsShell } from "@/components/settings/settings-shell"
import { CommunitySettingsSection } from "@/components/community-settings"

export default function Page() {
  return (
    <SettingsShell readOnlyNotice={false}>
      <CommunitySettingsSection heading={false} only={["mobile"]} />
    </SettingsShell>
  )
}
