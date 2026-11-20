import { Card } from '@heroui/react/card'
import { Chip } from '@heroui/react/chip'
import { Coins } from 'lucide-react'
import { useNinjaMarketOverview } from '../../hooks/useNinjaMarketOverview'
import { useNinjaPrices } from '../../hooks/useNinjaPrices'
import { useCurrencyStore } from '../../store/currency-store'
import { formatCurrencyAmount } from '../../lib/utils'
import { DashboardEmptyState, DashboardPage, DashboardPageHeader } from '../ui/dashboard'
import { QueryFreshnessNotice, QueryStatePanel } from '../ui/QueryStatePanel'
interface Poe2EconomyPageProps {
  league: string | null
}

export function Poe2EconomyPage({ league }: Poe2EconomyPageProps) {
  const display = useCurrencyStore((state) => state.display)
  const { data: ninjaData } = useNinjaPrices(league, 'poe2')
  const { data: sections = [], isLoading, isError, isFetching, refetch } = useNinjaMarketOverview(league, 'poe2')
  const divinePrice = ninjaData?.divinePrice
  const fmt = (chaos: number) => formatCurrencyAmount(chaos, display, divinePrice ?? Number.NaN)

  return (
    <DashboardPage>
      <DashboardPageHeader
        title="Economy"
        tone="currency"
        description="Follow PoE2 market prices. Stash snapshots are available in PoE1."
        actions={
          league ? (
            <>
              <Chip color="accent" variant="soft">{league}</Chip>
              {divinePrice && <Chip variant="soft">1 div = {divinePrice.toFixed(1)}c</Chip>}
            </>
          ) : null
        }
      />

      {sections.length > 0 ? (
        <QueryFreshnessNotice
          refreshFailed={isError}
          isRefreshing={isFetching}
          onRetry={refetch}
        />
      ) : null}
      {!league ? (
        <DashboardEmptyState icon={Coins} tone="currency">
          Choose a league to load PoE2 market data.
        </DashboardEmptyState>
      ) : isLoading ? (
        <QueryStatePanel kind="loading" title="Loading market prices" description={league} />
      ) : isError && sections.length === 0 ? (
        <QueryStatePanel kind="error" title="Couldn’t load market prices" description="Try again to refresh prices for this league." onRetry={refetch} />
      ) : sections.length === 0 ? (
        <DashboardEmptyState icon={Coins} tone="currency">
          No market prices available for {league}.
        </DashboardEmptyState>
      ) : (
        <div className="grid gap-4 lg:grid-cols-2">
          {sections.map((section) => (
            <Card key={section.type} className="p-0">
              <Card.Header className="px-4 pt-4">
                <div className="flex items-center gap-2">
                  <Coins size={16} className="text-warning" />
                  <h2 className="text-foreground text-sm font-semibold">{section.type}</h2>
                </div>
              </Card.Header>
              <Card.Content className="px-4 pb-4">
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
                        <p className="text-foreground text-sm font-medium wrap-anywhere">{entry.name}</p>
                      </div>
                      <p className="text-foreground shrink-0 text-sm font-semibold tabular-nums">
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
