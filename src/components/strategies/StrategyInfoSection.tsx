import { Chip } from '@heroui/react/chip'
import { ExternalLink } from 'lucide-react'
import { MAP_REQ_LABELS } from '../../lib/constants'
import type { Scarab } from '../../lib/strategy-scarabs'
import type { MapRequirements } from '../../hooks/useStrategies'
import type { ScarabEntry } from '../../hooks/useScarabNames'

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

function ScarabChipIcon({ icon, name }: { icon: ScarabEntry['icon'] | undefined; name: string }) {
  if (!icon) return null

  return (
    <img
      src={icon}
      alt=""
      width={20}
      height={20}
      loading="lazy"
      data-scarab-icon={name}
      className="inline-block h-5 w-5 shrink-0 object-contain"
    />
  )
}

export function StrategyInfoSection({
  atlasTreeUrl,
  scarabs,
  mapTradeLink,
  mapRequirements,
  scarabPriceMap,
  scarabIconMap,
}: {
  atlasTreeUrl: string | null
  scarabs: Scarab[]
  mapTradeLink: string | null
  mapRequirements: MapRequirements
  scarabPriceMap: Map<string, number>
  scarabIconMap: Map<string, ScarabEntry['icon']>
}) {
  const reqChips = Object.entries(mapRequirements ?? {})
    .filter(([, value]) => value != null)
    .map(([key, value]) => ({ label: MAP_REQ_LABELS[key] ?? key, value: value as number }))
  const hasAlternatives = scarabs.some((scarab) => scarab.alternatives.length > 0)

  const hasInfoRow = scarabs.length > 0 || reqChips.length > 0 || !!atlasTreeUrl || !!mapTradeLink
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

        {scarabs.length > 0 ? (
          <div
            className={`flex flex-col gap-2 ${
              atlasTreeUrl ? 'rounded-medium bg-default-100/40 p-1.5' : ''
            }`}
          >
            {scarabs.map((scarab, index) => {
              const rowCost = scarabPriceMap.has(scarab.name)
                ? scarabPriceMap.get(scarab.name)! * scarab.quantity
                : null
              const scarabIcon = scarabIconMap.get(scarab.name)

              return (
                <div
                  key={`${scarab.name}-${index}`}
                  className="flex flex-wrap items-center gap-1.5"
                >
                  <Chip size="sm" variant="soft" className="px-2 py-1">
                    <span className="inline-flex min-w-0 items-center gap-1.5">
                      <ScarabChipIcon icon={scarabIcon} name={scarab.name} />
                      <span>{scarab.name}</span>
                    </span>
                    {scarab.quantity > 1 ? (
                      <span className="text-default-400 ml-2">x{scarab.quantity}</span>
                    ) : null}
                    {rowCost != null ? (
                      <span className="ml-2">
                        <ChaosPrice amount={rowCost} />
                      </span>
                    ) : null}
                    {!scarab.required ? (
                      <span className="text-default-400 ml-2 text-xs">opt</span>
                    ) : null}
                  </Chip>
                  {scarab.alternatives.map((alternative, alternativeIndex) => {
                    const alternativeCost = scarabPriceMap.has(alternative.name)
                      ? scarabPriceMap.get(alternative.name)! * scarab.quantity
                      : null
                    const alternativeIcon = scarabIconMap.get(alternative.name)

                    return (
                      <Chip
                        key={`${scarab.name}-${index}-alt-${alternative.name}-${alternativeIndex}`}
                        size="sm"
                        variant="secondary"
                        className="border-dashed px-2 py-1"
                      >
                        <span className="text-default-400">Alternative:</span>
                        <span className="ml-1.5 inline-flex min-w-0 items-center gap-1.5">
                          <ScarabChipIcon icon={alternativeIcon} name={alternative.name} />
                          <span>{alternative.name}</span>
                        </span>
                        {scarab.quantity > 1 ? (
                          <span className="text-default-400 ml-2">x{scarab.quantity}</span>
                        ) : null}
                        {alternativeCost != null ? (
                          <span className="ml-2">
                            <ChaosPrice amount={alternativeCost} />
                          </span>
                        ) : null}
                      </Chip>
                    )
                  })}
                </div>
              )
            })}
            {hasAlternatives ? (
              <p className="text-default-400 text-xs">
                Alternative scarabs use the same quantity as the primary scarab.
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
