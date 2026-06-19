import { useMemo, useState } from 'react'
import { Button } from '@heroui/react/button'
import { ButtonGroup } from '@heroui/react/button-group'
import { Card } from '@heroui/react/card'
import { Chip } from '@heroui/react/chip'
import { ListBox } from '@heroui/react/list-box'
import { Separator } from '@heroui/react/separator'
import { ToggleButton } from '@heroui/react/toggle-button'
import { ToggleButtonGroup } from '@heroui/react/toggle-button-group'
import { ChevronDown, Handshake, Minus, Plus, Search, Trash2 } from 'lucide-react'
import { useNavigate } from '@tanstack/react-router'
import { Route } from '../../routes/dashboard/services'
import { useGroupStore } from '../../store/group-store'
import { useDebouncedValue } from '../../hooks/useDebouncedValue'
import { useCurrentUser } from '../../hooks/useCurrentUser'
import { useActiveGroupContext, useMyGroupRole } from '../../hooks/useGroups'
import {
  useDeleteService,
  useMyServices,
  usePublicServicesInMyLeague,
  useUpdateService,
  type OwnedService,
} from '../../hooks/useServices'
import { useServiceAvailabilityControl } from '../../hooks/useServiceAvailabilityControl'
import {
  REGION_OPTIONS,
  SERVICE_TYPE_OPTIONS,
  hasServiceDetailContent,
  regionFromSelection,
  type PartySlot,
  type ServiceDetails,
  type ServiceType,
} from '../../lib/service-types'
import { cn } from '../../lib/utils'
import type { PublicServiceRow } from '../../hooks/useGuestServices'
import { AvailabilityChip } from './AvailabilityChip'
import { AvailabilitySelector } from './AvailabilitySelector'
import { CreateServiceModal } from './CreateServiceModal'
import { ServiceCard } from './ServiceCard'
import { ServiceDetailSection } from './ServiceDetailSection'
import { ServiceTypeChip } from './ServiceTypeChip'
import { FieldInput, SelectField } from '../ui/heroui-native'
import { DashboardEmptyState, DashboardPage, DashboardPageHeader } from '../ui/dashboard'
type Mode = 'own' | 'public'
type TypeFilter = ServiceType | 'all'
const SERVICE_HEADER_CHIP_CLASS_NAME = 'px-3'

export function ServicesPage() {
  const activeGroupId = useGroupStore((s) => s.activeGroupId)
  const { league } = useActiveGroupContext()
  const myRole = useMyGroupRole(activeGroupId)
  const navigate = useNavigate()
  const { data: currentUser } = useCurrentUser()

  const { tab } = Route.useSearch()
  const mode = tab ?? 'own'
  const [typeFilter, setTypeFilter] = useState<TypeFilter>('all')
  const [region, setRegion] = useState<string>('Any')
  const [search, setSearch] = useState('')
  const debouncedSearch = useDebouncedValue(search, 250)
  const [createOpen, setCreateOpen] = useState(false)

  const serverTypeFilter = typeFilter === 'all' ? null : typeFilter
  const { data: myServices = [], isLoading: loadingOwn } = useMyServices(activeGroupId)
  const { data: publicServices = [], isLoading: loadingPublic } = usePublicServicesInMyLeague(
    activeGroupId,
    serverTypeFilter,
  )

  const filteredOwn = useMemo(() => {
    const q = debouncedSearch.trim().toLowerCase()
    return myServices.filter((s) => {
      if (serverTypeFilter && s.service_type !== serverTypeFilter) return false
      if (region !== 'Any' && s.region && s.region !== region) return false
      if (!q) return true
      return (
        s.title.toLowerCase().includes(q) ||
        s.poe_ign.toLowerCase().includes(q) ||
        (s.description ?? '').toLowerCase().includes(q)
      )
    })
  }, [myServices, serverTypeFilter, region, debouncedSearch])

  const filteredPublic = useMemo(() => {
    const q = debouncedSearch.trim().toLowerCase()
    return publicServices.filter((s) => {
      if (region !== 'Any' && s.region && s.region !== region) return false
      if (!q) return true
      if (s.title.toLowerCase().includes(q)) return true
      if (s.poe_ign.toLowerCase().includes(q)) return true
      if (s.owner_name.toLowerCase().includes(q)) return true
      if (s.details.service_type === 'boss_carry') {
        return s.details.bosses.some((boss) => boss.name.toLowerCase().includes(q))
      }
      return false
    })
  }, [publicServices, region, debouncedSearch])

  const isViewer = myRole === 'viewer'

  const setMode = (tab: Mode) => {
    navigate({
      to: '/dashboard/services',
      search: { tab },
      replace: true,
    })
  }

  return (
    <DashboardPage>
      <DashboardPageHeader
        title="Services"
        eyebrow="Market board"
        tone="currency"
        description={
          <>
            Advertise boss carries, map carries, 5-way runs, and gold rotas — or browse what other
            groups in {league ?? 'your league'} are offering.
          </>
        }
        actions={
          <>
            <ToggleButtonGroup
              size="sm"
              selectionMode="single"
              disallowEmptySelection
              selectedKeys={new Set([mode])}
              onSelectionChange={(keys) => {
                const [value] = Array.from(keys)
                if (value === 'own' || value === 'public') setMode(value)
              }}
            >
              <ToggleButton id="own">Own</ToggleButton>
              <ToggleButton id="public">
                <ToggleButtonGroup.Separator />
                Public
              </ToggleButton>
            </ToggleButtonGroup>
            {activeGroupId && !isViewer ? (
              <Button size="sm" onPress={() => setCreateOpen(true)}>
                New Service
              </Button>
            ) : null}
          </>
        }
      />

      <Card>
        <Card.Content className="gap-4 p-5">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <p className="text-foreground text-sm font-medium">
                {mode === 'own' ? 'Your services' : 'Public services in your league'}
              </p>
              <p className="text-default-500 mt-1 text-sm">
                {mode === 'own'
                  ? 'Everything you’ve posted. Toggle availability to control whether buyers see you.'
                  : 'Live listings from other groups matched to your current league.'}
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
          <div className="grid gap-3 md:grid-cols-[1fr_160px]">
            <FieldInput
              aria-label="Search services"
              placeholder={
                mode === 'own'
                  ? 'Search title, IGN, description...'
                  : 'Search title, IGN, or boss...'
              }
              startContent={<Search size={18} className="text-default-400" />}
              value={search}
              onValueChange={setSearch}
              isClearable
              onClear={() => setSearch('')}
            />
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

      {mode === 'own' ? (
        loadingOwn ? (
          <Card>
            <Card.Content className="text-default-400 p-10 text-center text-sm">
              Loading your services...
            </Card.Content>
          </Card>
        ) : filteredOwn.length === 0 ? (
          <Card>
            <Card.Content className="flex flex-col items-center gap-3 p-12 text-center">
              <Handshake size={32} className="text-default-300" />
              <p className="text-default-500 text-sm">
                {myServices.length === 0
                  ? 'No services yet — click New Service to post your first listing.'
                  : 'No services match your filters.'}
              </p>
              {myServices.length === 0 ? (
                <Button variant="tertiary" size="sm" onPress={() => setMode('public')}>
                  See public available services
                </Button>
              ) : null}
            </Card.Content>
          </Card>
        ) : (
          <div className="flex flex-col gap-3">
            {filteredOwn.map((service) => (
              <OwnedServiceRow key={service.id} service={service} />
            ))}
          </div>
        )
      ) : loadingPublic ? (
        <Card>
          <Card.Content className="text-default-400 p-10 text-center text-sm">
            Loading public services...
          </Card.Content>
        </Card>
      ) : filteredPublic.length === 0 ? (
        <DashboardEmptyState icon={Handshake} tone="currency">
          No public services in {league ?? 'your league'} match your filters yet.
        </DashboardEmptyState>
      ) : (
        <div className="flex flex-col gap-3">
          {filteredPublic.map((service) => (
            <ServiceCard
              key={service.id}
              service={service}
              isOwned={service.user_id === currentUser?.id}
            />
          ))}
        </div>
      )}

      <CreateServiceModal isOpen={createOpen} onClose={() => setCreateOpen(false)} />
    </DashboardPage>
  )
}

function ownedAsPublic(service: OwnedService): PublicServiceRow {
  return {
    ...service,
    group_name: '',
    group_game: 'poe1',
    group_league: '',
    owner_name: '',
  }
}

function clampPartyCount(value: number, capacity: number): number {
  return Math.max(0, Math.min(capacity, value))
}

function updatePartySlot(slot: PartySlot, delta: number): PartySlot {
  return {
    ...slot,
    current: clampPartyCount(slot.current + delta, slot.capacity),
  }
}

function getPrimaryPartySlot(details: ServiceDetails): { label: string; slot: PartySlot } | null {
  if (details.service_type === 'five_way_host') {
    return { label: 'Clients', slot: details.party.clients }
  }
  if (details.service_type === 'gold_rota') {
    return { label: 'Party', slot: details.party }
  }
  return null
}

function patchPrimaryPartySlot(details: ServiceDetails, delta: number): ServiceDetails {
  if (details.service_type === 'five_way_host') {
    return {
      ...details,
      party: {
        ...details.party,
        clients: updatePartySlot(details.party.clients, delta),
      },
    }
  }
  if (details.service_type === 'gold_rota') {
    return {
      ...details,
      party: updatePartySlot(details.party, delta),
    }
  }
  return details
}

function PartyQuickControls({ service }: { service: OwnedService }) {
  const { mutate: updateService, isPending } = useUpdateService()
  const primarySlot = getPrimaryPartySlot(service.details)

  if (!primarySlot) return null

  const { label, slot } = primarySlot
  const isEmpty = slot.current <= 0
  const isFull = slot.current >= slot.capacity

  function adjust(delta: number) {
    updateService({
      id: service.id,
      patch: {
        details: patchPrimaryPartySlot(service.details, delta),
      },
    })
  }

  return (
    <div className="mt-3 flex flex-wrap items-center gap-2">
      <span className="text-default-400 text-xs font-medium tracking-wide uppercase">{label}</span>
      <ButtonGroup size="sm" variant="tertiary">
        <Button
          isIconOnly
          onPress={() => adjust(-1)}
          isDisabled={isPending || isEmpty}
          aria-label={`Remove one ${label.toLowerCase()}`}
        >
          <Minus size={14} />
        </Button>
        <Button isDisabled className="min-w-16 opacity-100">
          {slot.current}/{slot.capacity}
        </Button>
        <Button
          isIconOnly
          onPress={() => adjust(1)}
          isDisabled={isPending || isFull}
          aria-label={`Add one ${label.toLowerCase()}`}
        >
          <Plus size={14} />
        </Button>
      </ButtonGroup>
    </div>
  )
}

function OwnedServiceRow({ service }: { service: OwnedService }) {
  const navigate = useNavigate()
  const { mutate: deleteService, isPending: deletingService } = useDeleteService()
  const {
    availability: displayAvailability,
    availabilityPending,
    updateAvailability,
  } = useServiceAvailabilityControl(service.id, service.availability)
  const [expanded, setExpanded] = useState(false)

  function goToEdit() {
    navigate({
      to: '/dashboard/services/$serviceId',
      params: { serviceId: service.id },
    })
  }

  function handleDelete() {
    if (!confirm(`Delete “${service.title}”? This cannot be undone.`)) return
    deleteService({ id: service.id, group_id: service.group_id })
  }

  return (
    <Card className="hover:bg-default-50 transition-colors">
      <Card.Content className="gap-0 p-0">
        <div
          role="button"
          tabIndex={0}
          aria-expanded={expanded}
          className="flex cursor-pointer items-start gap-3 p-5"
          onClick={(event) => {
            const target = event.target as HTMLElement
            if (target.closest('button, a, input, [role="menuitem"]')) return
            setExpanded((v) => !v)
          }}
          onKeyDown={(event) => {
            if (event.key === 'Enter' || event.key === ' ') {
              event.preventDefault()
              setExpanded((v) => !v)
            }
          }}
        >
          <div className="min-w-0 flex-1">
            <div className="flex flex-wrap items-center gap-2">
              <h2 className="text-foreground font-semibold">{service.title}</h2>
              <ServiceTypeChip
                type={service.service_type}
                className={SERVICE_HEADER_CHIP_CLASS_NAME}
              />
              <AvailabilityChip
                status={displayAvailability}
                className={SERVICE_HEADER_CHIP_CLASS_NAME}
              />
              {!service.is_active ? (
                <Chip
                  size="sm"
                  variant="soft"
                  color="default"
                  className={SERVICE_HEADER_CHIP_CLASS_NAME}
                >
                  Inactive
                </Chip>
              ) : null}
              <Chip size="sm" variant="soft" className={SERVICE_HEADER_CHIP_CLASS_NAME}>
                {service.visibility === 'public' ? 'Public' : 'Group only'}
              </Chip>
              {service.region ? (
                <Chip size="sm" variant="soft" className={SERVICE_HEADER_CHIP_CLASS_NAME}>
                  {service.region}
                </Chip>
              ) : null}
            </div>
            <p className="text-default-400 mt-2 text-xs">
              Updated {new Date(service.updated_at).toLocaleDateString()} · {service.poe_ign}
            </p>
            <PartyQuickControls service={service} />
          </div>

          <div className="flex shrink-0 items-center gap-2">
            <AvailabilitySelector
              availability={displayAvailability}
              isDisabled={availabilityPending}
              onChange={updateAvailability}
            />

            <Button size="sm" variant="tertiary" onPress={goToEdit}>
              Edit
            </Button>

            <Button
              size="sm"
              variant="danger-soft"
              onPress={handleDelete}
              isPending={deletingService}
              aria-label="Delete service"
            >
              <Trash2 size={14} />
              Delete
            </Button>

            <ChevronDown
              size={18}
              className={cn(
                'text-default-400 shrink-0 transition-transform',
                expanded && 'rotate-180',
              )}
              aria-hidden
            />
          </div>
        </div>

        {expanded ? (
          <>
            <Separator />
            <div className="flex flex-col gap-4 p-5">
              {service.description ? (
                <p className="text-default-600 text-sm leading-relaxed">{service.description}</p>
              ) : null}
              <ServiceDetailSection service={ownedAsPublic(service)} />
              {!service.description && !hasServiceDetailContent(service.details) ? (
                <p className="text-default-400 text-sm">
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
