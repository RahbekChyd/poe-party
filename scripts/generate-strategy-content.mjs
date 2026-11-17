import { createHash } from 'node:crypto'
import { access, mkdir, readFile, writeFile } from 'node:fs/promises'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const repoRoot = path.resolve(__dirname, '..')
const contentPath = path.join(repoRoot, 'src', 'content', 'public-strategy-content.json')
const seoManifestPath = path.join(repoRoot, 'src', 'lib', 'public-seo-pages.json')
const seedSqlPath = path.join(repoRoot, 'tmp_strategy_seed_current.sql')

const validStages = new Set([
  'league_starter',
  'alch_and_go',
  'early_maps',
  'midgame',
  'high_end',
  'party',
])
const validKinds = new Set(['league_starter', 'build_source', 'farming', 'party'])
const validConfidence = new Set(['official', 'source_backed', 'curated'])
const validDifficulties = new Set(['easy', 'normal', 'hard'])
const validGames = new Set(['poe1', 'poe2'])
const validChangefreq = new Set(['daily', 'weekly', 'monthly'])

function fail(message) {
  throw new Error(`Strategy content validation failed: ${message}`)
}

function slugToUuid(slug) {
  const hex = createHash('sha1').update(`poe-party-strategy:${slug}`).digest('hex').slice(0, 32)
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`
}

function sqlString(value) {
  if (value == null) return 'NULL'
  return `'${String(value).replaceAll("'", "''")}'`
}

function sqlJson(value) {
  return `${sqlString(JSON.stringify(value ?? {}))}::jsonb`
}

function sqlNumber(value) {
  return value == null ? 'NULL' : String(value)
}

function asArray(value, fieldName) {
  if (!Array.isArray(value)) fail(`${fieldName} must be an array`)
  return value
}

function validateSourceRef(source, entry) {
  if (!source || typeof source !== 'object') fail(`${entry.slug} has an invalid sourceRef`)
  if (typeof source.label !== 'string' || source.label.trim().length === 0) {
    fail(`${entry.slug} has a sourceRef without a label`)
  }
  if (typeof source.url !== 'string' || source.url.trim().length === 0) {
    fail(`${entry.slug} has a sourceRef without a URL`)
  }
  const url = new URL(source.url)
  if (url.protocol !== 'https:' && url.protocol !== 'http:') {
    fail(`${entry.slug} sourceRef must use http(s): ${source.url}`)
  }
}

function validateEntry(entry, slugs) {
  if (!entry || typeof entry !== 'object') fail('entry must be an object')
  if (typeof entry.slug !== 'string' || !/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(entry.slug)) {
    fail(`invalid slug: ${entry.slug}`)
  }
  if (slugs.has(entry.slug)) fail(`duplicate slug: ${entry.slug}`)
  slugs.add(entry.slug)

  if (!validGames.has(entry.game)) fail(`${entry.slug} has invalid game`)
  if (typeof entry.patch !== 'string' || !entry.patch.trim()) fail(`${entry.slug} missing patch`)
  if (!validStages.has(entry.stage)) fail(`${entry.slug} has invalid stage`)
  if (!validKinds.has(entry.kind)) fail(`${entry.slug} has invalid kind`)
  if (!validConfidence.has(entry.confidence)) fail(`${entry.slug} has invalid confidence`)
  if (typeof entry.title !== 'string' || !entry.title.trim()) fail(`${entry.slug} missing title`)
  if (typeof entry.headline !== 'string' || !entry.headline.trim()) {
    fail(`${entry.slug} missing headline`)
  }
  if (typeof entry.intro !== 'string' || !entry.intro.trim()) fail(`${entry.slug} missing intro`)
  asArray(entry.tags, `${entry.slug}.tags`)
  asArray(entry.tracking, `${entry.slug}.tracking`)
  asArray(entry.sourceRefs, `${entry.slug}.sourceRefs`).forEach((source) =>
    validateSourceRef(source, entry),
  )

  if (!entry.seo || typeof entry.seo !== 'object') fail(`${entry.slug} missing seo`)
  if (typeof entry.seo.title !== 'string' || !entry.seo.title.trim()) {
    fail(`${entry.slug} missing seo.title`)
  }
  if (typeof entry.seo.description !== 'string' || !entry.seo.description.trim()) {
    fail(`${entry.slug} missing seo.description`)
  }
  if (typeof entry.seo.priority !== 'number' || entry.seo.priority < 0 || entry.seo.priority > 1) {
    fail(`${entry.slug} has invalid seo.priority`)
  }
  if (!validChangefreq.has(entry.seo.changefreq)) {
    fail(`${entry.slug} has invalid seo.changefreq`)
  }

  if (!entry.strategy || typeof entry.strategy !== 'object') fail(`${entry.slug} missing strategy`)
  if (typeof entry.strategy.name !== 'string' || !entry.strategy.name.trim()) {
    fail(`${entry.slug} missing strategy.name`)
  }
  if (entry.strategy.name.length > 64) fail(`${entry.slug} strategy.name is over 64 chars`)
  if (
    typeof entry.strategy.description !== 'string' ||
    !entry.strategy.description.trim() ||
    entry.strategy.description.length > 1000
  ) {
    fail(`${entry.slug} strategy.description must be 1-1000 chars`)
  }
  if (!validDifficulties.has(entry.strategy.difficulty)) {
    fail(`${entry.slug} has invalid strategy.difficulty`)
  }
  if (
    entry.strategy.mapCost != null &&
    (!Number.isInteger(entry.strategy.mapCost) || entry.strategy.mapCost < 0)
  ) {
    fail(`${entry.slug} has invalid strategy.mapCost`)
  }
}

async function warnMissingSourceFiles(manifest) {
  const sourceFiles = manifest.entries.flatMap((entry) => entry.sourceFiles ?? [])
  for (const sourceFile of sourceFiles) {
    const absolutePath = path.join(repoRoot, sourceFile)
    try {
      await access(absolutePath)
    } catch {
      console.warn(`Source note not found yet: ${sourceFile}`)
    }
  }
}

function strategyRoutesFromContent(manifest) {
  return manifest.entries.map((entry) => ({
    path: `/poe-strategies/${entry.slug}`,
    title: entry.seo.title,
    description: entry.seo.description,
    priority: entry.seo.priority,
    changefreq: entry.seo.changefreq,
    prerender: true,
    llmsSection: entry.seo.llmsSection,
    contentType: 'strategy',
    slug: entry.slug,
  }))
}

function metadataForEntry(entry) {
  return {
    content_slug: entry.slug,
    patch: entry.patch,
    stage: entry.stage,
    kind: entry.kind,
    tags: entry.tags,
    source_refs: entry.sourceRefs,
    verified_at: entry.verifiedAt,
    confidence: entry.confidence,
  }
}

function renderSeedSql(manifest) {
  const rows = manifest.entries.map((entry) => {
    const strategy = entry.strategy
    const metadata = metadataForEntry(entry)
    const scarabs = strategy.scarabs ?? []
    const threads = strategy.threads ?? []
    const mapRequirements = strategy.mapRequirements ?? {}

    return `    (
      ${sqlString(slugToUuid(entry.slug))}::uuid,
      editorial_group_id,
      ${sqlString(strategy.name)},
      ${sqlString(strategy.description)},
      ${sqlString(strategy.colour ?? '#f5a524')},
      ${sqlString(strategy.difficulty)},
      true,
      editorial_user_id,
      ${sqlString(strategy.atlasTreeUrl ?? null)},
      ${sqlJson(scarabs)},
      ${sqlJson(threads)},
      ${sqlString(strategy.mapTradeLink ?? null)},
      ${sqlJson(mapRequirements)},
      ${sqlNumber(strategy.mapCost ?? null)},
      true,
      'public',
      ${sqlString(entry.slug)},
      ${sqlJson(metadata)}
    )`
  })

  return `-- Generated by scripts/generate-strategy-content.mjs.
-- This file is intentionally ignored by git. Review it before use.
-- Replace the zero UUIDs below with the confirmed editorial group/user IDs
-- for the exact target environment before running this SQL manually.

DO $$
DECLARE
  editorial_group_id UUID := '00000000-0000-0000-0000-000000000000';
  editorial_user_id UUID := '00000000-0000-0000-0000-000000000000';
BEGIN
  IF editorial_group_id = '00000000-0000-0000-0000-000000000000'::uuid THEN
    RAISE EXCEPTION 'Set editorial_group_id before running this generated SQL.';
  END IF;

  IF editorial_user_id = '00000000-0000-0000-0000-000000000000'::uuid THEN
    RAISE EXCEPTION 'Set editorial_user_id before running this generated SQL.';
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM public.groups
    WHERE id = editorial_group_id
      AND game = 'poe1'
      AND deleted_at IS NULL
  ) THEN
    RAISE EXCEPTION 'Editorial group % was not found as an active PoE1 group.', editorial_group_id;
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM public.users
    WHERE id = editorial_user_id
  ) THEN
    RAISE EXCEPTION 'Editorial user % was not found.', editorial_user_id;
  END IF;

  INSERT INTO public.strategies (
    id,
    group_id,
    name,
    description,
    colour,
    difficulty,
    is_active,
    created_by,
    atlas_tree_url,
    scarabs,
    threads,
    map_trade_link,
    map_requirements,
    map_cost,
    admin_locked,
    visibility,
    content_slug,
    content_metadata
  )
  VALUES
${rows.join(',\n')}
  ON CONFLICT (content_slug) WHERE content_slug IS NOT NULL
  DO UPDATE SET
    group_id = EXCLUDED.group_id,
    name = EXCLUDED.name,
    description = EXCLUDED.description,
    colour = EXCLUDED.colour,
    difficulty = EXCLUDED.difficulty,
    is_active = true,
    created_by = EXCLUDED.created_by,
    atlas_tree_url = EXCLUDED.atlas_tree_url,
    scarabs = EXCLUDED.scarabs,
    threads = EXCLUDED.threads,
    map_trade_link = EXCLUDED.map_trade_link,
    map_requirements = EXCLUDED.map_requirements,
    map_cost = EXCLUDED.map_cost,
    admin_locked = true,
    visibility = 'public',
    source_strategy_id = NULL,
    source_group_id = NULL,
    source_group_name = NULL,
    subscription_state = NULL,
    last_synced_from_source_at = NULL,
    content_metadata = EXCLUDED.content_metadata,
    updated_at = timezone('utc', now());
END $$;
`
}

const manifest = JSON.parse(await readFile(contentPath, 'utf8'))
const seoManifest = JSON.parse(await readFile(seoManifestPath, 'utf8'))

if (!manifest || typeof manifest !== 'object') fail('manifest must be an object')
if (!Array.isArray(manifest.entries)) fail('manifest.entries must be an array')

const slugs = new Set()
manifest.entries.forEach((entry) => validateEntry(entry, slugs))
await warnMissingSourceFiles(manifest)

const preservedRoutes = seoManifest.routes.filter((route) => route.contentType !== 'strategy')
const nextSeoManifest = {
  ...seoManifest,
  lastmod:
    typeof manifest.lastmod === 'string' && manifest.lastmod > seoManifest.lastmod
      ? manifest.lastmod
      : seoManifest.lastmod,
  routes: [...preservedRoutes, ...strategyRoutesFromContent(manifest)],
}

await writeFile(seoManifestPath, `${JSON.stringify(nextSeoManifest, null, 2)}\n`, 'utf8')
await mkdir(path.dirname(seedSqlPath), { recursive: true })
await writeFile(seedSqlPath, renderSeedSql(manifest), 'utf8')

console.log(
  `Generated ${manifest.entries.length} strategy SEO routes and ${path.relative(
    repoRoot,
    seedSqlPath,
  )}.`,
)
