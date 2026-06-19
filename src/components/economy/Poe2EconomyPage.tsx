import { Card } from '@heroui/react/card'
import { Chip } from '@heroui/react/chip'
import { Coins, LineChart } from 'lucide-react'
import { useNinjaMarketOverview } from '../../hooks/useNinjaMarketOverview'
import { useNinjaPrices } from '../../hooks/useNinjaPrices'
import { useCurrencyStore } from '../../store/currency-store'
import { formatCurrencyAmount } from '../../lib/utils'
import { DashboardEmptyState, DashboardPage, DashboardPageHeader } from '../ui/dashboard'
interface Poe2EconomyPageProps {
  league: string | null
}

export function Poe2EconomyPage({ league }: Poe2EconomyPageProps) {
  const display = useCurrencyStore((state) => state.display)
  const { data: ninjaData } = useNinjaPrices(league, 'poe2')
  const { data: sections = [], isLoading, error } = useNinjaMarketOverview(league, 'poe2')
  const divinePrice = ninjaData?.divinePrice ?? 1
  const fmt = (chaos: number) => formatCurrencyAmount(chaos, display, divinePrice)

  return (
    <DashboardPage>
      <DashboardPageHeader
        title="Economy"
        eyebrow="PoE2 market mode"
        tone="currency"
        description="Path of Exile 2 currently uses a market overview instead of stash snapshots."
        actions={
          league ? (
            <Chip color="accent" variant="soft">
              {league}
            </Chip>
          ) : null
        }
      />

      <Card>
        <Card.Content className="gap-3 p-5">
          <div className="flex items-center gap-2">
            <div className="bg-primary/10 flex h-10 w-10 items-center justify-center rounded-lg">
              <LineChart size={18} className="text-primary" />
            </div>
            <div>
              <p className="text-foreground text-sm font-semibold">PoE2 market mode</p>
              <p className="text-default-400 text-sm">
                Character sync, solo or group planning, and market research are live. Stash wealth,
                scheduled snapshots, and group value history stay PoE1-only for now.
              </p>
            </div>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <Chip variant="soft">No stash snapshots</Chip>
            <Chip variant="soft">No wealth history</Chip>
            <Chip variant="soft">No tab pricing</Chip>
            <Chip color="success" variant="soft">
              Market overview enabled
            </Chip>
            <Chip color="accent" variant="soft">
              1 divine = {divinePrice.toFixed(1)}c
            </Chip>
          </div>
        </Card.Content>
      </Card>

      {!league ? (
        <DashboardEmptyState icon={Coins} tone="currency">
          Choose a league to load PoE2 market data.
        </DashboardEmptyState>
      ) : isLoading ? (
        <Card>
          <Card.Content className="text-default-400 p-8 text-center text-sm">
            Loading market data...
          </Card.Content>
        </Card>
      ) : error ? (
        <Card>
          <Card.Content className="text-danger p-8 text-center text-sm">
            {error instanceof Error ? error.message : 'Failed to load PoE2 market data.'}
          </Card.Content>
        </Card>
      ) : sections.length === 0 ? (
        <DashboardEmptyState icon={Coins} tone="currency">
          No PoE2 market sections were returned for {league}.
        </DashboardEmptyState>
      ) : (
        <div className="grid gap-4 lg:grid-cols-2">
          {sections.map((section) => (
            <Card key={section.type}>
              <Card.Header className="px-5 pt-5 pb-0">
                <div className="flex items-center gap-2">
                  <Coins size={16} className="text-warning" />
                  <h2 className="text-foreground text-sm font-semibold">{section.type}</h2>
                </div>
              </Card.Header>
              <Card.Content className="p-5">
                <div className="flex flex-col gap-2">
                  {section.entries.slice(0, 10).map((entry) => (
                    <div
                      key={`${section.type}:${entry.id}`}
                      className="bg-default-50 flex items-center gap-3 rounded-xl px-3 py-2"
                    >
                      {entry.icon ? (
                        <img
                          src={entry.icon}
                          alt={entry.name}
                          className="h-8 w-8 shrink-0 bg-transparent object-contain"
                        />
                      ) : (
                        <div className="bg-default-200 h-8 w-8 shrink-0 rounded-lg" />
                      )}
                      <div className="min-w-0 flex-1">
                        <p className="text-foreground truncate text-sm font-medium">{entry.name}</p>
                      </div>
                      <p className="text-foreground shrink-0 text-sm font-semibold">
                        {fmt(entry.primaryValue)}
                      </p>
                    </div>
                  ))}
                </div>
              </Card.Content>
            </Card>
          ))}
        </div>
      )}
    </DashboardPage>
  )
}
