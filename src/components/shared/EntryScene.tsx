import { featuredLeagueTheme, leagueThemeDetails } from '../../lib/league-theme'
import './entry-scene.css'

export function EntryScene({ crop = 'wide' }: { crop?: 'wide' | 'close' }) {
  if (!featuredLeagueTheme) return null

  const { desktop, mobile } = leagueThemeDetails[featuredLeagueTheme].artwork

  return (
    <picture className="entry-scene" aria-hidden="true">
      {crop === 'wide' && <source media="(max-width: 47.99rem)" srcSet={mobile} />}
      <img src={crop === 'close' ? mobile : desktop} alt="" fetchPriority="high" />
    </picture>
  )
}
