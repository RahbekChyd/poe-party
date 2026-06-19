# Public Release Checklist

Use this checklist before publishing a clean public PoE Party repository.

## Local Scans

Run scanner checks before pushing public code:

```powershell
$repo = (Get-Location).ProviderPath
docker run --rm -v "${repo}:/repo" ghcr.io/gitleaks/gitleaks:latest detect --source=/repo --redact --no-banner --verbose
docker run --rm -v "${repo}:/repo" trufflesecurity/trufflehog:latest git file:///repo --only-verified --no-update
```

For a clean public export, scan the exported tree too:

```powershell
$export = "C:\path\to\poe-party-public"
docker run --rm -v "${export}:/repo" ghcr.io/gitleaks/gitleaks:latest dir /repo --redact --no-banner --verbose
```

Raw scans of the private working directory may report ignored local files such as `.env.local`,
`supabase/functions/.env`, `dist/`, or `.tmp-pob-src/`. Those findings are blockers only if the
files are tracked or copied into the public export.

## Clean Export Policy

Prefer a clean initial public import over preserving private Git history. The history scan found no
secrets, but old history contains non-secret residue such as author email metadata, old hosted
project references, personal contact/account literals, and deleted example/log artifacts.

The public export should include:

- tracked source files from the current tree;
- intended new public docs such as `LICENSE`, `CONTRIBUTING.md`, `SECURITY.md`, and OSS policy docs;
- validation workflows only.

The public export must not include:

- `.git/`, `node_modules/`, `dist/`, `.tmp-pob-src/`, or local env files;
- production deploy workflows;
- private comp-grant or billing-repair scripts;
- production logs, user exports, or hosted-service secrets.

## Final Local Validation

Before pushing the public repo:

```powershell
npm exec --yes pnpm@10.33.2 -- install --frozen-lockfile
npm exec --yes pnpm@10.33.2 -- type-check
npm exec --yes pnpm@10.33.2 -- lint
npm exec --yes pnpm@10.33.2 -- build
git diff --check
```

The build currently emits known upstream HeroUI CSS minifier warnings and an existing large chunk
warning.

## Publish Steps

1. Create a new GitHub repository while it is still private.
2. Add the new remote to the clean export repo.
3. Push the single clean initial commit.
4. Confirm GitHub secret scanning and Dependabot/security alerts are enabled.
5. Review the rendered README, LICENSE, SECURITY, and public workflows.
6. Make the GitHub repo public only after the clean export scan and rendered review pass.

Do not connect public repo workflows to production Supabase, Vercel, Stripe, or worker credentials.
Hosted production deployment remains private operations work.
