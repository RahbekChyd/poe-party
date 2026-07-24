import { Button } from '@heroui/react/button'
import { Card } from '@heroui/react/card'
import { Chip } from '@heroui/react/chip'
import { Separator } from '@heroui/react/separator'
import { Spinner } from '@heroui/react/spinner'
import {
  AlertCircle,
  ArrowLeft,
  CheckCircle,
  Coins,
  Cookie,
  Eye,
  EyeOff,
  Github,
  Shield,
  Sparkles,
  Swords,
} from 'lucide-react'
import { useState } from 'react'
import { Link } from '@tanstack/react-router'
import logo from '../../assets/poe-party-logo.png'
import { fetchPoeCharacters } from '../../lib/poe-cookie-client'
import { supabase } from '../../lib/supabase'
import { storePostLoginTarget, takeStoredPostLoginTarget } from '../../lib/auth-redirect'
import { usePoeOAuthUrl } from '../../hooks/usePoeOAuthUrl'
import { usePoeSession } from '../../store/poe-session-store'
import { FieldInput } from '../ui/heroui-native'
import { GITHUB_URL } from '../../lib/seo'
import { trackPublicEvent } from '../../lib/analytics'

function isLocalUrl(value: string | undefined): boolean {
  if (!value) return false
  try {
    const hostname = new URL(value).hostname
    return hostname === 'localhost' || hostname === '127.0.0.1' || hostname === '::1'
  } catch {
    return false
  }
}

function isLocalCookieTransportEnabled(): boolean {
  if (!import.meta.env.DEV || typeof window === 'undefined') return false
  if (!isLocalUrl(window.location.origin)) return false
  if (!isLocalUrl(import.meta.env.VITE_SUPABASE_URL as string | undefined)) return false

  const configured = import.meta.env.VITE_ENABLE_COOKIE_AUTH as string | undefined
  if (configured == null) return true
  return ['1', 'true', 'yes', 'on'].includes(configured.trim().toLowerCase())
}

const allowLocalCookieTransport = isLocalCookieTransportEnabled()

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
  const { setSession } = usePoeSession()
  const getRequestedTarget = () => new URLSearchParams(window.location.search).get('next')

  const [oauthStatus, setOauthStatus] = useState<'idle' | 'loading' | 'error'>('idle')
  const [accountName, setAccountName] = useState('')
  const [sessId, setSessId] = useState('')
  const [showSessId, setShowSessId] = useState(false)
  const [sessIdStatus, setSessIdStatus] = useState<'idle' | 'loading' | 'ok' | 'error'>('idle')
  const [sessIdError, setSessIdError] = useState('')

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

  const handleSessIdConnect = async () => {
    if (!allowLocalCookieTransport || !accountName.trim() || !sessId.trim()) return
    storePostLoginTarget(getRequestedTarget())
    setSessIdStatus('loading')
    setSessIdError('')

    try {
      await fetchPoeCharacters(accountName.trim(), sessId.trim(), '')
      setSession(accountName.trim(), sessId.trim(), '')

      const slug = accountName.trim().toLowerCase().replace(/[^a-z0-9]/g, '_')
      const internalEmail = `${slug}@cookie.poe-party.app`
      const internalPassword = 'poe-party-cookie-auth-v1'
      const { error: signUpError } = await supabase.auth.signUp({
        email: internalEmail,
        password: internalPassword,
      })

      if (signUpError && !signUpError.message.toLowerCase().includes('already')) {
        throw signUpError
      }

      const result = await supabase.auth.signInWithPassword({
        email: internalEmail,
        password: internalPassword,
      })
      if (result.error) throw result.error

      const {
        data: { user },
      } = await supabase.auth.getUser()

      if (user) {
        const { data: existingProfile, error: profileReadError } = await supabase
          .from('users')
          .select('id')
          .eq('id', user.id)
          .maybeSingle()

        if (profileReadError) throw profileReadError

        if (existingProfile) {
          const { error } = await supabase
            .from('users')
            .update({ display_name: accountName.trim() })
            .eq('id', user.id)
          if (error) throw error
        } else {
          const { error } = await supabase.from('users').insert({
            id: user.id,
            poe_account_name: accountName.trim(),
            display_name: accountName.trim(),
          })
          if (error) throw error
        }
      }

      setSessIdStatus('ok')
      setTimeout(() => window.location.replace(takeStoredPostLoginTarget()), 600)
    } catch {
      setSessIdStatus('error')
      setSessIdError('The local connection failed. Check the account name and session value.')
    }
  }

  const resetCookieStatus = () => setSessIdStatus('idle')

  return (
    <div className="from-background via-background to-warning/5 min-h-screen bg-gradient-to-br px-4 py-5 md:py-10">
      <main className="mx-auto flex w-full max-w-4xl flex-col gap-6">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div className="flex items-center gap-3">
            <img src={logo} alt="" className="h-12 w-12 rounded-2xl shadow-sm md:h-14 md:w-14" />
            <div>
              <div className="flex items-center gap-2">
                <h1 className="text-foreground text-2xl font-bold tracking-tight md:text-4xl">
                  Connect to PoE Party
                </h1>
                <Chip size="sm" color="warning" variant="soft" className="hidden sm:inline-flex">
                  Early access
                </Chip>
              </div>
              <p className="text-default-500 mt-1 text-sm md:text-base">
                Plan, play, snapshot, and learn in one league workspace.
              </p>
            </div>
          </div>
          <Link
            to="/"
            activeOptions={{ exact: true }}
            className="button button--sm button--tertiary"
          >
            <ArrowLeft size={16} aria-hidden="true" /> Back to explore
          </Link>
        </div>

        <Card className="border-warning/20 bg-content1/90 w-full border">
          <Card.Content className="gap-4 p-5 sm:p-6">
            <div className="flex flex-col gap-1">
              <h2 className="text-foreground text-xl font-semibold">Connect your PoE account</h2>
              <p className="text-default-500 text-sm">
                Continue through Path of Exile OAuth. PoE Party never asks for your game password.
              </p>
            </div>

            <div className="bg-warning/8 rounded-2xl border border-warning/20 px-4 py-3">
              <div className="flex items-start gap-3">
                <Shield size={17} className="text-warning mt-0.5 shrink-0" aria-hidden="true" />
                <div>
                  <p className="text-foreground text-sm font-medium">Read-only game access</p>
                  <p className="text-default-500 mt-1 text-sm leading-relaxed">
                    OAuth is exchanged server-side and is limited to account, character, league,
                    and PoE1 stash data used by the app.
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
                <AlertCircle size={15} aria-hidden="true" />
                Could not start OAuth. Check this deployment&apos;s configuration and try again.
              </div>
            ) : null}

            <p className="text-default-400 text-center text-xs">
              You will return to the page or workspace you were trying to open.
            </p>

            {allowLocalCookieTransport ? (
              <>
                <Separator />
                <div className="flex flex-col gap-3">
                  <div className="flex flex-wrap items-center gap-2">
                    <Cookie size={14} className="text-default-400" aria-hidden="true" />
                    <p className="text-default-500 text-xs font-medium uppercase tracking-wide">
                      Local development transport
                    </p>
                    <Chip size="sm" variant="soft">Current tab only</Chip>
                  </div>
                  <p className="text-default-400 text-xs leading-relaxed">
                    Available only when both the app and Supabase run locally. The session value is
                    kept in this browser tab and is not a production sign-in method.
                  </p>
                  <FieldInput
                    aria-label="Path of Exile account name for local development"
                    size="sm"
                    placeholder="AccountName#1234"
                    value={accountName}
                    onValueChange={(value) => {
                      setAccountName(value)
                      resetCookieStatus()
                    }}
                  />
                  <FieldInput
                    aria-label="POESESSID for local development"
                    size="sm"
                    placeholder="POESESSID"
                    value={sessId}
                    onValueChange={(value) => {
                      setSessId(value)
                      resetCookieStatus()
                    }}
                    type={showSessId ? 'text' : 'password'}
                    endContent={
                      <button
                        type="button"
                        onClick={() => setShowSessId((previous) => !previous)}
                        className="text-default-400 hover:text-default-700 rounded-md p-1 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary"
                        aria-label={showSessId ? 'Hide POESESSID' : 'Show POESESSID'}
                      >
                        {showSessId ? <EyeOff size={14} /> : <Eye size={14} />}
                      </button>
                    }
                  />
                  {sessIdStatus === 'error' ? (
                    <div role="alert" className="text-danger flex items-center gap-2">
                      <AlertCircle size={13} aria-hidden="true" />
                      <p className="text-xs">{sessIdError}</p>
                    </div>
                  ) : null}
                  {sessIdStatus === 'ok' ? (
                    <div role="status" className="text-success flex items-center gap-2">
                      <CheckCircle size={13} aria-hidden="true" />
                      <p className="text-xs">Connected — redirecting…</p>
                    </div>
                  ) : null}
                  <Button
                    onPress={handleSessIdConnect}
                    isPending={sessIdStatus === 'loading'}
                    isDisabled={!accountName.trim() || !sessId.trim() || sessIdStatus === 'ok'}
                    className="w-full"
                    variant="tertiary"
                    size="sm"
                  >
                    {({ isPending }) => (
                      <>
                        {isPending ? <Spinner color="current" size="sm" /> : null}
                        Connect to local Supabase
                      </>
                    )}
                  </Button>
                </div>
              </>
            ) : null}
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
