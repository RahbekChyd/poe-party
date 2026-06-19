import { Button } from '@heroui/react/button'
import { Modal } from '@heroui/react/modal'
import { Spinner } from '@heroui/react/spinner'
import type { LegacyStashTab } from '../../lib/poe-cookie-client'
import { NativeCheckbox } from '../ui/heroui-native'

export const MAX_STASH_TABS = 5

interface Props {
  isOpen: boolean
  isFetchingTabs: boolean
  tabs: LegacyStashTab[]
  selectedIds: string[]
  onSelectionChange: (ids: string[]) => void
  onConfirm: () => void
  onCancel: () => void
  error?: string | null
}

export function StashTabSelectorModal({
  isOpen,
  isFetchingTabs,
  tabs,
  selectedIds,
  onSelectionChange,
  onConfirm,
  onCancel,
  error,
}: Props) {
  const atLimit = selectedIds.length >= MAX_STASH_TABS

  const toggle = (id: string) => {
    if (selectedIds.includes(id)) {
      onSelectionChange(selectedIds.filter((x) => x !== id))
    } else if (!atLimit) {
      onSelectionChange([...selectedIds, id])
    }
  }

  const allSelected =
    tabs.length > 0 && selectedIds.length === Math.min(tabs.length, MAX_STASH_TABS)
  const toggleAll = () =>
    onSelectionChange(allSelected ? [] : tabs.slice(0, MAX_STASH_TABS).map((tab) => tab.id))

  return (
    <>
      <Modal.Backdrop
        isOpen={isOpen}
        onOpenChange={(open) => {
          if (!open) onCancel()
        }}
      >
        <Modal.Container>
          <Modal.Dialog>
            <Modal.Header className="flex flex-col gap-1">
              <Modal.Heading>Select stash tabs</Modal.Heading>
              <span className="text-default-500 text-sm font-normal">
                Choose up to <strong className="text-foreground">{MAX_STASH_TABS}</strong> tabs to
                include in the snapshot
              </span>
            </Modal.Header>

            <Modal.Body>
              {isFetchingTabs ? (
                <div className="flex items-center justify-center py-8">
                  <Spinner size="md" />
                </div>
              ) : error ? (
                <p className="text-danger py-4 text-center text-sm">{error}</p>
              ) : tabs.length === 0 ? (
                <p className="text-default-400 py-4 text-center text-sm">No stash tabs found.</p>
              ) : (
                <div className="flex flex-col gap-1">
                  <div className="border-divider mb-1 border-b pb-2">
                    <NativeCheckbox
                      id="stash-tab-select-all"
                      isSelected={allSelected}
                      onChange={toggleAll}
                    >
                      <span className="text-sm font-medium">
                        {allSelected ? 'Deselect all' : 'Select all'}
                      </span>
                    </NativeCheckbox>
                  </div>

                  {tabs.map((tab) => {
                    const { r = 128, g = 128, b = 128 } = tab.colour ?? {}
                    const swatch = `rgb(${r},${g},${b})`
                    return (
                      <NativeCheckbox
                        key={tab.id}
                        id={`stash-tab-${tab.id}`}
                        isSelected={selectedIds.includes(tab.id)}
                        isDisabled={!selectedIds.includes(tab.id) && atLimit}
                        onChange={() => toggle(tab.id)}
                      >
                        <div className="flex items-center gap-2">
                          <span
                            className="inline-block h-3 w-3 shrink-0 rounded-sm"
                            style={{ backgroundColor: swatch }}
                          />
                          <span className="text-sm">{tab.n}</span>
                          <span className="text-default-400 text-xs">{tab.type}</span>
                        </div>
                      </NativeCheckbox>
                    )
                  })}
                </div>
              )}
            </Modal.Body>

            <Modal.Footer className="flex-col gap-2">
              <div className="flex w-full items-center justify-between">
                <span
                  className={`text-sm font-medium ${atLimit ? 'text-warning' : 'text-default-500'}`}
                >
                  {selectedIds.length} / {MAX_STASH_TABS} tabs selected
                </span>
                <div className="flex gap-2">
                  <Button variant="tertiary" size="sm" onPress={onCancel}>
                    Cancel
                  </Button>
                  <Button
                    size="sm"
                    isDisabled={selectedIds.length === 0 || isFetchingTabs}
                    onPress={onConfirm}
                  >
                    Sync {selectedIds.length > 0 ? `(${selectedIds.length})` : ''}
                  </Button>
                </div>
              </div>
            </Modal.Footer>
          </Modal.Dialog>
        </Modal.Container>
      </Modal.Backdrop>
    </>
  )
}
