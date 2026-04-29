# CLAUDE.md

## What this is

Agent skill packaging FortiCNAPP (Lacework) investigation patterns. Covers both native `lacework` CLI commands and direct REST API calls (via `lacework api` or any HTTP client) so an agent can pick whichever fits the task.

## Project structure

```
skills/forticnapp-lacework/SKILL.md   # Agent instructions, full CLI/API reference, LQL guide
README.md                              # Install + setup for humans
LICENSE                                # MIT
```

No scripts. The skill is a single Markdown file consumed by agent runtimes.

## Origin

Started life as a Cursor skill, then lifted into its own repo so it could be shared and version-controlled independently. This repo is now the source of truth.

## Style

- Casual tone in docs (not corporate)
- Commits as `andrewbearsley`, not Claude
- Keep SKILL.md self-contained: no internal references, no customer-identifiable examples

## API gotchas (mirrored from SKILL.md for quick reference)

*Verified against FortiCNAPP as of April 2026. Re-check before relying on these.*


- AWS compliance scans cover ALL integrated accounts at once. No per-account targeting (Azure has `run-assessment <tenant_id>`, AWS does not).
- `/api/v2/AuditLogs/search` only supports `timeFilter`, not field-level filters.
- `/api/v2/TeamMembers` is deprecated on new RBAC accounts. Use `TeamUsers` instead.
- `/api/v2/ReportDefinitions` is unreliable for recently-added custom frameworks. Use `/api/v2/Reports` instead.
- Vulnerability host search has a 7-day max time window.
- SAML/SSO config is UI-only. No API endpoint.
