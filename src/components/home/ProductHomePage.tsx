import { Link } from '@tanstack/react-router'
import {
  ArrowRight,
  ChartNoAxesCombined,
  Github,
  Menu,
  Search,
  ShieldCheck,
  Sparkles,
  Swords,
  Target,
} from 'lucide-react'
import logo from '../../assets/poe-party-logo.png'
import { getLoginHref } from '../../lib/auth-redirect'
import { trackPublicEvent } from '../../lib/analytics'
import { featuredLeagueTheme, leagueThemeDetails, useLeagueTheme } from '../../lib/league-theme'
import { previewStrategies } from '../../lib/preview-fixtures'
import { GITHUB_URL } from '../../lib/seo'
import { formatCurrencyAmount } from '../../lib/utils'
import { Footer } from '../layout/Footer'
import { EntryScene } from '../shared/EntryScene'

const loop = [
  {
    title: 'Plan',
    description: 'Choose a strategy and keep the setup visible to the people running it.',
    icon: Target,
  },
  {
    title: 'Play',
    description: 'Keep characters, party context, and active work in one league-scoped workspace.',
    icon: Swords,
  },
  {
    title: 'Snapshot',
    description: 'Capture PoE1 stash value and connect the result to the strategy you played.',
    icon: ChartNoAxesCombined,
  },
  {
    title: 'Learn',
    description: 'Review the outcome, analyze the build, and decide the next useful upgrade.',
    icon: Sparkles,
  },
] as const

const productLinks = [
  { to: '/preview/analysis' as const, label: 'Analysis' },
  { to: '/preview/strategies' as const, label: 'Strategies' },
  { to: '/preview/search' as const, label: 'Directory' },
] as const

const sampleStrategy = previewStrategies.find((strategy) => strategy.is_active)

function SignInLink({
  placement,
  className,
  label = 'Connect PoE account',
  testId,
}: {
  placement: string
  className: string
  label?: string
  testId?: string
}) {
  const href =
    typeof window === 'undefined' ? '/auth/login' : getLoginHref(window.location.pathname)

  return (
    <a
      href={href}
      className={className}
      data-testid={testId}
      onClick={() =>
        trackPublicEvent('public_sign_in_click', {
          source: '/',
          placement,
        })
      }
    >
      {label}
    </a>
  )
}

export function ProductHomePage() {
  useLeagueTheme(featuredLeagueTheme)
  const featuredSeason = featuredLeagueTheme ? leagueThemeDetails[featuredLeagueTheme] : null

  return (
    <div className="entry-home bg-background min-h-dvh">
      <a
        href="#main-content"
        className="button button--primary sr-only focus:not-sr-only focus:fixed focus:top-2 focus:left-2 focus:z-50"
      >
        Skip to main content
      </a>

      <header className="entry-home-header entry-ink">
        <div className="entry-wrap flex min-h-16 items-center gap-3 md:gap-9">
          <Link
            to="/"
            activeOptions={{ exact: true }}
            aria-label="PoE Party home"
            className="entry-wordmark flex min-h-11 shrink-0 items-center gap-2.5"
          >
            <img src={logo} alt="" width={34} height={34} className="rounded-md" />
            <span>PoE Party</span>
          </Link>

          <nav aria-label="Explore PoE Party" className="hidden items-center gap-4 md:flex lg:gap-6">
            {productLinks.map((item) => (
              <Link
                key={item.to}
                to={item.to}
                activeOptions={{ exact: true }}
                className="entry-nav-link inline-flex min-h-11 items-center px-2 text-sm font-medium"
              >
                {item.label}
              </Link>
            ))}
          </nav>

          <div className="ml-auto flex items-center gap-2">
            <details className="relative md:hidden">
              <summary
                className="button button--tertiary button--icon-only min-h-11 min-w-11 list-none"
                aria-label="Open explore menu"
              >
                <Menu size={17} aria-hidden="true" />
              </summary>
              <nav
                aria-label="Explore PoE Party on mobile"
                className="entry-home-menu absolute top-12 right-0 flex w-48 flex-col p-2"
              >
                {productLinks.map((item) => (
                  <Link
                    key={item.to}
                    to={item.to}
                    activeOptions={{ exact: true }}
                    className="entry-nav-link flex min-h-11 items-center px-3 text-sm font-medium"
                  >
                    {item.label}
                  </Link>
                ))}
              </nav>
            </details>
            <SignInLink placement="header" label="Sign in" className="button button--outline min-h-11" />
          </div>
        </div>
      </header>

      <main id="main-content" tabIndex={-1}>
        <section className="entry-hero entry-ink" aria-labelledby="home-headline">
          <div className="entry-wrap entry-hero-stage">
            <div className="entry-hero-copy">
              <h1 id="home-headline" className="entry-display entry-hero-title">
                Plan the run. <span>See what changed.</span>
              </h1>
              <p className="entry-hero-summary">
                Plan strategies, track PoE1 stash value, and find gear upgrades in one workspace
                for solo and group play.
              </p>
              <div className="entry-hero-actions" data-testid="home-hero-ctas">
                <Link
                  to="/preview/analysis"
                  activeOptions={{ exact: true }}
                  className="button button--lg button--primary min-h-12 justify-center"
                  data-testid="home-hero-analysis-cta"
                  onClick={() =>
                    trackPublicEvent('public_home_cta_click', {
                      target: 'analysis',
                    })
                  }
                >
                  Try public analysis
                  <ArrowRight size={17} aria-hidden="true" />
                </Link>
                <SignInLink
                  placement="hero"
                  className="button button--lg button--outline min-h-12 justify-center"
                  testId="home-hero-connect-cta"
                />
              </div>
            </div>

            <figure className="entry-hero-art">
              <div className="entry-hero-image">
                <EntryScene />
              </div>
              {featuredSeason && <figcaption>{featuredSeason.label}</figcaption>}
            </figure>

            <section aria-labelledby="sample-today" className="entry-sample">
              <h2 id="sample-today">Sample workspace</h2>
              {sampleStrategy && (
                <dl>
                  <div>
                    <dt>Active strategy</dt>
                    <dd>{sampleStrategy.name}</dd>
                  </div>
                  <div>
                    <dt>Estimated chaos per hour</dt>
                    <dd className="tabular-nums">
                      {formatCurrencyAmount(sampleStrategy.benchmark_chaos_per_hour, 'chaos')}
                    </dd>
                  </div>
                </dl>
              )}
              <Link to="/preview" className="entry-sample-link inline-flex min-h-11 items-center gap-2">
                Explore sample <ArrowRight size={16} aria-hidden="true" />
              </Link>
            </section>
          </div>
        </section>

        <section aria-labelledby="workflow-title" className="entry-home-band">
          <div className="entry-wrap">
            <h2 id="workflow-title" className="entry-display entry-section-title">From strategy to upgrades</h2>
            <div className="entry-workflow">
              {loop.map(({ title, description, icon: Icon }) => (
                <div key={title}>
                  <h3 className="text-foreground flex items-center gap-2 font-semibold">
                    <Icon size={16} className="text-brand-readable" aria-hidden="true" /> {title}
                  </h3>
                  <p className="text-default-500 mt-2 text-sm leading-relaxed">{description}</p>
                </div>
              ))}
            </div>
          </div>
        </section>

        <section aria-labelledby="game-support-title" className="entry-home-band entry-home-band--raised">
          <div className="entry-wrap grid gap-6 lg:grid-cols-[0.8fr_1.2fr]">
            <h2 id="game-support-title" className="entry-display entry-section-title">Tools for each game</h2>
            <div className="entry-game-support">
              <div>
                <h3 className="font-semibold">Path of Exile 1</h3>
                <p className="text-default-500 mt-2 text-sm leading-relaxed">
                  Character sync, strategies, market data, stash snapshots, wealth history, Atlas
                  planning, and upgrade analysis.
                </p>
              </div>
              <div>
                <h3 className="flex flex-wrap items-baseline gap-2 font-semibold">
                  Path of Exile 2 <span className="text-info text-xs font-medium">Beta</span>
                </h3>
                <p className="text-default-500 mt-2 text-sm leading-relaxed">
                  Character sync, market overview, public discovery, strategy basics, and shared
                  planning.
                </p>
              </div>
            </div>
          </div>
        </section>

        <section className="entry-home-band" aria-labelledby="home-trust-title">
          <div className="entry-wrap flex flex-wrap items-center justify-between gap-6">
            <div className="flex items-start gap-4">
              <ShieldCheck size={24} className="text-success mt-1 shrink-0" aria-hidden="true" />
              <div>
                <h2 id="home-trust-title" className="entry-display entry-section-title">Independent and open source</h2>
                <p className="text-default-500 mt-2 max-w-3xl text-sm leading-relaxed">
                  Inspect the Apache-2.0 source and see how PoE Party handles your workspace data.
                </p>
              </div>
            </div>
            <a href={GITHUB_URL} target="_blank" rel="noopener noreferrer" className="button button--outline min-h-11">
              <Github size={17} aria-hidden="true" /> View on GitHub
            </a>
          </div>
        </section>

        <section className="entry-home-band entry-home-band--raised px-4 text-center">
          <div className="mx-auto max-w-2xl">
            <h2 className="entry-display entry-section-title">Start with your build</h2>
            <p className="text-default-500 mt-3">
              Run a public analysis without connecting, or create a private workspace when you are
              ready to keep the loop together.
            </p>
            <div className="mt-6 flex flex-col justify-center gap-3 sm:flex-row">
              <Link to="/preview/analysis" activeOptions={{ exact: true }} className="button button--primary min-h-11 justify-center">
                <Search size={17} aria-hidden="true" /> Open public analysis
              </Link>
              <SignInLink
                placement="final"
                label="Create a workspace"
                className="button button--tertiary min-h-11 justify-center"
              />
            </div>
          </div>
        </section>
      </main>

      <Footer />
    </div>
  )
}
