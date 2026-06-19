import { createFileRoute } from '@tanstack/react-router'
import { LoginPage } from '../../components/auth/LoginPage'
import { createSeoHead } from '../../lib/seo'
export const Route = createFileRoute('/auth/login')({
  head: () =>
    createSeoHead({
      title: 'Sign in',
      description:
        'Sign in to PoE Party to sync Path of Exile characters, stash snapshots, group economy, strategies, and gear planning.',
      path: '/auth/login',
      noIndex: true,
    }),
  component: LoginPage,
})
