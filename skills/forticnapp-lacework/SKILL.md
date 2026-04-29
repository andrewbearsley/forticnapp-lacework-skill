---
name: forticnapp-lacework
description: Investigate FortiCNAPP (formerly Lacework) integrations, vulnerability assessments, agents, alerts, and compliance data using the lacework CLI and supporting API calls. Use when extracting compliance reports, querying vulnerabilities, or working with FortiCNAPP endpoints.
version: 1.0.0
homepage: https://github.com/andrewbearsley/forticnapp-lacework-skill
---
# FortiCNAPP and Lacework CLI investigation tools

This skill provides tools for investigating FortiCNAPP (formerly Lacework) integrations, vulnerability assessments, agents, alerts, and compliance data. Both modes are covered: native `lacework` CLI commands (e.g. `lacework cloud-account list`, `lacework vulnerability host show-assessment`) and direct REST API calls via `lacework api get/post` or any HTTP client. Use whichever fits the task; a few endpoints aren't exposed as native CLI verbs and require the API path, and bulk workflows are usually easier against the API.

## Safety and scope

**Default to read-only operations.** Every tool below is labelled `[read]` or `[read or write]`. Stick to `[read]` tools for investigation work. Only invoke a `[read or write]` tool when the user has explicitly asked for a state change, and confirm the exact operation before running it.

**Never echo the credentials secret.** Read it from a JSON file with `jq -r`, pass it via `--api_secret "$API_SECRET"`, and don't print `$API_SECRET` to logs or transcripts. Prefer environment variables or a `lacework configure` profile over inline flags when the runtime supports it.

**Verify findings against current state.** Compliance and vulnerability data is point-in-time. Before acting on a finding (especially during an incident), re-run the query and inspect the underlying resource directly.

**This skill is unofficial.** It is not affiliated with, endorsed by, or sponsored by Fortinet. API behaviour and endpoint availability can change without notice; the gotchas below are accurate as of April 2026.

## Tools

### check_cloud_integration `[read]`

Check the status and configuration of cloud account integrations. Supports all integration types including AzureSidekick, AwsSidekickOrg, AzureCfg, AzureAlSeq, AwsCfg, and others.

**Parameters:**
- `credentialsPath` (string): Path to JSON file containing credentials. JSON should have `account`, `keyId`, and `secret` fields.
- `integrationGuid` (string, optional): Integration GUID. If not provided, lists all integrations.
- `integrationType` (string, optional): Filter by integration type (e.g., "AzureSidekick", "AwsSidekickOrg", "AzureCfg")

**Returns:** Integration status, configuration, and state information.

**Example:**
```bash
CREDENTIALS_PATH="<credentials_path>"
ACCOUNT=$(jq -r '.account' "$CREDENTIALS_PATH")
API_KEY=$(jq -r '.keyId' "$CREDENTIALS_PATH")
API_SECRET=$(jq -r '.secret' "$CREDENTIALS_PATH")

lacework cloud-account list \
  --account "$ACCOUNT" \
  --api_key "$API_KEY" \
  --api_secret "$API_SECRET" \
  --json

lacework cloud-account show <GUID> \
  --account "$ACCOUNT" \
  --api_key "$API_KEY" \
  --api_secret "$API_SECRET" \
  --json
```

### list_agents `[read]`

List all agents registered in the Lacework account. Shows both agent-based and agentless-scanned hosts.

**Parameters:**
- `credentialsPath` (string): Path to JSON file containing credentials
- `filter` (string, optional): Filter by hostname, OS, or other criteria

**Returns:** List of agents with hostname, OS, architecture, and status information.

**Example:**
```bash
CREDENTIALS_PATH="<credentials_path>"
ACCOUNT=$(jq -r '.account' "$CREDENTIALS_PATH")
API_KEY=$(jq -r '.keyId' "$CREDENTIALS_PATH")
API_SECRET=$(jq -r '.secret' "$CREDENTIALS_PATH")

lacework agent list \
  --account "$ACCOUNT" \
  --api_key "$API_KEY" \
  --api_secret "$API_SECRET" \
  --json
```

### get_host_vulnerability_assessments `[read]`

Get all vulnerability assessments for a specific host within a time range using the API search endpoint. Groups results by evalGuid to show unique assessments. Supports filtering by collector type, provider, severity, and CVE ID.

**Parameters:**
- `credentialsPath` (string): Path to JSON file containing credentials
- `machineId` (string): Machine ID (MID) to query
- `timeRange` (object): Time range for the query
  - `startTime` (string): Start time in ISO 8601 format (e.g., "2026-01-09T00:00:00Z")
  - `endTime` (string): End time in ISO 8601 format (e.g., "2026-01-16T00:00:00Z")
- `collectorType` (string, optional): Filter by collector type - "Agent", "Agentless", or "all" (default: "all")
- `provider` (string, optional): Filter by cloud provider - "Azure", "AWS", "GCP", etc.
- `severity` (string, optional): Filter by severity - "Critical", "High", "Medium", "Low", "Info"
- `cveId` (string, optional): Filter by specific CVE ID

**Returns:** Grouped assessments with evalGuid, collector type, timestamps, vulnerability counts, and details.

**Example:**
```bash
CREDENTIALS_PATH="<credentials_path>"
ACCOUNT=$(jq -r '.account' "$CREDENTIALS_PATH")
API_KEY=$(jq -r '.keyId' "$CREDENTIALS_PATH")
API_SECRET=$(jq -r '.secret' "$CREDENTIALS_PATH")

lacework api post /api/v2/Vulnerabilities/Hosts/search \
  -d '{
    "filters": [
      {"field": "mid", "expression": "eq", "value": "<MID>"},
      {"field": "evalCtx.collector_type", "expression": "eq", "value": "Agentless"}
    ],
    "timeFilter": {
      "startTime": "2026-01-09T00:00:00Z",
      "endTime": "2026-01-16T00:00:00Z"
    },
    "returns": ["mid", "evalCtx", "startTime", "endTime", "evalGuid", "vulnId", "severity"]
  }' \
  --account "$ACCOUNT" \
  --api_key "$API_KEY" \
  --api_secret "$API_SECRET" \
  --json
```

### list_hosts_with_cve `[read]`

List all hosts that have a specific CVE vulnerability.

**Parameters:**
- `credentialsPath` (string): Path to JSON file containing credentials
- `cveId` (string): CVE ID to search for (e.g., "CVE-2024-1234")

**Returns:** List of hosts with the specified CVE, including hostname, MID, and severity.

**Example:**
```bash
CREDENTIALS_PATH="<credentials_path>"
ACCOUNT=$(jq -r '.account' "$CREDENTIALS_PATH")
API_KEY=$(jq -r '.keyId' "$CREDENTIALS_PATH")
API_SECRET=$(jq -r '.secret' "$CREDENTIALS_PATH")

lacework vulnerability host list-hosts <CVE_ID> \
  --account "$ACCOUNT" \
  --api_key "$API_KEY" \
  --api_secret "$API_SECRET" \
  --json
```

### show_host_assessment `[read]`

Show the most recent vulnerability assessment for a specific host using the CLI command.

**Parameters:**
- `credentialsPath` (string): Path to JSON file containing credentials
- `machineId` (string): Machine ID (MID) to query

**Returns:** Most recent assessment data with vulnerability details.

**Example:**
```bash
CREDENTIALS_PATH="<credentials_path>"
ACCOUNT=$(jq -r '.account' "$CREDENTIALS_PATH")
API_KEY=$(jq -r '.keyId' "$CREDENTIALS_PATH")
API_SECRET=$(jq -r '.secret' "$CREDENTIALS_PATH")

lacework vulnerability host show-assessment <MID> \
  --account "$ACCOUNT" \
  --api_key "$API_KEY" \
  --api_secret "$API_SECRET" \
  --json
```

### search_vulnerability_assessments `[read]`

Search vulnerability assessments across multiple hosts using flexible filters. Groups results by machine ID and shows unique assessments per machine.

**Parameters:**
- `credentialsPath` (string): Path to JSON file containing credentials
- `timeRange` (object): Time range for the query
  - `startTime` (string): Start time in ISO 8601 format
  - `endTime` (string): End time in ISO 8601 format
- `collectorType` (string, optional): Filter by collector type - "Agent", "Agentless", or "all"
- `provider` (string, optional): Filter by cloud provider
- `severity` (string, optional): Filter by severity level
- `hostname` (string, optional): Filter by hostname pattern

**Returns:** List of machines with assessments matching the filters, including hostname, provider, and assessment counts.

**Example:**
```bash
CREDENTIALS_PATH="<credentials_path>"
ACCOUNT=$(jq -r '.account' "$CREDENTIALS_PATH")
API_KEY=$(jq -r '.keyId' "$CREDENTIALS_PATH")
API_SECRET=$(jq -r '.secret' "$CREDENTIALS_PATH")

lacework api post /api/v2/Vulnerabilities/Hosts/search \
  -d '{
    "filters": [
      {"field": "evalCtx.collector_type", "expression": "eq", "value": "Agentless"},
      {"field": "evalCtx.provider", "expression": "eq", "value": "Azure"}
    ],
    "timeFilter": {
      "startTime": "2026-01-09T00:00:00Z",
      "endTime": "2026-01-16T00:00:00Z"
    },
    "returns": ["mid", "evalCtx", "startTime", "endTime", "evalGuid"]
  }' \
  --account "$ACCOUNT" \
  --api_key "$API_KEY" \
  --api_secret "$API_SECRET" \
  --json
```

### compare_assessment_types `[read]`

Compare agent-based and agentless assessments for a specific machine. Shows assessments grouped by collector type.

**Parameters:**
- `credentialsPath` (string): Path to JSON file containing credentials
- `machineId` (string): Machine ID (MID) to query
- `timeRange` (object): Time range for the query
  - `startTime` (string): Start time in ISO 8601 format
  - `endTime` (string): End time in ISO 8601 format

**Returns:** Comparison of agent vs agentless assessments with counts and summary.

**Example:**
```bash
CREDENTIALS_PATH="<credentials_path>"
ACCOUNT=$(jq -r '.account' "$CREDENTIALS_PATH")
API_KEY=$(jq -r '.keyId' "$CREDENTIALS_PATH")
API_SECRET=$(jq -r '.secret' "$CREDENTIALS_PATH")

lacework api post /api/v2/Vulnerabilities/Hosts/search \
  -d '{
    "filters": [
      {"field": "mid", "expression": "eq", "value": "<MID>"}
    ],
    "timeFilter": {
      "startTime": "2026-01-09T00:00:00Z",
      "endTime": "2026-01-16T00:00:00Z"
    },
    "returns": ["mid", "evalCtx", "startTime", "endTime", "evalGuid", "vulnId", "severity"]
  }' \
  --account "$ACCOUNT" \
  --api_key "$API_KEY" \
  --api_secret "$API_SECRET" \
  --json
```

### list_alerts `[read]`

List alerts from Lacework. Supports filtering by severity, alert type, and time range.

**Parameters:**
- `credentialsPath` (string): Path to JSON file containing credentials
- `severity` (string, optional): Filter by severity. Lowercase values accepted: `critical`, `high`, `medium`, `low`, `info`
- `alertType` (string, optional): Filter by alert type
- `startTime` (string, optional): Start time for alert search
- `endTime` (string, optional): End time for alert search

**Returns:** List of alerts with details including severity, type, and description.

**Example:**
```bash
CREDENTIALS_PATH="<credentials_path>"
ACCOUNT=$(jq -r '.account' "$CREDENTIALS_PATH")
API_KEY=$(jq -r '.keyId' "$CREDENTIALS_PATH")
API_SECRET=$(jq -r '.secret' "$CREDENTIALS_PATH")

lacework alert list \
  --account "$ACCOUNT" \
  --api_key "$API_KEY" \
  --api_secret "$API_SECRET" \
  --severity high \
  --json
```

**Notes:**
- The `--json` response from `lacework alert list` is a bare JSON array, not the usual `{data: [...]}` wrapper. Use `jq '.[]'`, not `jq '.data[]'`.

### show_alert `[read]`

Show detailed information about a specific alert.

**Parameters:**
- `credentialsPath` (string): Path to JSON file containing credentials
- `alertGuid` (string): Alert GUID to retrieve

**Returns:** Detailed alert information including description, affected resources, and recommendations.

**Example:**
```bash
CREDENTIALS_PATH="<credentials_path>"
ACCOUNT=$(jq -r '.account' "$CREDENTIALS_PATH")
API_KEY=$(jq -r '.keyId' "$CREDENTIALS_PATH")
API_SECRET=$(jq -r '.secret' "$CREDENTIALS_PATH")

lacework alert show <GUID> \
  --account "$ACCOUNT" \
  --api_key "$API_KEY" \
  --api_secret "$API_SECRET" \
  --json
```

### list_queries `[read]`

List available Lacework Query Language (LQL) queries.

**Parameters:**
- `credentialsPath` (string): Path to JSON file containing credentials

**Returns:** List of available queries with IDs and descriptions.

**Example:**
```bash
CREDENTIALS_PATH="<credentials_path>"
ACCOUNT=$(jq -r '.account' "$CREDENTIALS_PATH")
API_KEY=$(jq -r '.keyId' "$CREDENTIALS_PATH")
API_SECRET=$(jq -r '.secret' "$CREDENTIALS_PATH")

lacework query list \
  --account "$ACCOUNT" \
  --api_key "$API_KEY" \
  --api_secret "$API_SECRET" \
  --json
```

### run_query `[read]`

Run a Lacework Query Language (LQL) query.

**Parameters:**
- `credentialsPath` (string): Path to JSON file containing credentials
- `queryId` (string): Query ID to execute

**Returns:** Query results in JSON format.

**Example:**
```bash
CREDENTIALS_PATH="<credentials_path>"
ACCOUNT=$(jq -r '.account' "$CREDENTIALS_PATH")
API_KEY=$(jq -r '.keyId' "$CREDENTIALS_PATH")
API_SECRET=$(jq -r '.secret' "$CREDENTIALS_PATH")

lacework query run <query_id> \
  --account "$ACCOUNT" \
  --api_key "$API_KEY" \
  --api_secret "$API_SECRET" \
  --json
```

### list_datasources `[read]`

List available datasources for LQL queries.

**Parameters:**
- `credentialsPath` (string): Path to JSON file containing credentials

**Returns:** List of available datasources.

**Example:**
```bash
CREDENTIALS_PATH="<credentials_path>"
ACCOUNT=$(jq -r '.account' "$CREDENTIALS_PATH")
API_KEY=$(jq -r '.keyId' "$CREDENTIALS_PATH")
API_SECRET=$(jq -r '.secret' "$CREDENTIALS_PATH")

lacework query list-sources \
  --account "$ACCOUNT" \
  --api_key "$API_KEY" \
  --api_secret "$API_SECRET" \
  --json
```

### preview_datasource `[read]`

Preview data from a specific datasource.

**Parameters:**
- `credentialsPath` (string): Path to JSON file containing credentials
- `datasource` (string): Datasource name to preview

**Returns:** Sample data from the datasource.

**Example:**
```bash
CREDENTIALS_PATH="<credentials_path>"
ACCOUNT=$(jq -r '.account' "$CREDENTIALS_PATH")
API_KEY=$(jq -r '.keyId' "$CREDENTIALS_PATH")
API_SECRET=$(jq -r '.secret' "$CREDENTIALS_PATH")

lacework query preview-source <datasource> \
  --account "$ACCOUNT" \
  --api_key "$API_KEY" \
  --api_secret "$API_SECRET" \
  --json
```

### make_api_call `[read or write]`

Make a custom API call to any Lacework API endpoint. Supports GET, POST, PUT, DELETE, and PATCH methods.

> **Caution:** this is the only tool in the skill that can mutate account state. Use `GET` for investigation. For any other method, the user must have explicitly asked for the operation; confirm the endpoint and payload back to them before sending. POST is read-only for `*/search` endpoints (e.g. `/api/v2/Vulnerabilities/Hosts/search`); for everything else, treat POST/PUT/DELETE/PATCH as state-changing.

**Parameters:**
- `credentialsPath` (string): Path to JSON file containing credentials
- `method` (string): HTTP method - "GET", "POST", "PUT", "DELETE", or "PATCH"
- `endpoint` (string): API endpoint path (e.g., "/api/v2/Vulnerabilities/Hosts/search" or "/api/v2/CloudAccounts")
- `data` (object, optional): Request body data for POST/PUT/PATCH requests (will be JSON-encoded)
- `queryParams` (object, optional): Query parameters as key-value pairs

**Returns:** API response in JSON format.

**Example:**
```bash
CREDENTIALS_PATH="<credentials_path>"
ACCOUNT=$(jq -r '.account' "$CREDENTIALS_PATH")
API_KEY=$(jq -r '.keyId' "$CREDENTIALS_PATH")
API_SECRET=$(jq -r '.secret' "$CREDENTIALS_PATH")

# GET request
lacework api get /api/v2/CloudAccounts \
  --account "$ACCOUNT" \
  --api_key "$API_KEY" \
  --api_secret "$API_SECRET" \
  --json

# POST request with data
lacework api post /api/v2/Vulnerabilities/Hosts/search \
  -d '{"filters": [], "timeFilter": {"startTime": "2026-01-09T00:00:00Z", "endTime": "2026-01-16T00:00:00Z"}}' \
  --account "$ACCOUNT" \
  --api_key "$API_KEY" \
  --api_secret "$API_SECRET" \
  --json
```

**CLI quirks:**
- The curl-style file reference `lacework api post -d @file.json` silently misparses. For non-trivial bodies, inline the JSON via a shell variable:
  ```bash
  JSON=$(jq -c . body.json)
  lacework api post /api/v2/Foo/search --data "$JSON" --json --noninteractive
  ```
- On any error response (4xx/5xx), `lacework api` prints its usage screen to stderr. That breaks `2>&1 | jq` pipelines. When piping to `jq`, send stderr to `/dev/null`:
  ```bash
  lacework api get /api/v2/CloudAccounts --json --noninteractive 2>/dev/null | jq '.data[]'
  ```

### get_compliance_report `[read]`

Extract policy inventories and report data from compliance reports using the Reports API endpoint. This is the recommended approach for getting report data programmatically.

**Parameters:**
- `credentialsPath` (string): Path to JSON file containing credentials
- `reportName` (string): Exact report name (e.g., "CIS Amazon Web Services Foundations Benchmark v4.0.1")
- `reportType` (string, optional): Alternative to reportName (e.g., "AWS_CIS_14", "AZURE_CIS_1_5")
- `primaryQueryId` (string): 
  - AWS Account ID for AWS reports
  - Azure Tenant ID for Azure reports
- `secondaryQueryId` (string, optional): Azure Subscription ID (required for Azure reports)
- `format` (string, optional): Output format - "json", "pdf", "csv", or "html" (default: "pdf")

**Returns:** Report data including policy inventory with recommendations array containing:
- `REC_ID`: Policy ID (e.g., "lacework-global-31")
- `CATEGORY`: Section name (e.g., "Identity and Access Management")
- `TITLE`: Policy title
- `SEVERITY`: Numeric severity (1=Critical, 2=High, 3=Medium, 4=Low, 5=Info)
- `STATUS`: `"Compliant"` or `"NonCompliant"`
- `RESOURCE_COUNT` (int): number of resources evaluated for this policy
- `VIOLATIONS` (array): per-resource detail for non-compliant findings

**AWS report example:**
```bash
CREDENTIALS_PATH="<credentials_path>"
ACCOUNT=$(jq -r '.account' "$CREDENTIALS_PATH")
API_KEY=$(jq -r '.keyId' "$CREDENTIALS_PATH")
API_SECRET=$(jq -r '.secret' "$CREDENTIALS_PATH")

# Get AWS Account ID
AWS_ACCOUNT_ID=$(lacework api get "api/v2/CloudAccounts" \
  --account "$ACCOUNT" \
  --api_key "$API_KEY" \
  --api_secret "$API_SECRET" \
  --json --noninteractive | jq -r '.data[] | select(.type == "AwsCfg") | .data.awsAccountId' | head -1)

# Get report data
lacework api get "api/v2/Reports?format=json&primaryQueryId=${AWS_ACCOUNT_ID}&reportName=CIS Amazon Web Services Foundations Benchmark v4.0.1" \
  --account "$ACCOUNT" \
  --api_key "$API_KEY" \
  --api_secret "$API_SECRET" \
  --json --noninteractive
```

**Azure report example:**
```bash
# Get Azure Tenant ID and Subscription ID
AZURE_TENANT_ID=$(lacework api get "api/v2/CloudAccounts" \
  --account "$ACCOUNT" \
  --api_key "$API_KEY" \
  --api_secret "$API_SECRET" \
  --json --noninteractive | jq -r '.data[] | select(.type == "AzureCfg") | .data.tenantId' | head -1)

AZURE_SUB_ID=$(lacework api get "api/v2/Configs/AzureSubscriptions" \
  --account "$ACCOUNT" \
  --api_key "$API_KEY" \
  --api_secret "$API_SECRET" \
  --json --noninteractive | jq -r '.data[0].subscriptions[0].subscriptionId' | head -1)

# Get Azure report data
lacework api get "api/v2/Reports?format=json&primaryQueryId=${AZURE_TENANT_ID}&secondaryQueryId=${AZURE_SUB_ID}&reportName=CIS Microsoft Azure Foundations Benchmark v4.0.0" \
  --account "$ACCOUNT" \
  --api_key "$API_KEY" \
  --api_secret "$API_SECRET" \
  --json --noninteractive
```

**Using reportType:**
```bash
lacework api get "api/v2/Reports?format=json&primaryQueryId=${AWS_ACCOUNT_ID}&reportType=AWS_CIS_14" \
  --account "$ACCOUNT" \
  --api_key "$API_KEY" \
  --api_secret "$API_SECRET" \
  --json --noninteractive
```

**Response structure:**
```json
{
  "data": [{
    "reportType": "CIS Amazon Web Services Foundations Benchmark v4.0.1",
    "reportTitle": "CIS Amazon Web Services Foundations Benchmark v4.0.1",
    "recommendations": [{
      "REC_ID": "lacework-global-31",
      "CATEGORY": "Identity and Access Management",
      "TITLE": "Maintain current contact details",
      "SEVERITY": 4,
      "STATUS": "NonCompliant",
      "RESOURCE_COUNT": 3,
      "VIOLATIONS": []
    }]
  }]
}
```

**Cross-account aggregation example:**

Aggregate non-compliant Critical findings across multiple AWS accounts, grouped by policy. The pattern below scrapes per-account Reports because there's no single endpoint that returns "current misconfigurations across accounts" (`POST /api/v2/Configs/ComplianceEvaluations/search` exists per `/api/v2/schemas` but rejects the standard filter shape; see "Broken or non-functional endpoints").

```bash
for ACCT in <id1> <id2> <id3>; do
  lacework api get "api/v2/Reports?format=json&primaryQueryId=${ACCT}&reportName=CIS Amazon Web Services Foundations Benchmark v4.0.1" \
    --account "$ACCOUNT" \
    --api_key "$API_KEY" \
    --api_secret "$API_SECRET" \
    --json --noninteractive 2>/dev/null \
    | jq --arg acct "$ACCT" '[.data[]?.recommendations[]?
        | select(.SEVERITY == 1 and .STATUS == "NonCompliant")
        | {acct: $acct, policyId: .REC_ID, title: .TITLE, resourceCount: .RESOURCE_COUNT}]'
done | jq -s 'add | group_by(.policyId) | map({
  policyId: .[0].policyId,
  title: .[0].title,
  accounts: [.[].acct],
  totalResources: ([.[].resourceCount] | add)
})'
```

`SEVERITY == 1` filters to Critical; change to `<= 2` for Critical+High. The trailing `jq -s 'add | group_by ...'` slurps the per-account arrays and folds them into one array per policy.

**Notes:**
- The `api/v2/ReportDefinitions` endpoint is broken and does not show recent definitions. Use `api/v2/Reports` instead.
- Reports must be available/executed in the account to retrieve data.
- For AWS reports, only `primaryQueryId` (AWS Account ID) is required.
- For Azure reports, both `primaryQueryId` (Tenant ID) and `secondaryQueryId` (Subscription ID) are required.
- The `format=json` parameter is essential for programmatic access.

### execute_custom_lql_query `[read]`

Execute a custom Lacework Query Language (LQL) query with raw query text. Useful for ad-hoc queries or queries not saved in the account.

**Parameters:**
- `credentialsPath` (string): Path to JSON file containing credentials
- `queryText` (string): Raw LQL query text to execute
- `startTime` (string, optional): Start time for the query in ISO 8601 format
- `endTime` (string, optional): End time for the query in ISO 8601 format

**Returns:** Query results in JSON format.

**Example:**
```bash
CREDENTIALS_PATH="<credentials_path>"
ACCOUNT=$(jq -r '.account' "$CREDENTIALS_PATH")
API_KEY=$(jq -r '.keyId' "$CREDENTIALS_PATH")
API_SECRET=$(jq -r '.secret' "$CREDENTIALS_PATH")

# Execute custom LQL query via API
lacework api post /api/v2/Queries/execute \
  -d '{
    "queryText": "LW_HE_USERS_HISTORY",
    "arguments": {
      "StartTimeRange": "2026-01-09T00:00:00Z",
      "EndTimeRange": "2026-01-16T00:00:00Z"
    }
  }' \
  --account "$ACCOUNT" \
  --api_key "$API_KEY" \
  --api_secret "$API_SECRET" \
  --json
```

### manage_policy_exception `[read or write]`

List, create, or delete exceptions on a FortiCNAPP policy. The native `lacework policy-exception create` command takes a positional `[policy_id]` but exposes no flags for description, constraints, or values, so it's interactive-only and not scriptable. Drive this through the API instead.

> **Caution:** `[read]` for list, `[write]` for create and delete. For POST or DELETE the user must have explicitly asked for the change; confirm the policy ID, exception ID, and constraint payload back to them before sending.

**Endpoints (use the flat path, not the nested one):**
- `GET    /api/v2/Exceptions?policyId=<policyId>`: list exceptions on a policy
- `POST   /api/v2/Exceptions?policyId=<policyId>`: create
- `DELETE /api/v2/Exceptions/<exceptionId>?policyId=<policyId>`: delete

The nested-looking `/api/v2/Policies/<policyId>/exceptions` returns `403 Unrecognized url`. See "Broken or non-functional endpoints" below.

**Parameters:**
- `credentialsPath` (string): Path to JSON file containing credentials
- `policyId` (string): Target policy ID (e.g., `lacework-global-31`)
- `operation` (string): `"list"`, `"create"`, or `"delete"`
- `exceptionId` (string, required for delete): UUID of the exception to remove
- `description` (string, required for create): Human-readable reason for the exception
- `constraints` (array, required for create): Array of `{fieldKey, fieldValues}` objects matching the policy's `exceptionConfiguration.constraintFields`
- `expiryTime` (string, optional, create only): ISO 8601 timestamp at which the exception expires (e.g., `"2027-01-01T00:00:00Z"`). Omit for a non-expiring exception. Round-trips on GET with millisecond precision (e.g., `"2027-01-01T00:00:00.000Z"`).

**Constraint schema is per-policy.** Read the valid `fieldKey` values from the target policy:

```bash
lacework policy show <policyId> --json \
  --account "$ACCOUNT" \
  --api_key "$API_KEY" \
  --api_secret "$API_SECRET" \
  | jq '.data.exceptionConfiguration.constraintFields'
```

Each entry has `fieldKey`, `dataType` (`String` or `KVTagPair`), and `multiValue` (bool). Single-value fields still wrap in a one-element `fieldValues` list. `KVTagPair` values are `{"key": "...", "value": "..."}` objects rather than plain strings. Common keys observed on AWS compliance policies: `arns`, `accountIds`, `regionNames`, `resourceNames`, `resourceTags`.

**Body shape (create):**

```json
{
  "description": "<human-readable reason>",
  "constraints": [
    {"fieldKey": "arns", "fieldValues": ["arn:aws:s3:::my-bucket"]}
  ],
  "expiryTime": "2027-01-01T00:00:00Z"
}
```

`expiryTime` is optional. Omit it for a non-expiring exception.

**Examples:**

```bash
CREDENTIALS_PATH="<credentials_path>"
ACCOUNT=$(jq -r '.account' "$CREDENTIALS_PATH")
API_KEY=$(jq -r '.keyId' "$CREDENTIALS_PATH")
API_SECRET=$(jq -r '.secret' "$CREDENTIALS_PATH")

# List (single-quote the URL: ? globs in zsh)
lacework api get '/api/v2/Exceptions?policyId=lacework-global-31' \
  --account "$ACCOUNT" \
  --api_key "$API_KEY" \
  --api_secret "$API_SECRET" \
  --json

# Create (with optional expiry)
lacework api post '/api/v2/Exceptions?policyId=lacework-global-31' \
  -d '{"description":"approved bucket","constraints":[{"fieldKey":"arns","fieldValues":["arn:aws:s3:::my-bucket"]}],"expiryTime":"2027-01-01T00:00:00Z"}' \
  --account "$ACCOUNT" \
  --api_key "$API_KEY" \
  --api_secret "$API_SECRET" \
  --json

# Delete
lacework api delete '/api/v2/Exceptions/<exceptionId>?policyId=lacework-global-31' \
  --account "$ACCOUNT" \
  --api_key "$API_KEY" \
  --api_secret "$API_SECRET" \
  --json
```

**POST response shape:**

```json
{
  "data": {
    "exceptionId": "<uuid>",
    "policyId": "lacework-global-31",
    "description": "approved bucket",
    "constraints": [{"fieldKey": "arns", "fieldValues": ["arn:aws:s3:::my-bucket"]}],
    "expiryTime": "2027-01-01T00:00:00.000Z",
    "lastUpdateTime": "...",
    "lastUpdateUser": "..."
  }
}
```

**Returns:** for `list`, the array of existing exceptions; for `create`, the new exception object including its `exceptionId`; for `delete`, an empty body on success.

**Notes:**
- The `?` in the query string globs in zsh. Single-quote any URL containing `?policyId=...` (or set `setopt no_nomatch`).
- The expiry field is named `expiryTime` (ISO 8601). Aliases the API rejects with `400 key <name> is unrecognized`: `expirationTime`, `expiresAt`, `validUntil`, `expiry`, `expiration`, `expires`. The API rejects all unknown keys this way, so a typo or rename surfaces as a 400 rather than a silent drop.
- Verified live on 2026-04-29.

## API endpoint discovery

Use these patterns when the documentation isn't clear about which endpoint to call. The Lacework API exposes compliance reports, inventory data, and resource configuration through a stable set of v2 endpoints.

### Endpoint discovery best practices

1. **Use Interactive API Documentation**
   - Access interactive docs at: https://api.lacework.net/api/v2/docs
   - Explore available endpoints, parameters, and response structures
   - Test endpoints directly in the browser interface

2. **Test Endpoints Systematically**
   - Start with base endpoints (e.g., `/api/v2/Reports`)
   - Test with different parameter combinations
   - Check both required and optional parameters
   - Verify response structures match expectations

3. **Understand Parameter Requirements**
   - Some endpoints require specific IDs (account ID, tenant ID, subscription ID)
   - Different cloud providers may need different parameters
   - Use `jq` to extract required IDs from related endpoints

4. **Check Response Structures**
   - Inspect actual API responses to understand data layout
   - Look for nested arrays and objects
   - Identify key fields needed for extraction

5. **Document Working Patterns**
   - Record successful endpoint calls and parameters
   - Note any limitations or special requirements
   - Document response structures for future reference

### Example: discovering report endpoints

```bash
# 1. List available endpoints (if accessible)
lacework api get "api/v2/Reports" \
  --account "$ACCOUNT" \
  --api_key "$API_KEY" \
  --api_secret "$API_SECRET" \
  --json --noninteractive

# 2. Test with different parameters
lacework api get "api/v2/Reports?format=json" \
  --account "$ACCOUNT" \
  --api_key "$API_KEY" \
  --api_secret "$API_SECRET" \
  --json --noninteractive

# 3. Test with account ID
AWS_ACCOUNT_ID=$(lacework api get "api/v2/CloudAccounts" \
  --account "$ACCOUNT" \
  --api_key "$API_KEY" \
  --api_secret "$API_SECRET" \
  --json --noninteractive | jq -r '.data[0].data.awsAccountId')

lacework api get "api/v2/Reports?format=json&primaryQueryId=${AWS_ACCOUNT_ID}" \
  --account "$ACCOUNT" \
  --api_key "$API_KEY" \
  --api_secret "$API_SECRET" \
  --json --noninteractive

# 4. Test with report name
lacework api get "api/v2/Reports?format=json&primaryQueryId=${AWS_ACCOUNT_ID}&reportName=CIS Amazon Web Services Foundations Benchmark v4.0.1" \
  --account "$ACCOUNT" \
  --api_key "$API_KEY" \
  --api_secret "$API_SECRET" \
  --json --noninteractive
```

### Learnings

- `api/v2/Reports` works for getting report data, including policy inventories
- `api/v2/ReportDefinitions` is broken and should not be used
- Different endpoints serve different purposes; test to find the right one
- Response structures vary, so always inspect the actual response
- Parameter requirements differ by cloud provider (AWS vs Azure)

## Usage notes

- All API queries use the Lacework CLI with JSON output format
- Time ranges are limited to 7 days maximum by the vulnerability API
- Results are automatically grouped by evalGuid to show unique assessments
- The API returns paginated results (up to 5,000 entries per page)
- Use `--noninteractive` flag to avoid pagers and spinners in scripts
- Credentials are provided via `credentialsPath` parameter pointing to a JSON file with `account`, `keyId`, and `secret` fields. Credentials will be extracted using `jq` or similar tools.
- Always use read-only commands (`list`, `show`, `query`, `get`) for investigations
- Avoid slow commands like `vulnerability host list-cves` unless necessary
- **Discover endpoints systematically** - test different parameter combinations to find working patterns
- **Inspect actual responses** - don't assume response structures match documentation

### Credentials JSON format

When using `credentialsPath`, the JSON file should have this structure:
```json
{
  "account": "account-name",
  "keyId": "your-api-key-id",
  "secret": "your-api-secret"
}
```

To extract credentials from JSON:
```bash
CREDENTIALS_PATH="api-keys/creds.json"
ACCOUNT=$(jq -r '.account' "$CREDENTIALS_PATH")
API_KEY=$(jq -r '.keyId' "$CREDENTIALS_PATH")
API_SECRET=$(jq -r '.secret' "$CREDENTIALS_PATH")
```

## Common workflows

### Check cloud integration status
1. Use `check_cloud_integration` to list or show specific integration
2. Check `state.ok` and `lastSuccessfulTime` fields
3. Verify `enabled` is 1 and relevant scan settings are configured
4. Review `state.details.message` for any error messages

### Investigate vulnerability assessments
1. Use `get_host_vulnerability_assessments` to get all assessments for a host
2. Filter by collector type, provider, or severity as needed
3. Group results by evalGuid to see unique assessments
4. Check assessment timestamps to verify recent scans

### Compare agent vs agentless scanning
1. Use `compare_assessment_types` for a specific machine
2. Review counts of agent vs agentless assessments
3. Check if both types are present or only one
4. Verify data completeness in each assessment type

### Find hosts with specific CVE
1. Use `list_hosts_with_cve` with the CVE ID
2. Review affected hosts and severity
3. Use `get_host_vulnerability_assessments` for detailed assessment data

### Investigate alerts
1. Use `list_alerts` to see recent alerts
2. Filter by severity or type as needed
3. Use `show_alert` to get detailed information about specific alerts
4. Review affected resources and recommendations

### Query custom data
1. Use `list_datasources` to see available data sources
2. Use `preview_datasource` to explore data structure
3. Use `list_queries` to find relevant queries
4. Use `run_query` to execute queries and get results

### Agent investigation
1. Use `list_agents` to see all registered agents
2. Review OS, architecture, and status information
3. Cross-reference with vulnerability assessments to verify agent coverage
4. Check for any agents with unusual status or configuration

## Building CSPM and compliance LQL queries

How to build custom CSPM policies using Lacework Query Language (LQL) against AWS inventory data.

### LQL query structure

All LQL queries follow this structure:
```
{
    source {
        DATASOURCE_NAME alias
    }
    filter {
        <conditions>
    }
    return distinct {
        <fields>
    }
}
```

### LQL syntax rules

1. **Operators**: use `=`, `<>` (not equal), `>`, `<`, `>=`, `<=`. Do NOT use `!=`; LQL uses `<>` for not equal.
2. **Strings**: use single quotes `'value'`, not double quotes.
3. **JSON path**: access nested JSON with colon notation: `RESOURCE_CONFIG:Field.SubField`.
4. **Null checks**: use `IS NULL` and `IS NOT NULL`.
5. **Boolean logic**: use `AND`, `OR`, `NOT`.
6. **Subqueries**: use `IN` with nested source blocks for set operations.

### Common AWS datasources

| Resource Level | Datasource | Description |
|----------------|------------|-------------|
| **Account** | `LW_CFG_AWS_ACCOUNTS` | All AWS accounts |
| **Account** | `LW_CFG_AWS_ACCOUNT_GET_ALTERNATE_CONTACT` | Account alternate contacts |
| **EC2** | `LW_CFG_AWS_EC2_INSTANCES` | EC2 instances |
| **EC2** | `LW_CFG_AWS_EC2_SECURITY_GROUPS` | Security groups |
| **EC2** | `LW_CFG_AWS_EC2_VOLUMES` | EBS volumes |
| **S3** | `LW_CFG_AWS_S3` | S3 buckets |
| **S3** | `LW_CFG_AWS_S3_GET_BUCKET_ENCRYPTION` | Bucket encryption config |
| **IAM** | `LW_CFG_AWS_IAM_USERS` | IAM users |
| **IAM** | `LW_CFG_AWS_IAM_ROLES` | IAM roles |
| **IAM** | `LW_CFG_AWS_IAM_POLICIES` | IAM policies |
| **Lambda** | `LW_CFG_AWS_LAMBDA` | Lambda functions |
| **RDS** | `LW_CFG_AWS_RDS_DB_INSTANCES` | RDS instances |

### Standard return fields for compliance policies

All compliance queries should return these fields:
```
return distinct {
    ACCOUNT_ID,
    RESOURCE_ID as RESOURCE_KEY,   -- or ACCOUNT_ID for account-level
    RESOURCE_REGION,
    RESOURCE_TYPE,
    SERVICE,
    '<FailureReason>' as COMPLIANCE_FAILURE_REASON
}
```

### Query patterns

#### Pattern 1: account-level "NOT IN" subquery

Use when checking accounts that lack a specific configuration. Example: accounts without security contacts.

```lql
{
    source {
        LW_CFG_AWS_ACCOUNTS account
    }
    filter {
        not (account.ACCOUNT_ID in {
            source {
                LW_CFG_AWS_ACCOUNT_GET_ALTERNATE_CONTACT
            }
            filter {
                RESOURCE_CONFIG:AlternateContact.AlternateContactType = 'SECURITY'
                AND RESOURCE_CONFIG:AlternateContact.Name is not null
                AND RESOURCE_CONFIG:AlternateContact.Name <> ''
            }
            return distinct {
                ACCOUNT_ID
            }
        })
    }
    return distinct {
        account.ACCOUNT_ALIAS,
        account.ACCOUNT_ID,
        account.ACCOUNT_ID as RESOURCE_KEY,
        account.RESOURCE_REGION,
        account.RESOURCE_TYPE,
        account.SERVICE,
        'SecurityContactMissingOrIncomplete' as COMPLIANCE_FAILURE_REASON
    }
}
```

#### Pattern 2: resource-level direct filter

Use when checking individual resources. Example: EC2 instances without IMDSv2.

```lql
{
    source {
        LW_CFG_AWS_EC2_INSTANCES instance
    }
    filter {
        instance.RESOURCE_CONFIG:MetadataOptions.HttpTokens <> 'required'
    }
    return distinct {
        instance.ACCOUNT_ID,
        instance.RESOURCE_ID as RESOURCE_KEY,
        instance.RESOURCE_REGION,
        instance.RESOURCE_TYPE,
        instance.SERVICE,
        'IMDSv2NotEnforced' as COMPLIANCE_FAILURE_REASON
    }
}
```

#### Pattern 3: security group rules with array iteration

Use `array_to_rows()` to iterate through arrays like security group rules.

```lql
{
    source {
        LW_CFG_AWS_EC2_SECURITY_GROUPS sg
    }
    filter {
        value_exists(
            array_to_rows(sg.RESOURCE_CONFIG:IpPermissions),
            ip,
            value_exists(
                array_to_rows(ip:IpRanges),
                range,
                range:CidrIp = '0.0.0.0/0'
            )
            AND ip:FromPort <= 22
            AND ip:ToPort >= 22
        )
    }
    return distinct {
        sg.ACCOUNT_ID,
        sg.RESOURCE_ID as RESOURCE_KEY,
        sg.RESOURCE_REGION,
        sg.RESOURCE_TYPE,
        sg.SERVICE,
        'SSHOpenToWorld' as COMPLIANCE_FAILURE_REASON
    }
}
```

#### Pattern 4: cross-resource join with the `with` keyword

Use `with` to join related datasources. Example: CloudTrail trails with event selectors.

```lql
{
    source {
        LW_CFG_AWS_ACCOUNTS
    }
    filter {
        not (ACCOUNT_ID in {
            source {
                LW_CFG_AWS_CLOUDTRAIL trail
                with LW_CFG_AWS_CLOUDTRAIL_GET_EVENT_SELECTORS selectors,
                array_to_rows(selectors.RESOURCE_CONFIG:EventSelectors) as (event_selectors)
            }
            filter {
                trail.RESOURCE_CONFIG:IsMultiRegionTrail = true
                and event_selectors:ReadWriteType = 'All'
                and event_selectors:IncludeManagementEvents = true
            }
            return distinct {
                trail.ACCOUNT_ID
            }
        })
    }
    return distinct {
        ACCOUNT_ALIAS,
        ACCOUNT_ID,
        ACCOUNT_ID as RESOURCE_KEY,
        RESOURCE_REGION,
        RESOURCE_TYPE,
        SERVICE,
        'NoMultiRegionTrailWithManagementEvents' as COMPLIANCE_FAILURE_REASON
    }
}
```

**Syntax notes**:
- `with` joins related datasources (auto-matches on RESOURCE_ID/ACCOUNT_ID)
- `array_to_rows(field) as (alias)` iterates array elements
- Access array element fields with `alias:FieldName`

#### Pattern 5: type casting and empty config check

Use `::string` to cast JSON values for comparison, and `'{}'` to check for empty config.

```lql
{
    source {
        LW_CFG_AWS_S3 buckets
        with LW_CFG_AWS_S3_GET_BUCKET_LOGGING bucket
    }
    filter {
        bucket.RESOURCE_CONFIG = '{}'
        and bucket.RESOURCE_ID in {
            source {
                LW_CFG_AWS_CLOUDTRAIL
            }
            return distinct {
                RESOURCE_CONFIG:S3BucketName::string as bucket_name
            }
        }
    }
    return distinct {
        buckets.ACCOUNT_ID,
        buckets.ARN as RESOURCE_KEY,
        buckets.RESOURCE_REGION,
        buckets.RESOURCE_TYPE,
        buckets.SERVICE,
        'CloudTrailS3BucketLoggingNotEnabled' as COMPLIANCE_FAILURE_REASON
    }
}
```

**Syntax notes**:
- `RESOURCE_CONFIG = '{}'` checks for empty JSON config
- `::string` casts JSON path to string for `in` comparison
- Useful when checking if a config exists vs is empty

### Exploring datasources

Before writing a query, explore the datasource structure:

```bash
# List all AWS datasources
lacework query list-sources --json | jq -r '.[].name' | grep -i aws

# Show datasource schema
lacework query show-source LW_CFG_AWS_EC2_INSTANCES --json

# Preview sample data from datasource
lacework query preview-source LW_CFG_AWS_EC2_INSTANCES --json
```

### Testing queries

Test queries using stdin with heredoc:

```bash
cat << 'EOF' | lacework query run --start "-24h" --json \
  --account "$ACCOUNT" \
  --subaccount "$SUBACCOUNT" \
  --api_key "$API_KEY" \
  --api_secret "$API_SECRET"
{
  "queryId": "temp",
  "queryText": "{ source { LW_CFG_AWS_ACCOUNTS } return { ACCOUNT_ID, ACCOUNT_ALIAS } }"
}
EOF
```

### LQL functions reference

| Function | Description | Example |
|----------|-------------|---------|
| `array_to_rows(arr)` | Iterate array elements | `array_to_rows(RESOURCE_CONFIG:Tags)` |
| `value_exists(arr, alias, condition)` | Check if any element matches | `value_exists(array_to_rows(Tags), t, t:Key = 'Name')` |
| `length(arr)` | Array length | `length(RESOURCE_CONFIG:SecurityGroups)` |
| `contains(str, substr)` | String contains | `contains(RESOURCE_ID, 'prod')` |
| `starts_with(str, prefix)` | String starts with | `starts_with(ARN, 'arn:aws:')` |
| `ends_with(str, suffix)` | String ends with | `ends_with(RESOURCE_ID, '-dev')` |
| `regex_match(str, pattern)` | Regex match | `regex_match(RESOURCE_ID, '^i-[a-z0-9]+$')` |

### Documentation links

- LQL reference: https://docs.fortinet.com/document/forticnapp/latest/lql-reference/598361/lql-overview
- LQL operators: https://docs.fortinet.com/document/forticnapp/latest/lql-reference/754354/lql-operators
- LQL functions: https://docs.fortinet.com/document/forticnapp/latest/lql-reference/486918/lql-functions
- Datasource metadata: https://docs.fortinet.com/document/forticnapp/latest/lql-reference/771173/datasource-metadata

## Related documentation

- Lacework CLI reference: https://docs.fortinet.com/document/forticnapp/latest/cli-reference
- Lacework API reference: https://docs.fortinet.com/document/forticnapp/latest/api-reference
- Interactive API docs: https://api.lacework.net/api/v2/docs (use this for endpoint discovery)

## API endpoint reference

### Working endpoints

- `GET /api/v2/Reports`: extract compliance report data including policy inventories
- `GET /api/v2/CloudAccounts`: list cloud-account integrations and get account IDs
- `GET /api/v2/Configs/AzureSubscriptions`: get Azure subscription information
- `POST /api/v2/Vulnerabilities/Hosts/search`: search vulnerability assessments
- `GET /api/v2/Queries`: list and execute LQL queries

### Broken or non-functional endpoints

- `GET /api/v2/ReportDefinitions`: doesn't show recent definitions. Use the Reports endpoint instead.
- `/api/v2/Policies/<policyId>/exceptions` (any method): returns `403 Unrecognized url`. The path is the most natural guess for policy exceptions, but the working endpoint is the flat form `/api/v2/Exceptions?policyId=<policyId>`. See `manage_policy_exception` above.
- `GET /api/v2/schemas/<resource>` (e.g., `/api/v2/schemas/Configs`): returns `EOF`. The plain `/api/v2/schemas` endpoint works and lists 35 resource types, but you can't drill in. There's no documented way to fetch a per-resource schema.
- `POST /api/v2/Configs/ComplianceEvaluations/search`: exists in `/api/v2/schemas`, but returns `400 Invalid request` with the standard v2 filter shape (`{filters, timeFilter, returns}`), both with empty filters and with severity/status fields. Request schema unknown. *TODO:* would be a cleaner path for "current misconfigurations" than scraping per-account Reports if the schema is ever documented.
