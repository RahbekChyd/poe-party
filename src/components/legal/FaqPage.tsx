import { type ReactNode } from 'react'
import { Accordion } from '@heroui/react/accordion'
import { ChevronDown } from 'lucide-react'
import { LegalLayout } from './LegalLayout'
import {
  FREE_DAILY_UPGRADE_ANALYSIS_LIMIT,
  PLAN_PRICE_LABELS,
  SNAPSHOT_LIMITS,
} from '../../lib/billing'
import { GITHUB_URL } from '../../lib/seo'
type FaqItem = {
  id: string
  question: string
  answer: ReactNode
}

const FAQ_ITEMS: FaqItem[] = [
  {
    id: 'what-is-poe-party',
    question: 'What is PoE Party?',
    answer: (
      <>
        <p>
          PoE Party is an independent Path of Exile tool for players who want one workspace for solo
          or party economy tracking, stash snapshots, strategy coordination, service listings, gear
          planning, and upgrade analysis.
        </p>
        <p>
          Public preview pages let guests browse parts of the product, including community
          strategies, service listings, and discovery views, before signing in.
        </p>
      </>
    ),
  },
  {
    id: 'open-source',
    question: 'Is PoE Party open source?',
    answer: (
      <>
        <p>
          Yes. PoE Party is open source under Apache-2.0, and the source is available on{' '}
          <a
            href={GITHUB_URL}
            className="text-primary underline underline-offset-2 hover:no-underline"
            target="_blank"
            rel="noreferrer"
          >
            GitHub
          </a>
          .
        </p>
        <p>
          The public repo includes the application, Supabase schema/functions, optimizer worker,
          analyser/scoring logic, local tooling, and validation workflows. Hosted production data,
          secrets, deploy automation, billing repair tools, and abuse-sensitive operations material
          stay private.
        </p>
      </>
    ),
  },
  {
    id: 'poe1-poe2-support',
    question: 'Does PoE Party support PoE 1 and Path of Exile 2?',
    answer: (
      <>
        <p>
          PoE Party supports Path of Exile 1 and has a capability-limited Path of Exile 2 beta for
          accounts included in the current rollout. PoE2 workspaces support character sync, market
          overview, public discovery, strategy basics, and shared planning.
        </p>
        <p>
          PoE2 does not currently support PoE1 stash snapshots, group wealth history, atlas and
          scarab planning, or optimizer and trade-analysis workflows. Those features remain PoE1
          only unless upstream integrations are separately validated.
        </p>
      </>
    ),
  },
  {
    id: 'solo-player',
    question: 'Can I use PoE Party as a solo player?',
    answer: (
      <>
        <p>
          Yes. PoE Party works for solo players as well as groups. You can create a solo workspace,
          track your own stash snapshots and wealth history, organize strategies, plan upgrades, and
          keep your character progress in one place.
        </p>
        <p>
          If you later want to play with friends, you can also create or join shared groups and
          switch between workspaces in the app.
        </p>
      </>
    ),
  },
  {
    id: 'snapshot-limits',
    question: 'Snapshot Limits',
    answer: (
      <>
        <p>
          Snapshot retention is based on your account capacity and applies across all of your groups
          combined.
        </p>
        <ul>
          <li>
            <strong>Community:</strong> up to {SNAPSHOT_LIMITS.free} retained raw snapshots
          </li>
          <li>
            <strong>Supporter:</strong> up to {SNAPSHOT_LIMITS.pro} retained raw snapshots
          </li>
        </ul>
        <p>
          When you go over your tier limit, the oldest completed raw snapshot is removed
          automatically. Historical summary rows can still remain available in the economy history
          view.
        </p>
      </>
    ),
  },
  {
    id: 'why-limits-exist',
    question: 'Why does the Community plan have limits?',
    answer: (
      <>
        <p>
          I run PoE Party as an open-source passion project. Keeping full stash snapshots uses
          database storage, and running upgrade analyses uses computing time. Community limits
          keep those costs manageable so the app can stay free to use. The optional Supporter
          subscription helps cover the extra cost if you need more capacity.
        </p>
        <p>
          Community accounts can queue up to {FREE_DAILY_UPGRADE_ANALYSIS_LIMIT} new authenticated
          upgrade analyses per UTC day. Supporter accounts do not have a daily app-enforced
          authenticated queue cap, though worker capacity and abuse controls can still apply
          operationally.
        </p>
        <p>
          Bugs, incomplete flows, and missing features may still appear. If you run into any of
          those, please report them in Discord so they can be prioritized and fixed faster.
        </p>
      </>
    ),
  },
  {
    id: 'max-snapshots',
    question: 'What happens when I reach the max number of snapshots?',
    answer: (
      <>
        <p>
          When a new snapshot completes and you are already at your tier limit, the oldest completed
          raw snapshot is removed automatically. This is handled per user, not per group.
        </p>
        <p>
          The limit is shared across all groups you are in. For example, if you are on Community
          access and already have {SNAPSHOT_LIMITS.free} saved snapshots in total, taking another
          snapshot in any group will push out your oldest one.
        </p>
        <p>
          Even after raw snapshot rows are removed, summary history can still remain visible in
          places like wealth history charts and linked strategy history.
        </p>
      </>
    ),
  },
  {
    id: 'multiple-groups',
    question: 'Can I be in more than one workspace or group?',
    answer: (
      <>
        <p>
          Yes. You can create a solo workspace, create shared groups, join other groups by invite
          code, and switch between them in the app.
        </p>
        <p>
          Snapshot retention is still counted at the account level across all of your groups
          combined, not separately per group.
        </p>
      </>
    ),
  },
  {
    id: 'group-wealth',
    question: 'How is group wealth calculated?',
    answer: (
      <>
        <p>
          Group wealth is the sum of each synced member&apos;s latest completed snapshot in that
          group. The app uses the latest stored snapshot per member and adds up the included item
          values from those snapshots.
        </p>
        <p>
          Prices come from the snapshot pricing pass. Items you exclude are not counted in the
          included total, and members without a completed snapshot do not contribute to the group
          total yet.
        </p>
      </>
    ),
  },
  {
    id: 'strategy-cph',
    question: 'How is currency per hour calculated on strategies?',
    answer: (
      <>
        <p>
          Strategy currency per hour is an estimate based on tagged group wealth history points, not
          a direct loot log.
        </p>
        <p>
          When a snapshot is linked to a strategy, the resulting group wealth history point is
          tagged with that strategy. The app then compares each tagged point to the previous group
          wealth point, measures the total wealth change over the elapsed time, and aggregates those
          deltas for the same strategy.
        </p>
        <p>In practice, that means the estimate is:</p>
        <ul>
          <li>Total group wealth change across tagged intervals</li>
          <li>Divided by the total elapsed hours across those intervals</li>
          <li>Based on consecutive group history points, not individual maps</li>
        </ul>
        <p>
          Because it is based on group wealth changes, the number can move from more than just
          farming output. New snapshots, excluded items, repricing, stash changes, and other
          members&apos; updates can all affect it.
        </p>
      </>
    ),
  },
  {
    id: 'supporter-capacity',
    question: 'What changes if I become a Supporter?',
    answer: (
      <>
        <p>
          If you need more capacity, the optional Supporter subscription helps cover the added
          storage and computing costs. It costs {PLAN_PRICE_LABELS.pro} and includes the following.
        </p>
        <ul>
          <li>
            Up to {SNAPSHOT_LIMITS.pro} retained raw snapshots instead of {SNAPSHOT_LIMITS.free}
          </li>
          <li>Mix mode for interval-based automatic snapshot scheduling</li>
          <li>No app-enforced daily authenticated upgrade-analysis queue cap</li>
        </ul>
        <p>
          Mix mode lets you keep taking manual snapshots while also running snapshots on a timer. A
          Community account can still take manual snapshots, keep {SNAPSHOT_LIMITS.free} retained
          raw snapshots, and queue up to {FREE_DAILY_UPGRADE_ANALYSIS_LIMIT} authenticated upgrade
          analyses per UTC day.
        </p>
      </>
    ),
  },
  {
    id: 'billing',
    question: 'How does Supporter billing work?',
    answer: (
      <>
        <p>
          Community accounts can start a Supporter subscription from the Support PoE Party page.
          Stripe Checkout collects payment and Stripe webhooks sync Supporter access back into PoE
          Party.
        </p>
        <p>
          Supporters can open the Stripe billing portal from the support page to manage eligible
          subscriptions. Supporter access is granted from trusted Stripe billing events or support
          grants, not from the checkout redirect alone.
        </p>
      </>
    ),
  },
  {
    id: 'mix-mode',
    question: 'What is Mix mode?',
    answer: (
      <>
        <p>
          Mix mode is the snapshot schedule option that combines manual snapshots with automatic
          interval snapshots.
        </p>
        <p>
          To use it, you need Supporter capacity, an active group with a league selected, access to
          your PoE account, and a saved stash tab selection from a previous manual snapshot.
        </p>
      </>
    ),
  },
  {
    id: 'history-points',
    question: 'Why does a chart point still exist if the raw snapshot is gone?',
    answer: (
      <>
        <p>
          Raw stash data and summary history are stored separately. When retention removes an old
          raw snapshot, the app can still keep the durable summary row that powers charts, totals,
          and strategy history.
        </p>
        <p>
          That is why you may still see an older point in a chart even when the item-level snapshot
          details are no longer available.
        </p>
      </>
    ),
  },
  {
    id: 'group-total',
    question: 'Why does my group total not match what I expect?',
    answer: (
      <>
        <p>
          The most common reasons are stale member snapshots, excluded items, members who have not
          synced yet, or price changes from the latest pricing pass.
        </p>
        <p>
          Group wealth is not a live stash crawl. It reflects the latest completed priced snapshot
          that each synced member has stored for that group.
        </p>
      </>
    ),
  },
]

export function FaqPage() {
  return (
    <LegalLayout title="FAQ" lastUpdated="July 20, 2026">
      <p>
        Short answers about PoE Party, the Path of Exile group tools, public previews, economy
        tracking, strategy planning, Supporter billing, and capacity limits.
      </p>
      <p className="text-foreground font-medium">
        Supporter is {PLAN_PRICE_LABELS.pro} and is managed through Stripe Checkout and the Stripe
        billing portal.
      </p>

      <Accordion
        allowsMultipleExpanded
        hideSeparator
        className="flex flex-col gap-3"
        variant="default"
      >
        {FAQ_ITEMS.map((item) => (
          <Accordion.Item
            key={item.id}
            id={item.id}
            aria-label={item.question}
            className="border-divider bg-content1 overflow-hidden rounded-xl border px-0 shadow-none"
          >
            <Accordion.Heading>
              <Accordion.Trigger className="flex min-h-0 w-full items-center gap-3 px-5 pt-3.5 pb-4 text-left">
                <span
                  id={item.id}
                  className="text-foreground m-0 flex-1 scroll-mt-24 text-sm leading-5 font-semibold"
                >
                  {item.question}
                </span>
                <Accordion.Indicator>
                  <ChevronDown size={16} className="text-default-400" />
                </Accordion.Indicator>
              </Accordion.Trigger>
            </Accordion.Heading>
            <Accordion.Panel>
              <Accordion.Body className="text-default-600 px-5 pt-0 pb-5 text-sm leading-relaxed [&_p+p]:mt-4 [&_ul]:mt-3 [&_ul]:list-disc [&_ul]:space-y-1 [&_ul]:pl-5">
                {item.answer}
              </Accordion.Body>
            </Accordion.Panel>
          </Accordion.Item>
        ))}
      </Accordion>
    </LegalLayout>
  )
}
