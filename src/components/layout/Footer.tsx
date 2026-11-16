import { Github } from 'lucide-react'
import { trackPublicEvent } from '../../lib/analytics'
import { CONTACT_MAILTO, DISCORD_URL, GITHUB_URL } from '../../lib/seo'
type ProductLink =
  | {
      type: 'route'
      to: '/preview' | '/preview/strategies' | '/preview/services' | '/preview/search'
      label: string
    }
  | {
      type: 'href'
      href: string
      label: string
    }

const productLinks: ProductLink[] = [
  { type: 'route', to: '/preview', label: 'Product Preview' },
  { type: 'href', href: '/tools/poe-wealth-tracker', label: 'Wealth Tracker' },
  { type: 'href', href: '/tools/poe-group-economy-tracker', label: 'Group Economy' },
  { type: 'route', to: '/preview/strategies', label: 'Public Strategies' },
  { type: 'route', to: '/preview/services', label: 'Services' },
  { type: 'route', to: '/preview/search', label: 'Directory' },
]

const legalLinks = [
  { to: '/legal/terms' as const, label: 'Terms of Service' },
  { to: '/legal/privacy' as const, label: 'Privacy Policy' },
  { to: '/legal/cookies' as const, label: 'Cookie Policy' },
  { to: '/legal/security' as const, label: 'Security & Trust' },
  { to: '/legal/faq' as const, label: 'FAQ', hash: 'early-access' },
]

function DiscordIcon({ size = 12, className }: { size?: number; className?: string }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 -28.5 256 256"
      fill="currentColor"
      aria-hidden="true"
      className={className}
    >
      <path d="M216.856 16.597A208.502 208.502 0 0 0 164.042 0c-2.275 4.113-4.933 9.645-6.766 14.046-19.692-2.961-39.203-2.961-58.533 0-1.832-4.4-4.55-9.933-6.846-14.046a207.809 207.809 0 0 0-52.855 16.638C5.618 67.147-3.443 116.4 1.087 164.956c22.169 16.555 43.653 26.612 64.775 33.193a161.094 161.094 0 0 0 13.882-22.584 136.426 136.426 0 0 1-21.846-10.632 108.636 108.636 0 0 0 5.356-4.237c42.122 19.702 87.89 19.702 129.51 0a131.66 131.66 0 0 0 5.355 4.237 136.07 136.07 0 0 1-21.886 10.653c4.006 8.02 8.638 15.67 13.862 22.584 21.142-6.58 42.646-16.637 64.815-33.213 5.316-56.288-9.08-105.09-38.056-148.36ZM85.474 135.095c-12.645 0-23.015-11.805-23.015-26.18s10.149-26.2 23.015-26.2c12.867 0 23.236 11.804 23.015 26.2.02 14.375-10.148 26.18-23.015 26.18Zm85.051 0c-12.645 0-23.014-11.805-23.014-26.18s10.148-26.2 23.014-26.2c12.867 0 23.236 11.804 23.015 26.2 0 14.375-10.148 26.18-23.015 26.18Z" />
    </svg>
  )
}

export function Footer() {
  return (
    <footer className="border-divider border-t px-6 py-4">
      <div className="text-default-400 flex flex-col gap-3 text-xs">
        <div className="flex flex-col gap-1">
          <p className="text-default-500">
            PoE Party is an independent Path of Exile group tool for economy tracking, stash
            snapshots, public strategies, service listings, gear planning, and upgrade analysis.
          </p>
          <p>This product isn&apos;t affiliated with or endorsed by Grinding Gear Games.</p>
        </div>
        <div className="flex flex-wrap items-center justify-between gap-4">
          <nav aria-label="Product pages" className="flex flex-wrap items-center gap-3">
            {productLinks.map((link, index) => (
              <span
                key={link.type === 'route' ? link.to : link.href}
                className="inline-flex items-center gap-3"
              >
                {index > 0 ? <span className="text-default-300">|</span> : null}
                {link.type === 'route' ? (
                  <a href={link.to} className="hover:text-foreground transition-colors">
                    {link.label}
                  </a>
                ) : (
                  <a
                    href={link.href}
                    className="hover:text-foreground transition-colors"
                    onClick={() =>
                      trackPublicEvent('public_footer_link_click', {
                        target: link.href,
                      })
                    }
                  >
                    {link.label}
                  </a>
                )}
              </span>
            ))}
          </nav>
          <span>&copy; {new Date().getFullYear()} PoE Party. Open source under Apache-2.0.</span>
        </div>
        <nav aria-label="Legal and support pages" className="flex flex-wrap items-center gap-3">
          {legalLinks.map((link, index) => (
            <span key={link.to} className="inline-flex items-center gap-3">
              {index > 0 ? <span className="text-default-300">|</span> : null}
              <a
                href={`${link.to}${'hash' in link ? `#${link.hash}` : ''}`}
                className="hover:text-foreground transition-colors"
              >
                {link.label}
              </a>
            </span>
          ))}
          <span className="text-default-300">|</span>
          <a href={CONTACT_MAILTO} className="text-default-400 hover:text-foreground text-xs">
            Contact
          </a>
          <span className="text-default-300">|</span>
          <a
            href={GITHUB_URL}
            className="text-default-400 hover:text-foreground inline-flex items-center gap-1 text-xs"
            target="_blank"
            rel="noreferrer"
          >
            <Github size={12} className="relative top-px" />
            GitHub
          </a>
          <span className="text-default-300">|</span>
          <a
            href={DISCORD_URL}
            className="text-default-400 hover:text-foreground inline-flex items-center gap-1 text-xs"
            target="_blank"
            rel="noreferrer"
          >
            <DiscordIcon size={12} className="relative top-px" />
            Discord
          </a>
        </nav>
      </div>
    </footer>
  )
}
