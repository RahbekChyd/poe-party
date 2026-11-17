import { createFileRoute, Link, useNavigate } from '@tanstack/react-router'
import { Spinner } from '@heroui/react/spinner'
import { useEffect, useState } from 'react'
import { supabase } from '../../lib/supabase'
import { POE_OAUTH_CODE_VERIFIER_KEY, POE_OAUTH_STATE_KEY } from '../../lib/poe-oauth'
import { invokePublicFunction } from '../../lib/supabase-functions'
import { takeStoredPostLoginTarget } from '../../lib/auth-redirect'
import { CONTACT_MAILTO } from '../../lib/seo'
import {
  clearNewProfileNotice,
  hasPendingNewProfileNotice,
  rememberNewProfileNotice,
  takeNewProfileNotice,
} from '../../lib/new-profile-notice'
export const Route = createFileRoute('/auth/callback')({
  component: AuthCallback,
})

function AuthCallback() {
  const navigate = useNavigate()
  const [status, setStatus] = useState('Charting a course back to your hideout...')
  const [failure, setFailure] = useState<'sign-in' | 'identity-recovery' | null>(null)
  const [freshProfileTarget, setFreshProfileTarget] = useState<string | null>(null)

  useEffect(() => {
    let cancelled = false
    let finishingSignIn = false
    let exchangingCode = false
    let terminalError = false
    let signInTimer: ReturnType<typeof setTimeout> | undefined
    const clearOAuthState = () => {
      try {
        sessionStorage.removeItem(POE_OAUTH_STATE_KEY)
        sessionStorage.removeItem(POE_OAUTH_CODE_VERIFIER_KEY)
      } catch {
        // Unavailable browser storage must still leave an actionable error screen.
      }
    }
    const showError = (message: string, needsIdentityRecovery = false) => {
      if (cancelled) return
      terminalError = true
      clearOAuthState()
      clearNewProfileNotice()
      setStatus(message)
      setFailure(needsIdentityRecovery ? 'identity-recovery' : 'sign-in')
    }
    const finishSignIn = async () => {
      if (cancelled || finishingSignIn || exchangingCode || terminalError) return
      finishingSignIn = true
      if (hasPendingNewProfileNotice()) {
        const { data, error } = await supabase.auth.getUser()
        if (cancelled) return
        if (error || !data.user) {
          showError('Unable to verify your sign-in. Please start the login flow again.')
          return
        }
        if (takeNewProfileNotice(data.user.id)) {
          setStatus('Create or join a league workspace to get started. If you used PoE Party before, groups, history and Supporter access from an older profile are not transferred automatically.')
          setFreshProfileTarget(takeStoredPostLoginTarget())
          return
        }
      }
      window.location.replace(takeStoredPostLoginTarget())
    }

    const completeOAuth = async () => {
      const url = new URL(window.location.href)
      const error = url.searchParams.get('error')
      const errorDescription = url.searchParams.get('error_description')
      const code = url.searchParams.get('code')
      const state = url.searchParams.get('state')

      if (error) {
        showError(errorDescription ?? 'The waypoint fizzled out. Please try connecting again.')
        return
      }

      if (code) {
        exchangingCode = true
        clearNewProfileNotice()
        const expectedState = sessionStorage.getItem(POE_OAUTH_STATE_KEY)
        const codeVerifier = sessionStorage.getItem(POE_OAUTH_CODE_VERIFIER_KEY)

        if (!state || !expectedState || state !== expectedState) {
          showError('The trail went cold. Please start the login flow again.')
          return
        }

        if (!codeVerifier) {
          showError('Your portal scroll was lost. Please start the login flow again.')
          return
        }

        setStatus('Parleying with Oriath for passage...')

        let data: { magic_link?: string; is_new_profile?: boolean; user?: { id?: string } } | undefined
        try {
          data = await invokePublicFunction('poe-oauth-callback', {
            code,
            state,
            code_verifier: codeVerifier,
            redirect_uri: `${window.location.origin}/auth/callback`,
          }) as unknown as { magic_link?: string; is_new_profile?: boolean; user?: { id?: string } }
        } catch (invokeError) {
          const needsIdentityRecovery = invokeError instanceof Error &&
            invokeError.message === 'This Path of Exile account requires a manual identity migration'
          showError(needsIdentityRecovery
            ? 'Your account needs a one-time identity upgrade. Contact support to restore access. Your existing data is retained.'
            : invokeError instanceof Error
              ? invokeError.message
              : 'The envoy never returned. Please try again.', needsIdentityRecovery)
          return
        }

        if (cancelled) return

        clearOAuthState()

        const magicLink = typeof data?.magic_link === 'string' ? data.magic_link : null
        if (!magicLink) {
          showError('No portal opened on the return trip. Please try again.')
          return
        }

        if (data?.is_new_profile === true) rememberNewProfileNotice(data.user?.id)
        window.location.replace(magicLink)
        return
      }

      // After Supabase consumes the magic-link redirect, the session should be available.
      const {
        data: { session },
      } = await supabase.auth.getSession()

      if (!cancelled && session) {
        await finishSignIn()
        return
      }

      if (!cancelled) {
        showError('Your hideout remains out of reach. Please start the login flow again.')
      }
    }

    const { data: listener } = supabase.auth.onAuthStateChange((event, session) => {
      if (event === 'SIGNED_IN' && session) {
        // Avoid awaiting an Auth method inside the Auth state-change lock.
        signInTimer = setTimeout(() => {
          void finishSignIn().catch(() => showError('Unable to finish signing in. Please start the login flow again.'))
        }, 0)
      } else if (event === 'SIGNED_OUT') {
        navigate({ to: '/auth/login' })
      }
    })

    void completeOAuth().catch(() => {
      showError('Unable to finish signing in. Please start the login flow again.')
    })

    return () => {
      cancelled = true
      if (signInTimer !== undefined) clearTimeout(signInTimer)
      listener.subscription.unsubscribe()
    }
  }, [navigate])

  return (
    <main className="flex min-h-screen items-center justify-center px-6 py-12" aria-busy={!failure && !freshProfileTarget}>
      <div className="flex w-full max-w-md flex-col items-center gap-4 text-center">
        {freshProfileTarget ? (
          <h1 className="text-xl font-semibold">Your new profile is ready</h1>
        ) : failure ? (
          <h1 className="text-xl font-semibold">
            {failure === 'identity-recovery' ? 'Account recovery needed' : 'Sign-in needs attention'}
          </h1>
        ) : <Spinner size="lg" aria-label="Completing sign-in" />}
        <p role={failure ? 'alert' : 'status'} className="text-default-500 text-sm">{status}</p>
        {freshProfileTarget && (
          <div className="flex flex-wrap items-center justify-center gap-3">
            <a href={freshProfileTarget} className="button button--primary">Continue to PoE Party</a>
            <a href={CONTACT_MAILTO} className="button button--secondary text-foreground">Contact support</a>
          </div>
        )}
        {failure && (
          <div className="flex flex-wrap items-center justify-center gap-3">
            {failure === 'identity-recovery' && (
              <a href={CONTACT_MAILTO} className="button button--primary">Contact support</a>
            )}
            <Link to="/auth/login" className="button button--secondary text-foreground">Back to sign in</Link>
          </div>
        )}
      </div>
    </main>
  )
}
