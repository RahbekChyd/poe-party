import { Button } from '@heroui/react/button'
import { Card } from '@heroui/react/card'
import { Chip } from '@heroui/react/chip'
import { Spinner } from '@heroui/react/spinner'
import {
  AlertCircle,
  ArrowLeft,
  Coins,
  Github,
  Shield,
  Sparkles,
  Swords,
} from 'lucide-react'
import { useState } from 'react'
import { Link } from '@tanstack/react-router'
import logo from '../../assets/poe-party-logo.png'
import { storePostLoginTarget } from '../../lib/auth-redirect'
import { usePoeOAuthUrl } from '../../hooks/usePoeOAuthUrl'
import { GITHUB_URL } from '../../lib/seo'
import { trackPublicEvent } from '../../lib/analytics'

const teaserItems = [
  {
    icon: Coins,
    title: 'Measure the outcome',
    description: 'Track PoE1 stash snapshots and wealth movement across a run.',
  },
  {
    icon: Swords,
    title: 'Keep the plan together',
    description: 'Carry strategies, characters, and party context into the next decision.',
  },
  {
    icon: Sparkles,
    title: 'Choose the next upgrade',
    description: 'Turn build analysis into recommendations your workspace can revisit.',
  },
] as const

export function LoginPage() {
  const { getOAuthUrl } = usePoeOAuthUrl()
  const getRequestedTarget = () => new URLSearchParams(window.location.search).get('next')

  const [oauthStatus, setOauthStatus] = useState<'idle' | 'loading' | 'error'>('idle')

  const handleLogin = async () => {
    setOauthStatus('loading')
    storePostLoginTarget(getRequestedTarget())
    trackPublicEvent('oauth_started', { source: 'login' })

    try {
      const url = await getOAuthUrl()
      window.location.assign(url)
    } catch {
      setOauthStatus('error')
    }
  }

  return (
    <div className="from-background via-background to-warning/5 min-h-dvh bg-gradient-to-br px-4 py-5 md:py-10">
      <main className="mx-auto flex w-full max-w-4xl flex-col gap-6">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div className="flex items-center gap-3">
            <img src={logo} alt="" className="h-12 w-12 shrink-0 rounded-2xl shadow-sm md:h-14 md:w-14" />
            <div className="min-w-0">
              <div className="flex flex-wrap items-center gap-2">
                <h1 className="text-foreground text-2xl font-bold tracking-tight md:text-4xl">
                  Connect to PoE Party
                </h1>
                <Chip size="sm" color="warning" variant="soft" className="hidden sm:inline-flex">
                  Early access
                </Chip>
              </div>
              <p className="text-default-500 mt-1 text-sm md:text-base">
                Sign in to manage your characters and league workspaces.
              </p>
            </div>
          </div>
          <Link
            to="/"
            activeOptions={{ exact: true }}
            className="button button--sm button--tertiary"
          >
            <ArrowLeft size={16} aria-hidden="true" /> Back to home
          </Link>
        </div>

        <Card className="border-warning/20 bg-content1/90 w-full border">
          <Card.Content className="gap-4 p-5 sm:p-6">
            <div className="flex flex-col gap-1">
              <h2 className="text-foreground text-xl font-semibold">Connect your PoE account</h2>
              <p className="text-default-500 text-sm">
                Sign in on the Path of Exile website.
              </p>
            </div>

            <div className="bg-warning/8 rounded-2xl border border-warning/20 px-4 py-3">
              <div className="flex items-start gap-3">
                <Shield size={17} className="text-warning mt-0.5 shrink-0" aria-hidden="true" />
                <div>
                  <p className="text-foreground text-sm font-medium">Read-only game access</p>
                  <p className="text-default-500 mt-1 text-sm leading-relaxed">
                    PoE Party reads account, character, league, and PoE1 stash data. Your game
                    password stays with Path of Exile.
                  </p>
                </div>
              </div>
            </div>

            <Button
              onPress={handleLogin}
              isPending={oauthStatus === 'loading'}
              isDisabled={oauthStatus === 'loading'}
              className="min-h-12 w-full"
              size="lg"
            >
              {({ isPending }) => (
                <>
                  {isPending ? <Spinner color="current" size="sm" /> : null}
                  Connect with PoE Account
                </>
              )}
            </Button>

            {oauthStatus === 'error' ? (
              <div role="alert" className="text-danger flex items-center justify-center gap-2 text-sm">
                <AlertCircle size={15} className="shrink-0" aria-hidden="true" />
                Could not open Path of Exile sign-in. Try again.
              </div>
            ) : null}

            <p className="text-default-400 text-center text-xs">
              After signing in, you’ll return to the page you were opening.
            </p>

          </Card.Content>
        </Card>

        <section aria-labelledby="why-connect-title">
          <h2 id="why-connect-title" className="sr-only">What a connected workspace adds</h2>
          <div className="grid gap-3 md:grid-cols-3">
            {teaserItems.map(({ icon: Icon, title, description }) => (
              <Card key={title} className="border-divider/70 bg-content1/80 border">
                <Card.Content className="gap-3 p-5">
                  <div className="bg-warning/12 flex h-10 w-10 items-center justify-center rounded-xl">
                    <Icon size={18} className="text-warning" aria-hidden="true" />
                  </div>
                  <div>
                    <h3 className="text-foreground text-sm font-semibold">{title}</h3>
                    <p className="text-default-500 mt-1 text-sm leading-relaxed">{description}</p>
                  </div>
                </Card.Content>
              </Card>
            ))}
          </div>
        </section>

        <nav aria-label="Login help and trust" className="text-default-400 flex flex-wrap justify-center gap-x-4 gap-y-2 text-xs">
          <Link to="/legal/privacy" activeOptions={{ exact: true }} className="hover:text-foreground">Privacy</Link>
          <Link to="/legal/security" activeOptions={{ exact: true }} className="hover:text-foreground">Security &amp; Trust</Link>
          <Link to="/legal/terms" activeOptions={{ exact: true }} className="hover:text-foreground">Terms</Link>
          <a href={GITHUB_URL} target="_blank" rel="noopener noreferrer" className="hover:text-foreground inline-flex items-center gap-1">
            <Github size={12} aria-hidden="true" /> GitHub
          </a>
        </nav>

        <p className="text-default-400 text-center text-xs">
          PoE Party is independent and is not affiliated with or endorsed by Grinding Gear Games.
        </p>
      </main>
    </div>
  )
}
