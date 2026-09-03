---
name: forticnapp-lacework
description: Investigate FortiCNAPP (formerly Lacework) data with the lacework CLI and API. Use when checking cloud integrations, agents, alerts, host vulnerabilities, risk surface, compliance reports, LQL queries, datasource schemas, or discovering authenticated FortiCNAPP API endpoints.
allowed-tools: Bash, Read, Grep, Glob
metadata:
  version: "2.4.0"
  homepage: "https://github.com/andrewbearsley/forticnapp-lacework-skill"
---

# FortiCNAPP / Lacework CLI

Use the local `lacework` CLI for read-only investigation and data extraction. Prefer JSON output and parse with `jq`.

## Ground rules

- Use read-only commands by default: `list`, `show`, `query`, `get`, and API `GET`/search requests.
- Add `--json --noninteractive` for scripts and agent runs.
- In a network-restricted or approval-gated environment, obtain permitted network access before the first API-backed `lacework` command. Do not use a failed DNS or connection attempt as a connectivity probe.
- Treat DNS, TLS, timeout, and connection errors as execution-environment failures, not FortiCNAPP health findings. Retry once with permitted network access before reporting the check as incomplete.
- Verify the effective account and subaccount before tenant-scoped work. Pass the intended `--profile`, `--account`, and `--subaccount` explicitly on every live command when they are known.
- Summarize JSON locally with `jq` **in the first command, not after seeing the raw output**. In an agent runtime the unreduced response is already in the tool trace and cannot be taken back. Do not paste full integration, agent, or alert payloads unless the user requests them. Raw payloads contain cloud account IDs, role ARNs, queue URLs, hostnames, internal IPs, and the email address in `createdOrUpdatedBy`.
- Never print, commit, or paste API secrets in final output.
- Treat credential files as local inputs only. Do not assume they live in a repo.
- Prefer short API calls and scoped filters before broad exports.
- For vulnerability host search, keep time windows to 7 days or less unless the API behaviour is known to permit more.
- If a command shape is uncertain, run `lacework <command> --help` or use the API docs before guessing.

## Credential pattern

Use an existing CLI profile, or a JSON credential file shaped like this:

```json
{
  "account": "account-name",
  "keyId": "api-key-id",
  "secret": "api-secret"
}
```

Load credentials into shell variables using the block for the user's shell.

**macOS / Linux (bash / zsh):**

```bash
CREDENTIALS_PATH="<credentials_path>"
ACCOUNT=$(jq -r '.account' "$CREDENTIALS_PATH")
API_KEY=$(jq -r '.keyId' "$CREDENTIALS_PATH")
API_SECRET=$(jq -r '.secret' "$CREDENTIALS_PATH")
```

**Windows (PowerShell):**

```powershell
$CredentialsPath = "<credentials_path>"
$Creds = Get-Content $CredentialsPath | ConvertFrom-Json
$ACCOUNT = $Creds.account
$API_KEY = $Creds.keyId
$API_SECRET = $Creds.secret
```

Pass credentials explicitly:

```bash
lacework <command> \
  --account "$ACCOUNT" \
  --api_key "$API_KEY" \
  --api_secret "$API_SECRET" \
  --json --noninteractive
```

On Windows PowerShell, use a backtick `` ` `` for line continuation instead of `\`, and drop the double quotes around `$ACCOUNT` etc.

For subaccounts, include `--subaccount "$SUBACCOUNT"` only when the user provides one or the current account requires it.

Alternative: `lacework configure --profile <name>` stores credentials in the CLI config, and subsequent calls only need `--profile <name>`. Same syntax on all platforms.

## Core commands

Check cloud integrations:

```bash
lacework cloud-account list \
  --account "$ACCOUNT" --api_key "$API_KEY" --api_secret "$API_SECRET" \
  --json --noninteractive

lacework cloud-account show <GUID> \
  --account "$ACCOUNT" --api_key "$API_KEY" --api_secret "$API_SECRET" \
  --json --noninteractive
```

List workload agents (the FortiCNAPP host agent, unrelated to any AI coding agent):

```bash
lacework agent list \
  --account "$ACCOUNT" --api_key "$API_KEY" --api_secret "$API_SECRET" \
  --json --noninteractive
```

List and inspect alerts:

```bash
lacework alert list \
  --account "$ACCOUNT" --api_key "$API_KEY" --api_secret "$API_SECRET" \
  --json --noninteractive

lacework alert show <GUID> \
  --account "$ACCOUNT" --api_key "$API_KEY" --api_secret "$API_SECRET" \
  --json --noninteractive
```

Run a direct API call:

```bash
lacework api get /api/v2/CloudAccounts \
  --account "$ACCOUNT" --api_key "$API_KEY" --api_secret "$API_SECRET" \
  --json --noninteractive
```

## Common workflows

### Tenant healthcheck

A customer-facing report in four sections, run in order. Each answers a question the
customer actually asks. Full detail in [references/healthcheck.md](references/healthcheck.md):

| Section | The customer's question | Covers |
|---|---|---|
| 1 Overall setup | What have we got, and does it cover what we own? | Integration Coverage, Integration State, Agentless Coverage, Agent Coverage, Agent Versions, Notification Alerts, AI Assist. |
| 2 Threats | What has actually been detected? | Composite alerts first, then anomalies, then policy noise. Never severity-sorted. |
| 3 Risks | What are we exposed to? | Critical misconfigurations from compliance reports, plus internet-exposed live vulnerable packages. Misconfiguration risk needs no agent, so it often carries the section. |
| 4 Recommendations | What should we do about it? | Derived from 1 to 3, ranked act-now / this-quarter / tidy. The deliverable. |

Sections 1 to 3 gather; section 4 is the deliverable. Do not hand over the first three alone.

The commands below cover the ingestion and alert-rollup part of section 1:

1. Read the effective account and subaccount with `lacework configure show account` and `lacework configure show subaccount`. Compare them with the requested target before making live calls. Do not list all profiles.
2. Obtain network permission first when the execution environment restricts outbound access.
3. Run these read-only checks with explicit tenant flags:
   - `lacework cloud-account list` for integration enablement and state.
   - `lacework agent list` for agent status and recency.
   - `lacework alert list --start -24h --end now` for current security attention.
4. Capture and reduce each JSON result separately. Report counts, unhealthy or disabled integrations, stale agents, alert severities, and recurring alert patterns. Avoid exposing identifiers that are not necessary to explain health.
5. Distinguish platform health from security posture. Healthy ingestion with open high-severity alerts is "operational, security attention required," not simply healthy.
6. If one check still fails after an authorized retry, mark only that component as incomplete and include the transport error category. Do not infer tenant failure from a local execution error.

Example command shape (replace every placeholder; keep the same values across the healthcheck):

Reduce on the **first** command, not after inspecting raw output. Every one of these
prints health without emitting an account ID, role ARN, queue URL, hostname, IP, or
email. Replace every placeholder and keep the same values across the healthcheck.

```bash
# Define once. A function, not a variable: zsh does not word-split an unquoted
# parameter, so a TENANT='--flag ...' string arrives as one bad argument.
lw() { lacework "$@" --profile "<profile>" --account "<account>" --subaccount "<subaccount>" --json --noninteractive; }

# Integrations: rollup by type
lw cloud-account list \
  | jq -r 'group_by(.type)[]
      | "\(.[0].type)\ttotal=\(length)\tenabled=\([.[]|select(.enabled==1)]|length)\tok=\([.[]|select(.state.ok)]|length)"'

# Integrations: only the ones needing attention
lw cloud-account list \
  | jq -r '[.[] | select(.enabled != 1 or .state.ok != true)]
      | if length == 0 then "all integrations enabled and healthy"
        else .[] | "\(.type)\tenabled=\(.enabled)\tok=\(.state.ok)\tlastSuccess=\(if .state.lastSuccessfulTime then (.state.lastSuccessfulTime/1000|todate) else "never" end)" end'

# Workload agents: fleet summary
lw agent list \
  | jq -r '"agents=\(length)  statuses=\([.[].status]|unique|join(","))  versions=\([.[].agentVersion]|unique|join(","))  oldestCheckin=\([.[].lastUpdate]|min)"'

# Alerts: severity rollup
lw alert list --start -24h --end now \
  | jq -r 'group_by(.severity)[] | "\(.[0].severity)\tcount=\(length)\topen=\([.[]|select(.status=="Open")]|length)"'

# Alerts: recurring patterns
lw alert list --start -24h --end now \
  | jq -r 'group_by(.alertName)[] | select(length>1) | "\(length)x\t\(.[0].severity)\t\(.[0].alertName)"' | sort -rn
```

The examples in this skill are bash and zsh. On Windows, define `lw` in PowerShell and
splat the shared flags, because a single string of flags arrives as one argument:

```powershell
function lw { $f = @('--profile','<profile>','--account','<account>','--subaccount','<subaccount>','--json','--noninteractive'); lacework @args @f }
```

`jq` filters carry over unchanged inside single quotes. Use a backtick for line
continuation instead of `\`.

Only drop to `cloud-account show <GUID>` or `alert show <GUID>` once a rollup points at
something specific, and report the finding rather than the payload.

**Response shapes by command.** Match the filter to the shape:

| Shape | Commands |
|---|---|
| Bare array | `cloud-account list`, `agent list`, `alert list`, `alert-channel list`, `policy list` |
| `{"data": [...]}` | `alert-rule list`, `report-rule list`, `resource-group list` |
| `null` when empty | any `lacework api post ...` search endpoint |

The REST API wraps in `data`. Use an explicit type test when a filter must handle either shape:

```bash
ROWS='if type=="object" then (.data // []) else . end'
lacework alert-rule list ... | jq -r "$ROWS"' | length'
```

Do not run the first live calls in parallel when doing so would trigger multiple network approvals or duplicate expected failures. After access is established, independent read-only checks may run concurrently.

For the rest of section 1 and for sections 2 to 4, see
[references/healthcheck.md](references/healthcheck.md). It carries the filters that keep a
risk report honest: `machineStatus` for live hosts, excluding suppressed `Exception` rows,
and the 5000-row paging cap.

### Cloud integration health

1. List integrations with `cloud-account list`.
2. Filter by `type` when looking for a provider or integration class.
3. Show the target integration by GUID.
4. Check `enabled`, `state.ok`, `lastSuccessfulTime`, and `state.details.message`.

See [references/api-and-cli.md](references/api-and-cli.md) for endpoint discovery and cloud account examples.

### Host vulnerabilities

Use the host vulnerability search API when the CLI's high-level vulnerability commands are too broad.

```bash
lacework api post /api/v2/Vulnerabilities/Hosts/search \
  -d '{
    "filters": [
      {"field": "mid", "expression": "eq", "value": "<MID>"}
    ],
    "timeFilter": {
      "startTime": "<start-iso8601>",
      "endTime": "<end-iso8601>"
    },
    "returns": ["mid", "evalCtx", "startTime", "endTime", "evalGuid", "vulnId", "severity"]
  }' \
  --account "$ACCOUNT" --api_key "$API_KEY" --api_secret "$API_SECRET" \
  --json --noninteractive
```

Group by `evalGuid` to compare unique assessments. Filter on `evalCtx.collector_type` for `Agent` vs `Agentless`.

See [references/vulnerabilities.md](references/vulnerabilities.md) for CVE, collector type, provider, and assessment comparison patterns.

### Risk surface reporting

Use current-state vulnerability observation APIs to report exposed hosts, high-severity findings, public exploit exposure, host risk scores, and active container image risk. Start with internet-exposed Critical or High host observations:

```bash
BODY=$(jq -cn '{
  filters: [
    {field:"internetExposed", expression:"eq", value:1},
    {field:"severity", expression:"in", values:["Critical","High"]},
    {field:"observationStatusCategory", expression:"eq", value:"Vulnerable"}
  ],
  returns: [
    "hostMachineId",
    "hostName",
    "hostRiskScore",
    "internetExposed",
    "publicFacing",
    "externalIp",
    "accountId",
    "cloudProvider",
    "machineTags",
    "severity",
    "observationStatusCategory",
    "vulnId",
    "vulnPublicExploitAvailable"
  ]
}')

lacework api post /api/v2/VulnerabilityObservations/Hosts/search \
  -d "$BODY" \
  --account "$ACCOUNT" --api_key "$API_KEY" --api_secret "$API_SECRET" \
  --json --noninteractive
```

Follow `paging.urls.nextPage` until it is null before grouping large result sets. Group results by host and report max risk score, exposure, cloud identifiers, severity counts, and public exploit counts.

See [references/risk-surface.md](references/risk-surface.md) for host, image, and open-port exposure query patterns.

### Code security

Application security findings read back with an ordinary API key:

```bash
lw api get /api/v2/CodeSec/vulnerabilities        # third-party CVEs
lw api get /api/v2/CodeSec/weaknesses             # internal code, by CWE
lw api get /api/v2/CodeSec/secrets                # hard-coded secrets
lw api get /api/v2/CodeSec/components             # dependency inventory with licences
lw api get /api/v2/CodeSec/repositories/summary   # per-repository scan metadata
```

All GET, no parameters, wrapped as `{"data": [...]}`, complete set each time. Subtract `numberOfExceptionInstances` from `numberOfInstances` or the total includes suppressed findings. Subaccount comes from `Account-Name`, which `--subaccount` sets. `/secrets` returns its counts as strings while the other endpoints use numbers, so cast with `tonumber` there.

`/api/v2/IacService/Policies` returns the infrastructure as code policy catalogue. See [references/code-security.md](references/code-security.md) for the full endpoint list and worked queries.

### Compliance reports

Use `GET /api/v2/Reports` for compliance report data (recommendations, evaluations, findings):

```bash
lacework api get "api/v2/Reports?format=json&primaryQueryId=<cloud-account-id>&reportType=<report-type>" \
  --account "$ACCOUNT" --api_key "$API_KEY" --api_secret "$API_SECRET" \
  --json --noninteractive
```

Custom framework definitions live at two different endpoints depending on how the framework was created. `/api/v2/ReportDefinitions` for API-created, `/api/v1/Frameworks` for UI-created. See [references/reports.md](references/reports.md) for AWS/Azure report parameters and the custom-framework split.

A report also records controls that could not be evaluated, which read as a gap rather than a violation and so never appear in a severity rollup. See [references/compliance-errors.md](references/compliance-errors.md) for the detection predicate, the per-account walk across an AWS Organization, report type codes, and scan triggering.

### LQL queries

List, inspect, preview, then query:

```bash
lacework query list-sources --json --noninteractive
lacework query show-source <DATASOURCE> --json --noninteractive
lacework query preview-source <DATASOURCE> --json --noninteractive
```

Never guess JSON key names inside `RESOURCE_CONFIG`. The docs do not publish that schema. Discover keys via `show-source` (which names the provider API call), `preview-source`, or an explore query. Keys are case-sensitive.

For syntax rules, policy-evaluation constraints (queries used by policies must `return distinct` and return only root-datasource columns when they expand arrays or join `MANY`-cardinality datasources), and the query-to-policy workflow (`query create` → `query run` → `policy create` → `policy update`), see [references/lql.md](references/lql.md).

## Documentation

- CLI reference: https://docs.fortinet.com/document/forticnapp/latest/cli-reference
- API reference: https://docs.fortinet.com/document/forticnapp/latest/api-reference
- Interactive API docs: https://api.lacework.net/api/v2/docs
- LQL reference: https://docs.fortinet.com/document/forticnapp/latest/lql-reference/598361/lql-overview

Read any of these with `curl` alone. docs.fortinet.com serves search results and section text as plain HTML, so no browser and no JavaScript rendering are needed. See [references/docs-access.md](references/docs-access.md) for the search, section-read, and whole-document PDF recipes.

### Where each answer lives

| Question | Source |
|---|---|
| CLI command shapes and flags | `cli-reference` |
| Product behaviour, onboarding, cloud integrations, agentless scanning, policies, alert channels | `administration-guide` |
| LQL grammar and functions | `lql-reference` |
| Version-specific changes | `release-notes` |
| Authentication, tokens, datasources, query execution | `api-reference` |
| REST endpoint catalog, request and response shapes | https://api.lacework.net/api/v2/docs |

The published API reference covers authentication, datasources, and query execution. The interactive API docs carry the full endpoint catalog, so check endpoint names and payload shapes there rather than concluding an endpoint is absent.

Use these sources when verifying a claim about FortiCNAPP CLI syntax, product behaviour, API behaviour, LQL grammar, or policy schemas before relying on it. The official documentation is the ground truth, not community references.
