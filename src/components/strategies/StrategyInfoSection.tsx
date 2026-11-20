import { Chip } from '@heroui/react/chip'
import { ExternalLink } from 'lucide-react'
import { MAP_REQ_LABELS } from '../../lib/constants'
import type { Thread } from '../../lib/strategy-threads'
import type { MapRequirements } from '../../hooks/useStrategies'
import type { ThreadEntry } from '../../hooks/useThreadData'

const CHAOS_ORB_ICON_URL =
  'https://web.poecdn.com/image/Art/2DItems/Currency/CurrencyRerollRare.png'

function formatChaosValue(chaos: number): string {
  if (chaos > 0 && chaos < 1) return chaos.toFixed(1)
  return Math.round(chaos).toLocaleString()
}

function ChaosPrice({ amount }: { amount: number }) {
  return (
    <span className="text-foreground inline-flex items-center gap-1 text-xs font-bold">
      {formatChaosValue(amount)}
      <img
        src={CHAOS_ORB_ICON_URL}
        alt="Chaos Orb"
        width={16}
        height={16}
        loading="lazy"
        className="inline-block shrink-0 object-contain"
      />
    </span>
  )
}

function ThreadChipIcon({ icon, name }: { icon: ThreadEntry['icon'] | undefined; name: string }) {
  if (!icon) return null

  return (
    <img
      src={icon}
      alt=""
      width={20}
      height={20}
      loading="lazy"
      data-thread-icon={name}
      className="inline-block h-5 w-5 shrink-0 object-contain"
    />
  )
}

export function StrategyInfoSection({
  atlasTreeUrl,
  threads,
  legacyScarabs = [],
  mapTradeLink,
  mapRequirements,
  threadPriceMap,
  threadIconMap,
}: {
  atlasTreeUrl: string | null
  threads: Thread[]
  legacyScarabs?: Thread[]
  mapTradeLink: string | null
  mapRequirements: MapRequirements
  threadPriceMap: Map<string, number | null>
  threadIconMap: Map<string, ThreadEntry['icon']>
}) {
  const reqChips = Object.entries(mapRequirements ?? {})
    .filter(([, value]) => value != null)
    .map(([key, value]) => ({ label: MAP_REQ_LABELS[key] ?? key, value: value as number }))
  const hasAlternatives = threads.some((thread) => thread.alternatives.length > 0)

  const hasInfoRow = legacyScarabs.length > 0 || threads.length > 0 || reqChips.length > 0 || !!atlasTreeUrl || !!mapTradeLink
  if (!hasInfoRow) return null

  return (
    <>
      <div className="border-divider border-t" />
      <div className="bg-default-50/50 flex flex-col gap-2 px-5 py-3">
        {atlasTreeUrl ? (
          <div className="flex gap-2">
            <a
              href={atlasTreeUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="button button--sm button--tertiary"
            >
              Atlas Tree
              <ExternalLink size={14} aria-hidden />
            </a>
          </div>
        ) : null}

        {legacyScarabs.length > 0 && (
          <details className="text-default-400 wrap-anywhere text-xs">
            <summary className="cursor-pointer">Legacy Scarab reference (removed in 3.30)</summary>
            <ul className="mt-1">{legacyScarabs.map((scarab, index) => (
              <li key={index}>{scarab.quantity} × {scarab.name}</li>
            ))}</ul>
          </details>
        )}
        {threads.length > 0 ? (
          <div
            className={`flex flex-col gap-2 ${
              atlasTreeUrl ? 'rounded-medium bg-default-100/40 p-1.5' : ''
            }`}
          >
            {threads.map((thread, index) => {
              const rowCost = threadPriceMap.get(thread.name) != null
                ? (threadPriceMap.get(thread.name) ?? 0) * thread.quantity
                : null
              const threadIcon = threadIconMap.get(thread.name)

              return (
                <div
                  key={`${thread.name}-${index}`}
                  className="flex flex-wrap items-center gap-1.5"
                >
                  <Chip size="sm" variant="soft" className="h-auto max-w-full flex-wrap gap-1.5 px-2 py-1 whitespace-normal">
                    <span className="inline-flex min-w-0 items-center gap-1.5">
                      <ThreadChipIcon icon={threadIcon} name={thread.name} />
                      <span className="wrap-anywhere">{thread.name}</span>
                    </span>
                    {thread.quantity > 1 ? (
                      <span className="text-default-400">×{thread.quantity}</span>
                    ) : null}
                    {rowCost != null ? <ChaosPrice amount={rowCost} /> : null}
                    {!thread.required ? (
                      <span className="text-default-400 text-xs">Optional</span>
                    ) : null}
                  </Chip>
                  {thread.alternatives.map((alternative, alternativeIndex) => {
                    const alternativeCost = threadPriceMap.get(alternative.name) != null
                      ? (threadPriceMap.get(alternative.name) ?? 0) * thread.quantity
                      : null
                    const alternativeIcon = threadIconMap.get(alternative.name)

                    return (
                      <Chip
                        key={`${thread.name}-${index}-alt-${alternative.name}-${alternativeIndex}`}
                        size="sm"
                        variant="secondary"
                        className="h-auto max-w-full flex-wrap gap-1.5 border-dashed px-2 py-1 whitespace-normal"
                      >
                        <span className="text-default-400">Alternative</span>
                        <span className="inline-flex min-w-0 items-center gap-1.5">
                          <ThreadChipIcon icon={alternativeIcon} name={alternative.name} />
                          <span className="wrap-anywhere">{alternative.name}</span>
                        </span>
                        {thread.quantity > 1 ? (
                          <span className="text-default-400">×{thread.quantity}</span>
                        ) : null}
                        {alternativeCost != null ? <ChaosPrice amount={alternativeCost} /> : null}
                      </Chip>
                    )
                  })}
                </div>
              )
            })}
            {hasAlternatives ? (
              <p className="text-default-400 text-xs">
                Alternative threads use the same quantity as the primary thread.
              </p>
            ) : null}
          </div>
        ) : null}

        {reqChips.length > 0 || mapTradeLink ? (
          <div className="flex flex-wrap items-center gap-1.5">
            {reqChips.length > 0 ? (
              <>
                <span className="text-default-400 w-14 shrink-0 text-xs font-medium">Requires</span>
                {reqChips.map(({ label, value }) => (
                  <Chip key={label} size="sm" variant="soft">
                    {label}
                    <span className="text-default-500 ml-1">{value}%</span>
                  </Chip>
                ))}
              </>
            ) : null}
            {mapTradeLink ? (
              <a
                href={mapTradeLink}
                target="_blank"
                rel="noopener noreferrer"
                className="button button--sm button--tertiary"
              >
                Buy Map
              </a>
            ) : null}
          </div>
        ) : null}
      </div>
    </>
  )
}
