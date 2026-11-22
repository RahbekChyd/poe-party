import { featuredLeagueTheme, leagueThemeDetails } from '../../lib/league-theme'
import './entry-scene.css'

export function EntryScene({ crop = 'wide' }: { crop?: 'wide' | 'close' }) {
  if (!featuredLeagueTheme) return null

  const { desktop, mobile } = leagueThemeDetails[featuredLeagueTheme].artwork
  const image = crop === 'close' ? mobile : desktop

  return (
    <picture className="entry-scene" aria-hidden="true">
      {crop === 'wide' && (
        <source media="(max-width: 47.99rem)" srcSet={mobile.src} width={mobile.width} height={mobile.height} />
      )}
      <img src={image.src} width={image.width} height={image.height} alt="" fetchPriority="high" />
    </picture>
  )
}
