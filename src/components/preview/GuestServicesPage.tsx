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
import { PreviewNotice, PreviewPageIntro } from './PreviewShared'
import {
  SERVICE_TYPE_OPTIONS,
  REGION_OPTIONS,
  regionFromSelection,
  type ServiceType,
} from '../../lib/service-types'
import { ServiceCard } from '../services/ServiceCard'
import { getPoeGameShortLabel } from '../../lib/poe-game'
import { FieldInput, SelectField } from '../ui/heroui-native'
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
  } = usePreviewLeague(canUsePoe2)

  const [typeFilter, setTypeFilter] = useState<TypeFilter>('all')
  const [region, setRegion] = useState<string>('Any')
  const [search, setSearch] = useState('')
  const debouncedSearch = useDebouncedValue(search, 250)

  const { data: services = [], isLoading } = useGuestPublicServices(
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
        description="Live boss carries, map carries, 5-way hosts, and gold rotas from real providers. Copy a whisper in one click and hit them up in-game."
        aside={
          <PreviewNotice
            mode="public"
            title="Live public listings"
            description="These are real providers advertising real services in the selected league. Posting and management stay inside private workspaces."
          />
        }
      />

      <Card>
        <Card.Content className="gap-4 p-5">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <p className="text-foreground text-sm font-medium">Filter live services</p>
              <p className="text-default-500 mt-1 text-sm">
                Pick the service type, region, and league. Search by title, IGN, or boss name.
              </p>
            </div>
            <ToggleButtonGroup
              size="sm"
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

          <div className="grid gap-3 md:grid-cols-[1fr_180px_180px_160px]">
            <FieldInput
              aria-label="Search services"
              placeholder="Search title, IGN, or boss..."
              startContent={<Search size={18} className="text-default-400" />}
              value={search}
              onValueChange={setSearch}
              isClearable
              onClear={() => setSearch('')}
            />
            <SelectField
              aria-label="Game"
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
              aria-label="League"
              selectedKey={selectedLeague}
              onSelectionChange={(value) =>
                setSelectedLeague(typeof value === 'string' ? value : null)
              }
              isDisabled={leagueLoading}
            >
              {leagues.map((league) => (
                <ListBox.Item key={league.id} id={league.id} textValue={league.label}>
                  {league.label}
                </ListBox.Item>
              ))}
            </SelectField>
            <SelectField
              aria-label="Region"
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

      {isLoading ? (
        <Card>
          <Card.Content className="text-default-400 p-10 text-center text-sm">
            Loading live public services...
          </Card.Content>
        </Card>
      ) : filtered.length === 0 ? (
        <Card>
          <Card.Content className="flex flex-col items-center gap-3 p-12 text-center">
            <Handshake size={32} className="text-default-300" />
            <p className="text-default-500 text-sm font-medium">
              No services in {selectedLeague ?? 'this league'} match your filters.
            </p>
            <p className="text-default-400 text-xs">
              Try another league, service type, region, or search term.
            </p>
          </Card.Content>
        </Card>
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
