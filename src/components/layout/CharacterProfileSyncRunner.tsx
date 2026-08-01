import { useEffect, useMemo, useRef } from 'react'
import { useGroupStore } from '../../store/group-store'
import { useCurrentUser, useMyProfile } from '../../hooks/useCurrentUser'
import { useActiveCharacters } from '../../hooks/useSnapshots'
import { useCharacterProfiles, useSyncCharacterProfile } from '../../hooks/useCharacterProfiles'
const PROFILE_FRESHNESS_MS = 15 * 60 * 1000

export function CharacterProfileSyncRunner() {
  const activeGroupId = useGroupStore((s) => s.activeGroupId)
  const { data: currentUser } = useCurrentUser()
  const { data: profile } = useMyProfile()
  const { data: activeCharacters } = useActiveCharacters(activeGroupId)
  const { data: characterProfiles } = useCharacterProfiles(activeGroupId)
  const { mutate: syncCharacterProfile, isPending } = useSyncCharacterProfile()
  const attemptedKeyRef = useRef<string | null>(null)

  const activeCharacter = useMemo(
    () => activeCharacters?.find((character) => character.user_id === currentUser?.id) ?? null,
    [activeCharacters, currentUser?.id],
  )
  const myCharacterProfile = useMemo(
    () =>
      characterProfiles?.find(
        (entry) =>
          entry.user_id === currentUser?.id && entry.character_id === activeCharacter?.id,
      ) ?? null,
    [activeCharacter?.id, characterProfiles, currentUser?.id],
  )

  useEffect(() => {
    const hasSyncAccess = !!profile?.poe_token_expires_at
    if (!activeGroupId || !currentUser?.id || !hasSyncAccess || !activeCharacter?.id) {
      return
    }

    const runKey = `${currentUser.id}:${activeGroupId}:${activeCharacter.id}`
    const lastSyncedAtMs = myCharacterProfile?.last_synced_at
      ? new Date(myCharacterProfile.last_synced_at).getTime()
      : Number.NaN
    const isFresh =
      myCharacterProfile?.character_id === activeCharacter.id &&
      Number.isFinite(lastSyncedAtMs) &&
      Date.now() - lastSyncedAtMs < PROFILE_FRESHNESS_MS

    if (isFresh) {
      attemptedKeyRef.current = runKey
      return
    }

    if (attemptedKeyRef.current === runKey || isPending) {
      return
    }

    attemptedKeyRef.current = runKey
    syncCharacterProfile(
      {
        groupId: activeGroupId,
        characterId: activeCharacter.id,
      },
      {
        onError: (error) => {
          console.error('Character profile sync failed:', error)
        },
      },
    )
  }, [
    activeCharacter?.id,
    activeGroupId,
    currentUser?.id,
    isPending,
    myCharacterProfile?.character_id,
    myCharacterProfile?.last_synced_at,
    profile?.poe_token_expires_at,
    syncCharacterProfile,
  ])

  return null
}
