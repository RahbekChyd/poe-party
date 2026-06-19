import { useEffect, useState } from 'react'
const ASCENDANCY_ART_THEMES: Record<string, { background: string; glow: string }> = {
  Juggernaut: { background: 'from-rose-900 via-orange-700 to-amber-300', glow: 'rgba(251, 146, 60, 0.45)' },
  Berserker: { background: 'from-red-950 via-red-700 to-orange-400', glow: 'rgba(248, 113, 113, 0.5)' },
  Chieftain: { background: 'from-orange-950 via-red-800 to-amber-400', glow: 'rgba(251, 191, 36, 0.45)' },
  Raider: { background: 'from-emerald-950 via-green-700 to-lime-300', glow: 'rgba(74, 222, 128, 0.45)' },
  Deadeye: { background: 'from-sky-950 via-blue-700 to-cyan-300', glow: 'rgba(56, 189, 248, 0.45)' },
  Pathfinder: { background: 'from-emerald-950 via-teal-700 to-green-300', glow: 'rgba(45, 212, 191, 0.45)' },
  Necromancer: { background: 'from-slate-950 via-violet-800 to-fuchsia-400', glow: 'rgba(192, 132, 252, 0.45)' },
  Occultist: { background: 'from-indigo-950 via-purple-800 to-pink-400', glow: 'rgba(216, 180, 254, 0.45)' },
  Elementalist: { background: 'from-orange-950 via-amber-600 to-sky-300', glow: 'rgba(253, 186, 116, 0.45)' },
  Slayer: { background: 'from-zinc-950 via-rose-800 to-orange-300', glow: 'rgba(253, 164, 175, 0.45)' },
  Gladiator: { background: 'from-stone-950 via-red-900 to-amber-300', glow: 'rgba(251, 191, 36, 0.4)' },
  Champion: { background: 'from-yellow-950 via-amber-700 to-stone-200', glow: 'rgba(253, 224, 71, 0.45)' },
  Inquisitor: { background: 'from-slate-950 via-amber-700 to-yellow-100', glow: 'rgba(254, 240, 138, 0.45)' },
  Hierophant: { background: 'from-indigo-950 via-blue-800 to-cyan-200', glow: 'rgba(125, 211, 252, 0.45)' },
  Guardian: { background: 'from-slate-950 via-cyan-700 to-emerald-200', glow: 'rgba(167, 243, 208, 0.45)' },
  Assassin: { background: 'from-zinc-950 via-fuchsia-800 to-rose-300', glow: 'rgba(244, 114, 182, 0.45)' },
  Saboteur: { background: 'from-zinc-950 via-orange-700 to-yellow-300', glow: 'rgba(251, 191, 36, 0.45)' },
  Trickster: { background: 'from-slate-950 via-teal-700 to-cyan-200', glow: 'rgba(103, 232, 249, 0.45)' },
  Ascendant: { background: 'from-stone-900 via-amber-700 to-yellow-200', glow: 'rgba(253, 230, 138, 0.45)' },
}

function getAscendancyInitials(label: string | null, poeClass: string | null): string {
  const source = (label ?? poeClass ?? '?').trim()
  if (!source) return '?'
  const words = source.split(/\s+/).filter(Boolean)
  if (words.length === 1) return words[0].slice(0, 2).toUpperCase()

  return words
    .slice(0, 2)
    .map((word) => word[0]?.toUpperCase() ?? '')
    .join('')
}

export function AscendancyArt({
  ascendancy,
  poeClass,
  imagePath,
  heightClass = 'h-28',
}: {
  ascendancy: string | null
  poeClass: string | null
  imagePath: string | null
  heightClass?: string
}) {
  const [imageVisible, setImageVisible] = useState(Boolean(imagePath))

  useEffect(() => {
    setImageVisible(Boolean(imagePath))
  }, [imagePath])

  const theme = ascendancy ? ASCENDANCY_ART_THEMES[ascendancy] : null
  const gradientClass = theme?.background ?? 'from-default-200 via-default-100 to-default-50'

  return (
    <div
      className={`relative overflow-hidden rounded-large border border-white/10 bg-gradient-to-br ${gradientClass} ${heightClass}`}
      style={{
        boxShadow: theme ? `inset 0 0 0 1px rgba(255,255,255,0.08), 0 18px 48px ${theme.glow}` : undefined,
      }}
    >
      <div className="absolute inset-0 bg-[radial-gradient(circle_at_top_right,rgba(255,255,255,0.28),transparent_34%),linear-gradient(135deg,rgba(255,255,255,0.12),transparent_45%)]" />
      <div className="absolute -right-5 -top-6 h-24 w-24 rounded-full bg-white/10 blur-2xl" />
      {imagePath && imageVisible ? (
        <img
          src={imagePath}
          alt={ascendancy ?? poeClass ?? 'Path of Exile class'}
          className="absolute inset-0 h-full w-full object-contain object-center p-2 opacity-95"
          onError={() => setImageVisible(false)}
        />
      ) : null}
      <div className="absolute inset-0 bg-gradient-to-t from-black/70 via-black/10 to-black/5" />
      <div className="absolute bottom-3 left-3 right-3 flex items-end justify-between gap-3">
        <div className="min-w-0">
          <p className="truncate text-[11px] font-semibold uppercase tracking-[0.22em] text-white/70">
            {poeClass ?? 'No Class'}
          </p>
          <p className="truncate text-sm font-semibold text-white">
            {ascendancy ?? 'Unascended'}
          </p>
        </div>
        <div className="shrink-0 text-3xl font-black tracking-tight text-white/90">
          {getAscendancyInitials(ascendancy, poeClass)}
        </div>
      </div>
    </div>
  )
}
