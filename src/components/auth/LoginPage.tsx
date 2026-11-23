import { Button } from '@heroui/react/button'
import { Spinner } from '@heroui/react/spinner'
import { AlertCircle, ArrowLeft, Github, Shield } from 'lucide-react'
import { useState } from 'react'
import { Link } from '@tanstack/react-router'
import logo from '../../assets/poe-party-logo.png'
import { storePostLoginTarget } from '../../lib/auth-redirect'
import { usePoeOAuthUrl } from '../../hooks/usePoeOAuthUrl'
import { GITHUB_URL } from '../../lib/seo'
import { trackPublicEvent } from '../../lib/analytics'
import { featuredLeagueTheme, useLeagueTheme } from '../../lib/league-theme'
import { EntryScene } from '../shared/EntryScene'

const trustLinkClass = 'hover:text-brand-readable inline-flex min-h-11 min-w-11 items-center justify-center gap-1'

export function LoginPage() {
  useLeagueTheme(featuredLeagueTheme)
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
    <div className="entry-login bg-background min-h-dvh">
      <header className="entry-login-header entry-ink">
        <div className="entry-wrap flex min-h-16 flex-wrap items-center justify-between gap-x-4">
          <span className="entry-wordmark flex items-center gap-2.5">
            <img src={logo} alt="" width={34} height={34} className="rounded-md" />
            PoE Party
          </span>
          <Link
            to="/"
            activeOptions={{ exact: true }}
            className="entry-nav-link inline-flex min-h-11 items-center gap-2 text-sm font-medium"
          >
            <ArrowLeft size={16} aria-hidden="true" /> Back to home
          </Link>
        </div>
      </header>

      <main className="entry-login-main">
        <div className="entry-login-art" aria-hidden="true">
          <EntryScene crop="close" />
        </div>

        <div className="entry-login-column">
          <section className="entry-login-panel" aria-labelledby="login-title">
            <div>
              <h1 id="login-title" className="entry-display entry-login-title">Connect to PoE Party</h1>
              <p className="text-default-500 mt-3 text-sm leading-relaxed sm:text-base">
                Sign in on the Path of Exile website to manage your characters and league workspaces.
              </p>
            </div>

            <div className="entry-login-access flex items-start gap-3">
              <Shield size={19} className="text-brand-readable mt-0.5 shrink-0" aria-hidden="true" />
              <div>
                <p className="text-foreground text-sm font-medium">Read-only game access</p>
                <p className="text-default-500 mt-1 text-sm leading-relaxed">
                  PoE Party reads account, character, league, and PoE1 stash data. Your game
                  password stays with Path of Exile.
                </p>
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
              <p role="alert" className="text-danger flex items-center gap-2 text-sm">
                <AlertCircle size={17} className="shrink-0" aria-hidden="true" />
                Could not open Path of Exile sign-in. Try again.
              </p>
            ) : null}

            <p className="text-default-500 text-center text-xs">
              After signing in, you’ll return to the page you were opening.
            </p>
          </section>

          <nav aria-label="Login help and trust" className="text-default-400 flex flex-wrap justify-center gap-x-3 text-xs">
            <Link to="/legal/privacy" activeOptions={{ exact: true }} className={trustLinkClass}>Privacy</Link>
            <Link to="/legal/security" activeOptions={{ exact: true }} className={trustLinkClass}>Security &amp; Trust</Link>
            <Link to="/legal/terms" activeOptions={{ exact: true }} className={trustLinkClass}>Terms</Link>
            <a href={GITHUB_URL} target="_blank" rel="noopener noreferrer" className={trustLinkClass}>
              <Github size={12} aria-hidden="true" /> GitHub
            </a>
          </nav>

          <p className="text-default-400 text-center text-xs leading-relaxed">
            PoE Party is independent and is not affiliated with or endorsed by Grinding Gear Games.
          </p>
        </div>
      </main>
    </div>
  )
}
