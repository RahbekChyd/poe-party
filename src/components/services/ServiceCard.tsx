import { useState, type ReactNode } from 'react'
import { Card } from '@heroui/react/card'
import { Chip } from '@heroui/react/chip'
import { Separator } from '@heroui/react/separator'
import { ChevronDown, Globe, MapPin, User } from 'lucide-react'
import type { PublicServiceRow } from '../../hooks/useGuestServices'
import { BOSS_MAP_MODE_LABELS, formatDivineRange, hasServiceDetailContent } from '../../lib/service-types'
import { getPoeGameShortLabel } from '../../lib/poe-game'
import { cn } from '../../lib/utils'
import { AvailabilityChip } from './AvailabilityChip'
import { DivineOrbIcon, DivinePrice } from './DivineOrbIcon'
import { PartyFillBar } from './PartyFillBar'
import { ServiceDetailSection } from './ServiceDetailSection'
import { ServiceTypeChip } from './ServiceTypeChip'
import { WhisperCopyButton } from './WhisperCopyButton'
const CARD_CHIP_CLASS_NAME = 'px-3'

function BossCarryBody({ service }: { service: PublicServiceRow }) {
  if (service.details.service_type !== 'boss_carry') return null
  const { bosses } = service.details

  if (bosses.length === 0) {
    return <p className="text-sm text-default-400">No bosses listed yet.</p>
  }

  return (
    <div className="flex flex-wrap gap-1.5">
      {bosses.map((boss, idx) => (
        <Chip key={`${boss.name}-${idx}`} size="sm" variant="soft" className={CARD_CHIP_CLASS_NAME}>
          <span className="inline-flex items-center gap-1">
            {boss.name}
            {boss.price_divine != null ? (
              <>
                <span className="text-default-400">·</span>
                {boss.price_divine}
                <DivineOrbIcon size={16} />
              </>
            ) : null}
          </span>
        </Chip>
      ))}
    </div>
  )
}

function MapCarryBody({ service }: { service: PublicServiceRow }) {
  if (service.details.service_type !== 'map_carry') return null
  const d = service.details
  const nonVoid = formatDivineRange(d.price_non_void_min_divine, d.price_non_void_max_divine)
  const voidRange = formatDivineRange(d.price_void_min_divine, d.price_void_max_divine)

  return (
    <div className="flex flex-col gap-2">
      <div className="flex flex-wrap gap-1.5">
        <Chip size="sm" variant="soft" color="warning" className={CARD_CHIP_CLASS_NAME}>
          {d.variant === 'valdo' ? 'Valdo' : 'General'}
        </Chip>
        {nonVoid ? (
          <Chip size="sm" variant="soft" className={CARD_CHIP_CLASS_NAME}>
            <span className="inline-flex items-center gap-1">
              Non-void: {nonVoid}
              <DivineOrbIcon size={16} />
            </span>
          </Chip>
        ) : null}
        {voidRange ? (
          <Chip size="sm" variant="soft" className={CARD_CHIP_CLASS_NAME}>
            <span className="inline-flex items-center gap-1">
              Void: {voidRange}
              <DivineOrbIcon size={16} />
            </span>
          </Chip>
        ) : null}
        {d.refund_policy ? (
          <Chip size="sm" variant="soft" color="success" className={CARD_CHIP_CLASS_NAME}>
            {d.refund_policy}
          </Chip>
        ) : null}
      </div>

      {service.mod_exclusions.length > 0 ? (
        <div className="flex flex-wrap items-center gap-1.5">
          <span className="text-xs font-medium uppercase tracking-wide text-default-400">
            Skips
          </span>
          {service.mod_exclusions.map((mod) => (
            <Chip key={mod} size="sm" variant="soft" color="danger" className={CARD_CHIP_CLASS_NAME}>
              {mod}
            </Chip>
          ))}
        </div>
      ) : null}
    </div>
  )
}

function FiveWayBody({ service }: { service: PublicServiceRow }) {
  if (service.details.service_type !== 'five_way_host') return null
  const d = service.details

  return (
    <div className="flex flex-col gap-3">
      <div className="flex flex-wrap gap-1.5">
        {service.price_divine != null ? (
          <Chip size="sm" variant="soft" color="accent" className={CARD_CHIP_CLASS_NAME}>
            <span className="inline-flex items-center gap-1">
              {service.price_divine}
              <DivineOrbIcon size={16} />
              <span className="text-default-400">/ {d.runs_per_bundle} runs</span>
            </span>
          </Chip>
        ) : null}
        {d.guaranteed_kills != null ? (
          <Chip size="sm" variant="soft" className={CARD_CHIP_CLASS_NAME}>
            {d.guaranteed_kills.toLocaleString()} kills
          </Chip>
        ) : null}
        {d.aurabot_resist_pct != null ? (
          <Chip size="sm" variant="soft" className={CARD_CHIP_CLASS_NAME}>
            Aurabot {d.aurabot_resist_pct}% res
          </Chip>
        ) : null}
      </div>
      <PartyFillBar
        compact
        rows={[
          { label: 'Clients', slot: d.party.clients },
          { label: 'Resetter', slot: d.party.resetter },
          { label: 'Aurabot', slot: d.party.aurabot },
        ]}
      />
    </div>
  )
}

function GoldRotaBody({ service }: { service: PublicServiceRow }) {
  if (service.details.service_type !== 'gold_rota') return null
  const d = service.details

  return (
    <div className="flex flex-col gap-3">
      <div className="flex flex-wrap gap-1.5">
        {service.price_divine != null ? (
          <Chip size="sm" variant="soft" color="success" className={CARD_CHIP_CLASS_NAME}>
            <DivinePrice amount={service.price_divine} iconSize={12} />
          </Chip>
        ) : null}
        {d.maps_per_run ? (
          <Chip size="sm" variant="soft" className={CARD_CHIP_CLASS_NAME}>
            {d.maps_per_run} maps/run
          </Chip>
        ) : null}
        {d.gold_guaranteed_millions != null ? (
          <Chip size="sm" variant="soft" className={CARD_CHIP_CLASS_NAME}>
            {d.gold_guaranteed_millions}M gold guaranteed
          </Chip>
        ) : null}
      </div>

      {service.mod_exclusions.length > 0 ? (
        <div className="flex flex-wrap items-center gap-1.5">
          <span className="text-xs font-medium uppercase tracking-wide text-default-400">
            Skips
          </span>
          {service.mod_exclusions.map((mod) => (
            <Chip key={mod} size="sm" variant="soft" color="danger" className={CARD_CHIP_CLASS_NAME}>
              {mod}
            </Chip>
          ))}
        </div>
      ) : null}

      <PartyFillBar compact rows={[{ label: 'Party', slot: d.party }]} />
    </div>
  )
}

function ServiceBody({ service }: { service: PublicServiceRow }) {
  switch (service.service_type) {
    case 'boss_carry':
      return <BossCarryBody service={service} />
    case 'map_carry':
      return <MapCarryBody service={service} />
    case 'five_way_host':
      return <FiveWayBody service={service} />
    case 'gold_rota':
      return <GoldRotaBody service={service} />
  }
}

export function ServiceCard({
  service,
  isOwned = false,
  rightExtra,
}: {
  service: PublicServiceRow
  isOwned?: boolean
  rightExtra?: ReactNode
}) {
  const [expanded, setExpanded] = useState(false)
  const game = service.group_game

  function toggle() {
    setExpanded((v) => !v)
  }

  return (
    <Card className="transition-colors hover:bg-default-50">
      <Card.Content className="gap-0 p-0">
        <div
          role="button"
          tabIndex={0}
          aria-expanded={expanded}
          className="flex cursor-pointer flex-col gap-4 p-5"
          onClick={(event) => {
            const target = event.target as HTMLElement
            if (target.closest('button, a, input, [role="menuitem"]')) return
            toggle()
          }}
          onKeyDown={(event) => {
            if (event.key === 'Enter' || event.key === ' ') {
              event.preventDefault()
              toggle()
            }
          }}
        >
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div className="flex min-w-0 flex-1 flex-col gap-2">
              <div className="flex flex-wrap items-center gap-2">
                <p className="text-base font-semibold text-foreground">{service.title}</p>
                <ServiceTypeChip type={service.service_type} className={CARD_CHIP_CLASS_NAME} />
                {isOwned ? (
                  <Chip
                    size="sm"
                    variant="soft"
                    color="accent"
                    className={CARD_CHIP_CLASS_NAME}
                  >
                    Yours
                  </Chip>
                ) : null}
                <AvailabilityChip status={service.availability} className={CARD_CHIP_CLASS_NAME} />
                {service.details.service_type === 'boss_carry' ? (
                  <Chip size="sm" variant="soft" color="default" className={CARD_CHIP_CLASS_NAME}>
                    {BOSS_MAP_MODE_LABELS[service.details.map_mode]}
                  </Chip>
                ) : null}
              </div>

              <div className="flex flex-wrap items-center gap-3 text-xs text-default-500">
                <span className="inline-flex items-center gap-1">
                  <User size={12} />
                  {service.owner_name}
                </span>
                {service.region ? (
                  <span className="inline-flex items-center gap-1">
                    <MapPin size={12} />
                    {service.region}
                  </span>
                ) : null}
                <span className="inline-flex items-center gap-1">
                  <Globe size={12} />
                  {getPoeGameShortLabel(game)} · {service.group_league}
                </span>
                <span className="text-default-400">· from {service.group_name}</span>
              </div>
            </div>

            <div className="flex shrink-0 items-start gap-2">
              <div className="flex flex-col items-end gap-2">
                <WhisperCopyButton
                  ign={service.poe_ign}
                  serviceType={service.service_type}
                  title={service.title}
                  whisperTemplate={service.whisper_template}
                />
                {rightExtra}
              </div>
              <ChevronDown
                size={18}
                className={cn(
                  'mt-1.5 shrink-0 text-default-400 transition-transform',
                  expanded && 'rotate-180',
                )}
                aria-hidden
              />
            </div>
          </div>

          <ServiceBody service={service} />
        </div>

        {expanded ? (
          <>
            <Separator />
            <div className="flex flex-col gap-4 p-5">
              {service.description ? (
                <p className="text-sm leading-relaxed text-default-600">{service.description}</p>
              ) : null}
              <ServiceDetailSection service={service} />
              {!service.description && !hasServiceDetailContent(service.details) ? (
                <p className="text-sm text-default-400">
                  No extra details — everything's on the card above.
                </p>
              ) : null}
            </div>
          </>
        ) : null}
      </Card.Content>
    </Card>
  )
}
