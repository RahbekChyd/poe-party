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

  const { data: groupMeta } = useQuery({
    queryKey: ['group-meta', groupId],
    queryFn: async () => {
      const { data } = await supabase
        .from('groups')
        .select('league, game')
        .eq('id', groupId)
        .single()
      return {
        league: data?.league ?? null,
        game: data?.game ?? 'poe1',
      }
    },
  })

  const groupLeague = groupMeta?.league ?? null
  const groupGame = groupMeta?.game ?? 'poe1'
  const { data: characters, isLoading, refetch } = useMyCharacters(groupId, groupLeague)
  const { mutate: setActive, isPending } = useSetActiveCharacter()
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
    if (!canSync || !groupId || syncAttempted.current) return
    syncAttempted.current = true
    setSyncing(true)
    triggerSync(groupId)
      .then(() => refetch())
      .catch((e) => console.error('Auto character sync failed:', e))
      .finally(() => setSyncing(false))
  }, [canSync, groupId, refetch, triggerSync])

  const selectedCharacterId = selected ?? characters?.find((char) => char.is_active)?.id ?? null

  function handleConfirm() {
    if (!selectedCharacterId) return
    setActive({ characterId: selectedCharacterId, groupId }, { onSuccess: onDone })
  }

  return (
    <>
      <Modal.Header>
        <Modal.Heading>Choose Your Character</Modal.Heading>
      </Modal.Header>
      <Modal.Body className="max-h-[min(80vh,40rem)] overflow-y-auto gap-3">
        <p className="text-default-500 text-sm">
          Select the character you'll be playing in this group.
          {groupLeague && (
            <span className="text-default-400">
              {' '}Showing {groupLeague} {groupGame === 'poe2' ? 'PoE2' : 'PoE1'} characters.
            </span>
          )}
        </p>
        {isLoading || syncing || groupLeague === undefined ? (
          <div className="flex flex-col items-center gap-2 py-6">
            <Spinner size="sm" />
            {syncing && (
              <p className="text-default-400 text-xs">Syncing characters from PoE…</p>
            )}
          </div>
        ) : !characters?.length ? (
          <p className="text-default-400 py-4 text-center text-sm">
            {groupLeague
              ? `No ${groupLeague} characters found — sync your account to see characters for this league.`
              : 'No characters found — sync your account to get started.'}
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
                  className={[
                    'flex items-center gap-3 rounded-large border-2 px-4 py-3 text-left transition-colors',
                    isSelected
                      ? 'border-primary bg-primary/10'
                      : 'border-default-200 hover:border-default-400',
                  ].join(' ')}
                >
                  <div className="flex-1">
                    <p className="text-foreground text-sm font-medium">{char.name}</p>
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
      </Modal.Body>
      <Modal.Footer>
        <Button
          isPending={isPending}
          isDisabled={!selectedCharacterId}
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
