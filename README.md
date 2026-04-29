# AI agent skill for the FortiCNAPP / Lacework CLI

![Format](https://img.shields.io/badge/format-Agent%20Skill-blue)
![License](https://img.shields.io/github/license/andrewbearsley/forticnapp-lacework-skill)

A skill for AI coding agents (Cursor, Claude Code, OpenClaw) that documents how to investigate <a href="https://www.fortinet.com/products/forticnapp" target="_blank">FortiCNAPP</a> (formerly Lacework) data. Covers both the native `lacework` CLI commands and direct REST API calls (via `lacework api` or any HTTP client). Pick whichever is more convenient for the task: native CLI verbs (`lacework cloud-account list`, `lacework vulnerability host show-assessment`) for common workflows, raw API calls for endpoints the CLI doesn't expose or for bulk operations.

The skill covers cloud-account integrations, vulnerability assessments, agents, alerts, compliance reports, and LQL queries.

## What it does

- Check status of cloud-account integrations (AWS, Azure, GCP), including AwsSidekickOrg, AzureSidekick, AzureCfg, and AwsCfg
- List agents and compare agent-based vs agentless coverage per host
- Query vulnerability assessments by host, by CVE, or by time range
- Pull compliance reports (CIS, SOC 2, custom frameworks)
- Run LQL queries against config datasources
- Show alerts with full detail
- Discover available API endpoints via `/api/v2/schemas`

The full reference (parameters, return values, sample commands, gotchas) lives in [`skills/forticnapp-lacework/SKILL.md`](skills/forticnapp-lacework/SKILL.md).

## Install

### Claude Code

```bash
git clone https://github.com/andrewbearsley/forticnapp-lacework-skill.git ~/.claude/skills/forticnapp-lacework-repo
ln -s ~/.claude/skills/forticnapp-lacework-repo/skills/forticnapp-lacework ~/.claude/skills/forticnapp-lacework
```

Or copy the skill directory directly:

```bash
mkdir -p ~/.claude/skills
cp -r skills/forticnapp-lacework ~/.claude/skills/
```

### Cursor

```bash
mkdir -p .cursor/skills
cp -r skills/forticnapp-lacework .cursor/skills/
```

### OpenClaw

```bash
mkdir -p ~/.openclaw/skills
cp -r skills/forticnapp-lacework ~/.openclaw/skills/
```

## Setup

### 1. Install the lacework CLI

```bash
brew install lacework/tap/lacework-cli      # macOS
# or follow https://docs.fortinet.com/document/forticnapp/latest/cli-reference
```

### 2. Create an API key

In the FortiCNAPP console: **Settings > API Keys > Add New**. Save the Key ID and Secret (the secret is shown only once).

### 3. Create a credentials file

```bash
cat > ~/.lacework-credentials.json << 'EOF'
{
  "account": "YOUR_ACCOUNT",
  "keyId": "YOUR_KEY_ID",
  "secret": "YOUR_SECRET"
}
EOF
chmod 600 ~/.lacework-credentials.json
```

`account` is the subdomain part of `<account>.lacework.net`.

### 4. Verify

```bash
ACCOUNT=$(jq -r '.account' ~/.lacework-credentials.json)
KEY=$(jq -r '.keyId' ~/.lacework-credentials.json)
SECRET=$(jq -r '.secret' ~/.lacework-credentials.json)

lacework cloud-account list --account "$ACCOUNT" --api_key "$KEY" --api_secret "$SECRET" --json
```

If that returns JSON, you're set. Point your agent at this skill and ask it to investigate.

## Skill format

The skill file uses standard agent-skill frontmatter:

```yaml
---
name: forticnapp-lacework
description: Investigate FortiCNAPP (formerly Lacework) integrations, ...
version: 1.0.0
homepage: https://github.com/andrewbearsley/forticnapp-lacework-skill
---
```

It works in any agent runtime that loads `SKILL.md` files (Cursor, Claude Code, OpenClaw, etc.).

## Related

- <a href="https://docs.fortinet.com/document/forticnapp/latest/cli-reference" target="_blank">Lacework CLI reference</a>
- <a href="https://docs.fortinet.com/document/forticnapp/latest/api-reference" target="_blank">Lacework API reference</a>
- <a href="https://api.lacework.net/api/v2/docs" target="_blank">Interactive API docs</a> (use this for endpoint discovery)

## Disclaimer

This is an unofficial community project. It is not affiliated with, endorsed by, or sponsored by Fortinet. "FortiCNAPP" and "Lacework" are trademarks of their respective owners and are used here for descriptive purposes only.

The skill documents commands and API endpoints that an AI agent may execute against your account. By default everything is read-only, but the `make_api_call` tool can issue write requests if asked. You're responsible for the agent that loads this skill, the credentials it has access to, and any operations it performs. API behaviour can change without notice; the gotchas in `SKILL.md` were verified against FortiCNAPP as of April 2026.

Use at your own risk. See [LICENSE](LICENSE) for the full warranty disclaimer.

## License

MIT. See [LICENSE](LICENSE).
