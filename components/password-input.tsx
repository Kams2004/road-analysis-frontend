"use client"

import { useState } from "react"
import { Eye, EyeOff } from "lucide-react"
import { Input } from "@/components/ui/input"
import { useT } from "@/lib/i18n"

/** Password field with a show/hide toggle (RRAP-01-006). */
export function PasswordInput(props: React.ComponentProps<typeof Input>) {
  const [visible, setVisible] = useState(false)
  const t = useT()
  return (
    <div className="relative">
      <Input {...props} type={visible ? "text" : "password"} className={`pr-10 ${props.className ?? ""}`} />
      <button
        type="button"
        onClick={() => setVisible((v) => !v)}
        className="absolute inset-y-0 right-0 flex w-10 items-center justify-center text-muted-foreground hover:text-foreground"
        aria-label={visible ? t("auth.hidePassword") : t("auth.showPassword")}
        title={visible ? t("auth.hidePassword") : t("auth.showPassword")}
        tabIndex={-1}
      >
        {visible ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
      </button>
    </div>
  )
}
