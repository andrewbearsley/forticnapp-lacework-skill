# Vulnerability investigation

## Host assessment search

Use `POST /api/v2/Vulnerabilities/Hosts/search` for filtered host vulnerability assessment data.

By machine ID:

```bash
lacework api post /api/v2/Vulnerabilities/Hosts/search \
  -d '{
    "filters": [
      {"field": "mid", "expression": "eq", "value": "<MID>"}
    ],
    "timeFilter": {
      "startTime": "<start-iso8601>",
      "endTime": "<end-iso8601>"
    },
    "returns": ["mid", "evalCtx", "startTime", "endTime", "evalGuid", "vulnId", "severity"]
  }' \
  --account "$ACCOUNT" --api_key "$API_KEY" --api_secret "$API_SECRET" \
  --json --noninteractive
```

By collector type:

```json
{"field": "evalCtx.collector_type", "expression": "eq", "value": "Agentless"}
```

By provider:

```json
{"field": "evalCtx.provider", "expression": "eq", "value": "AWS"}
```

By severity:

```json
{"field": "severity", "expression": "eq", "value": "High"}
```

## Compare agent and agentless

1. Search by `mid` without a collector filter.
2. Group the results by `evalCtx.collector_type`.
3. Group them again by `evalGuid` to find unique assessment runs.
4. Compare `startTime`, `endTime`, severity counts, and vulnerability IDs.

## CVE lookup

List the hosts that a CVE affects:

```bash
lacework vulnerability host list-hosts <CVE_ID> \
  --account "$ACCOUNT" --api_key "$API_KEY" --api_secret "$API_SECRET" \
  --json --noninteractive
```

Show the most recent host assessment:

```bash
lacework vulnerability host show-assessment <MID> \
  --account "$ACCOUNT" --api_key "$API_KEY" --api_secret "$API_SECRET" \
  --json --noninteractive
```

Run a broad `vulnerability host list-cves` call only when the user asks for a wide export. Broad calls can be slow and noisy.
