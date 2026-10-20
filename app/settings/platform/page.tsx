"use client"

/** Settings → Platform → Access & security: CAPTCHA, security policy, Google sign-in. */
import { SettingsShell } from "@/components/settings/settings-shell"
import { PlatformSettingsSection } from "@/components/platform-settings"

export default function Page() {
  return (
    <SettingsShell readOnlyNotice={false}>
      <PlatformSettingsSection heading={false} only={["captcha", "security", "google_signin"]} />
    </SettingsShell>
  )
}
