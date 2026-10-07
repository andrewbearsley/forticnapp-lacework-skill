---
name: forticnapp-lacework
description: Investigate FortiCNAPP (formerly Lacework) data with the lacework CLI and API. Use when checking cloud integrations, agents, alerts, host vulnerabilities, risk surface, compliance reports, LQL queries, datasource schemas, or discovering authenticated FortiCNAPP API endpoints.
allowed-tools: Bash, Read, Grep, Glob
metadata:
  version: "2.4.0"
  homepage: "https://github.com/andrewbearsley/forticnapp-lacework-skill"
---

# FortiCNAPP / Lacework CLI

Use the local `lacework` CLI to read tenant data. Ask for JSON output. Parse it with `jq`.

## Ground rules

- Use read-only commands by default: `list`, `show`, `query`, `get`, and API `GET`/search requests.
- Add `--json --noninteractive` for scripts and agent runs.
- Some environments restrict network access or need approval for it. There, get access before the first `lacework` command that calls the API. A failed DNS lookup or connection is not a connectivity test.
- A DNS, TLS, timeout or connection error is a local environment fault, not a FortiCNAPP health finding. Retry once with network access before you mark the check incomplete.
- Check the effective account and subaccount before you work on a tenant. When you know the intended `--profile`, `--account` and `--subaccount`, pass them on every live command.
- Reduce JSON with `jq` **in the first command, before you see the raw output**. In an agent runtime, the full response goes into the tool trace. You can't take it back. Show full integration, agent or alert payloads only when the user asks for them. Raw payloads hold cloud account IDs, role ARNs, queue URLs, hostnames, internal IPs and the email address in `createdOrUpdatedBy`.
- Keep API secrets out of output, commits and pasted text.
- Treat credential files as local inputs only. Expect them outside the repo.
- Start with short API calls and narrow filters. Move to broad exports only when you need them.
- Keep host vulnerability search windows to 7 days or less, unless you know the API accepts more.
- When you're unsure of a command's syntax, check `lacework <command> --help` or the API docs first.

## Credential pattern

Use an existing CLI profile, or a JSON credential file in this format:

```json
{
  "account": "account-name",
  "keyId": "api-key-id",
  "secret": "api-secret"
}
```

Load the credentials into shell variables. Use the block for the user's shell.

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

In Windows PowerShell, use a backtick `` ` `` for line continuation, not `\`. Remove the double quotes around `$ACCOUNT` and the other variables.

Add `--subaccount "$SUBACCOUNT"` only when the user gives one, or when the account needs one.

As an alternative, `lacework configure --profile <name>` stores the credentials in the CLI config. Later calls then need only `--profile <name>`. The syntax is the same on all platforms.

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

The healthcheck is a customer report in four sections. Run them in order. Each section answers
a question the customer asks. [references/healthcheck.md](references/healthcheck.md) has the
full detail:

| Section | The customer's question | Covers |
|---|---|---|
| 1 Overall setup | What have we got, and does it cover what we own? | Integration Coverage, Integration State, Agentless Coverage, Agent Coverage, Agent Versions, Notification Alerts, AI Assist. |
| 2 Threats | What has actually been detected? | Composite alerts first, then anomalies, then policy noise. Not sorted by severity. |
| 3 Risks | What are we exposed to? | Critical misconfigurations from compliance reports, plus internet-exposed live vulnerable packages. Misconfiguration risk needs no agent, so it is often the main content. |
| 4 Recommendations | What should we do about it? | Derived from 1 to 3, ranked act-now / this-quarter / tidy. The deliverable. |

Sections 1 to 3 collect the data. Section 4 is the deliverable. Hand over all four sections together.

The commands below cover the ingestion and alert-rollup part of section 1:

1. Read the effective account and subaccount with `lacework configure show account` and `lacework configure show subaccount`. Compare them with the requested tenant before you make live calls. Read only the active profile.
   The full profile list prints API key IDs.
2. If the environment restricts outbound access, get network permission first.
3. Run these read-only checks with explicit tenant flags:
   - `lacework cloud-account list` for integration state.
   - `lacework agent list` for agent status and last check-in.
   - `lacework alert list --start -24h --end now` for alerts from the last 24 hours.
4. Reduce each JSON result on its own. Report counts, unhealthy or disabled integrations, stale agents, alert severities and recurring alerts. Include an identifier only when the health finding needs it.
5. Keep platform health separate from security posture. Healthy ingestion with open high-severity alerts is "operational, security attention required", not healthy.
6. If one check still fails after an approved retry, mark only that check incomplete. Include the error category, such as DNS or TLS. A local error says nothing about the tenant.

Example commands. Reduce on the **first** command, before you see raw output. Each one prints
health with no account ID, role ARN, queue URL, hostname, IP or email. Replace every
placeholder. Use the same values for the whole healthcheck.

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

The examples in this skill are for bash and zsh. On Windows, define `lw` in PowerShell. Splat
the shared flags, because a single string of flags arrives as one argument:

```powershell
function lw { $f = @('--profile','<profile>','--account','<account>','--subaccount','<subaccount>','--json','--noninteractive'); lacework @args @f }
```

`jq` filters work unchanged inside single quotes. Use a backtick for line continuation, not
`\`.

Use `cloud-account show <GUID>` or `alert show <GUID>` only after a rollup points at one item.
Report the finding, not the payload.

**Response shapes by command.** Match the filter to the shape:

| Shape | Commands |
|---|---|
| Bare array | `cloud-account list`, `agent list`, `alert list`, `alert-channel list`, `policy list` |
| `{"data": [...]}` | `alert-rule list`, `report-rule list`, `resource-group list` |
| `null` when empty | any `lacework api post ...` search endpoint |

The REST API wraps results in `data`. When a filter must handle both shapes, test the type:

```bash
ROWS='if type=="object" then (.data // []) else . end'
lacework alert-rule list ... | jq -r "$ROWS"' | length'
```

Run the first live calls one at a time. In parallel, they can trigger several network approvals or repeat the same failure. Once access works, run independent read-only checks in parallel.

For the rest of section 1 and for sections 2 to 4, see
[references/healthcheck.md](references/healthcheck.md). It has the filters a correct risk
report needs: `machineStatus` for live hosts, removal of suppressed `Exception` rows, and the
5000-row page limit.

### Cloud integration health

1. List integrations with `cloud-account list`.
2. To find a provider or integration class, filter by `type`.
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

**Filter values are case-sensitive and are not the console labels.** `status` is `Active`, not
`VULNERABLE` or `Vulnerable`. `severity` is `Critical` / `High` / `Medium` / `Low` / `Info`.

**A search with no matching rows returns the literal `null`,** not an empty `data` array. Test
for `null` before you parse the response. When a search returns `null`, check the filter values
before you report an empty tenant.

**Pages hold at most 5000 rows.** A severity split counted from the first page is wrong, but
looks plausible. Filter on each severity and read `paging.totalRows`. Unfiltered `totalRows`
counts every status, fixed findings included. It is far above the live count.

See [references/vulnerabilities.md](references/vulnerabilities.md) for CVE, collector type, provider, and assessment comparison patterns.

### Agent fleet, and which endpoint to ask

`lacework agent list` returns agent state: `agentVersion`, `status` (`ACTIVE` / `INACTIVE`),
`mode` (`ebpf` / `Windows`), `lastUpdate`, `ipAddr` and `tags`.

`/v2/Entities/MachineDetails` returns host facts: `hostname`, `mid`, `os`, `osVersion`,
`kernel`, `kernelRelease`, `kernelVersion`, `domain`, `createdTime`. Use `agent list` for agent
version and status.

The two return different counts, and both are correct. `Entities/Machines` counts what the
platform sees, including cloud-inventory hosts with no agent installed. `agent list` counts
installed agents. Name the source of each number.

### Who uses the tenant

`/v2/AuditLogs?startTime=<iso>&endTime=<iso>` answers login and usage questions. Group the
events by `userName`. Filter `eventDescription` for `logged in`. Use the email domain to sort
users by organisation.

One login can write two or three `logged in` events in the same minute. Count sessions, not
events. Treat repeat events from one user within 10 minutes as one session.

For questions about human engagement, use this, not alert or agent data. Weekly login counts
show a real trend. Agent check-ins show only that software runs.

**Alert `status` is not an engagement signal.** `Open` / `InProgress` / `Closed` is a workflow
field that users set by hand. Report it as a plain count if asked. Measure engagement from
logins.

### Risk surface reporting

Use the current-state vulnerability observation APIs for risk reports. They cover exposed hosts, high-severity findings, public exploits, host risk scores and active container images. Start with internet-exposed Critical or High host observations:

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

Before you group a large result set, follow `paging.urls.nextPage` until it is null. Group the results by host. Report the maximum risk score, exposure, cloud identifiers, severity counts and public exploit counts.

See [references/risk-surface.md](references/risk-surface.md) for host, image, and open-port exposure query patterns.

### Code security

An ordinary API key reads application security findings:

```bash
lw api get /api/v2/CodeSec/vulnerabilities        # third-party CVEs
lw api get /api/v2/CodeSec/weaknesses             # internal code, by CWE
lw api get /api/v2/CodeSec/secrets                # hard-coded secrets
lw api get /api/v2/CodeSec/components             # dependency inventory with licences
lw api get /api/v2/CodeSec/repositories/summary   # per-repository scan metadata
```

Each is a GET with no parameters. Each returns the complete set, wrapped as `{"data": [...]}`. Subtract `numberOfExceptionInstances` from `numberOfInstances` to remove suppressed findings from the total. The subaccount comes from the `Account-Name` header, which `--subaccount` sets. `/secrets` returns its counts as strings, so cast them with `tonumber`.

`/api/v2/IacService/Policies` returns the infrastructure as code policy catalogue. See [references/code-security.md](references/code-security.md) for the full endpoint list and worked queries.

### Compliance reports

Use `GET /api/v2/Reports` for compliance report data (recommendations, evaluations, findings):

```bash
lacework api get "api/v2/Reports?format=json&primaryQueryId=<cloud-account-id>&reportType=<report-type>" \
  --account "$ACCOUNT" --api_key "$API_KEY" --api_secret "$API_SECRET" \
  --json --noninteractive
```

Custom framework definitions are at two endpoints. The endpoint depends on where you created the framework: `/api/v2/ReportDefinitions` for the API, `/api/v1/Frameworks` for the console. See [references/reports.md](references/reports.md) for AWS/Azure report parameters and custom framework definitions.

A report also records controls that it could not evaluate. These are gaps, not violations, so a severity rollup leaves them out. See [references/compliance-errors.md](references/compliance-errors.md) for how to detect them, the per-account walk across an AWS Organization, report type codes and scan triggers.

#### Per-resource evaluations

To find which resources fail policy X, and in which accounts, search the evaluations instead of whole reports:

```bash
lacework api post /api/v2/Configs/ComplianceEvaluations/search -d "$(jq -cn \
  --arg s "$(date -u -v-24H +%Y-%m-%dT%H:%M:%SZ)" --arg e "$(date -u +%Y-%m-%dT%H:%M:%SZ)" '{
    timeFilter: {startTime: $s, endTime: $e},
    dataset: "AwsCompliance",
    filters: [{field: "id", expression: "eq", value: "lacework-global-<n>"}],
    returns: ["account", "id", "region", "resource", "status", "reason", "reportTime"]
  }')" --account "$ACCOUNT" --api_key "$API_KEY" --api_secret "$API_SECRET" --json --noninteractive
```

Request rules:

- `dataset` is required: `AwsCompliance`, `AzureCompliance`, `GcpCompliance` or `K8sCompliance`.
- The time range is 7 days at most. The default is the last 24 hours.
- Row fields are `account` (an object with `AccountId` and `Account_Alias`), `id`, `region`, `resource`, `status`, `severity`, `reason`, `recommendation`, `section`, `evalType`, `reportTime`.
- Use only the row fields above in `filters` and `returns`. A search with no matching rows returns the literal `null`.
- The dataset holds non-compliant rows. Count passing resources from `GET /api/v2/Reports`.

### LQL queries

List, inspect, preview, then query:

```bash
lacework query list-sources --json --noninteractive
lacework query show-source <DATASOURCE> --json --noninteractive
lacework query preview-source <DATASOURCE> --json --noninteractive
```

Never guess JSON key names inside `RESOURCE_CONFIG`. Find the keys with `show-source`, which names the provider API call, or with `preview-source` or an explore query. Keys are case-sensitive.

`preview-source` also shows if a datasource is empty. It prints sample rows for a populated datasource and nothing for an empty one. The exit code is 0 in both cases. When a policy result looks wrong, check the datasources its query reads first:

```bash
for ds in LW_CFG_AWS_EC2_INSTANCES LW_CFG_AWS_SSM_INSTANCE_INFORMATION; do
  n=$(lacework query preview-source "$ds" --json --noninteractive 2>/dev/null | wc -c)
  echo "$ds  $([ "$n" -gt 0 ] && echo populated || echo EMPTY)"
done
```

Confirm an `EMPTY` result with a `query run` over `--start -7d` before you report it.

`query run -f` takes a YAML or JSON file with `queryId` and `queryText`, not bare LQL. Wrap raw LQL with `jq -Rs '{queryId: "Adhoc", queryText: .}' query.lql > query.json`.

[references/lql.md](references/lql.md) has the syntax rules and the query-to-policy workflow (`query create` → `query run` → `policy create` → `policy update`). It also has the rules for policy queries. A policy query must `return distinct`. When it expands arrays or joins `MANY`-cardinality datasources, it must return only root-datasource columns.

## Documentation

- CLI reference: https://docs.fortinet.com/document/forticnapp/latest/cli-reference
- API reference: https://docs.fortinet.com/document/forticnapp/latest/api-reference
- Interactive API docs: https://api.lacework.net/api/v2/docs
- LQL reference: https://docs.fortinet.com/document/forticnapp/latest/lql-reference/598361/lql-overview

Read any of these with `curl` alone. docs.fortinet.com serves search results and section text as plain HTML. You need no browser and no JavaScript. See [references/docs-access.md](references/docs-access.md) for the search, section and whole-document PDF recipes.

### Where each answer lives

| Question | Source |
|---|---|
| CLI command shapes and flags | `cli-reference` |
| Product behaviour, onboarding, cloud integrations, agentless scanning, policies, alert channels | `administration-guide` |
| LQL grammar and functions | `lql-reference` |
| Version-specific changes | `release-notes` |
| Authentication, tokens, datasources, query execution | `api-reference` |
| REST endpoint catalog, request and response shapes | https://api.lacework.net/api/v2/docs |

The published API reference covers authentication, datasources and query execution. The interactive API docs have the endpoint catalog. Check endpoint names and payload shapes there before you decide an endpoint is missing.

Check a claim against these sources before you rely on it. This covers CLI syntax, product and API behaviour, LQL grammar and policy schemas. The official documentation is the ground truth. Community references are not.
