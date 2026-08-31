# API and CLI reference

## Endpoint discovery

Use endpoint discovery when the documented command is incomplete, an API response differs from docs, or the user needs data not exposed by a high-level CLI command.

1. Start with the smallest relevant endpoint.
2. Add required query parameters one at a time.
3. Always inspect response structure before writing extraction logic.
4. Record the exact endpoint and parameters that worked in the investigation notes, but omit secrets.

Useful starting points:

```bash
lacework api get /api/v2/CloudAccounts \
  --account "$ACCOUNT" --api_key "$API_KEY" --api_secret "$API_SECRET" \
  --json --noninteractive

lacework api get /api/v2/Configs/AzureSubscriptions \
  --account "$ACCOUNT" --api_key "$API_KEY" --api_secret "$API_SECRET" \
  --json --noninteractive

lacework api get /api/v2/Queries \
  --account "$ACCOUNT" --api_key "$API_KEY" --api_secret "$API_SECRET" \
  --json --noninteractive
```

## Cloud accounts

List all integrations:

```bash
lacework cloud-account list \
  --account "$ACCOUNT" --api_key "$API_KEY" --api_secret "$API_SECRET" \
  --json --noninteractive
```

Show a specific integration:

```bash
lacework cloud-account show <GUID> \
  --account "$ACCOUNT" --api_key "$API_KEY" --api_secret "$API_SECRET" \
  --json --noninteractive
```

Fields to inspect:

- `type`: Integration type, such as `AwsCfg`, `AwsSidekickOrg`, `AzureCfg`, `AzureSidekick`, or `AzureAlSeq`.
- `enabled`: Whether the integration is enabled.
- `state.ok`: Current health state.
- `state.details.message`: Human-readable error or status details.
- `lastSuccessfulTime`: Last successful collection or scan time.

## Alerts

List alerts:

```bash
lacework alert list \
  --account "$ACCOUNT" --api_key "$API_KEY" --api_secret "$API_SECRET" \
  --json --noninteractive
```

Show alert details:

```bash
lacework alert show <GUID> \
  --account "$ACCOUNT" --api_key "$API_KEY" --api_secret "$API_SECRET" \
  --json --noninteractive
```

## Query commands

List queries:

```bash
lacework query list \
  --account "$ACCOUNT" --api_key "$API_KEY" --api_secret "$API_SECRET" \
  --json --noninteractive
```

Run a saved query:

```bash
lacework query run <query_id> \
  --account "$ACCOUNT" --api_key "$API_KEY" --api_secret "$API_SECRET" \
  --json --noninteractive
```

Execute raw LQL through the API:

```bash
lacework api post /api/v2/Queries/execute \
  -d '{
    "query": { "queryText": "<LQL query text>" },
    "options": { "limit": 5000 },
    "arguments": [
      { "name": "StartTimeRange", "value": "<start-iso8601>" },
      { "name": "EndTimeRange",   "value": "<end-iso8601>" }
    ]
  }' \
  --account "$ACCOUNT" --api_key "$API_KEY" --api_secret "$API_SECRET" \
  --json --noninteractive
```

`queryText` nests under `query`, and `arguments` is an array of `{name, value}` objects,
not a map. A flat `{"queryText": ..., "arguments": {...}}` body returns `400 Problem
parsing JSON`.

Config datasources are batched. A 24-hour window usually returns an empty `data` array;
use 7 days.

On any error the CLI prints its usage block first and the real error last. Read the tail,
not the head, or a `400` looks like a bad command line.

## The v2 endpoint list

The tenant serves its own OpenAPI spec:

```bash
curl -s -H "Authorization: Bearer $TOKEN" \
  https://<account>.lacework.net/api/v2/docs/lacework-api-v2.0.yaml -o spec.yaml

grep -oE '^  /[A-Za-z0-9/{}_-]+:' spec.yaml | tr -d ' :' | sort -u
```

`/api/v2/docs` is the HTML viewer and names the spec file. Use the YAML path.

Get a token with:

```bash
TOKEN=$(curl -s -X POST https://<account>.lacework.net/api/v2/access/tokens \
  -H "X-LW-UAKS: <api-secret>" -H "Content-Type: application/json" \
  -d '{"keyId":"<api-key-id>","expiryTime":3600}' | jq -r '.token')
```

The spec covers the documented core. Some endpoints are additional to it, so check the
product documentation and this reference alongside the spec.

## Known endpoint notes

- `GET /api/v2/Reports`: Use for compliance report data and policy inventories.
- `GET /api/v2/CloudAccounts`: Use to list cloud integrations and find provider-specific IDs.
- `GET /api/v2/Configs/AzureSubscriptions`: Use to find Azure subscription IDs for report queries.
- `POST /api/v2/Vulnerabilities/Hosts/search`: Use for host vulnerability assessment searches.
- `GET /api/v2/ReportDefinitions`: May omit recent definitions in some tenants; prefer `Reports` when extracting report content.
