import { useMemo, useState } from 'react'
import { Card } from '@heroui/react/card'
import { ListBox } from '@heroui/react/list-box'
import { ToggleButton } from '@heroui/react/toggle-button'
import { ToggleButtonGroup } from '@heroui/react/toggle-button-group'
import { Handshake, Search } from 'lucide-react'
import { useDebouncedValue } from '../../hooks/useDebouncedValue'
import { useGuestPublicServices } from '../../hooks/useGuestServices'
import { usePoeGameAccess } from '../../hooks/usePoeGameAccess'
import { usePreviewLeague } from '../../hooks/usePreviewLeague'
import { PreviewPageIntro } from './PreviewShared'
import {
  SERVICE_TYPE_OPTIONS,
  REGION_OPTIONS,
  regionFromSelection,
  type ServiceType,
} from '../../lib/service-types'
import { ServiceCard } from '../services/ServiceCard'
import { getPoeGameShortLabel } from '../../lib/poe-game'
import { FieldInput, SelectField } from '../ui/heroui-native'
import { QueryFreshnessNotice, QueryStatePanel } from '../ui/QueryStatePanel'
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
    <div className="flex flex-col gap-6">
      <PreviewPageIntro
        mode="public"
        title="Services"
        description="Find carries, 5-way runs, and gold rotas. Copy a whisper to contact the provider in-game."
      />

      <Card>
        <Card.Content className="gap-4 p-5">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <ToggleButtonGroup
              size="sm"
              aria-label="Service type"
              className="max-w-full flex-wrap"
              selectionMode="single"
              disallowEmptySelection
              selectedKeys={new Set([typeFilter])}
              onSelectionChange={(keys) => {
                const [value] = Array.from(keys)
                if (typeof value === 'string') setTypeFilter(value as TypeFilter)
              }}
            >
              <ToggleButton id="all">All</ToggleButton>
              {SERVICE_TYPE_OPTIONS.map((opt) => (
                <ToggleButton key={opt.id} id={opt.id}>
                  <ToggleButtonGroup.Separator />
                  {opt.shortLabel}
                </ToggleButton>
              ))}
            </ToggleButtonGroup>
          </div>

          <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-[minmax(0,2fr)_repeat(3,minmax(0,1fr))]">
            <FieldInput
              label="Search services"
              placeholder="Search title, IGN, or boss..."
              startContent={<Search size={18} className="text-default-400" />}
              value={search}
              onValueChange={setSearch}
              isClearable
              onClear={() => setSearch('')}
            />
            <SelectField
              label="Game"
              selectedKey={selectedGame}
              onSelectionChange={(value) => {
                if (value === 'poe1' || value === 'poe2') setSelectedGame(value)
              }}
            >
              {availableGames.map((g) => (
                <ListBox.Item key={g.id} id={g.id} textValue={g.label}>
                  {g.label}
                </ListBox.Item>
              ))}
            </SelectField>
            <SelectField
              label="League"
              selectedKey={selectedLeague}
              onSelectionChange={(value) =>
                setSelectedLeague(typeof value === 'string' ? value : null)
              }
              isDisabled={leagues.length === 0}
            >
              {leagues.map((league) => (
                <ListBox.Item key={league.id} id={league.id} textValue={league.label}>
                  {league.label}
                </ListBox.Item>
              ))}
            </SelectField>
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
    </div>
  )
}
