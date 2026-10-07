# Repo guidance

## What this is

This repo is an agent skill for FortiCNAPP (formerly Lacework) investigations. It uses native `lacework` CLI commands and direct REST API calls, through `lacework api` or any HTTP client. The agent picks the one that fits the task.

## Project structure

```
SKILL.md              # Agent instructions, hub reference for CLI/API/LQL
README.md             # Install + setup for humans
AGENTS.md             # This file. CLAUDE.md points here.
references/           # Deep dives, loaded on demand from SKILL.md
agents/openai.yaml    # Codex CLI interface metadata
LICENSE               # MIT
```

There are no scripts. Agent runtimes read the skill as Markdown. SKILL.md is the entry point. It links into `references/` for detail.

## What goes in

Document what works:

- Endpoints, and what each one returns
- Commands that run
- Fields an integrator needs to write correct code

"Counts are strings on this endpoint" is the right level of detail.

## Style

- Write in STE-Lite: the ASD-STE100 writing rules, without its approved-word dictionary.
  - One instruction per sentence.
  - Active voice, present tense.
  - Procedure sentences of 20 words or fewer. Descriptive sentences of 25 words or fewer.
  - Positive commands. For a real prohibition, put "never" or "do not" directly before the verb.
  - One term for each concept in a file.
  - Plain, common technical words. Product, API and CLI names stay as they are.
- Casual tone. Contractions are fine.
- Keep SKILL.md self-contained. Refer only to public sources.
- Make sure no example identifies a customer.
- Make sure each shell example runs in sh, bash and zsh. See the next section.

## Shell portability

- zsh doesn't word-split an unquoted parameter. A `for x in $LIST` loop runs once.
- Read a list with `printf | while IFS= read -r`.
- A `while` loop on the right of a pipe runs in a subshell. Collect its output in a file.
- Use a temporary file in place of process substitution `<(...)`. Process substitution isn't POSIX and has no PowerShell form.

## API gotchas

Keep API gotchas in SKILL.md and `references/` only. A second copy gets out of date.

Check any claim about API behaviour against the current doc PDF before it goes in. SKILL.md shows how to get the PDF.
