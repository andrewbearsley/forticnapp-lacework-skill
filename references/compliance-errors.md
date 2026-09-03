# Assessment errors and bulk reporting

A compliance report answers two different questions, and only one of them is "did this
control pass". The other is "did this control run at all". A control that could not be
evaluated reads as a gap in the report, not as a violation, so it stays invisible in a
severity rollup.

This matters most across an AWS Organization, where a service control policy or a missing
role permission suppresses assessment on some accounts and not others.

## Detecting an assessment error

Filter on `STATUS`. The values are `CouldNotAssess`, `Error` and `NotAssessed`.

```bash
lw api get "api/v2/Reports?format=json&primaryQueryId=<account-id>&reportType=<report-type>" \
  | jq '[.data[0].recommendations[]
      | select(.STATUS == "CouldNotAssess" or .STATUS == "Error" or .STATUS == "NotAssessed")]'
```

The counts give no warning. A `CouldNotAssess` control can report `RESOURCE_COUNT` 20,
`ASSESSED_RESOURCE_COUNT` 20 and `NUM_VIOLATIONS` 0, which reads as fully assessed and
clean. Testing for `ASSESSED_RESOURCE_COUNT == 0` finds nothing.

`RequiresManualAssessment` is not an error. It always carries `RESOURCE_COUNT` 0, and it
means the control cannot be automated.

## Deciding whether to look

The summary block does not count these controls anywhere. `NUM_RESOURCES_NOT_ASSESSED`,
`NUM_PARTIALLY_ASSESSED_POLICIES_*` and `NUM_UNKNOWN_POLICIES_*` all read 0 even when the
recommendations carry them. What gives them away is the arithmetic:

```bash
lw api get "api/v2/Reports?format=json&primaryQueryId=<account-id>&reportType=<report-type>" \
  | jq -r '.data[0] as $d
      | ($d.recommendations | map(select(.STATUS == "RequiresManualAssessment")) | length) as $m
      | $d.summary[0]
      | "unassessed: \(.NUM_RECOMMENDATIONS - .NUM_COMPLIANT - .NUM_NOT_COMPLIANT - $m)"'
```

A non-zero result is the count of controls that could not be evaluated. Run it first, and
pull the detail only where it is above 0.

## Across an AWS Organization

Report data is per account, so an org-wide view means one call per account.

Take the account IDs from the `AwsCfg` integrations. The account is inside the role ARN,
so read it from there:

```bash
ACCOUNTS=$(lw api get /api/v2/CloudAccounts \
  | jq -r '.data[]
      | select(.type == "AwsCfg" and .enabled == 1)
      | .data.crossAccountCredentials.roleArn | split(":")[4]' \
  | sort -u)
```

Then walk them, tagging each finding with the account it came from:

Read the list with `while read`, not `for ACCT in $ACCOUNTS`. zsh does not word-split an
unquoted parameter, so the `for` version runs once with all the account IDs glued into a
single argument. Collect into a file, because a `while` loop on the right of a pipe runs in
a subshell and loses any variable it sets:

```bash
TMP=$(mktemp)
printf '%s\n' "$ACCOUNTS" | while IFS= read -r ACCT; do
  [ -n "$ACCT" ] || continue
  lw api get "api/v2/Reports?format=json&primaryQueryId=${ACCT}&reportType=<report-type>" \
    | jq --arg a "$ACCT" '[.data[0].recommendations[]
        | select(.STATUS == "CouldNotAssess" or .STATUS == "Error" or .STATUS == "NotAssessed")
        | {ACCOUNT_ID: $a, REC_ID, TITLE, SEVERITY, STATUS}]' \
    >> "$TMP"
done

ERRORS=$(jq -s 'add' "$TMP") && rm -f "$TMP"
```

Roll the result up two ways. By account, which sizes the blast radius:

```bash
echo "$ERRORS" | jq -r 'group_by(.ACCOUNT_ID)[] | "\(.[0].ACCOUNT_ID)\t\(length)"' | sort -k2 -rn
```

And by control, which finds the systemic cause. One `REC_ID` failing on every account is a
single org-wide policy, not fifty separate problems:

```bash
echo "$ERRORS" | jq -r 'group_by(.REC_ID) | sort_by(-length) | .[:10][]
  | "\(length)x\t\(.[0].REC_ID)\t\(.[0].TITLE)"'
```

Keep the loop serial. Report generation is the expensive part of the call, and a wide fan
out across a large organization gains little.

## Report type codes

`reportType` when you know the code, `reportName` (URL-encoded) otherwise.

| Code | Report |
|---|---|
| `AWS_CIS_14` | CIS AWS Foundations Benchmark v1.4 |
| `AWS_CIS_S_1_6` | CIS AWS Foundations Benchmark v1.6, scored |
| `AWS_SOC_Rev2` | AWS SOC 2 |
| `AWS_HIPAA_Rev2` | AWS HIPAA |
| `AZURE_CIS_1_5` | CIS Azure Foundations Benchmark v1.5 |
| `AZURE_CIS_131` | CIS Azure Foundations Benchmark v1.3.1 |
| `GCP_CIS13` | CIS GCP Foundations Benchmark v1.3 |

Custom frameworks use their own name. See [reports.md](reports.md).

## Triggering a scan

A write operation, unlike everything else in this skill. Confirm the target tenant first.

```bash
lacework compliance aws scan
lacework compliance azure run-assessment <tenant-id>
```

AWS scans cover every integrated account in one pass. Azure targets a single tenant.

One scan runs at a time, and a full pass takes one to two hours, so treat the result as a
daily artifact. Reading a report never triggers a fresh scan, which is why an assessment
error can persist in report data long after the underlying permission is fixed.
