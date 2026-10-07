# Assessment errors and bulk reporting

A compliance report tells you if each control passed. It also tells you if each control ran
at all. A control that the assessment could not evaluate is a gap in the report, not a
violation. A severity rollup leaves it out.

This matters most across an AWS Organization. There, a service control policy or a missing
role permission blocks assessment on some accounts and not on others.

## Detecting an assessment error

Filter on `STATUS`. The values are `CouldNotAssess`, `Error` and `NotAssessed`.

```bash
lw api get "api/v2/Reports?format=json&primaryQueryId=<account-id>&reportType=<report-type>" \
  | jq '[.data[0].recommendations[]
      | select(.STATUS == "CouldNotAssess" or .STATUS == "Error" or .STATUS == "NotAssessed")]'
```

`STATUS` is the field that marks these controls. Base the test on `STATUS` alone.

`RequiresManualAssessment` is not an error. It marks a control that needs a manual check.
It always carries `RESOURCE_COUNT` 0.

## Deciding whether to look

Count these controls with the summary arithmetic below. It subtracts the compliant,
non-compliant and manual controls from `NUM_RECOMMENDATIONS`:

```bash
lw api get "api/v2/Reports?format=json&primaryQueryId=<account-id>&reportType=<report-type>" \
  | jq -r '.data[0] as $d
      | ($d.recommendations | map(select(.STATUS == "RequiresManualAssessment")) | length) as $m
      | $d.summary[0]
      | "unassessed: \(.NUM_RECOMMENDATIONS - .NUM_COMPLIANT - .NUM_NOT_COMPLIANT - $m)"'
```

A non-zero result is the count of controls that the assessment could not evaluate. Run this
check first. Pull the detail only when the result is above 0.

## Across an AWS Organization

Report data is per account. For an org-wide view, make one call per account.

Take the account IDs from the `AwsCfg` integrations. Each account ID is inside the role ARN.
Read it from there:

```bash
ACCOUNTS=$(lw api get /api/v2/CloudAccounts \
  | jq -r '.data[]
      | select(.type == "AwsCfg" and .enabled == 1)
      | .data.crossAccountCredentials.roleArn | split(":")[4]' \
  | sort -u)
```

Then walk the accounts. Tag each finding with the account it came from.

Read the list with `while read`. zsh doesn't word-split an unquoted parameter. A
`for ACCT in $ACCOUNTS` loop runs once, with all the account IDs in a single argument.

Collect the output in a file. A `while` loop on the right of a pipe runs in a subshell. It
loses any variable that it sets:

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

Roll up the result by account. This sizes the blast radius:

```bash
echo "$ERRORS" | jq -r 'group_by(.ACCOUNT_ID)[] | "\(.[0].ACCOUNT_ID)\t\(length)"' | sort -k2 -rn
```

Then roll it up by control. This finds the systemic cause. One `REC_ID` that fails on every
account points to a single org-wide policy:

```bash
echo "$ERRORS" | jq -r 'group_by(.REC_ID) | sort_by(-length) | .[:10][]
  | "\(length)x\t\(.[0].REC_ID)\t\(.[0].TITLE)"'
```

Keep the loop serial. Report generation is the expensive part of each call. A wide fan-out
across a large organisation gains little.

## Report type codes

Use `reportType` when you know the code. Otherwise, use `reportName`, URL-encoded.

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

A scan trigger is a write operation, unlike everything else in this skill. Confirm the
target tenant first.

```bash
lacework compliance aws scan
lacework compliance azure run-assessment <tenant-id>
```

An AWS scan covers every integrated account in one pass. An Azure scan targets one Azure
tenant.

One scan runs at a time. A full pass takes one to two hours. Treat the result as a daily
artifact. Reading a report returns the data from the last scan. An assessment error can stay
in the report data long after you fix the underlying permission.
