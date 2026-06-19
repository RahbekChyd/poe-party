---
name: poe-party-self-improve
description: Maintain PoE Party project skills after meaningful work. Use at the end of tasks in the poe-group-tool repo when Codex learned a recurring project rule, rediscovered non-obvious context, changed workflows, touched architecture/docs, or noticed that an existing PoE Party skill or reference is stale, incomplete, or over-triggering.
---

# PoE Party Self Improve

Use this skill as the closing loop for meaningful PoE Party work. Keep it lightweight: update working memory only when the next agent would genuinely move faster or safer because of the change.

## End-of-Task Review

Before the final response, quickly answer:

- What did the task change or reveal that is likely to recur?
- Did Codex need to rediscover a repo convention, domain rule, command, env detail, or edge case?
- Did a PoE Party skill trigger at the right time and give enough guidance?
- Did any repo doc become the better source of truth than a skill reference?

If the answer is "nothing durable", do not edit skills. Mention no skill update was needed only if it is useful to the user.

## Update Rules

- Prefer editing the smallest relevant skill or reference file.
- Keep volatile facts out of `SKILL.md`; link to repo docs or tell Codex how to verify current official docs.
- Do not duplicate large chunks from `README.md`, `docs/`, migrations, or source files.
- Do not add task history, changelogs, or "what happened today" notes.
- If an instruction applies across all PoE Party tasks, update `poe-party-project-context`; if it applies only to one workflow, update the narrower skill.
- If a new repeated workflow appears, propose or create a new skill rather than bloating an unrelated one.
- After changing active local skills, mirror the same PoE Party skill changes into the repo-tracked backup under `.codex/skills/`.

## Validation

After editing a skill, run:

```powershell
python <codex-home>/skills/.system/skill-creator/scripts/quick_validate.py <codex-home>/skills/<skill-name>
```

For multiple changed skills, validate each one. If validation fails, fix the skill before the final response.

## Skill Map

Read `references/skill-map.md` when choosing which skill to update.
