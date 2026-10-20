"use client"

import { InputOTP, InputOTPGroup, InputOTPSlot } from "@/components/ui/input-otp"

/** Six separate digit boxes for authenticator codes. */
export function OtpBoxes({
  value,
  onChange,
  autoFocus,
  onComplete,
}: {
  value: string
  onChange: (value: string) => void
  autoFocus?: boolean
  onComplete?: (value: string) => void
}) {
  return (
    <InputOTP
      maxLength={6}
      value={value}
      onChange={(v) => onChange(v.replace(/\D/g, ""))}
      onComplete={onComplete}
      autoFocus={autoFocus}
      inputMode="numeric"
      autoComplete="one-time-code"
      containerClassName="justify-center"
    >
      <InputOTPGroup className="gap-2 sm:gap-3">
        {Array.from({ length: 6 }, (_, i) => (
          <InputOTPSlot
            key={i}
            index={i}
            className="h-12 w-11 rounded-lg border text-lg font-semibold first:rounded-lg first:border last:rounded-lg sm:w-12"
          />
        ))}
      </InputOTPGroup>
    </InputOTP>
  )
}
