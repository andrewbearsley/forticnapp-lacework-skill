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
- Use `reportType` when you know it. Otherwise, use the exact `reportName`.

## Custom framework definitions

`/api/v2/Reports` returns report *data* (recommendations, findings). The framework *definition*, with its sections and policy mappings, is at `/api/v2/ReportDefinitions`.

### Managing definitions

```bash
lacework report-definition list --json --noninteractive
lacework report-definition show <guid> --json --noninteractive
lacework report-definition create --file <wrapped.json>
lacework report-definition update <guid> --file <wrapped.json>
lacework report-definition delete <guid>
```

The wrapped file holds top-level metadata. Sections sit under `reportDefinition`. Each section has a `category` slug and a `title`. `policies` is a bare string array.

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

Create frameworks through this API to manage them as code. `GET /api/v2/ReportDefinitions` lists the frameworks it manages, and the SYSTEM frameworks too.

### Validation errors

The server returns a 4xx response with a message that lists each invalid `policyId`. Common causes:

- Dead reference: the `policyId` is no longer in the tenant catalogue. Remove it from the body.
- Wrong-domain `policyId`: for example, an AWS `policyId` in an Azure framework. Filter the `policyId` list by domain before you send the body.
- Check each `policyId` against `GET /api/v2/Policies`.

### Gotchas

- URL-encode the framework name in the URL. Spaces become `%20`. Brackets stay literal.
- A duplicate `policyId` in a section shows as duplicate rows in the console. Remove duplicates before you send the body.
- `POST /api/v2/ReportDefinitions` accepts a `reportName` that is already in use. Two frameworks can share the same `reportName`. Add a distinct suffix when you create a framework again.
- `lacework report-definition update <guid>` reads the framework with a GET before it updates it. Use it on frameworks that you created through this API.
