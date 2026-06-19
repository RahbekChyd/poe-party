import { Card } from '@heroui/react/card'
import { Chip } from '@heroui/react/chip'
import { Separator } from '@heroui/react/separator'
import type { PublicServiceRow } from '../../hooks/useGuestServices'
import { DivinePrice } from './DivineOrbIcon'
import { PartyFillBar } from './PartyFillBar'
function BossCarrySection({ service }: { service: PublicServiceRow }) {
  if (service.details.service_type !== 'boss_carry') return null
  const { bosses } = service.details
  const hasNotes = bosses.some((boss) => boss.note)

  if (!hasNotes) return null

  return (
    <Card>
      <Card.Content className="gap-4 p-5">
        <p className="text-sm font-medium text-foreground">Boss notes</p>
        <div className="flex flex-col divide-y divide-divider">
          {bosses
            .filter((boss) => boss.note)
            .map((boss, idx) => (
              <div
                key={`${boss.name}-${idx}`}
                className="flex flex-wrap items-center justify-between gap-2 py-2.5 first:pt-0 last:pb-0"
              >
                <div className="min-w-0">
                  <p className="text-sm font-medium text-foreground">{boss.name}</p>
                  <p className="text-xs text-default-500">{boss.note}</p>
                </div>
                {boss.price_divine != null ? (
                  <Chip size="sm" variant="soft" color="warning">
                    <DivinePrice amount={boss.price_divine} iconSize={16} />
                  </Chip>
                ) : null}
              </div>
            ))}
        </div>
      </Card.Content>
    </Card>
  )
}

function MapCarrySection({ service }: { service: PublicServiceRow }) {
  if (service.details.service_type !== 'map_carry') return null
  const d = service.details

  if (d.extras.length === 0) return null

  return (
    <Card>
      <Card.Content className="gap-4 p-5">
        <p className="text-sm font-medium text-foreground">Extras</p>
        <div className="flex flex-col gap-2">
          {d.extras.map((extra, idx) => (
            <div
              key={`${extra.label}-${idx}`}
              className="flex items-center justify-between rounded-medium bg-default-50/50 px-3 py-2"
            >
              <span className="text-sm text-default-600">{extra.label}</span>
              <span className="text-sm font-medium text-foreground">
                {extra.price_divine != null ? (
                  <DivinePrice amount={extra.price_divine} iconSize={16} />
                ) : (
                  '—'
                )}
              </span>
            </div>
          ))}
        </div>
      </Card.Content>
    </Card>
  )
}

function FiveWaySection({ service }: { service: PublicServiceRow }) {
  if (service.details.service_type !== 'five_way_host') return null
  const d = service.details

  return (
    <Card>
      <Card.Content className="gap-4 p-5">
        <p className="text-sm font-medium text-foreground">Pricing & party fill</p>
        {service.price_divine != null ? (
          <Chip size="sm" variant="soft" color="accent" className="self-start">
            <span className="inline-flex items-center gap-1">
              <DivinePrice amount={service.price_divine} iconSize={16} />
              <span className="text-default-400">/ {d.runs_per_bundle} runs</span>
            </span>
          </Chip>
        ) : null}
        <PartyFillBar
          rows={[
            { label: 'Clients', slot: d.party.clients },
            { label: 'Resetter', slot: d.party.resetter },
            { label: 'Aurabot', slot: d.party.aurabot },
          ]}
        />

        {d.extra_guarantees.length > 0 ? (
          <>
            <Separator />
            <div>
              <p className="text-sm font-medium text-foreground">Guarantees</p>
              <ul className="mt-2 space-y-1">
                {d.extra_guarantees.map((guarantee, idx) => (
                  <li key={idx} className="flex items-start gap-2 text-sm text-default-600">
                    <span className="mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full bg-primary" />
                    <span>{guarantee}</span>
                  </li>
                ))}
              </ul>
            </div>
          </>
        ) : null}
      </Card.Content>
    </Card>
  )
}

function GoldRotaSection({ service }: { service: PublicServiceRow }) {
  if (service.details.service_type !== 'gold_rota') return null
  const d = service.details

  return (
    <Card>
      <Card.Content className="gap-4 p-5">
        <p className="text-sm font-medium text-foreground">Pricing & party fill</p>
        {service.price_divine != null ? (
          <Chip size="sm" variant="soft" color="success" className="self-start">
            <DivinePrice amount={service.price_divine} iconSize={16} />
          </Chip>
        ) : null}
        <PartyFillBar rows={[{ label: 'Party', slot: d.party }]} />

        {d.extra_info ? (
          <>
            <Separator />
            <div>
              <p className="text-sm font-medium text-foreground">Extra info</p>
              <p className="mt-1 text-sm leading-relaxed text-default-600">{d.extra_info}</p>
            </div>
          </>
        ) : null}

        {d.trade_only_with ? (
          <div className="rounded-medium bg-warning/10 px-3 py-2 text-sm text-warning-700 dark:text-warning">
            Trade only with: <span className="font-medium">{d.trade_only_with}</span>
          </div>
        ) : null}
      </Card.Content>
    </Card>
  )
}

export function ServiceDetailSection({ service }: { service: PublicServiceRow }) {
  switch (service.service_type) {
    case 'boss_carry':
      return <BossCarrySection service={service} />
    case 'map_carry':
      return <MapCarrySection service={service} />
    case 'five_way_host':
      return <FiveWaySection service={service} />
    case 'gold_rota':
      return <GoldRotaSection service={service} />
  }
}
