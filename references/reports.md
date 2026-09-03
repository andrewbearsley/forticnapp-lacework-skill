# Compliance reports

Use `GET /api/v2/Reports` with `format=json` to extract compliance report data programmatically.

## Response fields

Policy inventory data commonly appears under `data[].recommendations[]`:

```json
{
  "REC_ID": "lacework-global-31",
  "CATEGORY": "Identity and Access Management",
  "TITLE": "Maintain current contact details",
  "SEVERITY": 4
}
```

## AWS reports

Find an AWS account ID from cloud accounts:

```bash
AWS_ACCOUNT_ID=$(lacework api get "api/v2/CloudAccounts" \
  --account "$ACCOUNT" --api_key "$API_KEY" --api_secret "$API_SECRET" \
  --json --noninteractive |
  jq -r '.data[] | select(.type == "AwsCfg")
    | .data.crossAccountCredentials.roleArn | split(":")[4]' |
  head -1)
```

The account ID is inside the role ARN, not a top-level field.

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

Azure report requests usually require a tenant ID as `primaryQueryId` and subscription ID as `secondaryQueryId`.

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

- Reports must be available in the account before the API can return their data.
- `format=json` is required for structured extraction.
- Use `reportType` when known; use exact `reportName` when report type is unavailable.

## Custom framework definitions

`/api/v2/Reports` returns report *data* (recommendations, findings). The framework *definition* itself, its sections and policy mappings, lives at `/api/v2/ReportDefinitions`.

### Managing definitions

```bash
lacework report-definition list --json --noninteractive
lacework report-definition show <guid> --json --noninteractive
lacework report-definition create --file <wrapped.json>
lacework report-definition update <guid> --file <wrapped.json>
lacework report-definition delete <guid>
```

Wrapped file shape: top-level metadata, sections nested under `reportDefinition`, a `category` slug and `title` per section, and `policies` as a bare string array.

```json
{
  "reportName": "<framework name>",
  "displayName": "<display name>",
  "reportType": "COMPLIANCE",
  "subReportType": "Azure",
  "reportDefinition": {
    "sections": [
      {
        "category": "<slug>",
        "title": "<section title>",
        "policies": ["lacework-global-1040"]
      }
    ]
  }
}
```

Create frameworks through this API when you want them managed as code. `GET /api/v2/ReportDefinitions` lists the frameworks it manages, along with the SYSTEM ones.

### Validation errors

Server returns 4xx with a message listing invalid `policyId`s. Common causes:

- Dead reference: policyId no longer in the tenant catalog. Remove from the body.
- Wrong-domain policyId: for example an AWS policyId in an Azure framework. Filter against domain before sending.
- Cross-check policy IDs against `GET /api/v2/Policies`.

### Gotchas

- Framework name in the URL must be URL-encoded (spaces → `%20`, brackets stay literal).
- Duplicate `policyId` within a section renders as duplicate rows in the UI. Deduplicate before sending.
- `POST /api/v2/ReportDefinitions` does not enforce name uniqueness. Two frameworks with identical `reportName` can coexist. Use a distinctive suffix when recreating.
- The `lacework report-definition update <guid>` CLI does a GET pre-check; it fails on UI-created frameworks because those are unreachable via v2.
