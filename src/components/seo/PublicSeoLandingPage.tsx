import { Card } from '@heroui/react/card'
import { Chip } from '@heroui/react/chip'
import { Link, Navigate } from '@tanstack/react-router'
import { BarChart3, Coins, Handshake, LineChart, ShieldCheck, Target, Users } from 'lucide-react'
import { findSeoRouteBySlug, strategySeoRoutes, toolSeoRoutes, type PublicSeoRoute } from '../../lib/public-seo-pages'
import { trackPublicEvent } from '../../lib/analytics'
import {
  buildStrategyContentMetadata,
  findPublicStrategyContentBySlug,
} from '../../lib/public-strategy-content'
import { StrategyMetadataBadges, StrategySourceLinks } from '../strategies/StrategyMetadataBadges'
interface ToolPageContent {
  eyebrow: string
  headline: string
  intro: string
  primaryTo:
    | '/preview'
    | '/preview/economy'
    | '/preview/strategies'
    | '/preview/services'
    | '/preview/gear'
    | '/preview/analysis'
    | '/preview/search'
  primaryLabel: string
  points: string[]
}

const toolContent: Record<string, ToolPageContent> = {
  'poe-wealth-tracker': {
    eyebrow: 'PoE wealth tracker',
    headline: 'Track stash value, wealth movement, and party progress in one workspace.',
    intro:
      'PoE Party turns selected stash snapshots into a readable economy view for solo players and groups. Use it to understand what changed, who synced recently, and which strategies are moving the account forward.',
    primaryTo: '/preview/economy',
    primaryLabel: 'Preview Economy',
    points: [
      'Track wealth history from selected stash snapshots.',
      'Compare member value and snapshot freshness in group play.',
      'Link economy changes back to active farming strategies.',
    ],
  },
  'poe-stash-tracker': {
    eyebrow: 'PoE stash tracker',
    headline: 'Capture selected stash tabs and keep priced item snapshots organized.',
    intro:
      'Use PoE Party to snapshot the tabs that matter, price valuable items, exclude noise, and keep a history of stash value changes over time.',
    primaryTo: '/preview/economy',
    primaryLabel: 'Preview Stash Tracking',
    points: [
      'Select tabs before taking a stash snapshot.',
      'Review priced item totals and snapshot history.',
      'Keep stash tracking tied to the league and workspace that produced it.',
    ],
  },
  'poe-group-economy-tracker': {
    eyebrow: 'PoE group economy tracker',
    headline: 'Give your party a shared economy board instead of scattered notes.',
    intro:
      'PoE Party is built around shared workspaces, member coordination, public discovery, and strategy-linked economy tracking for groups that want more context than one stash total.',
    primaryTo: '/preview',
    primaryLabel: 'Preview Workspace',
    points: [
      'Create solo or group workspaces with game and league context.',
      'Track member snapshots, public characters, and shared strategy progress.',
      'Use public strategy and service surfaces to turn group activity into discovery.',
    ],
  },
  'poe-farming-strategy-tracker': {
    eyebrow: 'PoE farming strategy tracker',
    headline: 'Track the strategy, not just the stash total after the run.',
    intro:
      'Plan farming strategies with cost, difficulty, public sharing, and snapshot-linked results so your group can compare what is actually working.',
    primaryTo: '/preview/strategies',
    primaryLabel: 'Browse Strategies',
    points: [
      'Create private or public strategies for a workspace.',
      'Track benchmark currency per hour from linked snapshot history.',
      'Subscribe to public strategy ideas and adapt them locally.',
    ],
  },
  'poe-service-listings': {
    eyebrow: 'PoE service listings',
    headline: 'Publish and browse carry listings with prices, availability, and whispers.',
    intro:
      'PoE Party gives service providers public league-scoped listings for boss carries, map carries, 5-way hosts, and rotas with buyer-ready whisper copy.',
    primaryTo: '/preview/services',
    primaryLabel: 'Browse Services',
    points: [
      'List services with region, pricing, availability, and details.',
      'Let buyers copy a ready-to-send in-game whisper.',
      'Keep listings scoped to the correct game and league.',
    ],
  },
  'poe-gear-upgrade-planner': {
    eyebrow: 'PoE gear upgrade planner',
    headline: 'Turn upgrade ideas into shared gear plans and analysis runs.',
    intro:
      'PoE Party helps groups suggest upgrades, track target items, preserve trade context, and use Path of Building informed analysis where PoE1 support is available.',
    primaryTo: '/preview/gear',
    primaryLabel: 'Preview Gear Planning',
    points: [
      'Suggest gear upgrades for yourself or party members.',
      'Track item targets, importance, notes, and status.',
      'Use optimizer analysis for PoE1 characters when the worker is configured.',
    ],
  },
}

function RelatedLinks({
  current,
  routes,
  title,
}: {
  current: PublicSeoRoute
  routes: PublicSeoRoute[]
  title: string
}) {
  return (
    <Card>
      <Card.Content className="gap-3 p-5">
        <p className="text-sm font-semibold text-foreground">{title}</p>
        <div className="flex flex-wrap gap-2">
          {routes
            .filter((route) => route.path !== current.path)
            .slice(0, 5)
            .map((route) => (
              <a key={route.path} href={route.path} className="max-w-full rounded-full focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary">
                <Chip
                  variant="soft"
                  className="h-auto max-w-full cursor-pointer py-1 wrap-anywhere whitespace-normal transition-colors hover:bg-default-200"
                >
                  {route.title.replace(' | PoE Party', '')}
                </Chip>
              </a>
            ))}
        </div>
      </Card.Content>
    </Card>
  )
}

function FeatureGrid({ points }: { points: string[] }) {
  const icons = [LineChart, Users, Target]

  return (
    <div className="grid gap-4 md:grid-cols-3">
      {points.map((point, index) => {
        const Icon = icons[index] ?? ShieldCheck
        return (
          <Card key={point}>
            <Card.Content className="gap-3">
              <div className="flex h-10 w-10 items-center justify-center rounded-large bg-warning/15">
                <Icon size={20} className="text-warning" />
              </div>
              <p className="text-sm leading-relaxed text-default-600">{point}</p>
            </Card.Content>
          </Card>
        )
      })}
    </div>
  )
}

function ToolLandingPage({ route }: { route: PublicSeoRoute }) {
  const content = route.slug ? toolContent[route.slug] : null
  if (!content) return <Navigate to="/preview" replace />

  return (
    <div className="mx-auto flex w-full max-w-6xl flex-col gap-6">
      <section className="rounded-large border border-divider bg-content1 p-6 md:p-8">
        <div className="flex flex-col gap-5 md:flex-row md:items-end md:justify-between">
          <div className="min-w-0 max-w-3xl wrap-anywhere">
            <Chip color="warning" variant="soft">
              {content.eyebrow}
            </Chip>
            <h1 className="mt-4 text-3xl font-semibold tracking-normal text-foreground md:text-4xl">
              {content.headline}
            </h1>
            <p className="mt-4 text-base leading-relaxed text-default-500">{content.intro}</p>
          </div>
          <Link
            to={content.primaryTo}
            className="button button--lg button--primary h-auto max-w-full shrink-0 self-start py-2 text-center whitespace-normal md:self-end"
            onClick={() =>
              trackPublicEvent('seo_cta_click', {
                source: route.path,
                target: content.primaryTo,
              })
            }
          >
            {content.primaryLabel}
          </Link>
        </div>
      </section>

      <FeatureGrid points={content.points} />

      <RelatedLinks current={route} routes={toolSeoRoutes} title="Related PoE tools" />
    </div>
  )
}

function StrategyLandingPage({ route }: { route: PublicSeoRoute }) {
  const content = route.slug ? findPublicStrategyContentBySlug(route.slug) : null
  if (!content) return <Navigate to="/preview/strategies" replace />
  const metadata = buildStrategyContentMetadata(content)

  return (
    <div className="mx-auto flex w-full max-w-6xl flex-col gap-6">
      <section className="rounded-large border border-divider bg-content1 p-6 md:p-8">
        <div className="flex flex-col gap-5 md:flex-row md:items-end md:justify-between">
          <div className="min-w-0 max-w-3xl wrap-anywhere">
            <Chip color="accent" variant="soft">
              Farming strategy tracker
            </Chip>
            <h1 className="mt-4 text-3xl font-semibold tracking-normal text-foreground md:text-4xl">
              {content.headline}
            </h1>
            <p className="mt-4 text-base leading-relaxed text-default-500">{content.intro}</p>
            <div className="mt-5 flex flex-wrap gap-2">
              <StrategyMetadataBadges metadata={metadata} />
            </div>
          </div>
          <Link
            to="/preview/strategies"
            className="button button--lg button--primary h-auto max-w-full shrink-0 self-start py-2 text-center whitespace-normal md:self-end"
            onClick={() =>
              trackPublicEvent('seo_cta_click', {
                source: route.path,
                target: '/preview/strategies',
              })
            }
          >
            Browse public strategies
          </Link>
        </div>
      </section>

      <FeatureGrid points={content.tracking} />
      <StrategySourceLinks metadata={metadata} />

      <div className="grid gap-4 md:grid-cols-3">
        <Card>
          <Card.Content className="gap-2 p-5">
            <Coins size={20} className="text-warning" />
            <p className="text-sm font-semibold text-foreground">Track investment</p>
            <p className="text-sm leading-relaxed text-default-500">
              Keep map costs, setup notes, and strategy assumptions near the results.
            </p>
          </Card.Content>
        </Card>
        <Card>
          <Card.Content className="gap-2 p-5">
            <BarChart3 size={20} className="text-success" />
            <p className="text-sm font-semibold text-foreground">Compare outcomes</p>
            <p className="text-sm leading-relaxed text-default-500">
              Use linked stash snapshots to evaluate whether the strategy is improving.
            </p>
          </Card.Content>
        </Card>
        <Card>
          <Card.Content className="gap-2 p-5">
            <Handshake size={20} className="text-secondary" />
            <p className="text-sm font-semibold text-foreground">Share what works</p>
            <p className="text-sm leading-relaxed text-default-500">
              Publish public summaries or subscribe to strategies from other groups.
            </p>
          </Card.Content>
        </Card>
      </div>

      <RelatedLinks current={route} routes={strategySeoRoutes} title="Related farming strategies" />
    </div>
  )
}

export function PublicSeoLandingPage({
  contentType,
  slug,
}: {
  contentType: 'tool' | 'strategy'
  slug: string
}) {
  const route = findSeoRouteBySlug(contentType, slug)
  if (!route) return <Navigate to="/preview" replace />

  return contentType === 'tool' ? (
    <ToolLandingPage route={route} />
  ) : (
    <StrategyLandingPage route={route} />
  )
}
