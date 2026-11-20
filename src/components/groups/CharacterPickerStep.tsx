import { Button } from '@heroui/react/button'
import { Modal } from '@heroui/react/modal'
import { Spinner } from '@heroui/react/spinner'
import { Check } from 'lucide-react'
import { useState, useEffect, useRef } from 'react'
import { useQuery } from '@tanstack/react-query'
import { supabase } from '../../lib/supabase'
import { useMyCharacters, useSetActiveCharacter } from '../../hooks/useCharacters'
import { useCharacterSyncFlow } from '../../hooks/useCharacterSyncFlow'
interface Props {
  groupId: string
  onDone: () => void
}

export function CharacterPickerStep({ groupId, onDone }: Props) {
  const { triggerSync, canSync } = useCharacterSyncFlow(groupId)
  const [syncing, setSyncing] = useState(false)
  const syncAttempted = useRef(false)

  const { data: groupMeta, isError: groupError, isLoading: groupLoading, refetch: retryGroup } = useQuery({
    queryKey: ['group-meta', groupId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('groups')
        .select('league, game')
        .eq('id', groupId)
        .single()
      if (error) throw error
      return data
    },
  })

  const groupLeague = groupMeta?.league ?? null
  const groupGame = groupMeta?.game ?? 'poe1'
  const { data: characters, isLoading, isError, refetch } = useMyCharacters(groupMeta ? groupId : null, groupLeague)
  const { mutate: setActive, isPending, isError: selectionError } = useSetActiveCharacter()
  const [selected, setSelected] = useState<string | null>(null)

  useEffect(() => {
    if (!characters?.length) {
      setSelected(null)
      return
    }

    if (selected && characters.some((char) => char.id === selected)) return

    const activeCharacter = characters.find((char) => char.is_active)
    setSelected(activeCharacter?.id ?? (characters.length === 1 ? characters[0].id : null))
  }, [characters, selected])

  // Auto-sync characters when the step mounts if PoE account access is available.
  useEffect(() => {
    if (!canSync || !groupMeta || syncAttempted.current) return
    syncAttempted.current = true
    setSyncing(true)
    triggerSync(groupId)
      .then(() => refetch())
      .catch((e) => console.error('Auto character sync failed:', e))
      .finally(() => setSyncing(false))
  }, [canSync, groupId, groupMeta, refetch, triggerSync])

  const selectedCharacterId = selected ?? characters?.find((char) => char.is_active)?.id ?? null

  function handleConfirm() {
    if (!selectedCharacterId) return
    setActive({ characterId: selectedCharacterId, groupId }, { onSuccess: onDone })
  }

  return (
    <>
      <Modal.Header>
        <Modal.Heading>Choose Your Character</Modal.Heading>
        <p className="text-default-500 text-xs">Step 2 of 2 · Character</p>
      </Modal.Header>
      <Modal.Body className="min-h-0 gap-3 overflow-y-auto">
        <p className="text-default-500 text-sm">
          Select the character you'll be playing in this group.
          {groupLeague && (
            <span className="text-default-400">
              {' '}Showing {groupLeague} {groupGame === 'poe2' ? 'PoE2' : 'PoE1'} characters.
            </span>
          )}
        </p>
        {groupError || isError ? (
          <div className="flex flex-wrap items-center gap-2" role="alert">
            <p className="text-danger text-sm">Couldn’t load characters.</p>
            <Button size="sm" variant="tertiary" onPress={() => void (groupError ? retryGroup() : refetch())}>
              Try again
            </Button>
          </div>
        ) : isLoading || syncing || groupLoading ? (
          <div className="flex flex-col items-center gap-2 py-6">
            <Spinner size="sm" />
            {syncing && (
              <p className="text-default-400 text-xs">Syncing characters from PoE…</p>
            )}
          </div>
        ) : !characters?.length ? (
          <p className="text-default-400 py-4 text-center text-sm">
            {groupLeague
              ? `No characters found in ${groupLeague}. You can sync again from the workspace.`
              : 'No characters found. You can sync again from the workspace.'}
          </p>
        ) : (
          <div className="flex max-h-64 flex-col gap-2 overflow-y-auto">
            {characters.map((char) => {
              const isSelected = selectedCharacterId === char.id
              return (
                <button
                  key={char.id}
                  type="button"
                  onClick={() => setSelected(char.id)}
                  aria-pressed={isSelected}
                  className={[
                    'flex items-center gap-3 rounded-large border-2 px-4 py-3 text-left transition-colors',
                    isSelected
                      ? 'border-primary bg-primary/10'
                      : 'border-default-200 hover:border-default-400',
                  ].join(' ')}
                >
                  <div className="min-w-0 flex-1">
                    <p className="text-foreground text-sm font-medium wrap-anywhere">{char.name}</p>
                    <p className="text-default-400 text-xs">
                      {char.class} · Level {char.level}
                    </p>
                  </div>
                  {isSelected && <Check size={16} className="text-primary shrink-0" />}
                </button>
              )
            })}
          </div>
        )}
        {selectionError && <p role="alert" className="text-danger text-sm">Couldn’t select the character. Try again.</p>}
      </Modal.Body>
      <Modal.Footer>
        <Button variant="tertiary" isDisabled={isPending} onPress={onDone}>
          Choose later
        </Button>
        <Button
          isPending={isPending}
          isDisabled={!selectedCharacterId || groupLoading || groupError || syncing}
          onPress={handleConfirm}
        >
          {({ isPending }) => (
            <>
              {isPending ? <Spinner color="current" size="sm" /> : null}
              Confirm
            </>
          )}
        </Button>
      </Modal.Footer>
    </>
  )
}
