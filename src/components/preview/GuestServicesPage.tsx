import { useMemo, useState } from 'react'
import { Card } from '@heroui/react/card'
import { ListBox } from '@heroui/react/list-box'
import { Handshake, Search } from 'lucide-react'
import { useDebouncedValue } from '../../hooks/useDebouncedValue'
import { useGuestPublicServices } from '../../hooks/useGuestServices'
import { usePoeGameAccess } from '../../hooks/usePoeGameAccess'
import { usePreviewLeague } from '../../hooks/usePreviewLeague'
import { PreviewPageIntro } from './PreviewShared'
import { DiscoveryScope, FilterDisclosure } from './DiscoveryFilters'
import {
  SERVICE_TYPE_FILTER_OPTIONS,
  REGION_OPTIONS,
  regionFromSelection,
  type ServiceType,
} from '../../lib/service-types'
import { ServiceCard } from '../services/ServiceCard'
import { getPoeGameShortLabel } from '../../lib/poe-game'
import { FieldInput, SelectField } from '../ui/heroui-native'
import { QueryFreshnessNotice, QueryStatePanel } from '../ui/QueryStatePanel'
import { ResponsiveFilter } from '../ui/ResponsiveFilter'
type TypeFilter = ServiceType | 'all'

export function GuestServicesPage() {
  const { canUsePoe2, availableGames } = usePoeGameAccess()
  const {
    leagues,
    selectedGame,
    setSelectedGame,
    selectedLeague,
    setSelectedLeague,
    isLoading: leagueLoading,
    isError: leagueError,
    isFetching: leagueFetching,
    refetch: refetchLeagues,
  } = usePreviewLeague(canUsePoe2)

  const [typeFilter, setTypeFilter] = useState<TypeFilter>('all')
  const [region, setRegion] = useState<string>('Any')
  const [search, setSearch] = useState('')
  const debouncedSearch = useDebouncedValue(search, 250)

  const {
    data: services = [],
    isLoading,
    isError,
    isFetching,
    refetch,
  } = useGuestPublicServices(
    selectedGame,
    selectedLeague,
    typeFilter === 'all' ? null : typeFilter,
  )

  const filtered = useMemo(() => {
    const q = debouncedSearch.trim().toLowerCase()
    return services.filter((service) => {
      if (region !== 'Any' && service.region && service.region !== region) return false
      if (!q) return true
      if (service.title.toLowerCase().includes(q)) return true
      if (service.poe_ign.toLowerCase().includes(q)) return true
      if (service.owner_name.toLowerCase().includes(q)) return true
      if (service.details.service_type === 'boss_carry') {
        return service.details.bosses.some((boss) => boss.name.toLowerCase().includes(q))
      }
      return false
    })
  }, [services, debouncedSearch, region])

  return (
    <DashboardPage>
      <PreviewPageIntro
        title="Services"
        description="Find carries, 5-way runs, and gold rotas. Copy a whisper to contact the provider in-game."
      />

      <Card className="@container p-3 sm:p-4">
        <Card.Content className="gap-3">
          <FieldInput
            label="Search services"
            placeholder="Title, character, or boss"
            startContent={<Search size={18} className="text-default-400" aria-hidden="true" />}
            value={search}
            onValueChange={setSearch}
            isClearable
            onClear={() => setSearch('')}
          />
          <ResponsiveFilter
            label="Service type"
            options={SERVICE_TYPE_FILTER_OPTIONS}
            value={typeFilter}
            onChange={setTypeFilter}
          />
          <div className="grid grid-cols-2 items-start gap-2 sm:grid-cols-[minmax(0,1fr)_minmax(10rem,0.45fr)] sm:gap-3">
            <DiscoveryScope
              game={selectedGame}
              league={selectedLeague}
              games={availableGames}
              leagues={leagues}
              onGameChange={setSelectedGame}
              onLeagueChange={setSelectedLeague}
            />
            <FilterDisclosure label="Filters" value={region === 'Any' ? 'All regions' : region}>
              <SelectField
                label="Region"
                selectedKey={region}
                onSelectionChange={(value) =>
                  setRegion(regionFromSelection(new Set([value ?? 'Any'])))
                }
              >
                {REGION_OPTIONS.map((r) => (
                  <ListBox.Item key={r} id={r} textValue={r}>
                    {r}
                  </ListBox.Item>
                ))}
              </SelectField>
            </FilterDisclosure>
          </div>
        </Card.Content>
      </Card>

      {!selectedLeague && leagueError ? (
        <QueryStatePanel
          kind="error"
          title="Leagues are unavailable"
          description="Try again to load the league list."
          onRetry={refetchLeagues}
        />
      ) : null}

      <QueryFreshnessNotice
        isRefreshing={(leagueFetching && leagues.length > 0) || (isFetching && services.length > 0)}
        refreshFailed={(leagueError && leagues.length > 0) || (isError && services.length > 0)}
        onRetry={() => {
          void refetchLeagues()
          void refetch()
        }}
      />

      {!selectedLeague ? (
        leagueLoading ? (
          <QueryStatePanel kind="loading" title="Loading leagues" description="Getting leagues for the selected game." />
        ) : !leagueError ? (
          <QueryStatePanel kind="empty" title="No leagues available" description="Choose another game to browse its services." />
        ) : null
      ) : isError && services.length === 0 ? (
        <QueryStatePanel
          kind="error"
          title="Services could not be loaded"
          description="Try again to reload listings with your current filters."
          onRetry={refetch}
        />
      ) : isLoading ? (
        <QueryStatePanel
          kind="loading"
          title="Loading services"
          description="Checking the selected league for current public listings."
        />
      ) : filtered.length === 0 ? (
        <QueryStatePanel
          kind="empty"
          icon={<Handshake size={32} className="text-default-300" />}
          title={`No services match in ${selectedLeague ?? 'this league'}`}
          description="Try another league, service type, region, or search term."
        />
      ) : (
        <div className="flex flex-col gap-3">
          <p className="text-default-500 text-sm">
            Showing {filtered.length} live service{filtered.length === 1 ? '' : 's'}
            {selectedLeague ? ` in ${getPoeGameShortLabel(selectedGame)} ${selectedLeague}` : ''}.
          </p>
          {filtered.map((service) => (
            <ServiceCard key={service.id} service={service} />
          ))}
        </div>
      )}
    </DashboardPage>
  )
}
import { DashboardPage } from '../ui/dashboard'
