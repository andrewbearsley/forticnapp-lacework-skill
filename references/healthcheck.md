# Tenant healthcheck

The healthcheck is a customer report in four sections. Run them in order. Each section answers a question the customer asks:

| Section | The customer's question |
|---|---|
| 1. Overall setup | What have we got, and does it cover what we own? |
| 2. Threats | What has actually been detected? |
| 3. Risks | What are we exposed to? |
| 4. Recommendations | What should we do about it? |

Sections 1 to 3 collect the data. Section 4 is the deliverable. Derive it from the first three sections, not from a new query. Hand over all four sections together. With raw counts alone, the customer has to do the analysis you were there to do.

Every command reduces its output with `jq` in the first call. Sections 1 and 2 print no account ID, ARN, queue URL, hostname, IP or email. Section 3 prints cloud account IDs where a finding needs them.

Define the tenant flags once. Use a function, not a variable. zsh doesn't word-split an unquoted parameter, so `TENANT='--flag ...'` arrives as one bad argument.

```bash
lw() { lacework "$@" --profile "<profile>" --account "<account>" --subaccount "<subaccount>" --json --noninteractive; }
```

**Response shapes.** Match each filter to the shape of the command's `--json` output. `cloud-account list`, `agent list`, `alert list`, `alert-channel list` and `policy list` return bare arrays. `alert-rule list`, `report-rule list` and `resource-group list` wrap results in `{"data": [...]}`. An `api post` search returns the literal `null` when nothing matches. A `.data // .` filter fails on a bare array. jq throws an error on the string index before `//` runs. When a filter must handle both shapes, use `if type=="object" then (.data // []) else . end`.

## Writing the report

Write every customer-facing line in **Simplified Technical English (ASD-STE100)**:

- One instruction per sentence.
- Active voice, present tense.
- Short sentences. Procedures 20 words or fewer, descriptive text 25 or fewer.
- Positive commands. Write "Enable agentless scanning", not "Do not leave scanning disabled".
- One word per concept. Use "integration" every time, not "connector" or "collector".
- Plain, common technical words.

In prose, use a comma, a colon or a full stop in place of an em-dash or en-dash.

Give the reader findings, not method. Leave out why the report has this order. Leave out notes to yourself, such as "read every one". State the finding and its effect.

**Always translate integration type codes.** The API returns internal codes that customers don't recognise. Use the product name in every customer-facing line:

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

This section checks what is configured, and if it matches the estate the customer owns. It goes further than "is the platform up". Most findings that matter start here. A clean threat and risk report that covers half the estate is worse than useless. It reads as reassurance.

### 1.1 Integration Coverage

```bash
lw cloud-account list \
  | jq -r 'group_by(.type)[]
      | "\(.[0].type)\ttotal=\(length)\tenabled=\([.[]|select(.enabled==1)]|length)\tok=\([.[]|select(.state.ok)]|length)"'
```

Read the output as a coverage matrix, not a list. For each cloud, the customer needs:

- Configuration assessment (`*Cfg`)
- Activity or audit log ingestion (`AwsCtSqs`, `AzureAlSeq`, `GcpAlPubSub`)
- Agentless scanning (`*Sidekick`)

A missing row is a blind spot, not an absence of data.

### 1.2 Integration State

`state.ok=false` alone doesn't prove a fault. Read `state.details` before you call an integration broken.

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

Only `DISABLED` and `FAULT` are findings:

| Verdict | Condition | Report as |
|---|---|---|
| `DISABLED` | `enabled=0` | **Finding.** The integration collects nothing. |
| `FAULT` | A pipeline stage is not `OK` | **Finding.** Ingestion is broken. |
| `INTERMITTENT` | Every stage `OK`, only `noData: true` | **Note.** The account is lightly used. |

An intermittent activity log means the pipeline works. The cloud account has no events in the window. That is a quiet account, not a fault. Record it as a note. Keep it out of the actions. Let it change nothing else in the report.

A disabled integration is the dangerous one. It reads `ok=true`, so only the `enabled` field shows it.

### 1.3 Agentless Coverage

Every account with a configuration integration needs an enabled agentless integration too. The Sidekick types are `AwsSidekick`, `AwsSidekickOrg`, `AzureSidekick` and `GcpSidekick`.

```bash
lw cloud-account list \
  | jq -r 'group_by(.type)[] | "\(.[0].type)\ttotal=\(length)\tenabled=\([.[]|select(.enabled==1)]|length)"
      ' | grep -Ei 'cfg|sidekick'
```

Compare the configuration count with the agentless count for each cloud. A shortfall is a coverage gap. A disabled agentless integration is the same gap. Check `lastSuccessfulTime` on every agentless integration. On an enabled integration, a stale timestamp means collection stopped.


### 1.4 Agent Coverage

The cloud configuration inventory is the denominator. Configuration datasources load in batches. A 24-hour window usually returns no rows, so use 7 days.

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

The datasource names are `LW_CFG_AWS_EC2_INSTANCES`, `LW_CFG_GCP_COMPUTE_INSTANCE` (singular) and `LW_CFG_AZURE_COMPUTE_VIRTUALMACHINES`.

**Join agents to the inventory one cloud at a time. Report the gap as a number, not a host list, unless the join is clean.** Agent tags differ by platform:

- An AWS agent carries `InstanceId`.
- A Google Cloud agent carries `ProjectId` and `NumericProjectId`.
- An on-premises or hypervisor agent reports `VmProvider: HV` with `Zone: NOT_AVAILABLE`. It matches no cloud inventory.

```bash
lw agent list | jq -r 'group_by(.tags.VmProvider)[] | "\(.[0].tags.VmProvider // "unknown")\t\(length)"'
```

Subtract non-targets before you raise a gap. Containers, serverless and managed services are not agent targets. Expect no workload agent on a running ECS or Fargate task, a Lambda or an RDS instance.


### 1.5 Agent Versions

Fortinet publishes current versions and end-of-life dates for each platform. Windows and Linux use unrelated version schemes. Compare versions within one platform only.

- Linux: `https://docs.fortinet.com/document/forticnapp/latest/agent-support/49926/linux-agent-versions`
- Windows: `https://docs.fortinet.com/document/forticnapp/latest/agent-support/244773/windows-agent-versions`

Each page has a table of `version | type | GA | end of engineering | end of support`. The current release has the tag `Latest`. Parse only the content inside `<article class="reader__page">`. Keep one row for each version.

```bash
python3 - <<'EOF'
import re, html, urllib.request
PAGES = {"linux":   ".../agent-support/49926/linux-agent-versions",
         "windows": ".../agent-support/244773/windows-agent-versions"}
for os_, url in PAGES.items():
    t = urllib.request.urlopen(urllib.request.Request(
        url, headers={"User-Agent": "Mozilla/5.0"}), timeout=60).read().decode("utf-8", "replace")
    body = re.search(r'(?is)<article class="reader__page"[^>]*>(.*?)</article>', t).group(1)
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

- **Past end of support**: the version is unsupported. Raise it as a finding.
- **Past end of engineering**: the version gets no more fixes. Plan the upgrade.
- **Behind `Latest`**: note it without alarm.
- **Equal to `Latest`**: current.

Report the fleet spread first. One straggler matters less than a fleet-wide lag.

```bash
lw agent list | jq -r 'group_by(.agentVersion)[] | "\(.[0].agentVersion)\t\(length)"' | sort -rn
```

A new Linux agent version ships about every six weeks. End of engineering comes about four months after GA. So a fleet two releases back is usually past end of engineering already. Windows versions move far more slowly. The current Windows release can carry `Not Announced` EOL dates.


### 1.6 Notification Alerts

Answer these questions:

- What exists?
- Is it wired to anything?
- Does the wiring cover the severities that matter?

```bash
# What exists
lw alert-channel list \
  | jq -r 'group_by(.type)[] | "\(.[0].type)\ttotal=\(length)\tenabled=\([.[]|select(.enabled==1)]|length)"'

# What the alert rules actually route to.
# alert-rule list wraps in {"data": [...]} while alert-channel list returns a bare array.
lw alert-rule list \
  | jq -r '(if type=="object" then (.data // []) else . end)[]
      | "\(.filters.name)\tenabled=\(.filters.enabled)\tsev=\((.filters.severity//["all"])|join(","))\tchannels=\((.intgGuidList//[])|length)"'

# Report rules route to channels too: compliance reports, summaries and event notifications.
lw report-rule list \
  | jq -r '(if type=="object" then (.data // []) else . end)[]
      | "\(.filters.name)\tenabled=\(.filters.enabled)\tsev=\((.filters.severity//["all"])|join(","))\tsends=\((.reportNotificationTypes//{})|to_entries|map(select(.value==true)|.key)|join(","))\tchannels=\((.intgGuidList//[])|length)"'

# Channels wired to no rule at all. Count alert rules and report rules together.
lw alert-rule list > alert-rules.json
lw report-rule list > report-rules.json
jq -s -r '[.[] | (if type=="object" then (.data // []) else . end)[].intgGuidList[]?] | unique | length' \
  alert-rules.json report-rules.json | xargs echo "channel GUIDs referenced by alert or report rules:"
lw alert-channel list | jq -r 'length' | xargs echo "channels defined:"

# Email recipients. The field reads back as one comma-separated string, so split it to count.
lw alert-channel list \
  | jq -r '.[] | select(.type=="EmailUser")
      | "\(.name)\tenabled=\(.enabled)\trecipients=\(.data.channelProps.recipients | if type=="string" then split(",") else . end | length)"'
```

Rule severities are **numeric**, not names: `1` Critical, `2` High, `3` Medium, `4` Low, `5` Info. A rule that lists `sev=1` forwards Critical only.

Then reconcile:

- **Email-only** routing means every notification depends on one channel type. Flag it.
- **A channel wired to no alert rule and no report rule is decorative.** It looks like coverage in the console. It delivers nothing. Check each channel `intgGuid` against the `intgGuidList` of every alert rule and every report rule.
- **The default email channel reaches every member who turns on "Default email notification"** in My Profile. The built-in `DEFAULT RULE` report rule sends to it. On a shared tenant, count its recipients. Check which event types that rule sends. One busy day can email everyone on it. A member who turns the setting off stops getting mail from that channel only.
- **Severity gaps matter more than channel count.** Take a Slack channel on `Info` only, with Critical on email alone. That's a worse finding than no Slack at all.
- Notification stops when either the channel or the rule is disabled. Check `enabled` on each.

A variety of channel types doesn't prove coverage. Count the channels wired to no rule. Count the disabled rules. Count the disabled channels. Each one looks like coverage in the console, but delivers nothing.

Check the rule that routes composite alerts first. If that rule is disabled, the highest-value detections reach no channel.


### 1.7 AI Assist

Ask the customer to confirm this setting in the console. Generative AI features are disabled by default. Only an administrator can enable them. FortiCNAPP records consent for each feature, with the user and a timestamp. Revoking consent disables the feature for every user in the account. See [Appendix C, customer opt-in for generative AI features](https://docs.fortinet.com/document/forticnapp/latest/administration-guide/71895/appendix-c-customer-opt-in-for-generative-ai-features).

---

## 2. Threats

This section reports the actual detections. Group alerts by category, not severity. A high-severity Policy alert is usually compliance drift. A Composite alert is a correlated detection. A sort by severity puts the noise first.

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

A recurring Policy alert is one cause, not many threats. Recurring ingestion failure alerts come from one integration fault. Move the cause to section 4 as a configuration action.

---

## 3. Risks

This section reports what the customer is exposed to. Risk has two halves. A report with only one half is incomplete:

- **Vulnerable software** on running, internet-exposed hosts.
- **Critical misconfigurations** in the cloud accounts themselves.

Misconfiguration risk needs no agent and no running workload, so it's often the only half that returns data. Report both halves. When the vulnerability half is empty, report misconfigurations first.

### 3a. Critical misconfigurations

Compliance reports carry named findings with resource counts. Severity is numeric: `1` Critical, `2` High.

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

Rank by how many accounts share a finding, not by raw resource count. A Critical present in every account is a policy problem worth one conversation. A single account with many violating resources is one remediation task.

### 3b. Vulnerable software

The target is **internet-exposed, live, vulnerable packages**. Each of those words is a separate filter. If you drop any one of them, the number inflates badly.

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

**Keep the number honest:**

1. **`machineStatus` is the "live" filter.** Its values are `Running` and `Offline`. A tenant can hold a large observation count where every row belongs to a stopped machine. Without this filter, the risk report describes instances that are not running.
2. **Exclude suppressed findings.** `observationStatusCategory: "Exception"` marks a finding the customer already accepted. Filter to `Vulnerable` so the report covers live risk only.
3. **`internetExposed` takes `1` as a filter value and returns `true` or `null`.** Filter server-side with `value:1`, not later in `jq`. `publicFacing` is a separate field with its own value.
4. **An empty result returns `null` in place of an empty array.** Write `(.data // [])`. Then a tenant with no matching findings reports a clean zero.
5. **The page limit is 5000 rows.** Follow `paging.urls.nextPage` until it is null before you quote a total. Otherwise, quote `paging.totalRows`. State that the detail is a sample.

**`packageStatus` has a value on hosts that run a Linux workload agent.** On other hosts it reads `N/A`. Use it to sharpen the risk set on hosts with a Linux agent. Keep it out of a global filter, so Windows and agentless hosts stay in the result.


---

## 4. Recommendations

This section is the deliverable. Derive it from sections 1 to 3, not from a new query. Group the actions under the same three headings the customer just read. Inside each group, rank actions by the risk each one removes for the effort it takes.

### Act now

Something goes unseen, or something active gets no action.

| Trigger, from | Recommendation |
|---|---|
| Integration `ok=false` or `enabled=0` (1.2) | Restore ingestion. Until then, every clean result below it is unproven. |
| Composite alert rule disabled or its channel orphaned (1.6) | Wire composite alert routing. The best detections reach nobody. |
| Open composite alerts (2) | Investigate each by name. |
| Agent past end of support (1.5) | Upgrade. Unsupported agents get no fixes. |
| Cloud with configuration but no enabled agentless scanning (1.3) | Enable agentless workload scanning. That cloud has no vulnerability data. |
| Critical misconfiguration in every account (3a) | Fix it at policy level. One change covers the estate. |

### Plan this quarter

These are real coverage or exposure gaps that aren't on fire right now.

| Trigger, from | Recommendation |
|---|---|
| Exploitable and fixable observations on exposed live hosts (3b) | Patch these first. Name them in host risk score order. |
| High misconfigurations that open admin ports to 0.0.0.0/0 (3a) | Close the ingress rules. Exposure exists whether or not a host is running. |
| Running machines with no agent, net of non-targets (1.4) | Extend agent coverage. Or confirm that agentless is the deliberate choice for that estate. |
| Agent past end of engineering (1.5) | Schedule the upgrade before it reaches end of support. |
| Recurring Policy alert traced to one cause (2) | Fix the cause. That removes the noise that hides composite alerts. |

### Tidy

This is hygiene. It improves signal, but changes exposure only a little.

| Trigger, from | Recommendation |
|---|---|
| Channels wired to no rule (1.6) | Wire them or delete them. They look like coverage, but deliver nothing. |
| Rule severity gaps, like Slack on `sev=5` only (1.6) | Align routing to the severities the customer cares about. |
| Agents behind `Latest` but inside support (1.5) | Add them to the upgrade plan. It's not urgent. |
| Disabled integrations that are genuinely retired (1.2) | Delete them so the coverage matrix reads true. |
| AI Assist off and wanted (1.7) | An administrator enables it for each feature, at account level. |

### Writing the section

- Write one line for each recommendation: the action, the evidence, the effect. For example: "Enable agentless scanning on Google Cloud. Google Cloud Configuration has no matching Agentless Workload Scanning, so those workloads have no vulnerability data."
- Quantify with what you measured. "14 running instances, 1 agent" lands. "Improve agent coverage" doesn't.
- Never recommend a competitor product, or a control the platform already provides.
- Separate what the customer does from what Fortinet does.
- If a section found nothing, say so plainly. Say what that result proves, and what it doesn't.

### Report template

Deliver this shape. Use tables. Replace every angle-bracket placeholder.

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

Healthy ingestion with open composite alerts is "operational, security attention required", not healthy. Good posture over half the estate is not good posture. Section 1 catches that.

State coverage limits plainly. "No running instances lack an agent" and "no running instances were found" read the same in a summary. They mean opposite things. When section 1 shows a gap, every number in sections 2 and 3 inherits it. Say so.

An empty vulnerability result is not proof of zero risk. Check section 3a before you write that the customer has no exposure.
