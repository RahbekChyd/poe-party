import { useState, type ReactNode } from 'react'
import { Button } from '@heroui/react/button'
import { Card } from '@heroui/react/card'
import { Chip } from '@heroui/react/chip'
import { Modal } from '@heroui/react/modal'
import { Lock } from 'lucide-react'
import { useGuestGateStore } from '../../store/guest-gate-store'
import { getLoginHref } from '../../lib/auth-redirect'
export type PreviewMode = 'teaser' | 'public'

const MODE_STYLES: Record<PreviewMode, { label: string; color: 'warning' | 'accent' }> = {
  teaser: { label: 'Sample Workspace', color: 'warning' },
  public: { label: 'Public', color: 'accent' },
}

export function PreviewModeChip({ mode }: { mode: PreviewMode }) {
  const config = MODE_STYLES[mode]

  return (
    <Chip size="sm" color={config.color} variant="soft">
      {config.label}
    </Chip>
  )
}

export function PreviewPageIntro({
  mode,
  title,
  description,
  aside,
  asideClassName = 'w-full max-w-sm',
}: {
  mode: PreviewMode
  title: string
  description: string
  aside?: ReactNode
  asideClassName?: string
}) {
  const railColor = mode === 'teaser' ? 'var(--warning)' : 'var(--arcane)'

  return (
    <div className="border-divider/70 flex flex-col gap-4 border-b pb-5 md:flex-row md:items-end md:justify-between">
      <div className="max-w-3xl">
        <div className="mb-2 flex items-center gap-2">
          <span
            className="h-5 w-1 rounded-full"
            style={{ backgroundColor: railColor }}
            aria-hidden="true"
          />
          <PreviewModeChip mode={mode} />
        </div>
        <h1 className="text-foreground text-2xl leading-8 font-semibold">{title}</h1>
        <p className="text-default-500 mt-1 max-w-2xl text-sm leading-5">{description}</p>
      </div>
      {aside ? <div className={asideClassName}>{aside}</div> : null}
    </div>
  )
}

export function PreviewNotice({
  mode,
  title,
  description,
}: {
  mode: PreviewMode
  title: string
  description: string
}) {
  return (
    <Card className="border-divider/70 bg-content1/90 border">
      <Card.Content className="gap-2 p-3.5">
        <div className="flex flex-wrap items-center gap-2">
          <PreviewModeChip mode={mode} />
          <p className="text-foreground text-sm font-medium">{title}</p>
        </div>
        <p className="text-default-500 text-sm leading-relaxed">{description}</p>
      </Card.Content>
    </Card>
  )
}

export function UnlockCard({
  title,
  description,
  points,
  presentation = 'card',
  buttonLabel = 'Private workspace options',
  badgeLabel = 'Private workspace',
  actionLabel = 'Connect Account',
  signInPrompt = {
    title: 'Connect your private workspace',
    description:
      'Connect your Path of Exile account when you want your own strategies, characters, and stash data.',
  },
}: {
  title: string
  description: string
  points: string[]
  presentation?: 'card' | 'dialog-button'
  buttonLabel?: string
  badgeLabel?: string
  actionLabel?: string
  signInPrompt?: {
    title: string
    description: string
  }
}) {
  const [detailsOpen, setDetailsOpen] = useState(false)
  const openGuestGate = useGuestGateStore((state) => state.open)

  const openSignInPrompt = () => {
    setDetailsOpen(false)
    openGuestGate(signInPrompt)
  }

  const pointsList = (
    <div className="space-y-2">
      {points.map((point) => (
        <div
          key={point}
          className="rounded-large border-divider/70 bg-default-50/50 text-default-600 flex items-start gap-3 border px-4 py-3 text-sm"
        >
          <span className="bg-warning mt-1 h-1.5 w-1.5 shrink-0 rounded-full" />
          <span>{point}</span>
        </div>
      ))}
    </div>
  )

  if (presentation === 'dialog-button') {
    return (
      <>
        <div className="flex justify-start">
          <Button variant="tertiary" size="sm" onPress={() => setDetailsOpen(true)}>
            <span className="inline-flex items-center gap-2">
              <Lock size={14} aria-hidden="true" />
              {buttonLabel}
            </span>
          </Button>
        </div>

        <Modal.Backdrop isOpen={detailsOpen} onOpenChange={setDetailsOpen}>
          <Modal.Container>
            <Modal.Dialog>
              <Modal.Header>
                <div className="flex flex-col gap-2">
                  <Chip size="sm" color="warning" variant="soft" className="self-start">
                    {badgeLabel}
                  </Chip>
                  <Modal.Heading>{title}</Modal.Heading>
                </div>
              </Modal.Header>
              <Modal.Body className="gap-4">
                <p className="text-default-500 text-sm leading-relaxed">{description}</p>
                {pointsList}
              </Modal.Body>
              <Modal.Footer>
                <Button variant="tertiary" onPress={() => setDetailsOpen(false)}>
                  Close
                </Button>
                <Button onPress={openSignInPrompt}>{actionLabel}</Button>
              </Modal.Footer>
            </Modal.Dialog>
          </Modal.Container>
        </Modal.Backdrop>
      </>
    )
  }

  return (
    <Card className="border-divider/70 bg-content1 border">
      <Card.Content className="gap-4 p-5">
        <div className="flex flex-wrap items-center gap-2">
          <Chip size="sm" color="warning" variant="soft">
            {badgeLabel}
          </Chip>
          <p className="text-foreground text-sm font-medium">{title}</p>
        </div>
        <p className="text-default-500 text-sm leading-relaxed">{description}</p>
        {pointsList}
        <div>
          <Button variant="tertiary" size="sm" onPress={openSignInPrompt}>
            {actionLabel}
          </Button>
        </div>
      </Card.Content>
    </Card>
  )
}

export function LockedPanel({
  title,
  description,
  rows = 4,
}: {
  title: string
  description: string
  rows?: number
}) {
  const openGuestGate = useGuestGateStore((state) => state.open)

  return (
    <Card className="border-divider/70 overflow-hidden border">
      <Card.Content className="relative gap-4 p-5">
        <div className="pointer-events-none blur-[3px] select-none">
          <div className="flex flex-wrap gap-2">
            <div className="bg-default-200 h-8 w-28 rounded-full" />
            <div className="bg-default-200 h-8 w-36 rounded-full" />
            <div className="bg-default-200 h-8 w-24 rounded-full" />
          </div>
          <div className="mt-4 space-y-3">
            {Array.from({ length: rows }).map((_, index) => (
              <div key={index} className="rounded-large bg-default-100 h-12" />
            ))}
          </div>
        </div>

        <div className="bg-content1/72 absolute inset-0 flex items-center justify-center backdrop-blur-sm">
          <div className="mx-5 max-w-md text-center">
            <div className="bg-warning/15 mx-auto flex h-12 w-12 items-center justify-center rounded-full">
              <Lock size={18} className="text-warning" />
            </div>
            <p className="text-foreground mt-4 text-base font-semibold">{title}</p>
            <p className="text-default-500 mt-2 text-sm leading-relaxed">{description}</p>
            <Button
              className="mt-4"
              size="sm"
              onPress={() =>
                openGuestGate({
                  title: 'Connect to inspect the full details',
                  description,
                })
              }
            >
              Connect Account
            </Button>
          </div>
        </div>
      </Card.Content>
    </Card>
  )
}

export function GuestGateModal() {
  const { isOpen, title, description, close } = useGuestGateStore((state) => state)
  const nextTarget =
    typeof window === 'undefined'
      ? '/preview'
      : `${window.location.pathname}${window.location.search}${window.location.hash}`

  return (
    <>
      <Modal.Backdrop
        isOpen={isOpen}
        onOpenChange={(open) => {
          if (!open) {
            close()
          }
        }}
      >
        <Modal.Container>
          <Modal.Dialog>
            <Modal.Header>
              <Modal.Heading>{title}</Modal.Heading>
            </Modal.Header>
            <Modal.Body className="gap-3">
              <p className="text-default-500 text-sm leading-relaxed">{description}</p>
              <div className="rounded-large border-divider bg-default-50/60 text-default-500 border px-4 py-3 text-sm">
                After connecting, you can inspect full details, set up solo or group play, build
                your own strategies, and work with real stash and character data.
              </div>
              <p className="text-default-400 text-xs">
                After connecting, you&apos;ll return to this page.
              </p>
            </Modal.Body>
            <Modal.Footer>
              <Button variant="tertiary" onPress={close}>
                Keep Browsing
              </Button>
              <a href={getLoginHref(nextTarget)} className="button">
                Connect Account
              </a>
            </Modal.Footer>
          </Modal.Dialog>
        </Modal.Container>
      </Modal.Backdrop>
    </>
  )
}
