import { useEffect, useMemo, useState } from 'react'
import { Button } from '@heroui/react/button'
import { Card } from '@heroui/react/card'
import { Chip } from '@heroui/react/chip'
import { Description } from '@heroui/react/description'
import { Dropdown } from '@heroui/react/dropdown'
import { Label } from '@heroui/react/label'
import { Popover } from '@heroui/react/popover'
import { Spinner } from '@heroui/react/spinner'
import { Check, ChevronDown, Copy } from 'lucide-react'
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
import { QueryStatePanel } from '../ui/QueryStatePanel'

function OtherPobSection({
  pob_code,
  pob_support_code,
}: {
  pob_code: string | null
  pob_support_code: string | null
}) {
  const [feedback, setFeedback] = useState('')

  async function copyCode(code: string, label: string) {
    try {
      await navigator.clipboard.writeText(code)
      setFeedback(`${label} copied`)
    } catch {
      setFeedback(`Couldn’t copy ${label}. Select and copy the code manually.`)
    }
  }

  if (!pob_code && !pob_support_code) return null
  return (
    <div className="flex min-w-0 flex-col gap-2">
      <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
        {pob_code && (
          <FieldInput
            size="sm"
            label="PoB"
            value={pob_code}
            isReadOnly
            className="min-w-0"
            endContent={
              <Button
                isIconOnly
                aria-label="Copy PoB import code"
                size="sm"
                variant="tertiary"
                onPress={() => void copyCode(pob_code, 'PoB code')}
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
            className="min-w-0"
            endContent={
              <Button
                isIconOnly
                aria-label="Copy party support PoB import code"
                size="sm"
                variant="tertiary"
                onPress={() => void copyCode(pob_support_code, 'Party support PoB code')}
              >
                <Copy size={12} />
              </Button>
            }
          />
        )}
      </div>
      <p className="text-default-600 text-xs" role="status">{feedback}</p>
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
  const [draft, setDraft] = useState<{ code: string; support: string } | null>(null)
  const { mutate: savePob, isPending, isError, isSuccess } = useUpdatePobCodes()
  const { code, support } = draft ?? { code: pob_code ?? '', support: pob_support_code ?? '' }

  const isDirty = code !== (pob_code ?? '') || support !== (pob_support_code ?? '')

  const handleSave = () => {
    if (!isDirty || isPending) return
    savePob({ pob_code: code || null, pob_support_code: support || null }, {
      onSuccess: () => setDraft(null),
    })
  }

  return (
    <div className="flex flex-col gap-1">
      {!isSolo && (
        <p className="text-default-500 text-xs">Party members can use your support build as a buff source in Analysis.</p>
      )}
      <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
        <FieldInput
          size="sm"
          label="PoB"
          placeholder="Import code"
          value={code}
          onValueChange={(value) => setDraft({ code: value, support })}
          isReadOnly={isPending}
          className="min-w-0"
        />
        {!isSolo && (
          <FieldInput
            size="sm"
            label="Party support PoB"
            placeholder="Support character"
            value={support}
            onValueChange={(value) => setDraft({ code, support: value })}
            isReadOnly={isPending}
            className="min-w-0"
          />
        )}
      </div>
      <div className="flex flex-wrap items-center gap-2">
        <Button size="sm" variant="secondary" onPress={handleSave} isDisabled={!isDirty} isPending={isPending}>
          {isPending ? 'Saving…' : 'Save PoB codes'}
        </Button>
        {isError && isDirty && <p role="alert" className="text-danger text-xs">Couldn’t save the codes. Try again.</p>}
        {isSuccess && !isDirty && <p role="status" className="text-success text-xs">PoB codes saved.</p>}
      </div>
    </div>
  )
}

export function MembersPage() {
  const activeGroupId = useGroupStore((s) => s.activeGroupId)
  const isSolo = useIsSoloGroup(activeGroupId)
  const { game, league: activeLeague } = useActiveGroupContext()
  const { data: members, isLoading, isError, refetch } = useGroupMembers(activeGroupId)
  const { data: snapshots } = useLatestSnapshots(activeGroupId)
  const { data: characters } = useActiveCharacters(activeGroupId)
  const { data: characterProfiles, isLoading: profilesLoading } =
    useCharacterProfiles(activeGroupId)
  const { data: myCharacters } = useMyCharacters(activeGroupId, activeLeague)
  const { mutate: setActive, isPending: selectingCharacter, isError: characterError } = useSetActiveCharacter()
  const { triggerSync, isBusy, canSync } = useCharacterSyncFlow(activeGroupId)
  const { mutate: updateVisibility, isPending: visibilityPending, isError: visibilityError } =
    useUpdateCharacterProfileVisibility()
  const myRole = useMyGroupRole(activeGroupId)
  const { mutate: updateRole, isPending: rolePending, isError: roleError } = useUpdateMemberRole()
  const { mutate: updateColor, isError: colorError } = useUpdateAvatarColor()
  const { data: currentUser } = useCurrentUser()
  const currentUserId = currentUser?.id ?? null
  const [charPickerOpen, setCharPickerOpen] = useState(false)
  const [characterSyncFailed, setCharacterSyncFailed] = useState(false)
  const [colorPickerUserId, setColorPickerUserId] = useState<string | null>(null)
  const [selectedUserId, setSelectedUserId] = useState<string | null>(null)
  const [selectedDailySnapshotId, setSelectedDailySnapshotId] = useState<string | null>(null)

  const handleCharPickerOpenChange = async (open: boolean) => {
    if (!open) {
      setCharPickerOpen(false)
      return
    }
    setCharPickerOpen(true)
    setCharacterSyncFailed(false)
    if (canSync && activeGroupId) {
      try {
        await triggerSync(activeGroupId)
      } catch {
        setCharacterSyncFailed(true)
      }
    }
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
        description={
          isSolo ? 'Synced characters, build history, and profile visibility.' : 'Party members, active characters, and build history.'
        }
      />

      {isLoading ? (
        <MemberCardsSkeleton />
      ) : isError && !members ? (
        <QueryStatePanel kind="error" title="Couldn’t load members" description="Try again to view your roster." onRetry={refetch} />
      ) : !members?.length ? (
        <QueryStatePanel kind="empty" title="No members yet" description="Members will appear here once they join." />
      ) : (
        <div className="flex flex-col gap-4">
          <div className="grid grid-cols-[repeat(auto-fill,min(100%,15rem))] gap-2">
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
                    className={`min-w-0 border p-0 transition-colors ${
                      isSelected ? 'border-highlight bg-selected' : 'border-divider'
                    }`}
                  >
                    <Card.Content className="gap-2 p-3">
                      <div className="flex items-start justify-between gap-3">
                        <div className="flex min-w-0 items-center gap-3">
                          {isMe || myRole === 'admin' ? (
                            <Popover
                              isOpen={colorPickerUserId === member.user.id}
                              onOpenChange={(open) =>
                                setColorPickerUserId(open ? member.user.id : null)
                              }
                            >
                              <Popover.Trigger<'button'>
                                aria-label="Pick avatar color"
                                render={(props) => <button {...props} type="button" />}
                                className="hover:ring-default-300 focus-visible:outline-primary rounded-full ring-2 ring-transparent focus-visible:outline-2 focus-visible:outline-offset-2"
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

                          <button
                            type="button"
                            className="focus-visible:outline-primary hover:bg-default-50 min-h-10 min-w-0 cursor-pointer rounded-md py-1 text-left focus-visible:outline-2 focus-visible:outline-offset-2"
                            aria-label={`View ${member.user.display_name ?? member.user.poe_account_name ?? 'member'}`}
                            aria-pressed={isSelected}
                            onClick={() => setSelectedUserId(member.user.id)}
                          >
                            <span className="text-foreground block text-sm font-medium wrap-anywhere">
                              {member.user.display_name ?? member.user.poe_account_name}
                              {isMe && (
                                <span className="text-default-400 ml-1.5 text-xs font-normal">
                                  (you)
                                </span>
                              )}
                            </span>
                            <span className="text-default-500 block text-xs wrap-anywhere">
                              {char
                                ? `${char.name} · Level ${char.level}`
                                : 'No active character'}
                            </span>
                          </button>
                        </div>

                        {isSelected && (
                          <Chip size="sm" variant="soft" className="text-highlight">
                            Selected
                          </Chip>
                        )}
                      </div>

                      <div className="flex flex-col gap-2">
                        {portraitImagePath && (
                          <AscendancyArt
                            ascendancy={ascendancy}
                            poeClass={char?.class ?? null}
                            imagePath={portraitImagePath}
                          />
                        )}

                        <div className="flex flex-wrap gap-2">
                          <Chip size="sm" color={age.color} variant="soft">
                            {age.label}
                          </Chip>
                          <Chip size="sm" variant="soft">
                            {roleChip.label}
                          </Chip>
                          {ascendancy && (
                            <Chip size="sm" variant="soft">
                              {ascendancy}
                            </Chip>
                          )}
                        </div>

                      </div>
                    </Card.Content>
                  </Card>
                )
              })}
          </div>

          {selectedMember && (
            <Card className="gap-0 p-0">
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
                      <h2 className="text-foreground wrap-anywhere text-lg font-semibold">
                        {selectedMember.user.display_name ?? selectedMember.user.poe_account_name}
                        {isSelectedMe && (
                          <span className="text-default-400 ml-2 text-sm font-normal">(you)</span>
                        )}
                      </h2>
                      <p className="text-default-500 wrap-anywhere mt-1 text-sm">
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
                          variant="soft"
                        >
                          {selectedRoleChip.label}
                        </Chip>
                      )}
                      {selectedProfile && (
                        <Chip className="shrink-0" size="sm" variant="soft">
                          {selectedProfile.visibility === 'public' ? 'Public profile' : 'Group-only profile'}
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
                            className="select__trigger h-10 min-h-10 max-w-full min-w-0 items-center"
                            isDisabled={isBusy || selectingCharacter}
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
                            className="max-h-64 max-w-[calc(100vw-2rem)] overflow-y-auto"
                          >
                            <Dropdown.Menu
                              aria-label="Your characters"
                              renderEmptyState={() => <p className="text-default-500 px-3 py-2 text-sm">No characters available.</p>}
                              onAction={(key) => {
                                if (activeGroupId) setActive({ characterId: String(key), groupId: activeGroupId })
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
                                    <Label className="wrap-anywhere">{myCharacter.name}</Label>
                                    <Description>
                                      {myCharacter.class} - Level {myCharacter.level}
                                    </Description>
                                  </div>
                                  {myCharacter.is_active ? (
                                    <Check size={14} className="text-highlight shrink-0" aria-hidden="true" />
                                  ) : null}
                                </Dropdown.Item>
                              ))}
                            </Dropdown.Menu>
                          </Dropdown.Popover>
                        </Dropdown>
                      )}

                      {myRole === 'admin' && !isSelectedMe && selectedMember.role !== 'admin' && (
                        <Dropdown>
                          <Dropdown.Trigger className="select__trigger h-9 min-h-9 min-w-0 items-center" isDisabled={rolePending}>
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

                {(characterError || roleError || colorError || visibilityError) && (
                  <p role="alert" className="text-danger text-sm">
                    {characterError ? 'Couldn’t change the character.' : roleError ? 'Couldn’t change the role.' : colorError ? 'Couldn’t update the avatar color.' : 'Couldn’t change profile visibility.'} Try again.
                  </p>
                )}
                {characterSyncFailed ? (
                  <p role="status" className="text-default-600 text-sm">
                    Could not refresh characters. You can select a saved character or reopen the picker to try again.
                  </p>
                ) : null}
                {(isSelectedMe ||
                  Boolean(selectedMember.user.pob_code) ||
                  Boolean(selectedMember.user.pob_support_code)) && (
                  <details className="border-divider group w-full border-t pt-3">
                    <summary className="text-foreground focus-visible:outline-primary flex min-h-10 w-fit cursor-pointer list-none items-center gap-2 rounded-md text-sm font-medium focus-visible:outline-2 focus-visible:outline-offset-2 [&::-webkit-details-marker]:hidden">
                      <ChevronDown size={14} className="-rotate-90 group-open:rotate-0" aria-hidden="true" />
                      Path of Building codes
                    </summary>
                    <div className="pb-2">
                      {isSelectedMe ? (
                        <MyPobSection
                          key={activeGroupId}
                          pob_code={selectedMember.user.pob_code}
                          pob_support_code={selectedMember.user.pob_support_code}
                          isSolo={isSolo}
                        />
                      ) : (
                        <OtherPobSection
                          key={selectedMember.user.id}
                          pob_code={selectedMember.user.pob_code}
                          pob_support_code={selectedMember.user.pob_support_code}
                        />
                      )}
                    </div>
                  </details>
                )}
              </Card.Header>

              <Card.Content className="gap-4 p-0">
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
                            className="min-w-0 sm:min-w-48"
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
                          <Chip size="sm" variant="soft">
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
