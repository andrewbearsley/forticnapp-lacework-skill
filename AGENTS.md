# Repo guidance

## What this is

Agent skill packaging FortiCNAPP (Lacework) investigation patterns. Covers both native `lacework` CLI commands and direct REST API calls (via `lacework api` or any HTTP client) so an agent can pick whichever fits the task.

## Project structure

```
SKILL.md              # Agent instructions, hub reference for CLI/API/LQL
README.md             # Install + setup for humans
AGENTS.md             # This file. CLAUDE.md points here.
references/           # Deep dives, loaded on demand from SKILL.md
agents/openai.yaml    # Codex CLI interface metadata
LICENSE               # MIT
```

No scripts. The skill is Markdown consumed by agent runtimes. SKILL.md is the entry point; it links into `references/` for detail.

## What goes in

Document what works: endpoints and what they return, commands that run, and the fields an integrator needs to write correct code. "Counts are strings on this endpoint" is the right level of detail.

## Style

- Casual tone in docs (not corporate)
- Keep SKILL.md self-contained: no internal references, no customer-identifiable examples
- Shell examples must run in sh, bash and zsh. zsh does not word-split an unquoted
  parameter, so `for x in $LIST` iterates once. Use `printf | while IFS= read -r`, and
  collect to a file because a `while` on the right of a pipe runs in a subshell. Avoid
  process substitution `<(...)`; it is not POSIX and has no PowerShell form.

## API gotchas

Do not mirror them here. They live in SKILL.md and `references/`, and a second copy goes stale without anyone noticing.

Anything asserted about API behaviour needs a check against the current doc PDF before it goes in. SKILL.md documents how to pull one.
