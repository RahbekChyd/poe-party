import { Button } from '@heroui/react/button'
import { Card } from '@heroui/react/card'
import { Chip } from '@heroui/react/chip'
import { Separator } from '@heroui/react/separator'
import { Spinner } from '@heroui/react/spinner'
import {
  AlertCircle,
  CheckCircle,
  Coins,
  Cookie,
  Eye,
  EyeOff,
  Shield,
  Sparkles,
  Swords,
} from 'lucide-react'
import { useState } from 'react'
import logo from '../../assets/poe-party-logo.png'
import { fetchPoeCharacters } from '../../lib/poe-cookie-client'
import { invokePublicFunction } from '../../lib/supabase-functions'
import { supabase } from '../../lib/supabase'
import { storePostLoginTarget, takeStoredPostLoginTarget } from '../../lib/auth-redirect'
import { usePoeOAuthUrl } from '../../hooks/usePoeOAuthUrl'
import { usePoeSession } from '../../store/poe-session-store'
import { FieldInput } from '../ui/heroui-native'
function isLocalSupabase(): boolean {
  const url = import.meta.env.VITE_SUPABASE_URL as string | undefined
  return !!url && /127\.0\.0\.1|localhost/.test(url)
}

function isCookieAuthEnabled(): boolean {
  const raw = import.meta.env.VITE_ENABLE_COOKIE_AUTH as string | undefined
  if (raw != null) {
    return ['1', 'true', 'yes', 'on'].includes(raw.trim().toLowerCase())
  }

  return import.meta.env.DEV
}

const allowCookieAuth = isCookieAuthEnabled()

const teaserItems = [
  {
    icon: Coins,
    title: 'Stash economy tracking',
    description: 'Track stash value, snapshots, and wealth movement over time.',
  },
  {
    icon: Swords,
    title: 'Strategy ROI tracking',
    description: 'Associate snapshots with strategies to compare returns and map efficiency.',
  },
  {
    icon: Sparkles,
    title: 'Organized run tracking',
    description: 'Turn scattered notes and memory into a persistent dashboard for the run.',
  },
]

export function LoginPage() {
  const { getOAuthUrl } = usePoeOAuthUrl()
  const { setSession } = usePoeSession()
  const getRequestedTarget = () => new URLSearchParams(window.location.search).get('next')

  const [accountName, setAccountName] = useState('')
  const [sessId, setSessId] = useState('')
  const [showSessId, setShowSessId] = useState(false)
  const [sessIdStatus, setSessIdStatus] = useState<'idle' | 'loading' | 'ok' | 'error'>('idle')
  const [sessIdError, setSessIdError] = useState('')

  const handleLogin = async () => {
    storePostLoginTarget(getRequestedTarget())
    const url = await getOAuthUrl()
    window.location.href = url
  }

  const handleSessIdConnect = async () => {
    if (!accountName.trim() || !sessId.trim()) return
    storePostLoginTarget(getRequestedTarget())
    setSessIdStatus('loading')
    setSessIdError('')
    try {
      await fetchPoeCharacters(accountName.trim(), sessId.trim(), '')
      setSession(accountName.trim(), sessId.trim(), '')

      const slug = accountName.trim().toLowerCase().replace(/[^a-z0-9]/g, '_')
      const internalEmail = `${slug}@cookie.poe-party.app`
      const internalPassword = 'poe-party-cookie-auth-v1'

      if (isLocalSupabase()) {
        const { error: signUpError } = await supabase.auth.signUp({
          email: internalEmail,
          password: internalPassword,
        })

        if (signUpError && !signUpError.message.toLowerCase().includes('already')) {
          throw signUpError
        }
      } else {
        await invokePublicFunction('cookie-auth', {
          accountName: accountName.trim(),
        })
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
          const { error: updateProfileError } = await supabase
            .from('users')
            .update({ display_name: accountName.trim() })
            .eq('id', user.id)
          if (updateProfileError) throw updateProfileError
        } else {
          const { error: insertProfileError } = await supabase.from('users').insert({
            id: user.id,
            poe_account_name: accountName.trim(),
            display_name: accountName.trim(),
          })
          if (insertProfileError) throw insertProfileError
        }
      }

      setSessIdStatus('ok')
      setTimeout(() => window.location.replace(takeStoredPostLoginTarget()), 600)
    } catch (err) {
      setSessIdStatus('error')
      setSessIdError(err instanceof Error ? err.message : 'Connection failed')
    }
  }

  const resetStatus = () => setSessIdStatus('idle')

  return (
    <div className="from-background via-background to-warning/5 flex min-h-screen justify-center bg-gradient-to-br px-4 py-6 md:py-10">
      <section className="flex w-full max-w-4xl flex-col gap-6 self-start">
        <div className="flex flex-col gap-4">
          <div className="flex items-center gap-3">
            <img src={logo} alt="PoE Party" className="h-14 w-14 rounded-2xl shadow-sm" />
            <div>
              <div className="flex items-center gap-2">
                <h1 className="text-foreground text-2xl font-bold tracking-tight md:text-4xl">
                  PoE Party
                </h1>
                <Chip size="sm" color="warning" variant="soft">
                  Early access
                </Chip>
              </div>
              <p className="text-default-500 mt-1 text-sm md:text-base">
                Tracking and planning for Path of Exile, solo or with a party.
              </p>
            </div>
          </div>

          <div className="max-w-2xl space-y-4">
            <p className="text-foreground text-lg font-semibold leading-tight md:text-2xl">
              Track stash value, strategies, and upgrades in one dashboard.
            </p>
            <p className="text-default-500 text-sm leading-relaxed md:text-base">
              Track stash economy, strategies, and upgrade planning from one dashboard
              instead of splitting everything across chats, spreadsheets, and memory.
            </p>
          </div>
        </div>

        <div className="grid gap-3 md:grid-cols-3">
          {teaserItems.map(({ icon: Icon, title, description }) => (
            <Card key={title} className="border border-divider/70 bg-content1/80">
              <Card.Content className="gap-3 p-5">
                <div className="bg-warning/15 flex h-11 w-11 items-center justify-center rounded-2xl">
                  <Icon size={18} className="text-warning" />
                </div>
                <div>
                  <p className="text-foreground text-sm font-semibold">{title}</p>
                  <p className="text-default-500 mt-1 text-sm leading-relaxed">{description}</p>
                </div>
              </Card.Content>
            </Card>
          ))}
        </div>

        <Card className="w-full border border-divider/70 bg-content1/80">
          <Card.Content className="gap-4 p-6">
            <div className="flex flex-col gap-1">
              <h2 className="text-foreground text-xl font-semibold">Connect your account</h2>
              <p className="text-default-400 text-sm">
                Sign in with your Path of Exile account to start syncing stash, characters,
                leagues, and item-filter data.
              </p>
            </div>

            <div className="bg-warning/10 rounded-2xl border border-warning/20 px-4 py-3">
              <div className="flex items-start gap-3">
                <Shield size={16} className="text-warning mt-0.5 shrink-0" />
                <div>
                  <p className="text-foreground text-sm font-medium">Built for trust</p>
                  <p className="text-default-500 mt-1 text-sm leading-relaxed">
                    We never store your PoE password. OAuth is handled server-side and access is
                    limited to read-only game data needed by the app.
                  </p>
                </div>
              </div>
            </div>

            <Button
              onPress={handleLogin}
              className="w-full"
              size="lg"
            >
              Connect with PoE Account
            </Button>

            <p className="text-default-400 text-center text-xs">
              First login takes you through PoE OAuth, then back into your dashboard.
            </p>

            {allowCookieAuth && (
              <>
                <Separator />

                <div className="flex flex-col gap-3">
                  <div className="flex items-center gap-2">
                    <Cookie size={14} className="text-default-400" />
                    <p className="text-default-500 text-xs font-medium uppercase tracking-wide">
                      Session cookie
                    </p>
                  </div>
                  <p className="text-default-400 text-xs">
                    Uses the old session-cookie flow for local or staging environments. Copy values
                    from <span className="text-default-500">Application -&gt; Cookies -&gt; pathofexile.com</span>.
                  </p>
                  <FieldInput
                    size="sm"
                    placeholder="Account name (e.g. Name#1234)"
                    value={accountName}
                    onValueChange={(value) => {
                      setAccountName(value)
                      resetStatus()
                    }}
                  />
                  <FieldInput
                    size="sm"
                    placeholder="POESESSID"
                    value={sessId}
                    onValueChange={(value) => {
                      setSessId(value)
                      resetStatus()
                    }}
                    type={showSessId ? 'text' : 'password'}
                    endContent={
                      <button
                        type="button"
                        onClick={() => setShowSessId((previous) => !previous)}
                        className="text-default-400 hover:text-default-600"
                      >
                        {showSessId ? <EyeOff size={14} /> : <Eye size={14} />}
                      </button>
                    }
                  />
                  {sessIdStatus === 'error' && (
                    <div className="flex items-center gap-2 text-danger">
                      <AlertCircle size={13} />
                      <p className="text-xs">{sessIdError}</p>
                    </div>
                  )}
                  {sessIdStatus === 'ok' && (
                    <div className="flex items-center gap-2 text-success">
                      <CheckCircle size={13} />
                      <p className="text-xs">Connected - redirecting...</p>
                    </div>
                  )}
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
                        Connect with session cookies
                      </>
                    )}
                  </Button>
                </div>
              </>
            )}
          </Card.Content>
        </Card>

        <p className="text-default-400 text-center text-xs">
          This product isn&apos;t affiliated with or endorsed by Grinding Gear Games in any way.
        </p>
      </section>
    </div>
  )
}
