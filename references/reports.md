# Compliance reports

Use `GET /api/v2/Reports` with `format=json` to extract compliance report data in a script.

## Response fields

Policy inventory data usually sits under `data[].recommendations[]`:

```json
{
  "REC_ID": "lacework-global-31",
  "CATEGORY": "Identity and Access Management",
  "TITLE": "Maintain current contact details",
  "SEVERITY": 4
}
```

## AWS reports

Read an AWS account ID from the `CloudAccounts` integrations:

```bash
AWS_ACCOUNT_ID=$(lacework api get "api/v2/CloudAccounts" \
  --account "$ACCOUNT" --api_key "$API_KEY" --api_secret "$API_SECRET" \
  --json --noninteractive |
  jq -r '.data[] | select(.type == "AwsCfg")
    | .data.crossAccountCredentials.roleArn | split(":")[4]' |
  head -1)
```

The account ID is inside the role ARN, not in a top-level field.

Fetch a report by report type:

```bash
lacework api get "api/v2/Reports?format=json&primaryQueryId=${AWS_ACCOUNT_ID}&reportType=<report-type>" \
  --account "$ACCOUNT" --api_key "$API_KEY" --api_secret "$API_SECRET" \
  --json --noninteractive
```

Fetch a report by report name:

```bash
lacework api get "api/v2/Reports?format=json&primaryQueryId=${AWS_ACCOUNT_ID}&reportName=<url-encoded-report-name>" \
  --account "$ACCOUNT" --api_key "$API_KEY" --api_secret "$API_SECRET" \
  --json --noninteractive
```

## Azure reports

An Azure report request usually needs the Azure tenant ID as `primaryQueryId` and the subscription ID as `secondaryQueryId`.

```bash
AZURE_TENANT_ID=$(lacework api get "api/v2/CloudAccounts" \
  --account "$ACCOUNT" --api_key "$API_KEY" --api_secret "$API_SECRET" \
  --json --noninteractive |
  jq -r '.data[] | select(.type == "AzureCfg") | .data.tenantId' |
  head -1)

AZURE_SUBSCRIPTION_ID=$(lacework api get "api/v2/Configs/AzureSubscriptions" \
  --account "$ACCOUNT" --api_key "$API_KEY" --api_secret "$API_SECRET" \
  --json --noninteractive |
  jq -r '.data[0].subscriptions[0].subscriptionId' |
  head -1)
```

```bash
lacework api get "api/v2/Reports?format=json&primaryQueryId=${AZURE_TENANT_ID}&secondaryQueryId=${AZURE_SUBSCRIPTION_ID}&reportType=<report-type>" \
  --account "$ACCOUNT" --api_key "$API_KEY" --api_secret "$API_SECRET" \
  --json --noninteractive
```

## Notes

- A report must be available in the account before the API returns its data.
- Set `format=json` for structured extraction.
- Use `reportType` when you know it. Otherwise, use the exact `reportName`, URL-encoded.
- A report is available from the API after it has been generated once, for example by opening it in the console under Compliance.

## Custom framework definitions

`/api/v2/Reports` returns report *data* (recommendations, findings). The framework *definition*, with its sections and policy mappings, is at `/api/v2/Frameworks`. The console lists these frameworks under **Compliance > Framework Catalog**.

### Managing frameworks

| Call | Does |
|---|---|
| `GET /api/v2/Frameworks` | Lists all frameworks. `owner` is `Lacework` for built-in frameworks and the tenant account for custom ones. |
| `GET /api/v2/Frameworks/<url-encoded-name>` | Returns one framework, with `revision` and `sections`. |
| `POST /api/v2/Frameworks` | Creates a framework. Returns HTTP 201. |
| `PATCH /api/v2/Frameworks/<url-encoded-name>` | Replaces the sections in place and raises `revision` by 1. Send the full body. |

```bash
lacework api get /api/v2/Frameworks --json --noninteractive \
  | jq -r '.data[] | select(.owner != "Lacework") | "\(.name)\trev \(.revision)"'
```

Body for `POST` and `PATCH`:

```json
{
  "name": "<framework name>",
  "domains": ["AZURE"],
  "tags": [],
  "sections": [
    {
      "name": "<section title>",
      "policies": [{ "policyId": "lacework-global-1040" }]
    }
  ]
}
```

- `domains` takes `AWS`, `AZURE` or `GCP`.
- Check each `policyId` against `GET /api/v2/Policies` before you send the body.
- Filter the `policyId` list by domain. A `policyId` from another cloud produces no findings.
- A framework can reference a disabled policy. Enable the policy with `PATCH /api/v2/Policies/<policyId>` and the body `{"enabled": true}`. Send `enabled` alone.

### Report definitions

`/api/v2/ReportDefinitions` and `lacework report-definition` manage report definitions:

```bash
lacework report-definition list --json --noninteractive
lacework report-definition show <guid> --json --noninteractive
```

To show a framework in the Framework Catalog, create it at `/api/v2/Frameworks`.

### Gotchas

- URL-encode the framework name in the URL. Spaces become `%20`. Brackets stay literal.
- A duplicate `policyId` in a section shows as duplicate rows in the console. Remove duplicates before you send the body.
- Check `GET /api/v2/Frameworks` for the name before you create a framework again.
