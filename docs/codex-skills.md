# Codex Skills

This repo tracks PoE Party project skills under `.codex/skills/`.

Codex discovers active local copies from the user skills directory. On Windows, that is normally:

```powershell
$env:USERPROFILE\.codex\skills
```

## Restore From Repo

If the machine or Codex profile is rebuilt, copy the tracked project skills back into the user skills directory:

```powershell
$skillsDir = Join-Path $env:USERPROFILE '.codex\skills'
New-Item -ItemType Directory -Force $skillsDir | Out-Null
Copy-Item -Path .codex\skills\poe-party-* -Destination $skillsDir -Recurse -Force
```

## Update Rule

Treat `.codex/skills/` in this repo as the source-of-truth backup for PoE Party skills. After changing active local skills, mirror the same changes back into `.codex/skills/` before committing.
