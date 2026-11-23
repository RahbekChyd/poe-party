import { useEffect, useRef, useState, type FormEvent } from 'react'
import { Button } from '@heroui/react/button'
import { Modal } from '@heroui/react/modal'
import { Spinner } from '@heroui/react/spinner'
import { useNavigate } from '@tanstack/react-router'
import { zodResolver } from '@hookform/resolvers/zod'
import { useForm } from 'react-hook-form'
import { useCreateStrategy } from '../../hooks/useStrategies'
import type { ThreadMarket } from '../../hooks/useThreadData'
import { StrategyAtlasField, StrategyBasicsFields, StrategyMapFields } from './StrategyFormFields'
import { StrategyThreadFields } from './StrategyThreadFields'
import {
  EMPTY_STRATEGY,
  strategyFormSchema,
  threadLimitError,
  type StrategyFormInput,
  type StrategyFormValues,
} from './strategy-form'

const STEPS = ['Basics', 'Map setup', 'Threads'] as const

interface Props {
  isOpen: boolean
  onClose: () => void
  groupId: string
  supportsMapSetup: boolean
  threadMarket: ThreadMarket
}

export function CreateStrategyModal({ isOpen, onClose, groupId, supportsMapSetup, threadMarket }: Props) {
  const create = useCreateStrategy()
  const navigate = useNavigate()
  const [step, setStep] = useState(0)
  const headingRef = useRef<HTMLHeadingElement>(null)
  const bodyRef = useRef<HTMLDivElement>(null)
  const submitting = useRef(false)
  const stepTitle = STEPS[step]
  const isFinalStep = !supportsMapSetup || step === STEPS.length - 1

  const { control, handleSubmit, reset, setError, trigger, formState: { errors } } = useForm<
    StrategyFormInput, unknown, StrategyFormValues
  >({
    resolver: zodResolver(strategyFormSchema),
    defaultValues: EMPTY_STRATEGY,
  })

  useEffect(() => {
    if (!isOpen) return
    const frame = requestAnimationFrame(() => {
      if (bodyRef.current) bodyRef.current.scrollTop = 0
      headingRef.current?.focus()
    })
    return () => cancelAnimationFrame(frame)
  }, [isOpen, step])

  function close() {
    submitting.current = false
    create.reset()
    reset()
    setStep(0)
    onClose()
  }

  function save(values: StrategyFormValues) {
    if (submitting.current) return
    const limitError = threadLimitError(values.threads)
    if (limitError) {
      setError('root.threadLimit', { type: 'validate', message: limitError })
      return
    }

    submitting.current = true
    create.mutate(
      {
        group_id: groupId,
        colour: '#6366f1',
        name: values.name,
        description: values.description?.trim() || null,
        difficulty: values.difficulty,
        ...(supportsMapSetup ? {
          atlas_tree_url: values.atlas_tree_url?.trim() || null,
          map_trade_link: values.map_trade_link?.trim() || null,
          map_cost: values.map_cost ?? null,
          map_requirements: values.map_requirements,
          threads: values.threads,
        } : {}),
      },
      {
        onSuccess: (data) => {
          close()
          void navigate({
            to: '/dashboard/strategies/$strategyId',
            params: { strategyId: data.id },
          })
        },
        onError: () => {
          submitting.current = false
        },
      },
    )
  }

  async function submitStep(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (isFinalStep) {
      await handleSubmit(save)(event)
      return
    }
    const fields = step === 0
      ? (['name', 'description', 'difficulty'] as const)
      : (['atlas_tree_url', 'map_trade_link', 'map_cost', 'map_requirements'] as const)
    if (await trigger(fields, { shouldFocus: true })) setStep(step + 1)
  }

  return (
    <Modal.Backdrop
      isOpen={isOpen}
      onOpenChange={(open) => {
        if (!open && !submitting.current) close()
      }}
      isDismissable={false}
      isKeyboardDismissDisabled={create.isPending}
    >
      <Modal.Container>
        <Modal.Dialog className="max-h-[calc(100dvh-2rem)] overflow-hidden sm:max-w-xl">
          <form className="flex min-h-0 min-w-0 flex-col" noValidate onSubmit={submitStep}>
            <Modal.Header>
              <Modal.Heading>Create strategy</Modal.Heading>
            </Modal.Header>
            <Modal.Body ref={bodyRef} className="min-h-0 gap-4 overflow-y-auto overscroll-contain">
              {supportsMapSetup ? (
                <div className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-1">
                  <h3 tabIndex={-1} ref={headingRef} className="text-base font-semibold">{stepTitle}</h3>
                  <span className="text-default-500 text-xs">Step {step + 1} of {STEPS.length}</span>
                </div>
              ) : null}
              <fieldset disabled={create.isPending} className="flex min-w-0 flex-col gap-4">
                {step === 0 ? <StrategyBasicsFields control={control} errors={errors} /> : null}
                {step === 1 ? (
                  <>
                    <p className="text-default-600 text-sm">Add any map details you have. You can fill them in later.</p>
                    <StrategyAtlasField control={control} />
                    <StrategyMapFields control={control} errors={errors} />
                  </>
                ) : null}
                {step === 2 ? (
                  <StrategyThreadFields control={control} errors={errors} market={threadMarket} />
                ) : null}
              </fieldset>
            </Modal.Body>
            <Modal.Footer className="flex flex-wrap items-center gap-2">
              {create.isError ? (
                <p role="alert" className="text-danger w-full text-sm">
                  Could not create the strategy. Your draft is still here. Try again.
                </p>
              ) : null}
              <Button type="button" variant="tertiary" className="mr-auto" onPress={close} isDisabled={create.isPending}>
                Cancel
              </Button>
              {step > 0 ? (
                <Button
                  type="button"
                  variant="secondary"
                  isDisabled={create.isPending}
                  onPress={() => {
                    create.reset()
                    setStep(step - 1)
                  }}
                >
                  Back
                </Button>
              ) : null}
              <Button type="submit" isPending={create.isPending}>
                {create.isPending ? <Spinner color="current" size="sm" /> : null}
                {isFinalStep ? 'Create strategy' : 'Next'}
              </Button>
            </Modal.Footer>
          </form>
        </Modal.Dialog>
      </Modal.Container>
    </Modal.Backdrop>
  )
}
