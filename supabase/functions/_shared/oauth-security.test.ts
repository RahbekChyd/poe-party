import { assertEquals, assertThrows } from 'jsr:@std/assert@1.0.18'
import { POE_OAUTH_SCOPES as FRONTEND_POE_OAUTH_SCOPES } from '../../../src/lib/poe-oauth-scopes.ts'
import { POE_OAUTH_SCOPES } from './poe-oauth-scopes.ts'
import { buildOAuthIdentityMigrationError, parsePoeAccountSubject, resolveOauthReturnUrl } from './oauth-security.ts'

Deno.test('OAuth callback scopes match the frontend authorization scopes', () => {
  assertEquals(POE_OAUTH_SCOPES, FRONTEND_POE_OAUTH_SCOPES)
  assertEquals(POE_OAUTH_SCOPES, [
    'account:characters',
    'account:stashes',
    'account:league_accounts',
    'account:leagues',
  ])
})

Deno.test('PoE identity binding accepts only UUID account subjects', () => {
  assertEquals(
    parsePoeAccountSubject(' AAAAAAAA-BBBB-4CCC-8DDD-EEEEEEEEEEEE '),
    'aaaaaaaa-bbbb-4ccc-8ddd-eeeeeeeeeeee',
  )
  assertEquals(parsePoeAccountSubject('AccountName#1234'), null)
  assertEquals(parsePoeAccountSubject(null), null)
})

Deno.test('identity recovery exposes only the verified caller UUID and generic error', () => {
  assertEquals(buildOAuthIdentityMigrationError(' AAAAAAAA-BBBB-4CCC-8DDD-EEEEEEEEEEEE '), {
    error: 'This Path of Exile account requires a manual identity migration',
    code: 'oauth_identity_migration_required',
    verified_poe_account_sub: 'aaaaaaaa-bbbb-4ccc-8ddd-eeeeeeeeeeee',
  })
  assertThrows(() => buildOAuthIdentityMigrationError('AccountName#1234'))
})

Deno.test({
  name: 'OAuth return URLs require an exact configured callback URL',
  fn: () => {
    const previousRedirect = Deno.env.get('POE_REDIRECT_URI')
    const previousAllowed = Deno.env.get('POE_ALLOWED_RETURN_URLS')

    try {
      Deno.env.set('POE_REDIRECT_URI', 'https://poe-party.com/auth/callback')
      Deno.env.set(
        'POE_ALLOWED_RETURN_URLS',
        'https://preview-poe-party.xyz/auth/callback,http://localhost:5173/auth/callback',
      )

      assertEquals(
        resolveOauthReturnUrl('https://poe-party.com/auth/callback'),
        'https://poe-party.com/auth/callback',
      )
      assertEquals(
        resolveOauthReturnUrl('http://localhost:5173/auth/callback'),
        'http://localhost:5173/auth/callback',
      )
      assertEquals(
        resolveOauthReturnUrl('https://preview-poe-party.xyz/auth/callback'),
        'https://preview-poe-party.xyz/auth/callback',
      )

      assertThrows(() => resolveOauthReturnUrl('https://evil.example/auth/callback'))
      assertThrows(() => resolveOauthReturnUrl('https://poe-party.com.evil.example/auth/callback'))
      assertThrows(() => resolveOauthReturnUrl('https://untrusted-preview.vercel.app/auth/callback'))
      assertThrows(() => resolveOauthReturnUrl('https://preview-poe-party.xyz.evil.example/auth/callback'))
      assertThrows(() =>
        resolveOauthReturnUrl('https://poe-party.com/auth/callback?next=/dashboard'),
      )
      assertThrows(() => resolveOauthReturnUrl('http://poe-party.com/auth/callback'))
    } finally {
      if (previousRedirect === undefined) Deno.env.delete('POE_REDIRECT_URI')
      else Deno.env.set('POE_REDIRECT_URI', previousRedirect)

      if (previousAllowed === undefined) Deno.env.delete('POE_ALLOWED_RETURN_URLS')
      else Deno.env.set('POE_ALLOWED_RETURN_URLS', previousAllowed)
    }
  },
})
