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

All GET. No query parameters. Each returns the complete set wrapped as `{"data": [...]}`, so there is no paging to follow.

## Scoping to a subaccount

The `Account-Name` header selects the subaccount, and `--subaccount` sets it:

```bash
lacework api get /api/v2/CodeSec/vulnerabilities \
  --profile "<profile>" --subaccount "<subaccount>" --json --noninteractive
```

Confirm the subaccount before reporting a number, because each one returns its own complete, plausible-looking result.

## Counting findings

Every findings endpoint reports exceptions beside the total. Subtract them for the live count:

```bash
lw api get /api/v2/CodeSec/vulnerabilities \
  | jq -r '.data
      | map(select(.severity=="critical" or .severity=="high"))
      | "crit/high CVEs=\(length)  liveInstances=\(map(.numberOfInstances - .numberOfExceptionInstances)|add)"'
```

Severity values are lower case on the application security endpoints (`critical`, `high`, `medium`, `low`) and capitalised on `IacService/Policies` (`Critical`, `High`, `Medium`, `Low`).

Counts on `/api/v2/CodeSec/secrets` are strings, so cast with `tonumber` before arithmetic or sorting on that endpoint.

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

To assess code rather than read a tenant:

```bash
lacework sca scan <directory-or-git-url> \
  --formats lw-json,sarif --output ./results \
  --profile "<profile>" --noninteractive

lacework iac scan --directory <dir> --profile "<profile>" --noninteractive
```

`sca scan` covers dependencies, code weaknesses, secrets and licences in one pass. Add `--save-results` to send results to the tenant. `iac scan` returns a policy table with `POLICY-ID`, `SEVERITY`, `PASS`, `TITLE`, `FILE-PATH` and `LINE`.

`iac scan` runs two engines. Opal needs the CLI alone; checkov needs a running Docker daemon. Read the summary line for the finding count.
