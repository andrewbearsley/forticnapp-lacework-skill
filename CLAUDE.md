# CLAUDE.md

## What this is

Agent skill packaging FortiCNAPP (Lacework) investigation patterns. Covers both native `lacework` CLI commands and direct REST API calls (via `lacework api` or any HTTP client) so an agent can pick whichever fits the task.

## Project structure

```
SKILL.md              # Agent instructions, hub reference for CLI/API/LQL
README.md             # Install + setup for humans
references/           # Deep dives: api-and-cli, lql, reports, risk-surface, vulnerabilities
agents/openai.yaml    # Codex CLI interface metadata
LICENSE               # MIT
```

No scripts. The skill is Markdown consumed by agent runtimes. SKILL.md is the entry point; it links into `references/` for detail.

## Two surfaces

`references/` and the root files are **public**. `internal/` is gitignored and never ships.

Public carries capability: endpoints that work, commands that run, fields an integrator needs. Internal carries everything else: absent endpoints, rejected auth, response inconsistencies, probing techniques, limitation maps.

A limitation map in a public repo is competitor material. Before adding a line to a public file, apply the split:

| Public | Internal |
|---|---|
| An endpoint and what it returns | An endpoint that does not exist |
| How to handle a response shape | That the shapes are inconsistent |
| A working command | A command that fails, and its error |
| What the product does | What the product cannot do |

**Commit messages are public too.** They narrate what was tried and what failed, and every historical file version stays reachable with `git show <sha>:<path>`. Removing a line from a file does not remove it from the repo. Write the message to the same standard as the file, and keep sensitive material in `internal/` from the first commit.

**Never trust a zero from a piped grep.** `grep` here wraps ugrep, and `$(git show ... | grep -c ...)` inside a loop returns 0 whatever the content. Write to a file, grep the file, use `-E` for alternation, and prove the check works against known-matching content before believing a clean result.

State a field-level fact when an integrator needs it, without the judgement. "Counts are strings on this endpoint" belongs in public. "The API is inconsistent" does not.

## Style

- Casual tone in docs (not corporate)
- Commits as `andrewbearsley`, not Claude
- Keep SKILL.md self-contained: no internal references, no customer-identifiable examples

## API gotchas

Do not mirror them here. They live in SKILL.md and `references/`, and a second copy goes stale without anyone noticing.

Anything asserted about API behaviour needs a check against the current doc PDF before it goes in. SKILL.md documents how to pull one.
