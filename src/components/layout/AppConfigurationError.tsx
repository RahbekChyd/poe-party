import { Button } from '@heroui/react/button'
import { Card } from '@heroui/react/card'
import { AlertTriangle, Github, RefreshCw } from 'lucide-react'
import logo from '../../assets/poe-party-logo.png'
import { GITHUB_URL } from '../../lib/seo'

export function AppConfigurationError() {
  return (
    <main className="bg-background flex min-h-dvh items-center justify-center p-4">
      <Card className="w-full max-w-lg border border-danger/20">
        <Card.Content className="items-center gap-5 p-7 text-center sm:p-9">
          <img src={logo} alt="" className="h-14 w-14 rounded-2xl" />
          <div className="bg-danger/10 flex h-11 w-11 items-center justify-center rounded-xl">
            <AlertTriangle size={22} className="text-danger" aria-hidden="true" />
          </div>
          <div>
            <h1 className="text-foreground text-xl font-semibold">This app is not connected yet</h1>
            <p className="text-default-500 mt-2 text-sm leading-relaxed">
              PoE Party is missing its browser-safe Supabase configuration. No account or workspace
              request was sent. If you host this app yourself, finish the local environment setup
              and reload the page.
            </p>
          </div>
          <div className="flex w-full flex-col justify-center gap-2 sm:flex-row">
            <Button variant="tertiary" onPress={() => window.location.reload()}>
              <RefreshCw size={16} aria-hidden="true" /> Reload
            </Button>
            <a
              href={GITHUB_URL}
              target="_blank"
              rel="noopener noreferrer"
              className="button button--tertiary justify-center"
            >
              <Github size={16} aria-hidden="true" /> Setup documentation
            </a>
          </div>
          <p className="text-default-400 text-xs">
            Never paste service-role keys or OAuth client secrets into browser environment values.
          </p>
        </Card.Content>
      </Card>
    </main>
  )
}
