import gemColorLookup from '../../assets/poe_gem_color_lookup.json'
import { CheckCircle2, Copy, Globe2, Sparkles, Users } from 'lucide-react'
import { useState } from 'react'
import { Button } from '@heroui/react/button'
import { Chip } from '@heroui/react/chip'
import { Spinner } from '@heroui/react/spinner'
import { Tooltip } from '@heroui/react/tooltip'
import { ToggleButton } from '@heroui/react/toggle-button'
import { ToggleButtonGroup } from '@heroui/react/toggle-button-group'
import type {
  CharacterProfileItem,
  CharacterProfileSnapshot,
  CharacterProfileVisibility,
} from '../../lib/character-profile'
import { addPassiveTreeProfileContext, buildAtlasTreeUrl, buildPassiveTreeUrl, countPassiveTreeClusterJewels, formatRelativeTimestamp, getAscendancyLabel, getCharacterClassId, getCharacterProfileSlotLabel, getFrameTypeLabel, getItemDisplayName, hasPassiveTreeClusterSubgraphs } from '../../lib/character-profile'
import { getModifierSectionMeta, shouldDisplayTooltipProperty, shouldDisplayTooltipRequirement, stripInlineModifierMarker } from '../../lib/item-modifier-tooltip'
import { useActiveGroupContext } from '../../hooks/useGroups'
import { NativeCheckbox } from '../ui/heroui-native'
function getSocketColorStyle(color: string | null): { backgroundColor: string } {
  const normalized = color?.toUpperCase() ?? null
  switch (normalized) {
    case 'S':
    case 'R':
    case 'STRENGTH':
      return { backgroundColor: '#d20000' }
    case 'D':
    case 'G':
    case 'DEXTERITY':
      return { backgroundColor: '#46a239' }
    case 'I':
    case 'B':
    case 'INTELLIGENCE':
      return { backgroundColor: '#8888ff' }
    case 'W':
      return { backgroundColor: '#f5f5f5' }
    case 'A':
    case 'ABYSS':
      return { backgroundColor: '#f59e0b' }
    default:
      return { backgroundColor: '#94a3b8' }
  }
}

function getGemTextColorClassByName(gemName: string): string {
  const colorMap = gemColorLookup as Record<string, string>
  const normalizedName = gemName.replace(/\s+Support\s*$/i, '').trim()
  const color = colorMap[gemName] ?? colorMap[normalizedName] ?? null
  switch (color) {
    case 'red': return 'text-[#d20000]'
    case 'green': return 'text-[#46a239]'
    case 'blue': return 'text-[#8888ff]'
    default: return 'text-[#8888ff]'
  }
}

function normalizeModifierLines(lines: string[] | undefined): string[] {
  return (lines ?? []).filter((line) => typeof line === 'string' && line.trim().length > 0)
}

function getVeiledModLabel(mod: string): string {
  if (mod.startsWith('Prefix')) return 'Veiled Prefix'
  if (mod.startsWith('Suffix')) return 'Veiled Suffix'
  return mod
}

function pushModifierLine(
  sections: Array<{
    key: string
    lines: string[]
    lineClassName: string
  }>,
  key: string,
  lineClassName: string,
  line: string,
) {
  if (!line.trim()) return

  const lastSection = sections[sections.length - 1]
  if (
    lastSection &&
    lastSection.key.startsWith(`${key}-`) &&
    lastSection.lineClassName === lineClassName
  ) {
    lastSection.lines.push(line)
    return
  }

  sections.push({
    key: `${key}-${sections.length}`,
    lines: [line],
    lineClassName,
  })
}

function appendModifierLines(
  sections: Array<{
    key: string
    lines: string[]
    lineClassName: string
  }>,
  lines: string[],
  defaultMarker: string,
) {
  const defaultMeta = getModifierSectionMeta(defaultMarker)

  for (const rawLine of lines) {
    const inlineMarker = stripInlineModifierMarker(rawLine)
    const cleanedLine = inlineMarker.line.trim()
    if (!cleanedLine) continue

    const modifierForLine =
      inlineMarker.key && inlineMarker.lineClassName
        ? { key: inlineMarker.key, lineClassName: inlineMarker.lineClassName }
        : defaultMeta

    pushModifierLine(sections, modifierForLine.key, modifierForLine.lineClassName, cleanedLine)
  }
}

function getItemModifierSections(item: CharacterProfileItem): Array<{
  key: string
  lines: string[]
  lineClassName: string
}> {
  const sections: Array<{
    key: string
    lines: string[]
    lineClassName: string
  }> = []

  appendModifierLines(sections, normalizeModifierLines(item.enchantMods), 'enchant')
  appendModifierLines(sections, normalizeModifierLines(item.implicitMods), 'implicit')
  appendModifierLines(sections, normalizeModifierLines(item.fracturedMods), 'fractured')
  appendModifierLines(sections, normalizeModifierLines(item.explicitMods), 'explicit')
  appendModifierLines(sections, normalizeModifierLines(item.craftedMods), 'crafted')
  appendModifierLines(
    sections,
    normalizeModifierLines(item.veiledMods).map(getVeiledModLabel),
    'veiled',
  )

  if (sections.length > 0) return sections

  const legacyModifiers = normalizeModifierLines(item.modifiers)
  if (legacyModifiers.length === 0) return []

  appendModifierLines(sections, legacyModifiers, 'explicit')
  return sections
}

function SectionTitle({ title, subtitle }: { title: string; subtitle?: string }) {
  return (
    <div className="flex items-center justify-between gap-3">
      <div>
        <p className="text-foreground text-sm font-medium">{title}</p>
        {subtitle ? <p className="text-default-400 text-xs">{subtitle}</p> : null}
      </div>
    </div>
  )
}

function TreeSection({
  title,
  hashCount,
  url,
  subtitle,
  linkHint,
}: {
  title: string
  hashCount: number
  url: string | null
  subtitle: string
  linkHint?: string | null
}) {
  return (
    <div className="rounded-large border border-divider bg-default-50/60 p-4">
      <SectionTitle title={title} subtitle={subtitle} />
      <div className="mt-3 flex items-center justify-between gap-3">
        <div className="flex items-center gap-2">
          <Chip size="sm" variant="soft">
            {hashCount} allocated
          </Chip>
          {!hashCount && <span className="text-default-400 text-xs">No stored nodes yet.</span>}
          {hashCount > 0 && linkHint ? (
            <span className="text-default-400 text-xs">{linkHint}</span>
          ) : null}
        </div>
        {url ? (
          <div className="flex items-center gap-2">
            <Button
              size="sm"
              variant="tertiary"
              isIconOnly
              onPress={() => navigator.clipboard.writeText(url)}
            >
              <Copy size={12} />
            </Button>
            <a href={url} target="_blank" rel="noopener noreferrer">
              <Button size="sm" variant="tertiary">
                Open Official Tree
              </Button>
            </a>
          </div>
        ) : (
          <span className="text-default-400 text-xs">No tree link available</span>
        )}
      </div>
    </div>
  )
}

function readTreeVersion(rawCharacter: Record<string, unknown>): string | null {
  const directValue = rawCharacter.version
  if (typeof directValue === 'string' && directValue.trim()) return directValue

  const passiveTree = rawCharacter.passive_tree
  if (passiveTree && typeof passiveTree === 'object' && !Array.isArray(passiveTree)) {
    const nestedValue = (passiveTree as Record<string, unknown>).version
    if (typeof nestedValue === 'string' && nestedValue.trim()) return nestedValue
  }

  const metadata = rawCharacter.metadata
  if (metadata && typeof metadata === 'object' && !Array.isArray(metadata)) {
    const metaValue = (metadata as Record<string, unknown>).version
    if (typeof metaValue === 'string' && metaValue.trim()) return metaValue
  }

  return null
}

function readAlternateAscendancy(rawCharacter: Record<string, unknown>): string | null {
  const passives = rawCharacter.passives
  if (passives && typeof passives === 'object' && !Array.isArray(passives)) {
    const value = (passives as Record<string, unknown>).alternate_ascendancy
    if (typeof value === 'string' && value.trim()) return value
    if (typeof value === 'number' && Number.isFinite(value) && value > 0) return String(value)
  }

  const passiveTree = rawCharacter.passive_tree
  if (passiveTree && typeof passiveTree === 'object' && !Array.isArray(passiveTree)) {
    const nestedPassives = (passiveTree as Record<string, unknown>).passives
    if (nestedPassives && typeof nestedPassives === 'object' && !Array.isArray(nestedPassives)) {
      const value = (nestedPassives as Record<string, unknown>).alternate_ascendancy
      if (typeof value === 'string' && value.trim()) return value
      if (typeof value === 'number' && Number.isFinite(value) && value > 0) return String(value)
    }
  }

  return null
}

function readAtlasHashes(rawLeagueAccount: Record<string, unknown>): number[] {
  const directCandidates = [
    rawLeagueAccount.atlas_passive_hashes,
    rawLeagueAccount.atlasPassiveHashes,
    rawLeagueAccount.atlas_passive_skills,
    rawLeagueAccount.atlasPassiveSkills,
  ]

  for (const candidate of directCandidates) {
    if (Array.isArray(candidate)) {
      return candidate
        .map((value) => (typeof value === 'number' ? value : Number(value)))
        .filter((value) => Number.isFinite(value))
    }
  }

  const atlasPassives = rawLeagueAccount.atlas_passives
  if (atlasPassives && typeof atlasPassives === 'object' && !Array.isArray(atlasPassives)) {
    const hashes = (atlasPassives as Record<string, unknown>).hashes
    if (Array.isArray(hashes)) {
      return hashes
        .map((value) => (typeof value === 'number' ? value : Number(value)))
        .filter((value) => Number.isFinite(value))
    }
  }

  const atlasTrees = rawLeagueAccount.atlas_passive_trees
  if (Array.isArray(atlasTrees)) {
    for (const tree of atlasTrees) {
      if (tree && typeof tree === 'object' && !Array.isArray(tree)) {
        const hashes = (tree as Record<string, unknown>).hashes
        if (Array.isArray(hashes)) {
          return hashes
            .map((value) => (typeof value === 'number' ? value : Number(value)))
            .filter((value) => Number.isFinite(value))
        }
      }
    }
  }

  return []
}

function LinkedGemSocketRow({ item }: { item: CharacterProfileItem }) {
  if (!item.sockets.length) return null

  return (
    <div className="mt-2 flex flex-wrap items-center justify-center gap-1.5">
      {item.sockets.map((socket, index) => {
        const nextSocket = item.sockets[index + 1]
        const linked = nextSocket && nextSocket.group === socket.group
        return (
          <div key={`${socket.group}-${index}`} className="flex items-center gap-1">
            <span
              className="h-3.5 w-3.5 rounded-full border border-white/40 shadow-[0_0_10px_rgba(255,255,255,0.18)]"
              style={getSocketColorStyle(socket.color)}
              title={socket.color ?? 'Unknown'}
            />
            {linked ? <span className="bg-amber-200/70 h-0.5 w-3 rounded-full" /> : null}
          </div>
        )
      })}
    </div>
  )
}

function SocketedGemList({ item }: { item: CharacterProfileItem }) {
  return (
    <div className="mt-2 flex flex-wrap justify-center gap-1">
      {item.socketedItems.map((gem, index) => {
        const socket = item.sockets[index]
        const colorClass = getGemTextColorClassByName(gem.name || gem.typeLine)
        return (
          <span
            key={`${gem.id ?? gem.typeLine}-${gem.level ?? 'na'}`}
            className={`inline-flex items-center gap-1 rounded-full border border-white/10 bg-white/5 py-0.5 pr-2 pl-0.5 text-[11px] leading-4 ${colorClass}`}
          >
            {gem.icon ? (
              <img
                src={gem.icon}
                alt=""
                className="h-4 w-4 rounded-full object-contain"
              />
            ) : socket ? (
              <span
                className="h-3 w-3 rounded-full border border-white/30"
                style={getSocketColorStyle(socket.color)}
              />
            ) : null}
            <span className="truncate">
              {gem.name || gem.typeLine}
              {gem.level != null ? ` ${gem.level}` : ''}
              {gem.quality ? ` (${gem.quality})` : ''}
            </span>
          </span>
        )
      })}
    </div>
  )
}

function ItemTooltipContent({ item }: { item: CharacterProfileItem }) {
  const title = getItemDisplayName(item)
  const modifierSections = getItemModifierSections(item)
  const veiledMods = normalizeModifierLines(item.veiledMods)
  const visibleProperties = item.properties.filter((property) =>
    shouldDisplayTooltipProperty(property.name, item.rarity),
  )
  const visibleRequirements = item.requirements.filter((requirement) =>
    shouldDisplayTooltipRequirement(requirement.name, item.rarity),
  )
  const baseLine =
    item.baseType && item.baseType !== item.typeLine && item.baseType !== title
      ? item.baseType
      : item.typeLine && item.typeLine !== title
        ? item.typeLine
        : null

  return (
    <div className="min-w-[18rem] max-w-[24rem] rounded-large border border-amber-300/35 bg-[#11100d]/95 px-3 py-2 text-[#d9c7a2] shadow-2xl">
      <div className="border-b border-amber-300/20 pb-2 text-center">
        <p className="text-sm font-semibold uppercase tracking-[0.18em] text-[#e1c47a]">{title}</p>
        {baseLine ? (
          <p className="mt-1 text-xs uppercase tracking-[0.15em] text-[#f2ebd0]">{baseLine}</p>
        ) : null}
      </div>

      {visibleProperties.length > 0 && (
        <div className="border-b border-amber-300/15 py-2 text-center">
          {visibleProperties.map((property, index) => (
            <p
              key={`${property.name}-${property.values.join('|')}-${index}`}
              className="text-xs leading-5 text-[#d7d7d7]"
            >
              <span className="text-[#b4b4b4]">{property.name}:</span>{' '}
              <span className="text-white">{property.values.join(', ')}</span>
            </p>
          ))}
        </div>
      )}

      {visibleRequirements.length > 0 && (
        <div className="border-b border-amber-300/15 py-2 text-center">
          <p className="text-[11px] uppercase tracking-[0.14em] text-[#8f8f8f]">Requires</p>
          {visibleRequirements.map((requirement, index) => (
            <p
              key={`${requirement.name}-${requirement.values.join('|')}-${index}`}
              className="text-xs leading-5 text-[#d7d7d7]"
            >
              {requirement.name} {requirement.values.join(', ')}
            </p>
          ))}
        </div>
      )}

      {modifierSections.length > 0 && (
        <div className="border-b border-amber-300/15">
          {modifierSections.map((section, index) => (
            <div
              key={section.key}
              className={`${index > 0 ? 'border-t border-amber-300/10' : ''} py-2`}
            >
              {section.lines.map((modifier) => (
                <p
                  key={`${section.key}-${modifier}`}
                  className={`text-center text-xs leading-5 ${section.lineClassName}`}
                >
                  {modifier}
                </p>
              ))}
            </div>
          ))}
        </div>
      )}

      {item.socketedItems.length > 0 && (
        <div className="border-b border-amber-300/15 py-2">
          <LinkedGemSocketRow item={item} />
          <SocketedGemList item={item} />
        </div>
      )}

      <div className="pt-2 text-center text-[11px] text-[#a89467]">
        <p>{getFrameTypeLabel(item.frameType, item.rarity)}</p>
        {item.itemLevel != null ? <p>Item Level: {item.itemLevel}</p> : null}
        {item.synthesised ? <p className="text-[#8ee8ff]">Synthesised Item</p> : null}
        {item.fractured ? <p className="text-[#a29162]">Fractured Item</p> : null}
        {item.veiled && !veiledMods.length ? <p className="text-[#c7b7ff]">Veiled Item</p> : null}
        {item.corrupted ? <p className="text-[#d14b4b]">Corrupted</p> : null}
        {item.influences.length > 0 ? <p>{item.influences.join(' - ')}</p> : null}
      </div>
    </div>
  )
}

function VisibleItemCard({
  slotLabel,
  item,
  large = false,
  compact = false,
  tiny = false,
  wideCompact = false,
  className = '',
}: {
  slotLabel: string
  item: CharacterProfileItem | null
  large?: boolean
  compact?: boolean
  tiny?: boolean
  wideCompact?: boolean
  className?: string
}) {
  const shellSizeClass = wideCompact
    ? 'w-48 p-2.5'
    : tiny
      ? 'w-[6.25rem] p-2'
      : compact
        ? 'w-24 p-2.5'
        : 'w-full p-3'
  const artSizeClass = large ? 'min-h-44' : tiny ? 'min-h-12' : compact ? 'min-h-14' : 'min-h-28'
  const iconSizeClass = large ? 'h-32 w-32' : tiny ? 'h-7 w-7' : compact ? 'h-8 w-8' : 'h-20 w-20'

  const content = (
    <div
      className={`rounded-large border border-[#6c5b36] bg-[radial-gradient(circle_at_top,#262b4d,#12131f_60%,#0b0c13)] shadow-[inset_0_0_0_1px_rgba(255,218,127,0.08)] transition-transform duration-150 hover:scale-[1.01] ${shellSizeClass} ${className}`}
    >
      <p className="text-[11px] font-medium uppercase tracking-[0.16em] text-[#c9b47a]">
        {slotLabel}
      </p>
      <div
        className={`mt-2 flex items-center justify-center rounded-large border border-[#4d4560] bg-[#17192a] ${artSizeClass}`}
      >
        {item?.icon ? (
          <img
            src={item.icon}
            alt={item ? getItemDisplayName(item) : slotLabel}
            className={`${iconSizeClass} object-contain drop-shadow-[0_6px_14px_rgba(0,0,0,0.55)]`}
          />
        ) : (
          <div
            className={`${iconSizeClass} rounded-medium border border-dashed border-default-500/30`}
          />
        )}
      </div>
      {item ? (
        <>
          <p
            className={`truncate text-center font-medium text-[#ece3c9] ${
              tiny ? 'mt-2 text-[11px]' : compact ? 'mt-2 text-xs' : 'mt-3 text-sm'
            }`}
          >
            {getItemDisplayName(item)}
          </p>
          <p
            className={`truncate text-center text-[#a7a7b8] ${
              tiny ? 'mt-0.5 text-[10px]' : compact ? 'mt-0.5 text-[11px]' : 'mt-1 text-xs'
            }`}
          >
            {getFrameTypeLabel(item.frameType, item.rarity)}
          </p>
        </>
      ) : (
        <p className="mt-3 text-center text-xs text-default-400">Empty</p>
      )}
    </div>
  )

  if (!item) return content

  return (
    <Tooltip delay={150} closeDelay={50}>
      <Tooltip.Trigger>{content}</Tooltip.Trigger>
      <Tooltip.Content placement="right" className="bg-transparent p-0 shadow-none">
        <ItemTooltipContent item={item} />
      </Tooltip.Content>
    </Tooltip>
  )
}

function EquipmentLayout({
  gear,
  showWeaponSwap,
}: {
  gear: CharacterProfileItem[]
  showWeaponSwap: boolean
}) {
  const gearBySlot = new Map(gear.filter((item) => !!item.slot).map((item) => [item.slot!, item]))
  const PlaceholderCell = () => <div aria-hidden="true" className="hidden md:block" />

  return (
    <div className="rounded-[1.75rem] border border-[#55451f] bg-[radial-gradient(circle_at_top,#2d3d3a,#1b1a18_46%,#0e0d0d)] p-4 shadow-[inset_0_0_0_1px_rgba(244,209,126,0.05)]">
      <div className="flex flex-col gap-3">
        <div className="grid gap-3 md:grid-cols-3 md:items-end">
          <PlaceholderCell />
          <VisibleItemCard
            slotLabel={getCharacterProfileSlotLabel('Helm')}
            item={gearBySlot.get('Helm') ?? null}
            className="h-full"
          />
          <VisibleItemCard
            slotLabel={getCharacterProfileSlotLabel('Amulet')}
            item={gearBySlot.get('Amulet') ?? null}
            compact
            wideCompact
            className="justify-self-start self-end"
          />
        </div>

        <div className="grid gap-3 md:grid-cols-3">
          <VisibleItemCard
            slotLabel={
              showWeaponSwap
                ? getCharacterProfileSlotLabel('Weapon2')
                : getCharacterProfileSlotLabel('Weapon')
            }
            item={gearBySlot.get(showWeaponSwap ? 'Weapon2' : 'Weapon') ?? null}
            large
          />
          <VisibleItemCard
            slotLabel={getCharacterProfileSlotLabel('BodyArmour')}
            item={gearBySlot.get('BodyArmour') ?? null}
            large
          />
          <VisibleItemCard
            slotLabel={
              showWeaponSwap
                ? getCharacterProfileSlotLabel('Offhand2')
                : getCharacterProfileSlotLabel('Offhand')
            }
            item={gearBySlot.get(showWeaponSwap ? 'Offhand2' : 'Offhand') ?? null}
            large
          />
        </div>

        <div className="grid gap-3 md:grid-cols-3">
          <PlaceholderCell />
          <div className="grid w-full grid-cols-2 gap-3">
            <VisibleItemCard
              slotLabel={getCharacterProfileSlotLabel('Ring')}
              item={gearBySlot.get('Ring') ?? null}
              compact
              className="h-full w-full"
            />
            <VisibleItemCard
              slotLabel={getCharacterProfileSlotLabel('Ring2')}
              item={gearBySlot.get('Ring2') ?? null}
              compact
              className="h-full w-full"
            />
          </div>
          <PlaceholderCell />
        </div>

        <div className="grid gap-3 md:grid-cols-3">
          <VisibleItemCard
            slotLabel={getCharacterProfileSlotLabel('Gloves')}
            item={gearBySlot.get('Gloves') ?? null}
          />
          <VisibleItemCard
            slotLabel={getCharacterProfileSlotLabel('Belt')}
            item={gearBySlot.get('Belt') ?? null}
          />
          <VisibleItemCard
            slotLabel={getCharacterProfileSlotLabel('Boots')}
            item={gearBySlot.get('Boots') ?? null}
          />
        </div>
      </div>
    </div>
  )
}

function JewelStrip({ items }: { items: CharacterProfileItem[] }) {
  return (
    <div className="rounded-large border border-divider bg-default-50/60 p-4">
      <SectionTitle title="Jewels" subtitle="Stored passive-tree jewels and related items" />
      {!items.length ? (
        <p className="text-default-400 mt-3 text-sm">No jewels stored yet.</p>
      ) : (
        <div className="mt-3 flex flex-wrap gap-2">
          {items.map((item, index) => (
            <VisibleItemCard
              key={`${item.id ?? item.typeLine}-${index}`}
              slotLabel={item.slot ?? 'Jewel'}
              item={item}
              tiny
            />
          ))}
        </div>
      )}
    </div>
  )
}

export function MemberCharacterDetails({
  profile,
  isLoading,
  isPending = false,
  isMe,
  canSync,
  visibility,
  canToggleVisibility = false,
  visibilityPending = false,
  onToggleVisibility,
  selectionTitle = 'Selected character',
  selectionSubtitle = 'Stored snapshot shown to your group',
}: {
  profile: CharacterProfileSnapshot | null
  isLoading?: boolean
  isPending?: boolean
  isMe: boolean
  canSync: boolean
  visibility?: CharacterProfileVisibility | null
  canToggleVisibility?: boolean
  visibilityPending?: boolean
  onToggleVisibility?: () => void
  selectionTitle?: string
  selectionSubtitle?: string
}) {
  const { game, capabilities } = useActiveGroupContext()
  const [showWeaponSwap, setShowWeaponSwap] = useState(false)
  const loading = isLoading || isPending

  if (loading) {
    return (
      <div className="border-t border-divider px-4 py-4">
        <div className="text-default-400 text-sm">Loading character details...</div>
      </div>
    )
  }

  if (!profile) {
    return (
      <div className="border-t border-divider px-4 py-4">
        <div className="rounded-large border border-dashed border-divider bg-default-50/60 p-4">
          <p className="text-foreground text-sm font-medium">No character details synced yet.</p>
          <p className="text-default-400 mt-1 text-sm">
            {isMe && canSync
              ? 'Your details will appear here after the background sync completes.'
              : 'This member has not synced a detailed character snapshot yet.'}
          </p>
        </div>
      </div>
    )
  }

  const ascendancy = getAscendancyLabel(profile.class, profile.ascendancy_class, game ?? 'poe1')
  const alternateAscendancy = readAlternateAscendancy(profile.raw_character)
  const generatedPassiveTreeUrl = buildPassiveTreeUrl({
    game: game ?? 'poe1',
    gameVersion: profile.passive_tree.version ?? readTreeVersion(profile.raw_character),
    classId: profile.passive_tree.classId ?? getCharacterClassId(profile.class),
    ascendancyId: profile.passive_tree.ascendancyId ?? profile.ascendancy_class ?? null,
    alternateAscendancy,
    hashes: profile.passive_tree.hashes,
    hashesEx: profile.passive_tree.hashesEx,
    masteryEffects: profile.passive_tree.masteryEffects,
  })
  const passiveTreeUrl = addPassiveTreeProfileContext(
    generatedPassiveTreeUrl ?? profile.passive_tree.url,
    {
      accountName: profile.poe_account_name,
      characterName: profile.character_name,
    },
  )
  const clusterJewelCount = countPassiveTreeClusterJewels(profile.passive_tree)
  const hasClusterSubgraphs = hasPassiveTreeClusterSubgraphs(profile.passive_tree)
  const hasClusterAwareTreeUrl = hasClusterSubgraphs && !!profile.poe_account_name?.trim()
  const displayVisibility = visibility === 'public' ? 'public' : 'group_only'
  const atlasHashes =
    profile.atlas_tree.hashes.length > 0
      ? profile.atlas_tree.hashes
      : readAtlasHashes(profile.raw_league_account)
  const atlasTreeUrl =
    profile.atlas_tree.url ??
    buildAtlasTreeUrl({
      game: game ?? 'poe1',
      league: profile.atlas_tree.league ?? profile.league,
      hashes: atlasHashes,
    })
  const passiveTreeLinkHint = generatedPassiveTreeUrl
    ? hasClusterAwareTreeUrl
      ? 'Generated from stored tree data with profile context for cluster jewels'
      : hasClusterSubgraphs
        ? 'Generated from stored tree data; standalone link may omit cluster layout'
        : 'Generated from stored tree data'
    : profile.passive_tree.url
      ? 'Direct link from sync'
      : null
  const atlasTreeLinkHint = profile.atlas_tree.url
    ? 'Direct link from sync'
    : atlasTreeUrl
      ? 'Generated from stored tree data'
      : null

  return (
    <div className="border-t border-divider px-4 py-4">
      <div className="flex flex-col gap-4">
        {canToggleVisibility ? (
          <div className="rounded-large border border-divider bg-default-50/60 p-4">
            <div className="flex flex-col gap-4">
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div>
                  <p className="text-sm font-medium text-foreground">
                    Who can discover this character?
                  </p>
                  <p className="mt-1 text-sm text-default-500">
                    Pick a visibility option for {profile.character_name}. Changes apply immediately.
                  </p>
                </div>
                <Chip
                  size="sm"
                  variant="soft"
                  color={displayVisibility === 'public' ? 'accent' : 'default'}
                >
                  {displayVisibility === 'public' ? 'Currently public' : 'Currently group-only'}
                </Chip>
              </div>

              <ToggleButtonGroup
                isDetached
                fullWidth
                selectionMode="single"
                disallowEmptySelection
                isDisabled={visibilityPending}
                selectedKeys={new Set([displayVisibility])}
                onSelectionChange={(keys) => {
                  const [nextVisibility] = Array.from(keys)
                  if (
                    (nextVisibility === 'group_only' || nextVisibility === 'public') &&
                    nextVisibility !== displayVisibility
                  ) {
                    onToggleVisibility?.()
                  }
                }}
                className="grid w-full gap-3 sm:grid-cols-2"
              >
                <ToggleButton
                  id="group_only"
                  aria-label="Set visibility to group only"
                  className="rounded-large border-divider bg-content1 data-[selected=true]:border-primary/60 data-[selected=true]:bg-primary/10 h-auto min-h-20 w-full justify-start border p-3 text-left"
                >
                  <span className="flex w-full min-w-0 items-start gap-3">
                    <Users size={18} className="text-default-500 mt-0.5 shrink-0" />
                    <span className="flex min-w-0 flex-1 flex-col gap-1">
                      <span className="flex min-w-0 items-center justify-between gap-2">
                        <span className="text-foreground text-sm font-semibold">Group only</span>
                        {displayVisibility === 'group_only' ? (
                          <CheckCircle2 size={16} className="text-primary shrink-0" />
                        ) : null}
                      </span>
                      <span className="text-default-500 text-xs leading-relaxed">
                        Visible inside this workspace.
                      </span>
                    </span>
                  </span>
                </ToggleButton>
                <ToggleButton
                  id="public"
                  aria-label="Set visibility to public directory"
                  className="rounded-large border-divider bg-content1 data-[selected=true]:border-accent/60 data-[selected=true]:bg-accent/10 h-auto min-h-20 w-full justify-start border p-3 text-left"
                >
                  <span className="flex w-full min-w-0 items-start gap-3">
                    <Globe2 size={18} className="text-accent mt-0.5 shrink-0" />
                    <span className="flex min-w-0 flex-1 flex-col gap-1">
                      <span className="flex min-w-0 items-center justify-between gap-2">
                        <span className="text-foreground text-sm font-semibold">
                          Public directory
                        </span>
                        {displayVisibility === 'public' ? (
                          <CheckCircle2 size={16} className="text-accent shrink-0" />
                        ) : null}
                      </span>
                      <span className="text-default-500 text-xs leading-relaxed">
                        Discoverable by groups in your league.
                      </span>
                    </span>
                  </span>
                </ToggleButton>
              </ToggleButtonGroup>

              {visibilityPending ? (
                <div className="text-default-500 flex items-center gap-2 text-xs">
                  <Spinner color="current" size="sm" />
                  Updating visibility...
                </div>
              ) : (
                <p className="mt-1 text-sm text-default-500">
                  Public characters can appear in the directory for other groups in your league.
                </p>
              )}
            </div>
          </div>
        ) : null}
        <div className="rounded-large border border-divider bg-default-50/60 p-4">
          <SectionTitle title={selectionTitle} subtitle={selectionSubtitle} />
          <div className="mt-3 flex flex-wrap items-center gap-2">
            <Chip size="sm" color="accent" variant="soft">
              {profile.character_name}
            </Chip>
            <Chip size="sm" color="accent" variant="soft">
              Last synced {formatRelativeTimestamp(profile.last_synced_at)}
            </Chip>
            {profile.class && <Chip size="sm" variant="soft">{profile.class}</Chip>}
            {ascendancy && (
              <Chip size="sm" variant="soft" color="accent">
                {ascendancy}
              </Chip>
            )}
            {alternateAscendancy && (
              <Chip size="sm" variant="soft" color="warning">
                Bloodline {alternateAscendancy}
              </Chip>
            )}
            {clusterJewelCount > 0 ? (
              <Chip size="sm" variant="soft" color="accent">
                {clusterJewelCount} cluster jewel{clusterJewelCount === 1 ? '' : 's'}
              </Chip>
            ) : null}
            {profile.level != null && (
              <Chip size="sm" variant="soft">
                Level {profile.level}
              </Chip>
            )}
          </div>
        </div>

        <div className="grid gap-4 xl:grid-cols-[minmax(0,2.2fr)_minmax(18rem,1fr)]">
          <div className="flex flex-col gap-4">
            <div className="rounded-large border border-divider bg-default-50/60 p-4">
              <div className="flex flex-wrap items-start justify-between gap-3">
                <SectionTitle
                  title="Equipped gear"
                  subtitle="Hover an item to inspect it like a game tooltip"
                />
                <NativeCheckbox
                  id="show-weapon-swap"
                  isSelected={showWeaponSwap}
                  onChange={setShowWeaponSwap}
                >
                  Show weapon swap
                </NativeCheckbox>
              </div>
              <div className="mt-3">
                <EquipmentLayout gear={profile.gear} showWeaponSwap={showWeaponSwap} />
              </div>
            </div>

            <JewelStrip items={profile.jewels} />
          </div>

          <div className="flex flex-col gap-4">
            <TreeSection
              title="Passive tree"
              hashCount={profile.passive_tree.hashes.length}
              url={passiveTreeUrl}
              subtitle="Stored from the character detail sync"
              linkHint={passiveTreeLinkHint}
            />
            {capabilities?.supportsProfileAtlasTree ? (
              <TreeSection
                title="Atlas tree"
                hashCount={atlasHashes.length}
                url={atlasTreeUrl}
                subtitle="Account atlas snapshot for this league"
                linkHint={atlasTreeLinkHint}
              />
            ) : (
              <div className="rounded-large border border-divider bg-default-50/60 p-4">
                <p className="text-foreground text-sm font-medium">Atlas tree unavailable</p>
                <p className="text-default-500 mt-1 text-sm">
                  This workspace is running in PoE2 mode, so atlas tree data stays hidden until
                  we add a dedicated PoE2 profile model.
                </p>
              </div>
            )}
            {isMe && canSync && (
              <div className="rounded-large border border-primary/25 bg-primary/5 p-4">
                <div className="flex items-start gap-2">
                  <Sparkles size={16} className="text-primary mt-0.5 shrink-0" />
                  <div>
                    <p className="text-foreground text-sm font-medium">
                      Detail snapshots refresh in the background
                    </p>
                    <p className="text-default-500 mt-1 text-sm">
                      Your card shows the last successfully stored character profile, not a live
                      read from Path of Exile.
                    </p>
                  </div>
                </div>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  )
}
