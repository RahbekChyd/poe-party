import { Button } from '@heroui/react/button'
import { Modal } from '@heroui/react/modal'
import { Link } from '@tanstack/react-router'
import { FlaskConical, MessageSquareWarning } from 'lucide-react'
import { useEarlyAccessNoticeStore } from '../../store/early-access-notice-store'
import { useMarkEarlyAccessNoticeSeen } from '../../hooks/useCurrentUser'
const DISCORD_URL = 'https://discord.gg/hSMV2r83mU'

export function EarlyAccessNoticeModal() {
  const isOpen = useEarlyAccessNoticeStore((s) => s.isOpen)
  const close = useEarlyAccessNoticeStore((s) => s.close)
  const { mutate: markSeen, isPending } = useMarkEarlyAccessNoticeSeen()

  const dismiss = () => {
    markSeen(undefined, {
      onSuccess: () => close(),
    })
  }

  return (
    <>
      <Modal.Backdrop
        isOpen={isOpen}
        onOpenChange={(open) => {
          if (!open) {
            dismiss()
          }
        }}
      >
        <Modal.Container>
          <Modal.Dialog>
            <Modal.Header className="flex items-center gap-2">
              <FlaskConical size={18} className="text-warning" />
              <Modal.Heading>Early Access</Modal.Heading>
            </Modal.Header>
            <Modal.Body className="gap-4">
              <p className="text-default-600 text-sm leading-relaxed">
                PoE Party is still very early in its lifecycle. Some current limits are intentional
                while we learn how groups use the product and what needs to scale next.
              </p>
              <p className="text-default-600 text-sm leading-relaxed">
                You may run into bugs, rough edges, or missing features. If something breaks or
                feels unclear, please report it in Discord so it can be prioritized correctly.
              </p>
              <div className="bg-warning/10 border-warning/20 rounded-large border p-4">
                <p className="text-foreground flex items-center gap-2 text-sm font-medium">
                  <MessageSquareWarning size={16} className="text-warning" />
                  Best way to help right now
                </p>
                <p className="text-default-500 mt-1 text-sm">
                  Share bugs, missing functionality, and confusing workflows in Discord. Early
                  reports are the fastest way to improve the product.
                </p>
              </div>
              <p className="text-default-400 text-xs">
                You can reopen this message later from the account menu or read more in the{' '}
                <Link to="/legal/faq" hash="early-access" className="text-primary hover:underline">
                  FAQ
                </Link>
                .
              </p>
            </Modal.Body>
            <Modal.Footer>
              <Button variant="tertiary" onPress={dismiss} isDisabled={isPending}>
                Close
              </Button>
              <Button
                variant="tertiary"
                onPress={() => globalThis.open(DISCORD_URL, '_blank', 'noreferrer')}
              >
                Join Discord
              </Button>
              <Button onPress={dismiss} isPending={isPending}>
                Continue
              </Button>
            </Modal.Footer>
          </Modal.Dialog>
        </Modal.Container>
      </Modal.Backdrop>
    </>
  )
}
