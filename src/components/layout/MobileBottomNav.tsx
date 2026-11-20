import { Dropdown } from '@heroui/react/dropdown'
import { createLink, Link, useRouterState } from '@tanstack/react-router'
import { Check } from 'lucide-react'
import { useIsSoloGroup } from '../../hooks/useGroups'
import { useGroupStore } from '../../store/group-store'
import { cn } from '../../lib/utils'
import {
  dashboardNavigation,
  isDashboardNavItemActive,
  isDashboardSectionActive,
} from './dashboard-navigation'

const MenuLink = createLink(Dropdown.Item)

export function MobileBottomNav() {
  const { location } = useRouterState()
  const groupId = useGroupStore((state) => state.activeGroupId)
  const isSolo = useIsSoloGroup(groupId)

  return (
    <nav
      aria-label="Primary dashboard"
      className="border-divider bg-navigation grid shrink-0 grid-cols-5 border-t px-1 pb-[max(env(safe-area-inset-bottom),0.25rem)] lg:hidden"
    >
      {dashboardNavigation.map((section) => {
        const destination = section.items[0]
        const isActive = isDashboardSectionActive(location.pathname, section)
        const Icon = section.icon
        const tabClassName = cn(
          'mobile-nav-tab relative flex min-h-14 min-w-0 flex-col items-center justify-center gap-1 rounded-lg border border-transparent px-1 text-[11px] font-medium transition-colors',
          isActive ? 'border-control bg-selected text-highlight font-semibold forced-colors:border-[Highlight]' : 'text-default-500 hover:text-default-800',
        )
        const label = (
          <>
            <Icon size={18} aria-hidden="true" />
            <span>{section.label}</span>
          </>
        )

        if (section.items.length > 1) {
          return (
            <Dropdown key={section.label}>
              <Dropdown.Trigger className={tabClassName}>{label}</Dropdown.Trigger>
              <Dropdown.Popover placement="top">
                <Dropdown.Menu aria-label={section.label}>
                  {section.items.map((item) => {
                    const ItemIcon = item.icon
                    const isCurrent = isDashboardNavItemActive(location.pathname, item)
                    return (
                      <MenuLink
                        key={item.to}
                        id={item.to}
                        to={item.to}
                        activeOptions={{ exact: true }}
                        className={isCurrent ? 'bg-selected text-highlight font-semibold' : undefined}
                        textValue={item.label}
                        render={(props) =>
                          'href' in props ? (
                            <a {...props} aria-current={isCurrent ? 'page' : undefined} />
                          ) : (
                            <div {...props} aria-current={isCurrent ? 'page' : undefined} />
                          )
                        }
                      >
                        <ItemIcon size={16} aria-hidden="true" />
                        {item.label}
                        {isCurrent ? (
                          <Check size={14} className="ml-auto" aria-hidden="true" />
                        ) : null}
                      </MenuLink>
                    )
                  })}
                </Dropdown.Menu>
              </Dropdown.Popover>
            </Dropdown>
          )
        }

        return (
          <Link
            key={section.label}
            to={destination.to}
            activeOptions={{ exact: true }}
            aria-current={isActive ? 'page' : undefined}
            aria-label={
              section.label === 'Party'
                ? isSolo
                  ? 'Party, characters'
                  : 'Party, members'
                : undefined
            }
            className={tabClassName}
          >
            {label}
          </Link>
        )
      })}
    </nav>
  )
}
