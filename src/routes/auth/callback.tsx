import { createFileRoute, useNavigate } from '@tanstack/react-router'
import { Spinner } from '@heroui/react/spinner'
import { useEffect, useState } from 'react'
import { supabase } from '../../lib/supabase'
import { POE_OAUTH_CODE_VERIFIER_KEY, POE_OAUTH_STATE_KEY } from '../../lib/poe-oauth'
import { invokePublicFunction } from '../../lib/supabase-functions'
import { takeStoredPostLoginTarget } from '../../lib/auth-redirect'
export const Route = createFileRoute('/auth/callback')({
  component: AuthCallback,
})

function AuthCallback() {
  const navigate = useNavigate()
  const [status, setStatus] = useState('Charting a course back to your hideout...')

  useEffect(() => {
    let cancelled = false
    const clearOAuthState = () => {
      sessionStorage.removeItem(POE_OAUTH_STATE_KEY)
      sessionStorage.removeItem(POE_OAUTH_CODE_VERIFIER_KEY)
    }

    const completeOAuth = async () => {
      const url = new URL(window.location.href)
      const error = url.searchParams.get('error')
      const errorDescription = url.searchParams.get('error_description')
      const code = url.searchParams.get('code')
      const state = url.searchParams.get('state')

      if (error) {
        clearOAuthState()
        setStatus(errorDescription ?? 'The waypoint fizzled out. Please try connecting again.')
        return
      }

      if (code) {
        const expectedState = sessionStorage.getItem(POE_OAUTH_STATE_KEY)
        const codeVerifier = sessionStorage.getItem(POE_OAUTH_CODE_VERIFIER_KEY)

        if (!state || !expectedState || state !== expectedState) {
          clearOAuthState()
          setStatus('The trail went cold. Please start the login flow again.')
          return
        }

        if (!codeVerifier) {
          clearOAuthState()
          setStatus('Your portal scroll was lost. Please start the login flow again.')
          return
        }

        setStatus('Parleying with Oriath for passage...')

        let data: { magic_link?: string } | undefined
        try {
          data = await invokePublicFunction('poe-oauth-callback', {
            code,
            state,
            code_verifier: codeVerifier,
            redirect_to: `${window.location.origin}/auth/callback`,
          }) as unknown as { magic_link?: string }
        } catch (invokeError) {
          if (cancelled) return
          clearOAuthState()
          setStatus(
            invokeError instanceof Error
              ? invokeError.message
              : 'The envoy never returned. Please try again.',
          )
          return
        }

        if (cancelled) return

        clearOAuthState()

        const magicLink = typeof data?.magic_link === 'string' ? data.magic_link : null
        if (!magicLink) {
          setStatus('No portal opened on the return trip. Please try again.')
          return
        }

        window.location.replace(magicLink)
        return
      }

      // After Supabase consumes the magic-link redirect, the session should be available.
      const {
        data: { session },
      } = await supabase.auth.getSession()

      if (!cancelled && session) {
        window.location.replace(takeStoredPostLoginTarget())
        return
      }

      if (!cancelled) {
        clearOAuthState()
        setStatus('Your hideout remains out of reach. Please start the login flow again.')
      }
    }

    const { data: listener } = supabase.auth.onAuthStateChange((event, session) => {
      if (event === 'SIGNED_IN' && session) {
        window.location.replace(takeStoredPostLoginTarget())
      } else if (event === 'SIGNED_OUT') {
        navigate({ to: '/auth/login' })
      }
    })

    void completeOAuth()

    return () => {
      cancelled = true
      listener.subscription.unsubscribe()
    }
  }, [navigate])

  return (
    <div className="flex h-screen items-center justify-center">
      <div className="flex flex-col items-center gap-4">
        <Spinner size="lg" />
        <p className="text-default-500 text-center text-sm">{status}</p>
      </div>
    </div>
  )
}
