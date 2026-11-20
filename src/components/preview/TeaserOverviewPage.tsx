import { Avatar } from '@heroui/react/avatar'
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
import { Coins, Star, Sword, TrendingUp, Users } from 'lucide-react'
import {
  previewGearSuggestions,
  previewHistory,
  previewMembers,
  previewStrategies,
  previewWorkspace,
} from '../../lib/preview-fixtures'
import { DIFFICULTY_CHIP, IMPORTANCE_CHIP, STATUS_COLOR } from '../../lib/constants'
import { formatCurrencyAmount } from '../../lib/utils'
import { formatWealthAxisTick } from '../../lib/wealth-history'
import { getPreviewItemImage } from '../../lib/preview-item-images'
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
    <div className="@container flex min-w-0 flex-col gap-6">
      <PreviewPageIntro
        mode="teaser"
        title="Overview"
        description="See a sample workspace with stash history, members, strategies, and gear suggestions."
      />

      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
        <Card>
          <Card.Content className="flex flex-col items-start gap-2 sm:flex-row sm:items-center">
            <div className="rounded-large bg-wealth-series/15 flex size-9 shrink-0 items-center justify-center">
              <TrendingUp size={18} className="text-wealth-series" aria-hidden="true" />
            </div>
            <div>
              <p className="text-default-400 text-xs">Sample wealth</p>
              <p className="text-foreground text-2xl font-bold">
                {formatCurrencyAmount(previewWorkspace.total_wealth_chaos, 'divine', divinePrice)}
              </p>
            </div>
          </Card.Content>
        </Card>

        <Card>
          <Card.Content className="flex flex-col items-start gap-2 sm:flex-row sm:items-center">
            <div className="rounded-large bg-primary/15 flex size-9 shrink-0 items-center justify-center">
              <Users size={18} className="text-primary" />
            </div>
            <div>
              <p className="text-default-400 text-xs">Synced members</p>
              <p className="text-foreground text-2xl font-bold">
                {previewWorkspace.synced_members}
              </p>
            </div>
          </Card.Content>
        </Card>

        <Card>
          <Card.Content className="flex flex-col items-start gap-2 sm:flex-row sm:items-center">
            <div className="rounded-large bg-warning/15 flex size-9 shrink-0 items-center justify-center">
              <Sword size={18} className="text-warning" />
            </div>
            <div>
              <p className="text-default-400 text-xs">Open gear suggestions</p>
              <p className="text-foreground text-2xl font-bold">
                {previewWorkspace.open_gear_items}
              </p>
            </div>
          </Card.Content>
        </Card>
      </div>

      <Card>
        <Card.Header>
          <div>
            <p className="text-foreground text-sm font-semibold">Sample wealth trend</p>
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

      <div className="grid gap-4 @min-[44rem]:grid-cols-2">
        <div className="min-w-0">
          <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
            <h2 className="text-foreground text-sm font-semibold">Active strategy</h2>
            <Link to="/preview/strategies" className="button button--sm button--tertiary">
              Browse strategies
            </Link>
          </div>
          <Link
            to="/preview/strategies"
            className="block min-w-0"
          >
            <Card className="hover:bg-default-50 min-w-0 cursor-pointer transition-colors">
              <Card.Content className="gap-1.5">
                <div className="flex flex-wrap items-center gap-2">
                  {sampleStrategy.is_active ? (
                    <Star size={14} className="fill-highlight text-highlight shrink-0" aria-hidden="true" />
                  ) : null}
                  <p className="text-foreground min-w-0 flex-1 wrap-anywhere text-sm font-medium">
                    {sampleStrategy.name}
                  </p>
                  <Chip size="sm" variant="soft" color={diffChip.color}>
                    {diffChip.label}
                  </Chip>
                </div>
                <div className="mt-1 flex items-center justify-between">
                  <span className="text-default-400 flex items-center gap-1 text-xs">
                    <Coins size={10} />~{formatCurrencyAmount(sampleStrategy.map_cost, 'chaos')}/map
                  </span>
                  <span className="text-default-400 text-xs">Tracked</span>
                </div>
                <div className="mt-1 flex flex-wrap items-center gap-2">
                  <Chip size="sm" variant="soft" color="success">
                    {formatCurrencyAmount(
                      sampleStrategy.benchmark_chaos_per_hour,
                      'chaos',
                      divinePrice,
                    )}
                    /hr
                  </Chip>
                  <Chip size="sm" variant="soft" className="bg-selected text-highlight">
                    Active
                  </Chip>
                </div>
              </Card.Content>
            </Card>
          </Link>
        </div>

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
                  <Sword size={14} className="text-default-400 shrink-0" />
                )}
                <p className="text-foreground min-w-0 flex-1 wrap-anywhere text-sm font-medium">
                  {sampleSuggestion.item_name}
                </p>
                <Chip size="sm" variant="soft" color={importance.color}>
                  {importance.label}
                </Chip>
              </div>
              <div className="text-default-400 flex items-center gap-1.5 wrap-anywhere text-xs">
                <Avatar
                  size="sm"
                  className="h-5 w-5 shrink-0"
                  style={{ backgroundColor: sampleTarget?.avatar_color ?? '#f5a524' }}
                >
                  <Avatar.Fallback className="text-[10px] font-semibold text-white">
                    {(sampleTarget?.display_name ?? 'Member').slice(0, 2).toUpperCase()}
                  </Avatar.Fallback>
                </Avatar>
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
    </div>
  )
}
