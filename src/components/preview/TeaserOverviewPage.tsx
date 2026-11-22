import { Card } from '@heroui/react/card'
import { Chip } from '@heroui/react/chip'
import { Link } from '@tanstack/react-router'
import {
  Area,
  AreaChart,
  CartesianGrid,
  ResponsiveContainer,
  Tooltip as RechartsTooltip,
  XAxis,
  YAxis,
} from 'recharts'
import { ArrowRight, Coins, Sword } from 'lucide-react'
import {
  previewGearSuggestions,
  previewHistory,
  previewLinkedSnapshot,
  previewMembers,
  previewStrategies,
  previewWorkspace,
} from '../../lib/preview-fixtures'
import { DIFFICULTY_CHIP, IMPORTANCE_CHIP, STATUS_COLOR } from '../../lib/constants'
import { formatCurrencyAmount } from '../../lib/utils'
import { formatWealthAxisTick } from '../../lib/wealth-history'
import { getPreviewItemImage } from '../../lib/preview-item-images'
import { UserAvatar } from '../ui/heroui-native'
import { RunOverviewData, RunSummary } from '../overview/RunSummary'
import { DashboardPage } from '../ui/dashboard'
import { PreviewPageIntro, UnlockCard } from './PreviewShared'
const divinePrice = 205
const sampleStrategy = previewStrategies[0]
const sampleSuggestion = previewGearSuggestions[0]
const sampleTarget = previewMembers.find((member) => member.id === sampleSuggestion.target_user_id)
const sampleSuggester = previewMembers.find(
  (member) => member.id === sampleSuggestion.suggester_user_id,
)
const sampleItemImage = getPreviewItemImage(sampleSuggestion.item_name)

export function TeaserOverviewPage() {
  const diffChip = DIFFICULTY_CHIP[sampleStrategy.difficulty]
  const importance = IMPORTANCE_CHIP[sampleSuggestion.importance]

  return (
    <DashboardPage className="@container">
      <PreviewPageIntro
        title="Overview"
        description="See a sample workspace with stash history, members, strategies, and gear suggestions."
      />

      <RunSummary
        strategy={(
          <>
            <p className="run-summary__strategy-name">{sampleStrategy.name}</p>
            <div className="text-default-500 flex flex-wrap items-center gap-x-3 gap-y-1 text-sm">
              <span className="flex items-center gap-1.5">
                <Coins size={14} aria-hidden="true" />
                ~{formatCurrencyAmount(sampleStrategy.map_cost, 'chaos')} per map
              </span>
              <Chip size="sm" variant="soft">{diffChip.label}</Chip>
            </div>
          </>
        )}
        resultTitle="Latest linked snapshot"
        result={(
          <>
            <p className="run-summary__amount">{formatCurrencyAmount(previewLinkedSnapshot.total_wealth_chaos, 'chaos')}</p>
            <time className="text-default-500 text-xs" dateTime={previewLinkedSnapshot.created_at}>
              {new Date(previewLinkedSnapshot.created_at).toLocaleString(undefined, {
                month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit',
              })}
            </time>
          </>
        )}
        action={(
          <Link to="/preview/economy" hash="strategy-results" className="button button--primary">
            View strategy results <ArrowRight size={16} aria-hidden="true" />
          </Link>
        )}
      />

      <RunOverviewData
        metrics={(
          <>
            <div className="min-w-0">
              <dt className="text-default-500 text-sm">Sample wealth</dt>
              <dd className="text-foreground mt-1 font-semibold wrap-anywhere tabular-nums">
                {formatCurrencyAmount(previewWorkspace.total_wealth_chaos, 'divine', divinePrice)}
              </dd>
            </div>
            <div className="min-w-0">
              <dt className="text-default-500 text-sm">Synced members</dt>
              <dd className="text-foreground mt-1 font-semibold tabular-nums">{previewWorkspace.synced_members}</dd>
            </div>
            <div className="min-w-0">
              <dt className="text-default-500 text-sm">Open gear suggestions</dt>
              <dd className="text-foreground mt-1 font-semibold tabular-nums">{previewWorkspace.open_gear_items}</dd>
            </div>
          </>
        )}

        history={(
          <Card className="min-w-0">
            <Card.Header>
              <div>
                <h2 className="text-foreground text-sm font-semibold">Sample wealth trend</h2>
                <p className="text-default-500 mt-1 text-sm">
                  Stash value in Chaos Orbs from recent snapshots.
                </p>
              </div>
            </Card.Header>
            <Card.Content>
              <ResponsiveContainer width="100%" height={220}>
                <AreaChart
                  title="Sample stash value in Chaos Orbs"
                  desc="Use the left and right arrow keys to read snapshot values."
                  data={previewHistory}
                  margin={{ top: 4, right: 12, left: 0, bottom: 0 }}
                >
                  <defs>
                    <linearGradient id="previewOverviewHistory" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="5%" stopColor="var(--wealth-series)" stopOpacity={0.24} />
                      <stop offset="95%" stopColor="var(--wealth-series)" stopOpacity={0} />
                    </linearGradient>
                  </defs>
                  <CartesianGrid strokeDasharray="3 3" stroke="var(--separator)" />
                  <XAxis
                    dataKey="created_at"
                    tickFormatter={(value: string) =>
                      new Date(value).toLocaleDateString(undefined, { month: 'short', day: 'numeric' })
                    }
                    tick={{ fontSize: 11, fill: 'var(--muted-text)' }}
                    axisLine={false}
                    tickLine={false}
                  />
                  <YAxis
                    tickFormatter={formatWealthAxisTick}
                    tick={{ fontSize: 11, fill: 'var(--muted-text)' }}
                    axisLine={false}
                    tickLine={false}
                    width={42}
                  />
                  <RechartsTooltip
                    content={({ active, payload }) => {
                      if (!active || !payload?.length) return null
                      const point = payload[0].payload as (typeof previewHistory)[number]
                      return (
                        <div role="status" className="rounded-large border-divider bg-overlay border px-3 py-2 text-xs shadow-lg">
                          <p className="text-default-400">
                            {new Date(point.created_at).toLocaleString(undefined, {
                              month: 'short',
                              day: 'numeric',
                              hour: '2-digit',
                              minute: '2-digit',
                            })}
                          </p>
                          <p className="text-foreground mt-1 font-semibold">
                            {formatCurrencyAmount(point.total_wealth_chaos, 'chaos')}
                          </p>
                        </div>
                      )
                    }}
                  />
                  <Area
                    type="monotone"
                    isAnimationActive={false}
                    dataKey="total_wealth_chaos"
                    name="Stash value"
                    stroke="var(--wealth-series)"
                    fill="url(#previewOverviewHistory)"
                    strokeWidth={2}
                    dot={{ r: 3, fill: 'var(--wealth-series)' }}
                  />
                </AreaChart>
              </ResponsiveContainer>
            </Card.Content>
          </Card>
        )}
      />

      <div className="min-w-0">
        <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
          <h2 className="text-foreground text-sm font-semibold">Gear suggestion</h2>
          <Link to="/preview/gear" className="button button--sm button--tertiary">
            View gear sample
          </Link>
        </div>
        <Card className="min-w-0">
          <Card.Content className="gap-1.5">
            <div className="flex flex-wrap items-center gap-2">
              {sampleItemImage ? (
                <img
                  src={sampleItemImage}
                  alt=""
                  className="h-8 w-8 bg-transparent object-contain"
                />
              ) : (
                <Sword size={14} className="text-default-400 shrink-0" aria-hidden="true" />
              )}
              <p className="text-foreground min-w-0 flex-1 wrap-anywhere text-sm font-medium">
                {sampleSuggestion.item_name}
              </p>
              <Chip size="sm" variant="soft">
                {importance.label}
              </Chip>
            </div>
            <div className="text-default-400 flex items-center gap-1.5 wrap-anywhere text-xs">
              <UserAvatar
                size="sm"
                name={sampleTarget?.display_name ?? 'Member'}
                className="h-5 w-5 shrink-0"
                fallbackClassName="text-[10px]"
                style={sampleTarget ? { backgroundColor: sampleTarget.avatar_color } : undefined}
              />
              <span className="min-w-0">
                For {sampleTarget?.display_name ?? 'the selected member'}
              </span>
            </div>
            <div className="mt-auto flex flex-wrap items-center justify-between gap-2 pt-2">
              <p className="text-default-400 wrap-anywhere text-xs">
                by {sampleSuggester?.display_name ?? 'another member'}
              </p>
              <Chip
                size="sm"
                color={STATUS_COLOR[sampleSuggestion.status]}
                variant="soft"
                className="capitalize"
              >
                {sampleSuggestion.status}
              </Chip>
            </div>
          </Card.Content>
        </Card>
      </div>

      <UnlockCard
        title="Set up your workspace"
        description="Sign in to bring your characters and group into PoE Party."
        points={[
          'Track your PoE1 stash value over time.',
          'See your sync status and which strategy is active.',
          'Plan runs and share gear suggestions.',
        ]}
      />
    </DashboardPage>
  )
}
