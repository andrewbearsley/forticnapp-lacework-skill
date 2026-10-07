# API and CLI reference

## Endpoint discovery

Use endpoint discovery when you need more data than a high-level CLI command returns. Also use it to check the exact shape of an API response.

1. Start with the smallest relevant endpoint.
2. Add required query parameters one at a time.
3. Check the response structure before you write extraction logic. Read the keys only, for example with `jq '.data[0] | keys'`.
4. Record the exact endpoint and parameters that worked in the investigation notes.
5. Keep secrets out of the notes.

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

Show one integration:

```bash
lacework cloud-account show <GUID> \
  --account "$ACCOUNT" --api_key "$API_KEY" --api_secret "$API_SECRET" \
  --json --noninteractive
```

Fields to inspect:

- `type`: the integration type, such as `AwsCfg`, `AwsSidekickOrg`, `AzureCfg`, `AzureSidekick`, or `AzureAlSeq`.
- `enabled`: whether the integration is enabled.
- `state.ok`: the current health state.
- `state.details.message`: the error or status detail, in plain text.
- `state.lastSuccessfulTime`: the time of the last successful collection or scan.

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

Run raw LQL through the API:

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

`queryText` nests under `query`. `arguments` is an array of `{name, value}` objects. Send
the body in the nested shape above.

Config datasources are batched. Use a 7-day window for them. A 24-hour window usually
returns an empty `data` array.

On an error, the CLI prints its usage block first and the real error last. Read the end of
the output. The usage block alone makes a `400` look like a bad command line.

## The v2 endpoint list

The tenant serves its own OpenAPI spec. The fetch needs no token:

```bash
curl -s https://<account>.lacework.net/api/v2/docs/lacework-api-v2.0.yaml -o spec.yaml

grep -oE '^  /[A-Za-z0-9/{}_-]+:' spec.yaml | tr -d ' :' | sort -u
```

`/api/v2/docs` is the HTML viewer. It names the spec file. Use the YAML path.

The endpoints in the spec do need a bearer token. Get one with:

```bash
TOKEN=$(curl -s -X POST https://<account>.lacework.net/api/v2/access/tokens \
  -H "X-LW-UAKS: <api-secret>" -H "Content-Type: application/json" \
  -d '{"keyId":"<api-key-id>","expiryTime":3600}' | jq -r '.token')
```

The spec covers the documented core. Read it alongside the product documentation and this
reference.

## Known endpoint notes

- `GET /api/v2/Reports`: use it for compliance report data and policy inventories.
- `GET /api/v2/CloudAccounts`: use it to list cloud integrations and find provider-specific IDs.
- `GET /api/v2/Configs/AzureSubscriptions`: use it to find Azure subscription IDs for report queries.
- `POST /api/v2/Vulnerabilities/Hosts/search`: use it for host vulnerability assessment searches.
- `GET /api/v2/ReportDefinitions`: returns report definitions. To extract report content, use `Reports`.
