# Tenant healthcheck

A customer-facing report in four sections, run in order. Each answers a question the customer actually asks:

| Section | The customer's question |
|---|---|
| 1. Overall setup | What have we got, and does it cover what we own? |
| 2. Threats | What has actually been detected? |
| 3. Risks | What are we exposed to? |
| 4. Recommendations | What should we do about it? |

Sections 1 to 3 gather. Section 4 is the deliverable, derived from the first three rather than queried. Do not hand over sections 1 to 3 alone; a customer reading raw counts has to do the analysis you were there to do.

Every command reduces with `jq` in the first call. None emit an account ID, ARN, queue URL, hostname, IP, or email.

Define the tenant flags once. Use a function, not a variable: zsh does not word-split an unquoted parameter, so `TENANT='--flag ...'` arrives as one bad argument.

```bash
lw() { lacework "$@" --profile "<profile>" --account "<account>" --subaccount "<subaccount>" --json --noninteractive; }
```

**Shape trap.** CLI `--json` output is not one shape. `cloud-account list`, `agent list`, `alert list`, `alert-channel list` and `policy list` return bare arrays. `alert-rule list`, `report-rule list` and `resource-group list` wrap in `{"data": [...]}`. An `api post` search returns literal `null` when nothing matches. `.data // .` cannot bridge these, because indexing an array with a string throws before `//` is reached. Where a filter must handle either, use `if type=="object" then (.data // []) else . end`.

## Writing the report

Write every customer-facing line in **Simplified Technical English (ASD-STE100)**:

- One instruction per sentence.
- Active voice, present tense.
- Short sentences. Procedures 20 words or fewer, descriptive text 25 or fewer.
- Positive commands. Write "Enable agentless scanning", not "Do not leave scanning disabled".
- One word per concept. Do not alternate between "integration", "connector", and "collector".
- Plain, common technical words.

Do not use em-dashes or en-dashes in prose. Use a comma, a colon, or a full stop.

Give the reader findings, not method. Do not explain why the report is ordered as it is, and
do not add instructions to yourself such as "read every one". State the finding and its effect.

**Always translate integration type codes.** The API returns internal codes. Customers do not
know them. Use the product name in every customer-facing line:

| API type | Product name |
|---|---|
| `AwsCfg` | AWS Configuration |
| `AwsCtSqs` | AWS CloudTrail |
| `AwsSidekick`, `AwsSidekickOrg` | AWS Agentless Workload Scanning |
| `AwsDspm` | AWS Data Security Posture Management |
| `AzureCfg` | Azure Configuration |
| `AzureAlSeq` | Azure Activity Log |
| `AzureSidekick` | Azure Agentless Workload Scanning |
| `GcpCfg` | Google Cloud Configuration |
| `GcpAlPubSub` | Google Cloud Audit Log |
| `GcpSidekick` | Google Cloud Agentless Workload Scanning |

The product says "Google Cloud", not "GCP". Keep the type code in the raw command output only.

---

## 1. Overall setup

Not "is the platform up". What is configured, and does it match the estate the customer owns. Most findings that matter start here, because a clean threat and risk report covering half the estate is worse than useless: it reads as reassurance.

### 1.1 Integration Coverage

```bash
lw cloud-account list \
  | jq -r 'group_by(.type)[]
      | "\(.[0].type)\ttotal=\(length)\tenabled=\([.[]|select(.enabled==1)]|length)\tok=\([.[]|select(.state.ok)]|length)"'
```

Read it as a coverage matrix, not a list. Per cloud the customer should have configuration assessment (`*Cfg`), activity or audit log ingestion (`AwsCtSqs`, `AzureAlSeq`, `GcpAlPubSub`), and agentless scanning (`*Sidekick`). A missing row is a blind spot, not an absence of data.

### 1.2 Integration State

`state.ok=false` alone is not a fault. Read `state.details` before you call anything broken.

```bash
lw cloud-account list \
  | jq -r '.[] | select(.enabled != 1 or .state.ok != true)
      | . as $i
      | ($i.state.details | to_entries
         | map(select(.key | test("^(decodeNtfn|logFileGet|queueRx|queueDel|crawl|scan)$")))) as $stages
      | "\($i.type)\tenabled=\($i.enabled)\tok=\($i.state.ok)"
      + "\tlastSuccess=\(if $i.state.lastSuccessfulTime then ($i.state.lastSuccessfulTime/1000|todate) else "never" end)"
      + "\tstages=\($stages | map("\(.key)=\(.value)") | join(" "))"
      + "\tnoData=\($i.state.details.noData)"
      + "\t=> \(if $i.enabled != 1 then "DISABLED"
                 elif ($stages | length > 0) and ($stages | all(.value == "OK")) then "INTERMITTENT"
                 else "FAULT" end)"'
```

Three outcomes, and only two are findings:

| Verdict | Condition | Report as |
|---|---|---|
| `DISABLED` | `enabled=0` | **Finding.** The integration collects nothing and raises no alert. |
| `FAULT` | A pipeline stage is not `OK` | **Finding.** Ingestion is broken. |
| `INTERMITTENT` | Every stage `OK`, only `noData: true` | **Note.** The account is lightly used. |

An intermittent activity log means the pipeline works and the cloud account produced no
events in the window. That is a quiet account, not a fault. Record it as a note. Do not
raise it as an action, and do not let it colour the rest of the report.

A disabled integration is the dangerous one. It raises no alert and reads `ok=true`, so it
stays invisible until someone asks this exact question.

### 1.3 Agentless Coverage

Every account with a config integration should also have an enabled agentless integration. Sidekick types are `AwsSidekick`, `AwsSidekickOrg`, `AzureSidekick`, `GcpSidekick`.

```bash
lw cloud-account list \
  | jq -r 'group_by(.type)[] | "\(.[0].type)\ttotal=\(length)\tenabled=\([.[]|select(.enabled==1)]|length)"
      ' | grep -Ei 'cfg|sidekick'
```

Compare the configuration count against the agentless count for each cloud. A shortfall is a coverage gap. A disabled agentless integration is the same gap, and it raises no alert. Check `lastSuccessfulTime` on every agentless integration: a stale timestamp on an enabled integration means collection stopped without notice.


### 1.4 Agent Coverage

Cloud config inventory is the denominator. Time window matters: config datasources are batched, and a 24-hour window returns empty. Use 7 days.

```bash
runq() {  # $1 = LQL
  lacework api post /api/v2/Queries/execute --profile "<profile>" --json --noninteractive \
    -d "$(jq -cn --arg q "$1" '{query:{queryText:$q},options:{limit:5000},
          arguments:[{name:"StartTimeRange",value:"'"$(date -u -v-7d +%Y-%m-%dT%H:%M:%SZ)"'"},
                     {name:"EndTimeRange",  value:"'"$(date -u +%Y-%m-%dT%H:%M:%SZ)"'"}]}')"
}

# Running instances per cloud
runq "{ source { LW_CFG_AWS_EC2_INSTANCES i } filter { i.RESOURCE_CONFIG:State.Name = 'running' } return distinct { i.ACCOUNT_ID, i.RESOURCE_ID } }" \
  | jq -r '(.data // []) | "AWS running instances=\(length)  accounts=\([.[].ACCOUNT_ID]|unique|length)"'

runq "{ source { LW_CFG_GCP_COMPUTE_INSTANCE g } return distinct { g.PROJECT_ID, g.RESOURCE_ID } }" \
  | jq -r '(.data // []) | "GCP compute instances=\(length)"'

runq "{ source { LW_CFG_AZURE_COMPUTE_VIRTUALMACHINES v } return distinct { v.SUBSCRIPTION_ID, v.RESOURCE_ID } }" \
  | jq -r '(.data // []) | "Azure VMs=\(length)"'

# Agent-covered fleet
lw agent list | jq -r '"agents installed=\(length)  active=\([.[]|select(.status=="ACTIVE")]|length)"'
```

Datasource names: `LW_CFG_AWS_EC2_INSTANCES`, `LW_CFG_GCP_COMPUTE_INSTANCE` (singular), `LW_CFG_AZURE_COMPUTE_VIRTUALMACHINES`.

**The join is per-cloud and imperfect. Report the gap as a number, not a host list, unless you can join cleanly.** Agent tags differ by platform: an AWS agent carries `InstanceId`, a GCP agent carries `ProjectId` and `NumericProjectId`, and an on-prem or hypervisor agent reports `VmProvider: HV` with `Zone: NOT_AVAILABLE` and joins to no cloud inventory at all.

```bash
lw agent list | jq -r 'group_by(.tags.VmProvider)[] | "\(.[0].tags.VmProvider // "unknown")\t\(length)"'
```

Subtract before raising a gap: containers, serverless, and managed services are not agent targets. A running ECS or Fargate task, a Lambda, and an RDS instance are all expected to have no workload agent.


### 1.5 Agent Versions

Fortinet publishes current versions and end-of-life dates per platform. Windows and Linux use unrelated version schemes, so compare within a platform only.

- Linux: `https://docs.fortinet.com/document/forticnapp/latest/agent-support/49926/linux-agent-versions`
- Windows: `https://docs.fortinet.com/document/forticnapp/latest/agent-support/244773/windows-agent-versions`

Both pages carry a table of `version | type | GA | end of engineering | end of support`, with the current release tagged `Latest`. Scope the parse to `div.document-content` and dedupe rows, because the page renders each table twice.

```bash
python3 - <<'EOF'
import re, html, urllib.request
PAGES = {"linux":   ".../agent-support/49926/linux-agent-versions",
         "windows": ".../agent-support/244773/windows-agent-versions"}
for os_, url in PAGES.items():
    t = urllib.request.urlopen(urllib.request.Request(
        url, headers={"User-Agent": "Mozilla/5.0"}), timeout=60).read().decode("utf-8", "replace")
    body = re.search(r'(?is)<div class="document-content[^"]*">(.*)', t).group(1)
    seen, rows = set(), []
    for tbl in re.findall(r'(?is)<table.*?</table>', body):
        for r in re.findall(r'(?is)<tr[^>]*>(.*?)</tr>', tbl):
            c = [html.unescape(re.sub(r'(?s)<[^>]+>', '', x)).strip()
                 for x in re.findall(r'(?is)<t[dh][^>]*>(.*?)</t[dh]>', r)]
            if c and re.match(r'^\d+\.\d', c[0]) and c[0] not in seen:
                seen.add(c[0]); d = [x for x in c if re.match(r'^\d{4}-\d{2}-\d{2}$', x)]
                rows.append((c[0], "latest" in " ".join(c[1:2]).lower(),
                             d[1] if len(d) > 1 else None, d[2] if len(d) > 2 else None))
    latest = next((v for v, is_l, _, _ in rows if is_l), None)
    print(f"{os_}: latest={latest}")
    for v, _, eoe, eos in rows[:6]:
        print(f"   {v:8} EOE={eoe or 'Not Announced':14} EOS={eos or 'Not Announced'}")
EOF
```

Grade each installed version against that table:

- **Past end of support**: unsupported, raise it as a finding.
- **Past end of engineering**: no more fixes, plan the upgrade.
- **Behind `Latest`**: note it, do not alarm.
- **Equal to `Latest`**: current.

Report the fleet spread first, since one straggler matters less than a fleet-wide lag:

```bash
lw agent list | jq -r 'group_by(.agentVersion)[] | "\(.[0].agentVersion)\t\(length)"' | sort -rn
```

Linux agent versions move roughly every six weeks and end of engineering lands about four months after GA, so a fleet two releases back is usually already past end of engineering. Windows moves far more slowly and has carried `Not Announced` EOL dates for the current release.


### 1.6 Notification Alerts

Three questions: what exists, is it wired to anything, and does the wiring cover the severities that matter.

```bash
# What exists
lw alert-channel list \
  | jq -r 'group_by(.type)[] | "\(.[0].type)\ttotal=\(length)\tenabled=\([.[]|select(.enabled==1)]|length)"'

# What the alert rules actually route to.
# alert-rule list wraps in {"data": [...]} while alert-channel list returns a bare array.
lw alert-rule list \
  | jq -r '(if type=="object" then (.data // []) else . end)[]
      | "\(.filters.name)\tenabled=\(.filters.enabled)\tsev=\((.filters.severity//["all"])|join(","))\tchannels=\((.intgGuidList//[])|length)"'

# Channels wired to no rule at all
lw alert-rule list \
  | jq -r '[(if type=="object" then (.data // []) else . end)[].intgGuidList[]?] | unique | length' \
  | xargs echo "channel GUIDs referenced by rules:"
lw alert-channel list | jq -r 'length' | xargs echo "channels defined:"
```

Rule severities are **numeric**, not names: `1` Critical, `2` High, `3` Medium, `4` Low,
`5` Info. A rule listing `sev=1` forwards Critical only.

Then reconcile:

- **Email-only** means every notification depends on one channel type. Flag it.
- **A channel wired to no alert rule is decorative.** It looks like coverage in the console and delivers nothing. Cross-reference each channel `intgGuid` against the `intgGuidList` of every rule.
- **Severity gaps matter more than channel count.** A Slack channel subscribed only to `Info` while Critical goes to email alone is a worse finding than having no Slack at all.
- A disabled channel and a disabled rule fail identically and silently. Check `enabled` on both.

Channel-type variety does not prove coverage. Count the channels that no rule references,
count the disabled rules, and count the disabled channels. Each one looks like coverage in
the console and delivers nothing.

Check the rule that routes composite alerts first. A disabled rule there sends the highest
value detections to no channel.


### 1.7 AI Assist

Console only, no API or CLI surface, so this is a question for the customer rather than a query. Generative AI features are disabled by default, only an administrator can enable them, consent is recorded per feature with user and timestamp, and revoking it disables the feature for every user in the account. See [Appendix C, customer opt-in for generative AI features](https://docs.fortinet.com/document/forticnapp/latest/administration-guide/71895/appendix-c-customer-opt-in-for-generative-ai-features).

---

## 2. Threats

What has actually been detected. Group by category, not severity. A high-severity Policy
alert is usually compliance drift; a Composite alert is a correlated detection. Severity
sorting puts the noise first.

| Category | Meaning | Volume |
|---|---|---|
| `Composite` | Correlated multi-signal detection. | Rare |
| `Anomaly` | Behavioural deviation from the learned baseline. | Occasional |
| `Policy` | A rule fired. Mostly compliance drift and ingestion noise. | Dominant |

```bash
lw alert list --start -7d --end now \
  | jq -r 'group_by(.derivedFields.category)[]
      | "\(.[0].derivedFields.category // "Uncategorised")\tcount=\(length)\topen=\([.[]|select(.status=="Open")]|length)"'

# Composite alerts
lw alert list --start -7d --end now \
  | jq -r '[.[]|select(.derivedFields.category=="Composite")]
      | if length == 0 then "no composite alerts in window"
        else .[] | "\(.severity)\t\(.status)\t\(.derivedFields.sub_category // "-")\t\(.alertName)\tstart=\(.startTime)" end'

lw alert list --start -7d --end now \
  | jq -r '[.[]|select(.derivedFields.category=="Anomaly")]
      | group_by(.alertName)[] | "\(length)x\t\(.[0].severity)\t\(.[0].alertName)"' | sort -rn

# Recurring policy noise, usually a config symptom rather than a threat
lw alert list --start -7d --end now \
  | jq -r '[.[]|select(.derivedFields.category=="Policy")]
      | group_by(.alertName)[] | select(length>1) | "\(length)x\t\(.[0].severity)\t\(.[0].alertName)"' | sort -rn
```

Name each composite alert. Give the count for anomalies and policy alerts.

A repeating Policy alert is one cause, not many threats. Repeated ingestion failure alerts
are one integration fault. Move the cause to section 4 as a configuration action.

---

## 3. Risks

What the customer is exposed to. Risk has two halves, and a report with only one is incomplete:

- **Vulnerable software** on running, internet-exposed hosts.
- **Critical misconfigurations** in the cloud accounts themselves.

Misconfiguration risk needs no agent and no running workload, so it is often the only half
that returns data. Report both, and report misconfigurations first when the vulnerability
half is empty.

### 3a. Critical misconfigurations

Compliance reports carry named, resource-counted findings. Severity is numeric: `1` Critical,
`2` High.

```bash
# Accounts assessed
lacework compliance aws list-accounts --profile "<profile>" --json --noninteractive \
  | jq -r '.aws_accounts[] | "\(.account_id) \(.status)"'

# Per-account rollup
for a in $(lacework compliance aws list-accounts --profile "<profile>" --json --noninteractive \
           | jq -r '.aws_accounts[]|select(.status=="Enabled")|.account_id'); do
  lacework compliance aws get-report "$a" --profile "<profile>" --json --noninteractive 2>/dev/null \
    | jq -r --arg a "$a" '.summary[0]
        | "acct=\($a)\tcritical=\(.NUM_SEVERITY_1_NON_COMPLIANCE)\thigh=\(.NUM_SEVERITY_2_NON_COMPLIANCE)"
        + "\tviolatedResources=\(.VIOLATED_RESOURCE_COUNT)\tassessed=\(.ASSESSED_RESOURCE_COUNT)"'
done

# Named findings, aggregated across accounts
for a in $(lacework compliance aws list-accounts --profile "<profile>" --json --noninteractive \
           | jq -r '.aws_accounts[]|select(.status=="Enabled")|.account_id'); do
  lacework compliance aws get-report "$a" --profile "<profile>" --json --noninteractive 2>/dev/null \
    | jq -c --arg a "$a" '.recommendations[]
        | select(.STATUS=="NonCompliant" and .SEVERITY<=2)
        | {acct:$a, sev:.SEVERITY, title:.TITLE, res:(.RESOURCE_COUNT//0)}'
done | jq -s -r 'group_by(.title)
    | map({title:.[0].title, sev:.[0].sev, accts:length, res:(map(.res)|add)})
    | sort_by(.sev, -.accts)[]
    | "sev\(.sev)\taccounts=\(.accts)\tresources=\(.res)\t\(.title)"'
```

Azure and Google Cloud use the same shape with different identifiers:

```bash
lacework compliance azure list-tenants --profile "<profile>" --json --noninteractive
lacework compliance azure get-report <tenant-id> <subscription-id> --profile "<profile>" --json --noninteractive
lacework compliance google list-projects <org-id> --profile "<profile>" --json --noninteractive
```

Rank by how many accounts share a finding, not by raw resource count. A Critical present in
every account is a policy problem worth one conversation. A single account with many
violating resources is one remediation task.

### 3b. Vulnerable software

The target is **internet-exposed, live, vulnerable packages**. Each of those words is a separate filter, and dropping any one of them inflates the number badly.

```bash
BODY=$(jq -cn '{
  filters: [
    {field:"internetExposed",            expression:"eq", value:1},
    {field:"machineStatus",              expression:"eq", value:"Running"},
    {field:"observationStatusCategory",  expression:"eq", value:"Vulnerable"},
    {field:"severity",                   expression:"in", values:["Critical","High"]}
  ],
  returns: ["hostMachineId","hostRiskScore","severity","vulnId","packageName",
            "packageStatus","fixable","vulnPublicExploitAvailable","cloudProvider","accountId"]
}')

lw api post /api/v2/VulnerabilityObservations/Hosts/search -d "$BODY" \
  | jq -r '(.data // [])
      | "exposed-live-vulnerable observations=\(length)"
      + "  hosts=\([.[].hostMachineId]|unique|length)"
      + "  CVEs=\([.[].vulnId]|unique|length)"
      + "  exploitable=\([.[]|select(.vulnPublicExploitAvailable==true)]|length)"
      + "  fixable=\([.[]|select(.fixable==true)]|length)"'
```

Rank hosts for the write-up:

```bash
lw api post /api/v2/VulnerabilityObservations/Hosts/search -d "$BODY" \
  | jq -r '(.data // []) | group_by(.hostMachineId)[]
      | "risk=\(.[0].hostRiskScore)\tcrit=\([.[]|select(.severity=="Critical")]|length)\thigh=\([.[]|select(.severity=="High")]|length)\texploitable=\([.[]|select(.vulnPublicExploitAvailable==true)]|length)\tcloud=\(.[0].cloudProvider)"' \
  | sort -rn | head -20
```

**Five filters that keep the number honest:**

1. **`machineStatus` is the "live" filter.** Values are `Running` and `Offline`. A tenant can hold a large observation count where every row belongs to a stopped machine. Without this filter the risk report describes instances that are not running.
2. **Exclude suppressed findings.** `observationStatusCategory: "Exception"` marks a finding the customer already accepted. Filter to `Vulnerable` so the report covers live risk only.
3. **`internetExposed` takes `1` as a filter value and returns `true` or `null`.** Filter server-side with `value:1` rather than post-filtering in `jq`. `publicFacing` is a separate field with its own value.
4. **An empty result returns `null` in place of an empty array.** Write `(.data // [])` so a
   tenant with no matching findings reports a clean zero.
5. **Paging caps at 5000 rows.** Follow `paging.urls.nextPage` until null before you quote a total. Otherwise quote `paging.totalRows` and state that the detail is a sample.

**`packageStatus` is populated where a Linux workload agent is installed**, and reads `N/A` otherwise. Use it to sharpen the risk set on Linux-agent hosts. Keep it out of a global filter so Windows and agentless hosts stay in the result.


---

## 4. Recommendations

The deliverable. Derived from sections 1 to 3, never queried directly. Group under the same three headings the customer just read, and rank within each group by how much risk the action removes per unit of effort.

### Act now

Something is not being seen, or something active is not being acted on.

| Trigger, from | Recommendation |
|---|---|
| Integration `ok=false` or `enabled=0` (1.2) | Restore ingestion. Until then every clean result below it is unproven. |
| Composite alert rule disabled or its channel orphaned (1.6) | Wire composite alert routing. The best detections are reaching nobody. |
| Open composite alerts (2) | Investigate each by name. |
| Agent past end of support (1.5) | Upgrade. Unsupported agents get no fixes. |
| Cloud with configuration but no enabled agentless scanning (1.3) | Enable agentless workload scanning. That cloud has no vulnerability data. |
| Critical misconfiguration in every account (3a) | Fix at policy level. One change covers the estate. |

### Plan this quarter

Real coverage or exposure gaps that are not actively on fire.

| Trigger, from | Recommendation |
|---|---|
| Exploitable and fixable observations on exposed live hosts (3b) | Patch these first, named by host risk score. |
| High misconfigurations opening admin ports to 0.0.0.0/0 (3a) | Close the ingress rules. Exposure exists whether or not a host is running. |
| Running machines with no agent, net of non-targets (1.4) | Extend agent coverage, or confirm agentless is the deliberate choice for that estate. |
| Agent past end of engineering (1.5) | Schedule the upgrade before it reaches end of support. |
| Repeating Policy alert traced to one cause (2) | Fix the cause. Removes the noise that hides composite alerts. |

### Tidy

Hygiene that improves signal without changing exposure much.

| Trigger, from | Recommendation |
|---|---|
| Channels defined but referenced by no rule (1.6) | Wire them or delete them. They read as coverage and deliver nothing. |
| Rule severity gaps, for example Slack on `sev=5` only (1.6) | Align routing to the severities the customer cares about. |
| Agents behind `Latest` but inside support (1.5) | Note in the upgrade plan. Not urgent. |
| Disabled integrations that are genuinely retired (1.2) | Delete them so the coverage matrix reads true. |
| AI Assist off and wanted (1.7) | Admin enables it per feature, at account level. |

### Writing the section

- One line per recommendation: the action, the evidence, the effect. "Enable agentless on GCP: `GcpCfg` present with no `GcpSidekick`, so GCP workloads have no vulnerability data."
- Quantify with what you measured. "14 running instances, 1 agent" lands; "improve agent coverage" does not.
- Never recommend a competitor product, or a control the platform already provides.
- Separate what the customer does from what Fortinet does.
- If a section produced nothing, say so plainly, and say what that does and does not prove.

### Report template

Deliver this shape. Use tables. Replace every angle bracket.

```markdown
# FortiCNAPP healthcheck: <tenant>
<date>

## 1. Overall setup

### Integration Coverage
| Cloud | Configuration | Activity log | Agentless Workload Scanning |
|---|---|---|---|
| AWS | <n> enabled | <n> enabled (CloudTrail) | <n> total, <n> enabled |
| Azure | <n> enabled | <n> enabled | <n> enabled |
| Google Cloud | <n> enabled | <n> enabled (Audit Log) | <n or none> |

<One line for each cloud with no agentless scanning, and what that cloud loses.>

### Integration State
| Integration | Verdict | Detail |
|---|---|---|
| <product name> | Disabled / Fault / Intermittent | <last collection, or which stage failed> |

### Agentless Coverage
<Configuration count against agentless count for each cloud. Name the uncovered accounts count.>

### Agent Coverage
| Estate | Count |
|---|---|
| AWS instances running | <n> |
| Google Cloud instances | <n> |
| Azure virtual machines | <n> |
| Agents installed | <n> |

### Agent Versions
| Installed | Latest | Status |
|---|---|---|
| <version> | <version> | <current, behind latest, end of engineering DATE, or past end of support> |

### Notification Alerts
| Item | Count |
|---|---|
| Channels defined | <n> |
| Channels used by a rule | <n> |
| Channels used by no rule | <n> |
| Rules disabled | <n> |

<State whether the rule that routes composite alerts is enabled.>

### AI Assist
<Console setting. Confirm the current state with the customer.>

## 2. Threats
Window: <n> days.

| Category | Count | Open |
|---|---|---|
| Composite | <n> | <n> |
| Anomaly | <n> | <n> |
| Policy | <n> | <n> |

**Composite alerts**
| Severity | Name | Started |
|---|---|---|

**Anomalies of note**
| Count | Severity | Name |
|---|---|---|

**Policy alerts**
| Count | Severity | Name |
|---|---|---|

## 3. Risks

### Critical misconfigurations
<n> accounts assessed against <benchmark>. <n> resources violate a control out of <n> assessed.

| Severity | Accounts | Resources | Finding |
|---|---|---|---|

### Vulnerable software
| Metric | Count |
|---|---|
| Internet-exposed, running, vulnerable observations | <n> |
| Hosts | <n> |

<If zero, state whether any machine was running.>

## 4. Recommendations

### Act now
| Action | Evidence |
|---|---|

### Plan this quarter
| Action | Evidence |
|---|---|

### Tidy
| Action | Evidence |
|---|---|
```

### Honest framing

Healthy ingestion with open composite alerts is "operational, security attention required", not healthy. Good posture over half the estate is not good posture, and section 1 is what catches that.

State coverage limits plainly. "No running instances lack an agent" and "no running instances
were found" read the same in a summary and mean opposite things. When section 1 shows a gap,
every number in sections 2 and 3 inherits it. Say so.

An empty vulnerability result never means zero risk. Check section 3a before you write any
sentence that says the customer has no exposure.
