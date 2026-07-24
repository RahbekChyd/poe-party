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
    <div className="flex flex-col gap-6">
      <PreviewPageIntro
        mode="teaser"
        title="Overview"
        description="A lighter sample of the dashboard. Wealth, roster health, and next actions are shown with illustrative values — sign in to see your own."
      />

      <div className="grid gap-4 md:grid-cols-3">
        <Card>
          <Card.Content className="flex flex-row items-center gap-4 p-5">
            <div className="rounded-large bg-success/15 flex h-12 w-12 items-center justify-center">
              <TrendingUp size={24} className="text-success" />
            </div>
            <div>
              <p className="text-default-400 text-xs tracking-wider uppercase">Sample Wealth</p>
              <p className="text-foreground text-2xl font-bold">
                {formatCurrencyAmount(previewWorkspace.total_wealth_chaos, 'divine', divinePrice)}
              </p>
            </div>
          </Card.Content>
        </Card>

        <Card>
          <Card.Content className="flex flex-row items-center gap-4 p-5">
            <div className="rounded-large bg-primary/15 flex h-12 w-12 items-center justify-center">
              <Users size={24} className="text-primary" />
            </div>
            <div>
              <p className="text-default-400 text-xs tracking-wider uppercase">Synced Members</p>
              <p className="text-foreground text-2xl font-bold">
                {previewWorkspace.synced_members}
              </p>
            </div>
          </Card.Content>
        </Card>

        <Card>
          <Card.Content className="flex flex-row items-center gap-4 p-5">
            <div className="rounded-large bg-warning/15 flex h-12 w-12 items-center justify-center">
              <Sword size={24} className="text-warning" />
            </div>
            <div>
              <p className="text-default-400 text-xs tracking-wider uppercase">Open Gear Plans</p>
              <p className="text-foreground text-2xl font-bold">
                {previewWorkspace.open_gear_items}
              </p>
            </div>
          </Card.Content>
        </Card>
      </div>

      <Card>
        <Card.Header className="px-4 pt-4 pb-0">
          <div>
            <p className="text-foreground text-sm font-semibold">Illustrative wealth trend</p>
            <p className="text-default-500 mt-1 text-sm">
              A single sample chart to show how snapshots turn into momentum over time.
            </p>
          </div>
        </Card.Header>
        <Card.Content className="px-2 pt-2 pb-3">
          <ResponsiveContainer width="100%" height={220}>
            <AreaChart data={previewHistory} margin={{ top: 4, right: 12, left: 0, bottom: 0 }}>
              <defs>
                <linearGradient id="previewOverviewHistory" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="5%" stopColor="#17c964" stopOpacity={0.24} />
                  <stop offset="95%" stopColor="#17c964" stopOpacity={0} />
                </linearGradient>
              </defs>
              <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.06)" />
              <XAxis
                dataKey="created_at"
                tickFormatter={(value: string) =>
                  new Date(value).toLocaleDateString(undefined, { month: 'short', day: 'numeric' })
                }
                tick={{ fontSize: 10, fill: '#888' }}
                axisLine={false}
                tickLine={false}
              />
              <YAxis
                tickFormatter={(value: number) => `${Math.round(value / 1000)}k`}
                tick={{ fontSize: 10, fill: '#888' }}
                axisLine={false}
                tickLine={false}
                width={42}
              />
              <RechartsTooltip
                content={({ active, payload }) => {
                  if (!active || !payload?.length) return null
                  const point = payload[0].payload as (typeof previewHistory)[number]
                  return (
                    <div className="rounded-large border-divider bg-content1 border px-3 py-2 text-xs shadow-lg">
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
                stroke="#17c964"
                fill="url(#previewOverviewHistory)"
                strokeWidth={2}
                dot={{ r: 3, fill: '#17c964' }}
              />
            </AreaChart>
          </ResponsiveContainer>
        </Card.Content>
      </Card>

      <div>
        <div className="mb-3 flex items-center justify-between">
          <div>
            <h2 className="text-foreground text-sm font-semibold">Strategy Reference</h2>
            <p className="text-default-400 mt-1 text-xs">
              Sample card shown at the same size as the signed-in overview.
            </p>
          </div>
          <Link to="/preview/strategies" className="button button--sm button--tertiary">
            Open Live Strategies
          </Link>
        </div>
        <div
          className="-mx-0.5 flex items-stretch gap-3 overflow-x-auto px-0.5 pt-0.5 pb-2"
          style={{ scrollSnapType: 'x mandatory' }}
        >
          <Link
            to="/preview/strategies"
            className="block h-full shrink-0"
            style={{ scrollSnapAlign: 'start' }}
          >
            <Card className="hover:bg-default-50 h-full w-60 cursor-pointer transition-colors">
              <Card.Content className="gap-1.5 p-4">
                <div className="flex items-center gap-2">
                  {sampleStrategy.is_active ? (
                    <Star size={14} className="fill-primary text-primary shrink-0" />
                  ) : null}
                  <p className="text-foreground flex-1 truncate text-sm font-medium">
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
                  <Chip size="sm" variant="soft" color="accent">
                    Active
                  </Chip>
                </div>
              </Card.Content>
            </Card>
          </Link>
        </div>
      </div>

      <div>
        <div className="mb-3 flex items-center justify-between">
          <div>
            <h2 className="text-foreground text-sm font-semibold">Gear Suggestion Reference</h2>
            <p className="text-default-400 mt-1 text-xs">
              Sample card shown at the same size as the signed-in overview, using a local preview
              item image.
            </p>
          </div>
          <Link to="/preview/gear" className="button button--sm button--tertiary">
            Open Gear Teaser
          </Link>
        </div>
        <div
          className="-mx-1 flex items-stretch gap-3 overflow-x-auto px-1 pt-0.5 pb-2"
          style={{ scrollSnapType: 'x mandatory' }}
        >
          <Card
            className="hover:bg-default-50 h-full w-72 shrink-0 transition-colors"
            style={{ scrollSnapAlign: 'start' }}
          >
            <Card.Content className="gap-1.5 p-4">
              <div className="flex items-center gap-2">
                {sampleItemImage ? (
                  <img
                    src={sampleItemImage}
                    alt=""
                    className="h-8 w-8 bg-transparent object-contain"
                  />
                ) : (
                  <Sword size={14} className="text-default-400 shrink-0" />
                )}
                <p className="text-foreground flex-1 truncate text-sm font-medium">
                  {sampleSuggestion.item_name}
                </p>
                <Chip size="sm" variant="soft" color={importance.color}>
                  {importance.label}
                </Chip>
              </div>
              <div className="text-default-400 flex items-center gap-1.5 truncate text-xs">
                <Avatar
                  size="sm"
                  className="h-5 w-5 shrink-0"
                  style={{ backgroundColor: sampleTarget?.avatar_color ?? '#f5a524' }}
                >
                  <Avatar.Fallback className="text-[10px] font-semibold text-white">
                    {(sampleTarget?.display_name ?? 'Member').slice(0, 2).toUpperCase()}
                  </Avatar.Fallback>
                </Avatar>
                <span className="truncate">
                  For {sampleTarget?.display_name ?? 'the selected member'}
                </span>
              </div>
              <div className="mt-auto flex items-center justify-between pt-2">
                <p className="text-default-400 truncate text-xs">
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
        title="What the overview page unlocks after sign-in"
        description="The signed-in overview becomes your real command board, tied to your own snapshots, strategies, and upgrade work."
        points={[
          'Track your own wealth trend instead of sample values.',
          'See your sync status and which strategy is active.',
          'Jump from overview cards into your real strategy and gear workflows.',
        ]}
      />
    </div>
  )
}
