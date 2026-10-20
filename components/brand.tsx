import { cn } from "@/lib/utils"

/** Product name shown in the console chrome. */
export const BRAND_NAME = "VIASafe"

/** Logo mark (public/logo-mark.png) + name + tagline, used on the sign-in pages and in the sidebar. */
export function BrandLockup({
  tagline,
  inverted = false,
  className,
}: {
  tagline: string
  inverted?: boolean
  className?: string
}) {
  return (
    <div className={cn("flex items-center gap-2.5", className)}>
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img src="/logo-mark.png" alt="" className="h-10 w-10 shrink-0 object-contain drop-shadow-sm" />
      <div className="leading-tight">
        <p className={cn("text-lg font-bold tracking-tight", inverted ? "text-white" : "text-foreground")}>
          {BRAND_NAME}
        </p>
        <p className={cn("text-[11px]", inverted ? "text-white/70" : "text-muted-foreground")}>{tagline}</p>
      </div>
    </div>
  )
}
