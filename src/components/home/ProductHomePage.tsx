import { Card } from '@heroui/react/card'
import { Chip } from '@heroui/react/chip'
import { Link } from '@tanstack/react-router'
import {
  ArrowRight,
  ChartNoAxesCombined,
  Check,
  Github,
  Menu,
  Search,
  ShieldCheck,
  Sparkles,
  Swords,
  Target,
  Users,
} from 'lucide-react'
import logo from '../../assets/poe-party-logo.png'
import { getLoginHref } from '../../lib/auth-redirect'
import { trackPublicEvent } from '../../lib/analytics'
import { GITHUB_URL } from '../../lib/seo'
import { Footer } from '../layout/Footer'

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
  return (
    <div className="bg-background min-h-dvh">
      <a
        href="#main-content"
        className="bg-content1 text-foreground fixed top-2 left-2 z-50 -translate-y-20 rounded-lg px-3 py-2 text-sm shadow-lg transition-transform focus:translate-y-0"
      >
        Skip to main content
      </a>

      <header className="border-divider/70 bg-content1/90 sticky top-0 z-40 border-b backdrop-blur">
        <div className="mx-auto flex min-h-16 max-w-7xl items-center gap-4 px-4 sm:px-6">
          <Link
            to="/"
            activeOptions={{ exact: true }}
            aria-label="PoE Party home"
            className="flex min-w-0 items-center gap-2.5 rounded-lg focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary"
          >
            <img src={logo} alt="" className="h-9 w-9 rounded-xl" />
            <span className="text-foreground truncate font-semibold">PoE Party</span>
            <Chip size="sm" variant="soft" color="warning" className="hidden sm:inline-flex">
              Early access
            </Chip>
          </Link>

          <nav aria-label="Explore PoE Party" className="ml-5 hidden items-center gap-1 md:flex">
            {productLinks.map((item) => (
              <Link
                key={item.to}
                to={item.to}
                activeOptions={{ exact: true }}
                className="text-default-500 hover:text-foreground rounded-lg px-3 py-2 text-sm font-medium transition-colors"
              >
                {item.label}
              </Link>
            ))}
          </nav>

          <div className="ml-auto flex items-center gap-2">
            <details className="relative md:hidden">
              <summary className="button button--sm button--tertiary button--icon-only list-none" aria-label="Open explore menu">
                <Menu size={17} aria-hidden="true" />
              </summary>
              <nav
                aria-label="Explore PoE Party on mobile"
                className="border-divider bg-content1 absolute top-12 right-0 flex w-52 flex-col rounded-xl border p-2 shadow-lg"
              >
                {productLinks.map((item) => (
                  <Link
                    key={item.to}
                    to={item.to}
                    activeOptions={{ exact: true }}
                    className="text-default-600 hover:bg-default-100 hover:text-foreground flex min-h-11 items-center rounded-lg px-3 text-sm font-medium"
                  >
                    {item.label}
                  </Link>
                ))}
              </nav>
            </details>
            <SignInLink placement="header" label="Sign in" className="button button--sm" />
          </div>
        </div>
      </header>

      <main id="main-content">
        <section className="relative overflow-hidden px-4 py-12 sm:px-6 sm:py-20">
          <div
            aria-hidden="true"
            className="bg-warning/10 absolute top-0 left-1/2 h-80 w-80 -translate-x-1/2 rounded-full blur-3xl sm:h-[30rem] sm:w-[30rem]"
          />
          <div className="relative mx-auto grid max-w-7xl items-center gap-10 lg:grid-cols-[1.08fr_0.92fr]">
            <div className="max-w-3xl">
              <h1 className="text-foreground mt-4 text-4xl leading-[1.05] font-bold tracking-tight sm:text-6xl">
                Plan the run. See what changed. Choose the next upgrade.
              </h1>
              <p className="text-default-500 mt-5 max-w-2xl text-base leading-relaxed sm:text-lg">
                Plan strategies, track PoE1 stash value, and find gear upgrades in one workspace
                for solo and group play.
              </p>
              <div
                className="mt-7 flex flex-col gap-3 sm:flex-row"
                data-testid="home-hero-ctas"
              >
                <Link
                  to="/preview/analysis"
                  activeOptions={{ exact: true }}
                  className="button button--lg justify-center"
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
                  className="button button--lg button--tertiary justify-center"
                  testId="home-hero-connect-cta"
                />
              </div>
              <div className="text-default-400 mt-5 flex flex-wrap gap-x-5 gap-y-2 text-xs">
                <span className="inline-flex items-center gap-1.5">
                  <Check size={14} className="text-success" aria-hidden="true" /> No PoE password
                </span>
                <span className="inline-flex items-center gap-1.5">
                  <Check size={14} className="text-success" aria-hidden="true" /> Open source
                </span>
                <span className="inline-flex items-center gap-1.5">
                  <Check size={14} className="text-success" aria-hidden="true" /> Solo or party
                </span>
              </div>
            </div>

            <Card className="border-warning/20 bg-content1/90 overflow-hidden border">
              <Card.Header className="border-divider/60 flex items-center justify-between border-b px-5 py-4">
                <div>
                  <p className="text-foreground text-sm font-semibold">Today</p>
                  <p className="text-default-400 mt-0.5 text-xs">One workspace, one next action</p>
                </div>
                <Chip size="sm" variant="soft" color="success">
                  League ready
                </Chip>
              </Card.Header>
              <Card.Content className="gap-3 p-5">
                <div className="border-divider bg-default-50 flex items-start gap-3 rounded-xl border p-4">
                  <Target size={18} className="text-warning mt-0.5" aria-hidden="true" />
                  <div>
                    <p className="text-foreground text-sm font-medium">Run the active strategy</p>
                    <p className="text-default-500 mt-1 text-xs">Setup and notes stay visible.</p>
                  </div>
                </div>
                <div className="border-divider bg-default-50 flex items-start gap-3 rounded-xl border p-4">
                  <ChartNoAxesCombined size={18} className="text-success mt-0.5" aria-hidden="true" />
                  <div>
                    <p className="text-foreground text-sm font-medium">Capture the outcome</p>
                    <p className="text-default-500 mt-1 text-xs">Connect a PoE1 snapshot to the run.</p>
                  </div>
                </div>
                <div className="border-divider bg-default-50 flex items-start gap-3 rounded-xl border p-4">
                  <Sparkles size={18} className="text-arcane mt-0.5" aria-hidden="true" />
                  <div>
                    <p className="text-foreground text-sm font-medium">Review the next upgrade</p>
                    <p className="text-default-500 mt-1 text-xs">Turn analysis into a build plan.</p>
                  </div>
                </div>
              </Card.Content>
            </Card>
          </div>
        </section>

        <section aria-labelledby="workflow-title" className="border-divider/70 border-y px-4 py-14 sm:px-6">
          <div className="mx-auto max-w-7xl">
            <div className="max-w-2xl">
              <h2 id="workflow-title" className="text-foreground text-2xl font-bold sm:text-3xl">
                From strategy to upgrades
              </h2>
            </div>
            <div className="mt-8 grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
              {loop.map(({ title, description, icon: Icon }) => (
                <Card key={title} className="h-full">
                  <Card.Content className="gap-4 p-5">
                    <div className="bg-warning/12 flex h-10 w-10 items-center justify-center rounded-xl">
                      <Icon size={18} className="text-warning" aria-hidden="true" />
                    </div>
                    <div>
                      <h3 className="text-foreground font-semibold">{title}</h3>
                      <p className="text-default-500 mt-2 text-sm leading-relaxed">{description}</p>
                    </div>
                  </Card.Content>
                </Card>
              ))}
            </div>
          </div>
        </section>

        <section aria-labelledby="game-support-title" className="px-4 py-14 sm:px-6">
          <div className="mx-auto grid max-w-7xl gap-6 lg:grid-cols-2">
            <div>
              <h2 id="game-support-title" className="text-foreground text-2xl font-bold sm:text-3xl">
                Clear support for each game
              </h2>
              <p className="text-default-500 mt-3 max-w-xl leading-relaxed">
                PoE2 is treated as its own capability set. The app does not imply stash or optimizer
                parity where upstream support is not available.
              </p>
            </div>
            <div className="grid gap-4 sm:grid-cols-2">
              <Card>
                <Card.Content className="gap-3 p-5">
                  <div className="flex items-center justify-between gap-2">
                    <h3 className="text-foreground font-semibold">Path of Exile 1</h3>
                    <Chip size="sm" color="success" variant="soft">Full workflow</Chip>
                  </div>
                  <p className="text-default-500 text-sm leading-relaxed">
                    Character sync, strategies, market data, stash snapshots, wealth history, atlas
                    planning, and upgrade analysis.
                  </p>
                </Card.Content>
              </Card>
              <Card>
                <Card.Content className="gap-3 p-5">
                  <div className="flex items-center justify-between gap-2">
                    <h3 className="text-foreground font-semibold">Path of Exile 2</h3>
                    <Chip size="sm" color="warning" variant="soft">Beta</Chip>
                  </div>
                  <p className="text-default-500 text-sm leading-relaxed">
                    Character sync, market overview, public discovery, strategy basics, and shared
                    planning without PoE1-only stash, atlas, or optimizer features.
                  </p>
                </Card.Content>
              </Card>
            </div>
          </div>
        </section>

        <section className="px-4 pb-16 sm:px-6">
          <Card className="border-divider/70 mx-auto max-w-7xl border">
            <Card.Content className="grid items-center gap-6 p-6 md:grid-cols-[1fr_auto] md:p-8">
              <div className="flex items-start gap-4">
                <div className="bg-success/12 flex h-11 w-11 shrink-0 items-center justify-center rounded-xl">
                  <ShieldCheck size={20} className="text-success" aria-hidden="true" />
                </div>
                <div>
                  <h2 className="text-foreground text-xl font-semibold">Inspect the product you trust with your workspace</h2>
                  <p className="text-default-500 mt-2 max-w-3xl text-sm leading-relaxed">
                    PoE Party is independent and open source under Apache-2.0. Source availability
                    improves transparency; it is not a claim of independent security audit.
                  </p>
                </div>
              </div>
              <a
                href={GITHUB_URL}
                target="_blank"
                rel="noopener noreferrer"
                className="button button--tertiary justify-center"
              >
                <Github size={17} aria-hidden="true" /> View on GitHub
              </a>
            </Card.Content>
          </Card>
        </section>

        <section className="border-divider/70 border-t px-4 py-14 text-center sm:px-6">
          <div className="mx-auto max-w-2xl">
            <Users size={28} className="text-warning mx-auto" aria-hidden="true" />
            <h2 className="text-foreground mt-4 text-2xl font-bold">Start with a useful result</h2>
            <p className="text-default-500 mt-3">
              Run a public analysis without connecting, or create a private workspace when you are
              ready to keep the loop together.
            </p>
            <div className="mt-6 flex flex-col justify-center gap-3 sm:flex-row">
              <Link to="/preview/analysis" activeOptions={{ exact: true }} className="button justify-center">
                <Search size={17} aria-hidden="true" /> Open public analysis
              </Link>
              <SignInLink
                placement="final"
                label="Create a workspace"
                className="button button--tertiary justify-center"
              />
            </div>
          </div>
        </section>
      </main>

      <Footer />
    </div>
  )
}
