"use client"

/** Settings → Module 6 · Hazards → Rejection reasons (kind of each reason, custom reasons). */
import { SettingsShell, useSettingsReadOnly } from "@/components/settings/settings-shell"
import { RejectionReasonsSettings } from "@/components/settings/hazards/rejection-reasons"

export default function Page() {
  const readOnly = useSettingsReadOnly()
  return (
    <SettingsShell>
      <RejectionReasonsSettings readOnly={readOnly} />
    </SettingsShell>
  )
}
