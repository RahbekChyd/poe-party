import { Button } from '@heroui/react/button'
import { Card } from '@heroui/react/card'
import { Chip } from '@heroui/react/chip'
import { TrendingUp } from 'lucide-react'
import { Area, AreaChart, CartesianGrid, ResponsiveContainer, Tooltip as RechartsTooltip, XAxis, YAxis } from 'recharts'
import { previewHistory, previewMembers, previewWorkspace } from '../../lib/preview-fixtures'
import { formatCurrencyAmount } from '../../lib/utils'
import { PreviewPageIntro, UnlockCard } from './PreviewShared'
import { useGuestGateStore } from '../../store/guest-gate-store'
const divinePrice = 205

export function TeaserEconomyPage() {
  const openGuestGate = useGuestGateStore((state) => state.open)

  return (
    <div className="flex flex-col gap-6">
      <PreviewPageIntro
        mode="teaser"
        title="Economy"
        description="Explore how a PoE1 stash snapshot tracks value over time and across party members."
      />

      <Card>
        <Card.Content className="gap-4 p-5 md:flex-row md:items-start md:justify-between">
          <div className="min-w-0 flex-1">
            <p className="text-sm font-medium text-foreground">Stash snapshots</p>
            <p className="mt-2 text-sm leading-relaxed text-default-500">
              Capture the value of selected stash tabs at a point in time.
            </p>
          </div>
          <Button
            variant="tertiary"
            onPress={() =>
              openGuestGate({
                title: 'Sign in to run stash snapshots',
                description:
                  'Connect a PoE account to capture stash value in your workspace.',
              })
            }
          >
            Snapshot
          </Button>
        </Card.Content>
      </Card>

      <Card>
        <Card.Content className="flex flex-row items-center gap-4 p-5">
          <div className="flex h-10 w-10 items-center justify-center rounded-large bg-success/15">
            <TrendingUp size={20} className="text-success" />
          </div>
          <div>
            <p className="text-xs uppercase tracking-wider text-default-400">Sample Wealth Total</p>
            <p className="text-2xl font-bold text-foreground">
              {formatCurrencyAmount(previewWorkspace.total_wealth_chaos, 'divine', divinePrice)}
            </p>
          </div>
          <div className="ml-auto flex items-center gap-3">
            <div className="text-right text-xs text-default-500">
              <p>{previewMembers.length} synced members</p>
              <p>Sample values</p>
            </div>
            <Chip size="sm" variant="soft" color="warning">
              Sign in for details
            </Chip>
          </div>
        </Card.Content>
      </Card>

      <Card>
        <Card.Header className="px-4 pb-0 pt-4">
          <div>
            <p className="text-sm font-semibold text-foreground">Illustrative wealth history</p>
            <p className="mt-1 text-sm text-default-500">
              Sample values demonstrate how snapshots turn into a simple trend line over time.
            </p>
          </div>
        </Card.Header>
        <Card.Content className="px-2 pb-3 pt-2">
          <ResponsiveContainer width="100%" height={220}>
            <AreaChart data={previewHistory} margin={{ top: 4, right: 12, left: 0, bottom: 0 }}>
              <defs>
                <linearGradient id="previewEconomyHistory" x1="0" y1="0" x2="0" y2="1">
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
                width={44}
              />
              <RechartsTooltip
                content={({ active, payload }) => {
                  if (!active || !payload?.length) return null
                  const point = payload[0].payload as (typeof previewHistory)[number]
                  return (
                    <div className="rounded-large border border-divider bg-content1 px-3 py-2 text-xs shadow-lg">
                      <p className="text-default-400">
                        {new Date(point.created_at).toLocaleString(undefined, {
                          month: 'short',
                          day: 'numeric',
                          hour: '2-digit',
                          minute: '2-digit',
                        })}
                      </p>
                      <p className="mt-1 font-semibold text-foreground">
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
                fill="url(#previewEconomyHistory)"
                strokeWidth={2}
                dot={{ r: 3, fill: '#17c964' }}
              />
            </AreaChart>
          </ResponsiveContainer>
        </Card.Content>
      </Card>

      <Card>
        <Card.Header className="px-4 pb-0 pt-4">
          <div>
            <p className="text-sm font-semibold text-foreground">Illustrative member breakdown</p>
            <p className="mt-1 text-sm text-default-500">
              Compare stash value and snapshot activity by member.
            </p>
          </div>
        </Card.Header>
        <Card.Content className="p-0">
          <div className="overflow-x-auto">
            <table className="min-w-[44rem] w-full">
              <thead>
                <tr className="border-b border-divider">
                  <th className="px-4 py-3 text-left text-xs font-medium uppercase tracking-wider text-default-400">Member</th>
                  <th className="px-4 py-3 text-left text-xs font-medium uppercase tracking-wider text-default-400">Character</th>
                  <th className="px-4 py-3 text-right text-xs font-medium uppercase tracking-wider text-default-400">Sample Value</th>
                  <th className="px-4 py-3 text-right text-xs font-medium uppercase tracking-wider text-default-400">Last Snapshot</th>
                </tr>
              </thead>
              <tbody>
                {previewMembers.slice(0, 3).map((member, index, members) => (
                  <tr key={member.id} className={index < members.length - 1 ? 'border-b border-divider' : ''}>
                    <td className="px-4 py-3">
                      <div>
                        <p className="text-sm font-medium text-foreground">{member.display_name}</p>
                        <p className="text-xs text-default-400">{member.focus}</p>
                      </div>
                    </td>
                    <td className="px-4 py-3">
                      <p className="text-sm text-foreground">{member.character_name}</p>
                      <p className="text-xs text-default-400">
                        {member.class} - Level {member.level}
                      </p>
                    </td>
                    <td className="px-4 py-3 text-right text-sm font-semibold text-foreground">
                      {formatCurrencyAmount(member.wealth_chaos, 'chaos')}
                    </td>
                    <td className="px-4 py-3 text-right">
                      <Chip size="sm" variant="soft">
                        {member.snapshot_age_label}
                      </Chip>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Card.Content>
      </Card>

      <UnlockCard
        title="Track your stash"
        description="Sign in to capture snapshots in a PoE1 workspace."
        points={[
          'Capture snapshots of selected stash tabs.',
          'Track changes in stash value over time.',
          'Compare party members’ snapshots.',
        ]}
      />
    </div>
  )
}
