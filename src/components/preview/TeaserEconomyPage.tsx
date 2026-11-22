import { Button } from '@heroui/react/button'
import { Card } from '@heroui/react/card'
import { Chip } from '@heroui/react/chip'
import { Area, AreaChart, CartesianGrid, ResponsiveContainer, Tooltip as RechartsTooltip, XAxis, YAxis } from 'recharts'
import { previewHistory, previewLinkedSnapshot, previewMembers, previewStrategies, previewWorkspace } from '../../lib/preview-fixtures'
import { formatCurrencyAmount } from '../../lib/utils'
import { formatWealthAxisTick } from '../../lib/wealth-history'
import { PreviewPageIntro, UnlockCard } from './PreviewShared'
import { useGuestGateStore } from '../../store/guest-gate-store'
import { DashboardPage } from '../ui/dashboard'
import { EconomySnapshotSummary } from '../economy/EconomySnapshotSummary'
import '../economy/economy-data.css'
const divinePrice = 205

export function TeaserEconomyPage() {
  const openGuestGate = useGuestGateStore((state) => state.open)

  return (
    <DashboardPage className="@container">
      <PreviewPageIntro
        title="Economy"
        description="Explore how a PoE1 stash snapshot tracks value over time and across party members."
      />

      <EconomySnapshotSummary
        valueLabel="Sample stash value"
        amount={<p className="workspace-lead-amount">{formatCurrencyAmount(previewWorkspace.total_wealth_chaos, 'divine', divinePrice)}</p>}
        metadata={<span>{previewMembers.length} members synced</span>}
        pricing={
          <>
            <h3 className="text-foreground text-sm font-semibold">Sample pricing</h3>
            <p className="text-default-600 text-xs">1 div = {divinePrice}c in this example</p>
          </>
        }
        actions={
          <Button
            size="sm"
            variant="primary"
            className="min-h-11"
            onPress={() =>
              openGuestGate({
                title: 'Sign in to capture snapshots',
                description: 'Connect a PoE account to capture stash value in your workspace.',
              })
            }
          >
            Snapshot stash
          </Button>
        }
      />

      <Card id="strategy-results" className="scroll-mt-6 p-0">
        <Card.Header className="flex-row flex-wrap items-center justify-between gap-x-4 gap-y-1 px-4 pb-0 pt-4">
          <h2 className="text-foreground text-sm font-semibold">Wealth history</h2>
          <p className="text-default-600 text-sm wrap-anywhere">
            {previewStrategies[0].name} · Linked snapshot ·{' '}
            <strong className="text-foreground tabular-nums">{formatCurrencyAmount(previewLinkedSnapshot.total_wealth_chaos, 'chaos')}</strong>
          </p>
        </Card.Header>
        <Card.Content className="px-2 pb-3 pt-2">
          <ResponsiveContainer width="100%" height={220}>
            <AreaChart
              data={previewHistory}
              title="Sample stash wealth in chaos orbs"
              desc="Use the left and right arrow keys to read snapshot values."
              margin={{ top: 4, right: 12, left: 0, bottom: 0 }}
            >
              <defs>
                <linearGradient id="previewEconomyHistory" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="5%" stopColor="var(--wealth-series)" stopOpacity={0.25} />
                  <stop offset="95%" stopColor="var(--wealth-series)" stopOpacity={0} />
                </linearGradient>
              </defs>
              <CartesianGrid strokeDasharray="3 3" stroke="var(--separator)" />
              <XAxis
                dataKey="created_at"
                tickFormatter={(value: string) =>
                  new Date(value).toLocaleDateString(undefined, { month: 'short', day: 'numeric' })
                }
                tick={{ fontSize: 10, fill: 'var(--muted-text)' }}
                axisLine={false}
                tickLine={false}
              />
              <YAxis
                tickFormatter={formatWealthAxisTick}
                unit="c"
                tick={{ fontSize: 10, fill: 'var(--muted-text)' }}
                axisLine={false}
                tickLine={false}
                width={44}
              />
              <RechartsTooltip
                content={({ active, payload }) => {
                  if (!active || !payload?.length) return null
                  const point = payload[0].payload as (typeof previewHistory)[number]
                  return (
                    <div role="status" className="bg-overlay border-divider rounded-large border px-3 py-2 text-xs shadow-lg">
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
                isAnimationActive={false}
                dataKey="total_wealth_chaos"
                stroke="var(--wealth-series)"
                fill="url(#previewEconomyHistory)"
                strokeWidth={2}
                dot={{ r: 3, fill: 'var(--wealth-series)' }}
                activeDot={{ r: 6, fill: 'var(--wealth-series)', stroke: 'var(--surface)', strokeWidth: 2 }}
              />
            </AreaChart>
          </ResponsiveContainer>
        </Card.Content>
      </Card>

      <Card className="gap-0 p-0">
        <Card.Header className="px-4 pb-0 pt-4">
          <div>
            <h2 className="text-foreground text-sm font-semibold">Member breakdown</h2>
            <p className="mt-1 text-sm text-default-500">
              Compare stash value and snapshot activity by member.
            </p>
          </div>
        </Card.Header>
        <Card.Content className="p-0">
          <div className="economy-data">
            <table className="economy-members" role="table">
              <thead role="rowgroup">
                <tr className="border-b border-divider" role="row">
                  <th role="columnheader" scope="col" className="px-4 py-3 text-left text-xs font-medium uppercase tracking-wider text-default-400">Member</th>
                  <th role="columnheader" scope="col" className="px-4 py-3 text-left text-xs font-medium uppercase tracking-wider text-default-400">Character</th>
                  <th role="columnheader" scope="col" className="w-40 px-4 py-3 text-right text-xs font-medium uppercase tracking-wider text-default-400">Sample value</th>
                  <th role="columnheader" scope="col" className="w-32 px-4 py-3 text-right text-xs font-medium uppercase tracking-wider text-default-400">Last snapshot</th>
                </tr>
              </thead>
              <tbody role="rowgroup">
                {previewMembers.slice(0, 3).map((member, index, members) => (
                  <tr key={member.id} role="row" className={index < members.length - 1 ? 'border-b border-divider' : ''}>
                    <td role="cell" data-cell="member" className="px-4 py-3">
                      <div>
                        <p className="text-sm font-medium text-foreground">{member.display_name}</p>
                        <p className="text-xs text-default-400">{member.focus}</p>
                      </div>
                    </td>
                    <td role="cell" data-cell="character" className="px-4 py-3">
                      <p className="text-sm text-foreground">{member.character_name}</p>
                      <p className="text-xs text-default-400">
                        {member.class} - Level {member.level}
                      </p>
                    </td>
                    <td role="cell" data-cell="value" className="px-4 py-3 text-right text-sm font-semibold text-foreground tabular-nums">
                      <span className="economy-data-label font-normal">Value</span>
                      <p>{formatCurrencyAmount(member.wealth_chaos, 'chaos')}</p>
                    </td>
                    <td role="cell" data-cell="snapshot" className="px-4 py-3 text-right">
                      <span className="economy-data-label">Snapshot</span>
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
    </DashboardPage>
  )
}
