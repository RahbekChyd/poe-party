import { Button } from '@heroui/react/button'
import { Link } from '@tanstack/react-router'
import { FlaskConical, MessageSquare, X } from 'lucide-react'
import { useEarlyAccessNoticeStore } from '../../store/early-access-notice-store'
import { useMarkEarlyAccessNoticeSeen } from '../../hooks/useCurrentUser'
import { DISCORD_URL } from '../../lib/seo'

/**
 * Kept under the historical export name so account-menu callers remain compatible.
 * The notice is intentionally an inline, dismissible banner rather than a blocking dialog.
 */
export function EarlyAccessNoticeModal() {
  const isOpen = useEarlyAccessNoticeStore((state) => state.isOpen)
  const close = useEarlyAccessNoticeStore((state) => state.close)
  const { mutate: markSeen } = useMarkEarlyAccessNoticeSeen()

  if (!isOpen) return null

  const dismiss = () => {
    close()
    markSeen()
  }

  return (
    <section
      aria-labelledby="early-access-notice-title"
      className="border-warning/25 bg-warning/8 mx-4 mt-4 rounded-2xl border px-4 py-3 md:mx-6"
    >
      <div className="flex items-start gap-3">
        <div className="bg-warning/15 mt-0.5 flex h-9 w-9 shrink-0 items-center justify-center rounded-xl">
          <FlaskConical size={17} className="text-warning" aria-hidden="true" />
        </div>
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
            <h2 id="early-access-notice-title" className="text-foreground text-sm font-semibold">
              PoE Party is in early access
            </h2>
            <span className="text-default-400 text-xs">Your workspace remains fully usable.</span>
          </div>
          <p className="text-default-500 mt-1 max-w-3xl text-sm leading-relaxed">
            Some workflows are still being refined. If something breaks or feels unclear, a short
            report helps us prioritize the right fix.
          </p>
          <div className="mt-2 flex flex-wrap items-center gap-3 text-xs">
            <a
              href={DISCORD_URL}
              target="_blank"
              rel="noopener noreferrer"
              className="text-primary inline-flex min-h-8 items-center gap-1.5 font-medium hover:underline"
            >
              <MessageSquare size={14} aria-hidden="true" />
              Share feedback
            </a>
            <Link
              to="/legal/faq"
              hash="early-access"
              activeOptions={{ exact: true }}
              className="text-default-500 inline-flex min-h-8 items-center hover:text-foreground"
            >
              Read the FAQ
            </Link>
          </div>
        </div>
        <Button
          isIconOnly
          size="sm"
          variant="tertiary"
          onPress={dismiss}
          aria-label="Dismiss early access notice"
        >
          <X size={16} aria-hidden="true" />
        </Button>
      </div>
    </section>
  )
}
