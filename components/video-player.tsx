"use client"

import { useRef, useState, useEffect, useCallback } from "react"
import { Play, Pause, Volume2, VolumeX, Maximize } from "lucide-react"
import { cn } from "@/lib/utils"

interface VideoPlayerProps {
  src: string
  className?: string
}

export function VideoPlayer({ src, className }: VideoPlayerProps) {
  const videoRef   = useRef<HTMLVideoElement>(null)
  const containerRef = useRef<HTMLDivElement>(null)
  const [playing, setPlaying]   = useState(false)
  const [muted, setMuted]       = useState(false)
  const [progress, setProgress] = useState(0)   // 0-100
  const [duration, setDuration] = useState(0)
  const [current, setCurrent]   = useState(0)
  const [showControls, setShowControls] = useState(true)
  const hideTimer = useRef<ReturnType<typeof setTimeout> | null>(null)

  const scheduleHide = useCallback(() => {
    if (hideTimer.current) clearTimeout(hideTimer.current)
    setShowControls(true)
    hideTimer.current = setTimeout(() => {
      if (playing) setShowControls(false)
    }, 2500)
  }, [playing])

  useEffect(() => () => { if (hideTimer.current) clearTimeout(hideTimer.current) }, [])

  // keep controls visible when paused
  useEffect(() => { if (!playing) setShowControls(true) }, [playing])

  const togglePlay = () => {
    const v = videoRef.current
    if (!v) return
    if (v.paused) { v.play(); setPlaying(true) }
    else          { v.pause(); setPlaying(false) }
    scheduleHide()
  }

  const handleTimeUpdate = () => {
    const v = videoRef.current
    if (!v || !v.duration) return
    setCurrent(v.currentTime)
    setProgress((v.currentTime / v.duration) * 100)
  }

  const handleLoaded = () => {
    const v = videoRef.current
    if (v) setDuration(v.duration)
  }

  const handleEnded = () => setPlaying(false)

  const seek = (e: React.MouseEvent<HTMLDivElement>) => {
    const v = videoRef.current
    if (!v) return
    const rect = e.currentTarget.getBoundingClientRect()
    const pct  = (e.clientX - rect.left) / rect.width
    v.currentTime = pct * v.duration
  }

  const toggleMute = (e: React.MouseEvent) => {
    e.stopPropagation()
    const v = videoRef.current
    if (!v) return
    v.muted = !v.muted
    setMuted(v.muted)
  }

  const fullscreen = (e: React.MouseEvent) => {
    e.stopPropagation()
    containerRef.current?.requestFullscreen?.()
  }

  const fmt = (s: number) => {
    const m = Math.floor(s / 60)
    const sec = Math.floor(s % 60).toString().padStart(2, "0")
    return `${m}:${sec}`
  }

  return (
    <div
      ref={containerRef}
      className={cn("relative group overflow-hidden rounded-lg bg-black select-none", className)}
      onMouseMove={scheduleHide}
      onMouseLeave={() => { if (playing) setShowControls(false) }}
    >
      {/* Video */}
      <video
        ref={videoRef}
        src={src}
        className="w-full h-full object-contain"
        onTimeUpdate={handleTimeUpdate}
        onLoadedMetadata={handleLoaded}
        onEnded={handleEnded}
        onClick={togglePlay}
        playsInline
      />

      {/* ── Centered play/pause button ── */}
      <button
        onClick={togglePlay}
        className={cn(
          "absolute inset-0 flex items-center justify-center transition-opacity duration-200",
          showControls || !playing ? "opacity-100" : "opacity-0"
        )}
        aria-label={playing ? "Pause" : "Play"}
      >
        <div className={cn(
          "flex h-16 w-16 items-center justify-center rounded-full bg-black/50 backdrop-blur-sm border border-white/20 transition-all duration-150",
          "hover:bg-black/70 hover:scale-105 active:scale-95"
        )}>
          {playing
            ? <Pause  className="h-7 w-7 text-white fill-white" />
            : <Play   className="h-7 w-7 text-white fill-white ml-0.5" />
          }
        </div>
      </button>

      {/* ── Bottom controls bar ── */}
      <div className={cn(
        "absolute bottom-0 inset-x-0 px-3 pb-2 pt-6 transition-opacity duration-200",
        "bg-gradient-to-t from-black/80 to-transparent",
        showControls ? "opacity-100" : "opacity-0 pointer-events-none"
      )}>
        {/* Seek bar */}
        <div
          className="mb-2 h-1.5 w-full cursor-pointer rounded-full bg-white/20 overflow-hidden"
          onClick={seek}
        >
          <div
            className="h-full rounded-full bg-white transition-[width] duration-100"
            style={{ width: `${progress}%` }}
          />
        </div>

        {/* Bottom row */}
        <div className="flex items-center justify-between text-white text-xs">
          <span className="tabular-nums font-mono">
            {fmt(current)} / {fmt(duration)}
          </span>
          <div className="flex items-center gap-2">
            <button onClick={toggleMute} className="hover:text-white/70 transition-colors p-1">
              {muted ? <VolumeX className="h-4 w-4" /> : <Volume2 className="h-4 w-4" />}
            </button>
            <button onClick={fullscreen} className="hover:text-white/70 transition-colors p-1">
              <Maximize className="h-4 w-4" />
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}
