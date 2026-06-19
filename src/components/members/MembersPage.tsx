import { useEffect, useMemo, useState } from 'react'
import { Button } from '@heroui/react/button'
import { Card } from '@heroui/react/card'
import { Chip } from '@heroui/react/chip'
import { Description } from '@heroui/react/description'
import { Dropdown } from '@heroui/react/dropdown'
import { Label } from '@heroui/react/label'
import { Popover } from '@heroui/react/popover'
import { Spinner } from '@heroui/react/spinner'
import { Check, Copy } from 'lucide-react'
import {
  useActiveGroupContext,
  useGroupMembers,
  useIsSoloGroup,
  useMyGroupRole,
  useUpdateAvatarColor,
  useUpdateMemberRole,
  useUpdatePobCodes,
} from '../../hooks/useGroups'
import { useActiveCharacters, useLatestSnapshots } from '../../hooks/useSnapshots'
import { useMyCharacters, useSetActiveCharacter } from '../../hooks/useCharacters'
import { useCharacterSyncFlow } from '../../hooks/useCharacterSyncFlow'
import { formatRelativeTimestamp, getAscendancyLabel } from '../../lib/character-profile'
import { getPoePortraitImagePath } from '../../lib/poe-class-art'
import {
  useCharacterProfileDailySnapshotDetail,
  useCharacterProfileDailySnapshotSummaries,
  useCharacterProfiles,
  useUpdateCharacterProfileVisibility,
} from '../../hooks/useCharacterProfiles'
import { getAvatarColor, snapshotAge } from '../../lib/utils'
import { useGroupStore } from '../../store/group-store'
import { useCurrentUser } from '../../hooks/useCurrentUser'
import { AVATAR_COLORS, ROLE_CHIP } from '../../lib/constants'
import { MemberCardsSkeleton } from '../layout/Skeletons'
import { MemberCharacterDetails } from './MemberCharacterDetails'
import { AscendancyArt } from '../shared/AscendancyArt'
import { DropdownCaret, FieldInput, ListBox, SelectField, UserAvatar } from '../ui/heroui-native'
import { DashboardPage, DashboardPageHeader } from '../ui/dashboard'

type NativeChipColor = 'default' | 'accent' | 'success' | 'warning' | 'danger'

function toNativeChipColor(color: string): NativeChipColor {
  return color === 'primary' ? 'accent' : (color as NativeChipColor)
}

function OtherPobSection({
  pob_code,
  pob_support_code,
}: {
  pob_code: string | null
  pob_support_code: string | null
}) {
  if (!pob_code && !pob_support_code) return null
  return (
    <div className="flex flex-wrap items-center">
      <div className="flex min-w-0 flex-1 flex-wrap items-center gap-1.5">
        {pob_code && (
          <FieldInput
            size="sm"
            label="PoB"
            value={pob_code}
            isReadOnly
            className="w-[40%] min-w-[13rem]"
            endContent={
              <Button
                isIconOnly
                aria-label="Copy PoB import code"
                size="sm"
                variant="tertiary"
                onPress={() => navigator.clipboard.writeText(pob_code)}
              >
                <Copy size={12} />
              </Button>
            }
          />
        )}
        {pob_support_code && (
          <FieldInput
            size="sm"
            label="Party support PoB"
            value={pob_support_code}
            isReadOnly
            className="w-[40%] min-w-[13rem]"
            endContent={
              <Button
                isIconOnly
                aria-label="Copy party support PoB import code"
                size="sm"
                variant="tertiary"
                onPress={() => navigator.clipboard.writeText(pob_support_code)}
              >
                <Copy size={12} />
              </Button>
            }
          />
        )}
      </div>
    </div>
  )
}

function MyPobSection({
  pob_code,
  pob_support_code,
  isSolo,
}: {
  pob_code: string | null
  pob_support_code: string | null
  isSolo: boolean
}) {
  const [pobCode, setPobCode] = useState(pob_code ?? '')
  const [pobSupportCode, setPobSupportCode] = useState(pob_support_code ?? '')
  const { mutate: savePob, isPending } = useUpdatePobCodes()

  useEffect(() => {
    setPobCode(pob_code ?? '')
    setPobSupportCode(pob_support_code ?? '')
  }, [pob_code, pob_support_code])

  const isDirty = pobCode !== (pob_code ?? '') || pobSupportCode !== (pob_support_code ?? '')

  const handleBlurSave = () => {
    if (!isDirty || isPending) return
    savePob({ pob_code: pobCode || null, pob_support_code: pobSupportCode || null })
  }

  return (
    <div className="flex flex-col gap-1">
      {!isSolo && (
        <p className="text-default-500 text-xs">
          Party support PoB is for your support character used in group play — not your solo
          character(s). Other members can add it as a party buff source in the Analyzer.
        </p>
      )}
      <div className="flex flex-wrap gap-1">
        <FieldInput
          size="sm"
          label="PoB"
          placeholder="Import code"
          value={pobCode}
          onValueChange={setPobCode}
          onBlur={handleBlurSave}
          className="max-w-90 min-w-40 flex-1"
        />
        {!isSolo && (
          <FieldInput
            size="sm"
            label="Party support PoB"
            placeholder="Support character"
            value={pobSupportCode}
            onValueChange={setPobSupportCode}
            onBlur={handleBlurSave}
            className="max-w-90 min-w-40 flex-1"
          />
        )}
      </div>
    </div>
  )
}

export function MembersPage() {
  const activeGroupId = useGroupStore((s) => s.activeGroupId)
  const isSolo = useIsSoloGroup(activeGroupId)
  const { game, league: activeLeague } = useActiveGroupContext()
  const { data: members, isLoading } = useGroupMembers(activeGroupId)
  const { data: snapshots } = useLatestSnapshots(activeGroupId)
  const { data: characters } = useActiveCharacters(activeGroupId)
  const { data: characterProfiles, isLoading: profilesLoading } =
    useCharacterProfiles(activeGroupId)
  const { data: myCharacters } = useMyCharacters(activeGroupId, activeLeague)
  const { mutate: setActive } = useSetActiveCharacter()
  const { triggerSync, isBusy, canSync } = useCharacterSyncFlow(activeGroupId)
  const { mutate: updateVisibility, isPending: visibilityPending } =
    useUpdateCharacterProfileVisibility()
  const myRole = useMyGroupRole(activeGroupId)
  const { mutate: updateRole } = useUpdateMemberRole()
  const { mutate: updateColor } = useUpdateAvatarColor()
  const { data: currentUser } = useCurrentUser()
  const currentUserId = currentUser?.id ?? null
  const [charPickerOpen, setCharPickerOpen] = useState(false)
  const [colorPickerUserId, setColorPickerUserId] = useState<string | null>(null)
  const [selectedUserId, setSelectedUserId] = useState<string | null>(null)
  const [selectedDailySnapshotId, setSelectedDailySnapshotId] = useState<string | null>(null)

  const handleCharPickerOpenChange = async (open: boolean) => {
    if (!open) {
      setCharPickerOpen(false)
      return
    }
    if (canSync && activeGroupId) await triggerSync(activeGroupId)
    setCharPickerOpen(true)
  }

  const snapshotByUser = Object.fromEntries((snapshots ?? []).map((s) => [s.user_id, s]))
  const charByUser = Object.fromEntries((characters ?? []).map((c) => [c.user_id, c]))
  useEffect(() => {
    if (!members?.length) {
      setSelectedUserId(null)
      return
    }

    if (selectedUserId && members.some((member) => member.user.id === selectedUserId)) {
      return
    }

    const myMember = members.find((member) => member.user.id === currentUserId)
    setSelectedUserId(myMember?.user.id ?? members[0].user.id)
  }, [activeGroupId, currentUserId, members, selectedUserId])

  const selectedMember = members?.find((member) => member.user.id === selectedUserId) ?? null
  const selectedChar = selectedMember ? charByUser[selectedMember.user.id] : null
  const selectedProfile = useMemo(() => {
    if (!selectedMember) return null

    const profilesForUser = (characterProfiles ?? []).filter(
      (profile) => profile.user_id === selectedMember.user.id,
    )
    if (selectedChar?.id) {
      return profilesForUser.find((profile) => profile.character_id === selectedChar.id) ?? null
    }
    return profilesForUser[0] ?? null
  }, [characterProfiles, selectedChar?.id, selectedMember])
  const selectedSnapshot = selectedMember ? snapshotByUser[selectedMember.user.id] : null
  const selectedAge = snapshotAge(selectedSnapshot?.completed_at ?? null)
  const isSelectedMe = selectedMember?.user.id === currentUserId
  const selectedRoleChip = selectedMember
    ? (ROLE_CHIP[selectedMember.role] ?? ROLE_CHIP.viewer)
    : null
  const selectedAscendancy = selectedChar
    ? getAscendancyLabel(selectedChar.class, selectedChar.ascendancy_class, game ?? 'poe1')
    : null
  const { data: selectedProfileDailySummaries = [], isLoading: profileHistoryLoading } =
    useCharacterProfileDailySnapshotSummaries(
      activeGroupId,
      selectedProfile?.id ?? null,
      selectedProfile?.character_id ?? null,
    )
  const { data: selectedHistoricalProfile, isLoading: selectedHistoricalProfileLoading } =
    useCharacterProfileDailySnapshotDetail(activeGroupId, selectedDailySnapshotId)

  useEffect(() => {
    if (!selectedProfileDailySummaries.length) {
      setSelectedDailySnapshotId(null)
      return
    }

    if (
      selectedDailySnapshotId &&
      selectedProfileDailySummaries.some((entry) => entry.id === selectedDailySnapshotId)
    ) {
      return
    }

    setSelectedDailySnapshotId(selectedProfileDailySummaries[0].id)
  }, [selectedDailySnapshotId, selectedProfileDailySummaries])

  const selectedDailySummary = useMemo(
    () =>
      selectedProfileDailySummaries.find((entry) => entry.id === selectedDailySnapshotId) ?? null,
    [selectedDailySnapshotId, selectedProfileDailySummaries],
  )
  const visibleProfile = selectedDailySummary ? selectedHistoricalProfile : selectedProfile
  const visibleProfileLoading =
    profilesLoading ||
    (!!selectedDailySummary && selectedHistoricalProfileLoading && !selectedHistoricalProfile)

  const formatSnapshotDateUtc = (snapshotDate: string) => `${snapshotDate} UTC`

  return (
    <DashboardPage>
      <DashboardPageHeader
        title={isSolo ? 'Characters' : 'Members'}
        eyebrow={isSolo ? 'Solo roster' : 'Party roster'}
        tone="accent"
        description={
          isSolo
            ? 'Your synced characters, stored build snapshots, and public-profile controls.'
            : 'Group members, active characters, stored build snapshots, and party build context.'
        }
      />

      {isLoading ? (
        <MemberCardsSkeleton />
      ) : (
        <div className="flex flex-col gap-4">
          <div className="-mx-1 overflow-x-auto pb-2">
            <div className="flex min-w-max gap-3 px-1">
              {members?.map((member) => {
                const snap = snapshotByUser[member.user.id]
                const char = charByUser[member.user.id]
                const age = snapshotAge(snap?.completed_at ?? null)
                const isMe = member.user.id === currentUserId
                const isSelected = member.user.id === selectedUserId
                const roleChip = ROLE_CHIP[member.role] ?? ROLE_CHIP.viewer
                const ascendancy = char
                  ? getAscendancyLabel(char.class, char.ascendancy_class, game ?? 'poe1')
                  : null
                const portraitImagePath = char
                  ? getPoePortraitImagePath(char.class, char.ascendancy_class, game ?? 'poe1')
                  : null

                return (
                  <Card
                    key={member.user.id}
                    className={`w-[18.5rem] shrink-0 border transition-all ${
                      isSelected ? 'border-primary/60 bg-primary/5' : 'border-transparent'
                    }`}
                  >
                    <Card.Content className="gap-4 p-4">
                      <div className="flex items-start justify-between gap-3">
                        <div className="flex min-w-0 items-center gap-3">
                          {isMe || myRole === 'admin' ? (
                            <Popover
                              isOpen={colorPickerUserId === member.user.id}
                              onOpenChange={(open) =>
                                setColorPickerUserId(open ? member.user.id : null)
                              }
                            >
                              <Popover.Trigger aria-label="Pick avatar color">
                                <button
                                  type="button"
                                  className="hover:ring-default-300 rounded-full ring-2 ring-transparent transition-all"
                                >
                                  <UserAvatar
                                    src={member.user.avatar_url ?? undefined}
                                    name={member.user.display_name ?? member.user.poe_account_name}
                                    size="sm"
                                    style={{
                                      backgroundColor: getAvatarColor(
                                        member.user.id,
                                        member.user.avatar_color,
                                      ),
                                    }}
                                  />
                                </button>
                              </Popover.Trigger>
                              <Popover.Content placement="bottom start" className="p-3">
                                <Popover.Dialog>
                                  <Popover.Heading className="text-foreground mb-2 text-xs font-medium">
                                    Pick a color
                                  </Popover.Heading>
                                  <div className="grid grid-cols-4 gap-2">
                                    {AVATAR_COLORS.map((color) => (
                                      <button
                                        key={color}
                                        type="button"
                                        aria-label={`Use avatar color ${color}`}
                                        className="h-7 w-7 rounded-full border-2 transition-transform hover:scale-110"
                                        style={{
                                          backgroundColor: color,
                                          borderColor:
                                            getAvatarColor(
                                              member.user.id,
                                              member.user.avatar_color,
                                            ) === color
                                              ? 'white'
                                              : 'transparent',
                                        }}
                                        onClick={() => {
                                          updateColor({ userId: member.user.id, color })
                                          setColorPickerUserId(null)
                                        }}
                                      />
                                    ))}
                                  </div>
                                </Popover.Dialog>
                              </Popover.Content>
                            </Popover>
                          ) : (
                            <UserAvatar
                              src={member.user.avatar_url ?? undefined}
                              name={member.user.display_name ?? member.user.poe_account_name}
                              size="sm"
                              style={{
                                backgroundColor: getAvatarColor(
                                  member.user.id,
                                  member.user.avatar_color,
                                ),
                              }}
                            />
                          )}

                          <div className="min-w-0">
                            <p className="text-foreground truncate text-sm font-medium">
                              {member.user.display_name ?? member.user.poe_account_name}
                              {isMe && (
                                <span className="text-default-400 ml-1.5 text-xs font-normal">
                                  (you)
                                </span>
                              )}
                            </p>
                            <p className="text-default-400 truncate text-xs">
                              {char
                                ? `${char.name} · Level ${char.level}`
                                : member.user.poe_account_name}
                            </p>
                          </div>
                        </div>

                        {isSelected && (
                          <Chip size="sm" color="accent" variant="soft">
                            Selected
                          </Chip>
                        )}
                      </div>

                      <button
                        type="button"
                        className="flex w-full flex-col gap-3 text-left"
                        onClick={() => setSelectedUserId(member.user.id)}
                      >
                        <AscendancyArt
                          ascendancy={ascendancy}
                          poeClass={char?.class ?? null}
                          imagePath={portraitImagePath}
                        />

                        <div className="flex flex-wrap gap-2">
                          <Chip size="sm" color={age.color} variant="soft">
                            {age.label}
                          </Chip>
                          <Chip size="sm" color={toNativeChipColor(roleChip.color)} variant="soft">
                            {roleChip.label}
                          </Chip>
                          {ascendancy && (
                            <Chip size="sm" variant="soft">
                              {ascendancy}
                            </Chip>
                          )}
                        </div>

                        <div className="flex items-center justify-between gap-3">
                          <p className="text-default-500 text-xs">
                            {char
                              ? `${char.class} · Level ${char.level}`
                              : 'No active character selected'}
                          </p>
                          <div className="text-default-400 flex items-center gap-1.5">
                            <Chip size="sm" variant="soft">
                              Gear
                            </Chip>
                            <Chip size="sm" variant="soft">
                              Tree
                            </Chip>
                          </div>
                        </div>
                      </button>
                    </Card.Content>
                  </Card>
                )
              })}
            </div>
          </div>

          {selectedMember && (
            <Card>
              <Card.Header className="flex flex-col gap-4 px-5 pt-5 pb-0">
                <div className="flex flex-col gap-3 xl:flex-row xl:items-start xl:justify-between">
                  <div className="flex min-w-0 items-start gap-3">
                    <UserAvatar
                      src={selectedMember.user.avatar_url ?? undefined}
                      name={
                        selectedMember.user.display_name ?? selectedMember.user.poe_account_name
                      }
                      size="md"
                      style={{
                        backgroundColor: getAvatarColor(
                          selectedMember.user.id,
                          selectedMember.user.avatar_color,
                        ),
                      }}
                    />
                    <div className="min-w-0 flex-1">
                      <h2 className="text-foreground truncate text-lg font-semibold">
                        {selectedMember.user.display_name ?? selectedMember.user.poe_account_name}
                        {isSelectedMe && (
                          <span className="text-default-400 ml-2 text-sm font-normal">(you)</span>
                        )}
                      </h2>
                      <p className="text-default-500 mt-1 truncate text-sm">
                        {selectedChar
                          ? `${selectedChar.name} · ${selectedChar.class} · Level ${selectedChar.level}`
                          : selectedMember.user.poe_account_name}
                      </p>
                    </div>
                  </div>

                  <div className="flex min-w-0 flex-col gap-2 sm:flex-row sm:items-center sm:justify-between xl:justify-end">
                    <div className="flex min-w-0 flex-wrap items-center gap-2">
                      <Chip className="shrink-0" size="sm" color={selectedAge.color} variant="soft">
                        {selectedAge.label}
                      </Chip>
                      {selectedRoleChip && (
                        <Chip
                          className="shrink-0"
                          size="sm"
                          color={toNativeChipColor(selectedRoleChip.color)}
                          variant="soft"
                        >
                          {selectedRoleChip.label}
                        </Chip>
                      )}
                      {selectedChar && (
                        <Chip className="shrink-0" size="sm" variant="soft">
                          {selectedChar.class}
                        </Chip>
                      )}
                      {selectedAscendancy && (
                        <Chip className="shrink-0" size="sm" variant="soft">
                          {selectedAscendancy}
                        </Chip>
                      )}
                    </div>

                    <div className="flex shrink-0 flex-wrap items-center gap-2 sm:justify-end">
                      {isSelectedMe && (canSync || (myCharacters && myCharacters.length > 0)) && (
                        <Dropdown isOpen={charPickerOpen} onOpenChange={handleCharPickerOpenChange}>
                          <Dropdown.Trigger
                            className="select__trigger h-10 min-h-10 min-w-44 items-center"
                            isDisabled={isBusy}
                          >
                            <span className="select__value min-w-0 truncate">
                              <span className="inline-flex min-w-0 items-center gap-2">
                                {isBusy ? (
                                  <Spinner
                                    color="current"
                                    size="sm"
                                    className="animate-spin-fast shrink-0"
                                  />
                                ) : null}
                                <span className="truncate">
                                  {selectedChar ? 'Change character' : 'Select character'}
                                </span>
                              </span>
                            </span>
                            <DropdownCaret className="select__indicator" />
                          </Dropdown.Trigger>
                          <Dropdown.Popover
                            placement="bottom end"
                            className="max-h-64 overflow-y-auto"
                          >
                            <Dropdown.Menu
                              aria-label="Your characters"
                              onAction={(key) => {
                                setActive({ characterId: key as string, groupId: activeGroupId! })
                                setCharPickerOpen(false)
                              }}
                            >
                              {(myCharacters ?? []).map((myCharacter) => (
                                <Dropdown.Item
                                  key={myCharacter.id}
                                  id={myCharacter.id}
                                  textValue={myCharacter.name}
                                >
                                  <div className="flex min-w-0 flex-1 flex-col">
                                    <Label>{myCharacter.name}</Label>
                                    <Description>
                                      {myCharacter.class} - Level {myCharacter.level}
                                    </Description>
                                  </div>
                                  {myCharacter.is_active ? (
                                    <Check size={14} className="text-accent shrink-0" />
                                  ) : null}
                                </Dropdown.Item>
                              ))}
                            </Dropdown.Menu>
                          </Dropdown.Popover>
                        </Dropdown>
                      )}

                      {myRole === 'admin' && !isSelectedMe && selectedMember.role !== 'admin' && (
                        <Dropdown>
                          <Dropdown.Trigger className="select__trigger h-9 min-h-9 min-w-36 items-center">
                            <span className="select__value min-w-0 truncate">
                              Role: {selectedRoleChip?.label ?? 'Permissions'}
                            </span>
                            <DropdownCaret className="select__indicator" />
                          </Dropdown.Trigger>
                          <Dropdown.Popover placement="bottom end">
                            <Dropdown.Menu
                              aria-label="Change member role"
                              selectionMode="single"
                              selectedKeys={[selectedMember.role]}
                              onAction={(key) => {
                                const role = key as 'editor' | 'viewer'
                                if (activeGroupId) {
                                  updateRole({
                                    groupId: activeGroupId,
                                    userId: selectedMember.user.id,
                                    role,
                                  })
                                }
                              }}
                            >
                              <Dropdown.Item id="editor" textValue="Editor">
                                <Dropdown.ItemIndicator />
                                <Label>Editor</Label>
                              </Dropdown.Item>
                              <Dropdown.Item id="viewer" textValue="Viewer">
                                <Dropdown.ItemIndicator />
                                <Label>Viewer</Label>
                              </Dropdown.Item>
                            </Dropdown.Menu>
                          </Dropdown.Popover>
                        </Dropdown>
                      )}
                    </div>
                  </div>
                </div>

                {(isSelectedMe ||
                  Boolean(selectedMember.user.pob_code) ||
                  Boolean(selectedMember.user.pob_support_code)) && (
                  <div className="w-full">
                    {isSelectedMe ? (
                      <MyPobSection
                        pob_code={selectedMember.user.pob_code}
                        pob_support_code={selectedMember.user.pob_support_code}
                        isSolo={isSolo}
                      />
                    ) : (
                      <OtherPobSection
                        pob_code={selectedMember.user.pob_code}
                        pob_support_code={selectedMember.user.pob_support_code}
                      />
                    )}
                  </div>
                )}
              </Card.Header>

              <Card.Content className="gap-4 p-0">
                <div className="flex flex-wrap items-center gap-3 px-5 pt-4">
                  <p className="text-default-500 text-xs">
                    Inspect equipped gear, passive tree, atlas tree, and synced build details for
                    the selected member.
                  </p>
                </div>

                {selectedProfile && (
                  <div className="px-5">
                    <div className="rounded-large border-divider bg-default-50/60 border p-4">
                      <div className="flex flex-wrap items-start justify-between gap-4">
                        <div>
                          <p className="text-foreground text-sm font-medium">Daily snapshots</p>
                          <p className="text-default-500 mt-1 text-sm">
                            Latest stored snapshot for each UTC day, available to your group even
                            when the profile is not public.
                          </p>
                        </div>
                        {selectedProfileDailySummaries.length > 0 ? (
                          <SelectField
                            aria-label="Select daily snapshot"
                            label="Snapshot day"
                            selectedKey={selectedDailySnapshotId ?? undefined}
                            onSelectionChange={(key) => {
                              setSelectedDailySnapshotId(typeof key === 'string' ? key : null)
                            }}
                            className="min-w-[15rem]"
                          >
                            {selectedProfileDailySummaries.map((entry) => (
                              <ListBox.Item
                                key={entry.id}
                                id={entry.id}
                                textValue={formatSnapshotDateUtc(entry.snapshot_date)}
                              >
                                {formatSnapshotDateUtc(entry.snapshot_date)}
                              </ListBox.Item>
                            ))}
                          </SelectField>
                        ) : (
                          <Chip size="sm" variant="soft">
                            {profileHistoryLoading ? 'Loading history...' : 'Latest profile only'}
                          </Chip>
                        )}
                      </div>

                      {selectedDailySummary ? (
                        <div className="mt-3 flex flex-wrap items-center gap-2">
                          <Chip size="sm" variant="soft">
                            Viewing {formatSnapshotDateUtc(selectedDailySummary.snapshot_date)}
                          </Chip>
                          <Chip size="sm" color="accent" variant="soft">
                            Synced {formatRelativeTimestamp(selectedDailySummary.last_synced_at)}
                          </Chip>
                          {selectedDailySummary.class ? (
                            <Chip size="sm" variant="soft">
                              {selectedDailySummary.class}
                              {selectedDailySummary.level != null
                                ? ` ${selectedDailySummary.level}`
                                : ''}
                            </Chip>
                          ) : null}
                        </div>
                      ) : null}
                    </div>
                  </div>
                )}

                <MemberCharacterDetails
                  profile={visibleProfile ?? null}
                  isPending={visibleProfileLoading}
                  isMe={isSelectedMe}
                  canSync={!!canSync}
                  visibility={selectedProfile?.visibility ?? null}
                  canToggleVisibility={isSelectedMe && !!selectedProfile && !!activeGroupId}
                  visibilityPending={visibilityPending}
                  selectionTitle={
                    selectedDailySummary ? 'Selected daily snapshot' : 'Selected character'
                  }
                  selectionSubtitle={
                    selectedDailySummary
                      ? `Latest stored snapshot captured on ${formatSnapshotDateUtc(selectedDailySummary.snapshot_date)}`
                      : 'Stored snapshot shown to your group'
                  }
                  onToggleVisibility={() => {
                    if (!activeGroupId || !selectedProfile) return
                    updateVisibility({
                      groupId: activeGroupId,
                      profileId: selectedProfile.id,
                      visibility: selectedProfile.visibility === 'public' ? 'group_only' : 'public',
                    })
                  }}
                />
              </Card.Content>
            </Card>
          )}
        </div>
      )}
    </DashboardPage>
  )
}
