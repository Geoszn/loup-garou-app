import { useEffect, useState } from 'react'

export function useCountdown(deadline: string | null) {
  const [remaining, setRemaining] = useState<number>(() => secondsLeft(deadline))

  useEffect(() => {
    setRemaining(secondsLeft(deadline))
    if (!deadline) return
    const interval = setInterval(() => setRemaining(secondsLeft(deadline)), 250)
    return () => clearInterval(interval)
  }, [deadline])

  return remaining
}

function secondsLeft(deadline: string | null): number {
  if (!deadline) return 0
  return Math.max(0, Math.round((new Date(deadline).getTime() - Date.now()) / 1000))
}

export function Timer({ deadline }: { deadline: string | null }) {
  const remaining = useCountdown(deadline)
  if (!deadline) return null

  return (
    <div className="flex items-center gap-2 rounded-full border border-night-600 bg-gradient-to-b from-night-700/70 to-night-800/70 px-4 py-1.5 text-sm font-semibold text-moon-300 shadow-[0_1px_0_0_rgb(var(--c-shadow-hairline)/var(--c-shadow-hairline-a))_inset]">
      <span className={remaining <= 5 ? 'animate-pulse text-blood-400' : ''}>⏱</span>
      <span className={`font-display tabular-nums ${remaining <= 5 ? 'animate-pulse text-blood-400' : ''}`}>{remaining}s</span>
    </div>
  )
}
