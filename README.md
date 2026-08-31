# AI agent skill for the FortiCNAPP / Lacework CLI

![Format](https://img.shields.io/badge/format-Agent%20Skill-blue)
![License](https://img.shields.io/github/license/andrewbearsley/forticnapp-lacework-skill)

A skill for AI coding agents (Claude Code, Codex, GitHub Copilot) that investigates <a href="https://www.fortinet.com/products/forticnapp" target="_blank">FortiCNAPP</a> (formerly Lacework) data. Works on macOS, Linux, and Windows.

Covers the native `lacework` CLI verbs (`lacework cloud-account list`, `lacework vulnerability host show-assessment`) and direct REST API calls via `lacework api`. Use CLI verbs for common workflows; drop to raw API for endpoints the CLI doesn't expose or for bulk operations.

## What it does

- Check the status of cloud-account integrations (AWS, Azure, GCP), including AwsSidekickOrg, AzureSidekick, AzureCfg, and AwsCfg
- List agents and compare agent-based vs agentless coverage per host
- Query vulnerability assessments by host, by CVE, or by time range
- Pull compliance reports (CIS, SOC 2, custom frameworks)
- Run LQL queries against config datasources
- Show alerts with full detail
- Discover available API endpoints via `/api/v2/schemas`

The hub reference lives in [`SKILL.md`](SKILL.md); deep dives are in [`references/`](references/) (api-and-cli, lql, reports, risk-surface, vulnerabilities).

## Install

Clone into your agent's skills directory. Assumes the agent runtime is already installed.

| Runtime | Target path |
|---|---|
| Claude Code | `~/.claude/skills/forticnapp-lacework` |
| Codex | `~/.agents/skills/forticnapp-lacework` |
| GitHub Copilot | `~/.copilot/skills/forticnapp-lacework` or `~/.agents/skills/forticnapp-lacework` |

```bash
git clone https://github.com/andrewbearsley/forticnapp-lacework-skill.git <target-path>
```

For a single repository rather than your whole account, clone into `.agents/skills/forticnapp-lacework` inside that repo. Codex and GitHub Copilot both read it there, and Copilot also reads `.github/skills` and `.claude/skills`.

Windows: substitute `$env:USERPROFILE` for `~`.

Invoke with `$forticnapp-lacework` in Codex. Claude Code and Copilot select it automatically when a request matches the description.

## Setup

### 1. Install the lacework CLI

macOS:

```bash
brew install lacework/tap/lacework-cli
```

Linux:

```bash
curl https://raw.githubusercontent.com/lacework/go-sdk/main/cli/install.sh | bash
```

Windows (PowerShell):

```powershell
Set-ExecutionPolicy Bypass -Scope Process -Force
iwr -useb https://raw.githubusercontent.com/lacework/go-sdk/main/cli/install.ps1 | iex
```

Or follow the <a href="https://docs.fortinet.com/document/forticnapp/latest/cli-reference" target="_blank">FortiCNAPP CLI reference</a> for other platforms.

### 2. Create an API key

In the FortiCNAPP console: **Settings > API Keys > Add New**. Save the Key ID and Secret (the secret is shown only once).

### 3. Create a credentials file

macOS / Linux:

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

Windows (PowerShell):

```powershell
@'
{
  "account": "YOUR_ACCOUNT",
  "keyId": "YOUR_KEY_ID",
  "secret": "YOUR_SECRET"
}
'@ | Set-Content -Encoding utf8 "$env:USERPROFILE\.lacework-credentials.json"
```

`account` is the subdomain part of `<account>.lacework.net`.

### 4. Verify

macOS / Linux:

```bash
ACCOUNT=$(jq -r '.account' ~/.lacework-credentials.json)
KEY=$(jq -r '.keyId' ~/.lacework-credentials.json)
SECRET=$(jq -r '.secret' ~/.lacework-credentials.json)

lacework cloud-account list --account "$ACCOUNT" --api_key "$KEY" --api_secret "$SECRET" --json
```

Windows (PowerShell):

```powershell
$Creds = Get-Content "$env:USERPROFILE\.lacework-credentials.json" | ConvertFrom-Json
lacework cloud-account list --account $Creds.account --api_key $Creds.keyId --api_secret $Creds.secret --json
```

If that returns JSON, you're set.

## Related

- <a href="https://docs.fortinet.com/document/forticnapp/latest/cli-reference" target="_blank">Lacework CLI reference</a>
- <a href="https://docs.fortinet.com/document/forticnapp/latest/api-reference" target="_blank">Lacework API reference</a>
- <a href="https://api.lacework.net/api/v2/docs" target="_blank">Interactive API docs</a> (use this for endpoint discovery)

## Disclaimer

This is an unofficial community project. It is not affiliated with, endorsed by, or sponsored by Fortinet. "FortiCNAPP" and "Lacework" are trademarks of their respective owners and are used here for descriptive purposes only.

The skill documents commands and API endpoints that an AI agent may execute against your account. Every documented workflow is read-only, but `lacework api post` and the other write verbs are available to any agent that is asked to use them. You're responsible for the agent that loads this skill, the credentials it has access to, and any operations it performs. API behaviour can change without notice. Check any gotcha against the current documentation before you rely on it; `SKILL.md` covers how to pull the official PDF.

Use at your own risk. See [LICENSE](LICENSE) for the full warranty disclaimer.

## License

MIT. See [LICENSE](LICENSE).
