# Code security data

Read a tenant's code security findings with an API key, through the `lacework` CLI.

```bash
lw() { lacework "$@" --profile "<profile>" --json --noninteractive; }

lw api get /api/v2/CodeSec/vulnerabilities        # third-party CVEs, one row per CVE
lw api get /api/v2/CodeSec/weaknesses             # internal code, one row per CWE
lw api get /api/v2/CodeSec/secrets                # hard-coded secrets, one row per rule
lw api get /api/v2/CodeSec/components             # dependency inventory with licences
lw api get /api/v2/CodeSec/repositories/summary   # per-repository scan metadata
lw api get /api/v2/IacService/Policies            # infrastructure as code policy catalogue
```

## Endpoints

| Endpoint | Returns |
|---|---|
| `/api/v2/CodeSec/vulnerabilities` | `name`, `library`, `severity`, `cvssScore`, `numberOfInstances`, `numberOfExceptionInstances`, `exploitability`, `foundInArray[]` |
| `/api/v2/CodeSec/vulnerabilities/count` | Instance counts by CVSS band, split by severity |
| `/api/v2/CodeSec/vulnerabilities/age` | Instance counts by age bucket |
| `/api/v2/CodeSec/vulnerabilities/top` | Highest-ranked vulnerabilities |
| `/api/v2/CodeSec/vulnerabilities/metrics` | Instance counts by date, for trend |
| `/api/v2/CodeSec/weaknesses` | `cweId`, `name`, `affectedRepositories`, `numberOfInstances`, `firstDetected` |
| `/api/v2/CodeSec/secrets` | `ruleId`, `name`, `severities[]`, `categories[]`, `instances`, `impactedRepositories` |
| `/api/v2/CodeSec/secrets/top` | Ranked subset |
| `/api/v2/CodeSec/components` | `name`, `repositories[]`, `versions[]`, licence expressions, `vulnCount`, severity counts |
| `/api/v2/CodeSec/repositories/summary` | `repository`, `provider`, `defaultBranch`, `languages`, `latestScan`, `avgCvssScore`, severity counts and per-severity exception counts |
| `/api/v2/CodeSec/repositories/count` | Per-repository instance counts |
| `/api/v2/IacService/Policies` | `policyId`, `title`, `severity`, `category`, `provider`, `checkTool`, `checkType[]`, `description`, `guidelines`, `policyOverride` |

Each endpoint is a GET with no query parameters. Each returns the complete set in one response, wrapped as `{"data": [...]}`.

## Scoping to a subaccount

The `Account-Name` header selects the subaccount. `--subaccount` sets the header:

```bash
lacework api get /api/v2/CodeSec/vulnerabilities \
  --profile "<profile>" --subaccount "<subaccount>" --json --noninteractive
```

Confirm the subaccount before you report a number. Each subaccount returns its own complete result. A result from the wrong subaccount looks plausible.

## Counting findings

Every findings endpoint reports exceptions beside the total. Subtract them to get the live count:

```bash
lw api get /api/v2/CodeSec/vulnerabilities \
  | jq -r '.data
      | map(select(.severity=="critical" or .severity=="high"))
      | "crit/high CVEs=\(length)  liveInstances=\(map(.numberOfInstances - .numberOfExceptionInstances)|add)"'
```

On the application security endpoints, severity values are lower case (`critical`, `high`, `medium`, `low`). On `IacService/Policies`, they're capitalised (`Critical`, `High`, `Medium`, `Low`).

Counts on `/api/v2/CodeSec/secrets` are strings. Cast them with `tonumber` before you do arithmetic or sort on them.

## Worked queries

```bash
# Libraries carrying the most critical and high CVEs
lw api get /api/v2/CodeSec/vulnerabilities \
  | jq -r '.data | map(select(.severity=="critical" or .severity=="high"))
      | group_by(.library)[] | "\(length)\t\(.[0].library)"' | sort -rn | head

# Secrets by blast radius
lw api get /api/v2/CodeSec/secrets \
  | jq -r '.data | sort_by(-(.instances|tonumber))[]
      | "\(.instances)\tinstances\t\(.impactedRepositories)\trepos\t\(.name)"'

# Repositories ranked by critical findings
lw api get /api/v2/CodeSec/repositories/summary \
  | jq -r '.data | sort_by(-.critical)[]
      | "C\(.critical)/H\(.high)\tavgCvss=\(.avgCvssScore)\t\(.languages|join(","))\t\(.repository)"' | head

# A CVE and the repositories it reaches
lw api get /api/v2/CodeSec/vulnerabilities \
  | jq -r '.data[] | select(.name=="<CVE-ID>")
      | "\(.name) \(.library) cvss=\(.cvssScore)\n  \(.foundInArray|join("\n  "))"'

# Explain a policy that a scan reported
lw api get /api/v2/IacService/Policies \
  | jq -r '.data[] | select(.policyId=="<policy-id>")
      | "\(.severity)\t\(.title)\n\(.description)"'
```

## Scanning source directly

Run a source scan only when the user requests it. Explain the scan scope and any source transfer first.
Stop if sensitive source cannot be excluded from a remote transfer.
Verify current CLI syntax and the selected tenant before a scan.

Scan output and diagnostics can contain secrets, source snippets and sensitive URLs.
Capture both output streams in private files before they enter the tool trace.
Keep the scan exit status. Use private scratch space and remove it after use.
Use a tested reducer with a verified schema to produce numeric counts and finite-enum severity or status values.
Test the reducer with synthetic fixtures before a live scan.
Drop unknown fields, free text, matches, paths, URLs and fingerprints.
If the schema or reducer is uncertain, mark the scan incomplete.
Never display, attach or upload raw scan artifacts or matched material.
An explicitly requested upload can contain only a separately sanitised summary to a confirmed destination.

`sca scan` covers dependencies, code weaknesses, secrets and licences.
`iac scan` uses Opal and checkov. Checkov requires a running Docker daemon.
