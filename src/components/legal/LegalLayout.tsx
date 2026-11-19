import type { ReactNode } from 'react'
import { Link } from '@tanstack/react-router'
import { ArrowLeft } from 'lucide-react'
import { Footer } from '../layout/Footer'
interface LegalLayoutProps {
  title: string
  lastUpdated: string
  children: ReactNode
}

export function LegalLayout({ title, lastUpdated, children }: LegalLayoutProps) {
  return (
    <div className="bg-background flex min-h-dvh flex-col">
      <main className="mx-auto w-full max-w-3xl flex-1 px-4 py-8 wrap-anywhere sm:px-6 sm:py-12">
        <Link
          to="/"
          className="text-default-400 hover:text-foreground mb-8 inline-flex items-center gap-2 text-sm transition-colors"
        >
          <ArrowLeft size={14} aria-hidden="true" />
          Back to home
        </Link>
        <h1 className="text-foreground mb-2 text-3xl font-bold">{title}</h1>
        <p className="text-default-400 mb-8 text-xs">Last updated: {lastUpdated}</p>
        <div className="text-default-600 [&_h2]:text-foreground space-y-6 text-sm leading-relaxed [&_h2]:mt-8 [&_h2]:mb-3 [&_h2]:text-lg [&_h2]:font-semibold [&_ol]:list-decimal [&_ol]:space-y-1 [&_ol]:pl-5 [&_ul]:list-disc [&_ul]:space-y-1 [&_ul]:pl-5">
          {children}
        </div>
      </main>
      <Footer />
    </div>
  )
}
