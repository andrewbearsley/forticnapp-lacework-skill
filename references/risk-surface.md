# Risk surface queries

Workflows for summarizing current exposure and vulnerability risk. Prefer current-state observation APIs for report context.

## Internet-exposed critical or high host vulnerabilities

Use `POST /api/v2/VulnerabilityObservations/Hosts/search` to find current host vulnerability observations on internet-exposed hosts.

```bash
BODY=$(jq -cn '{
  filters: [
    {field:"internetExposed", expression:"eq", value:1},
    {field:"severity", expression:"in", values:["Critical","High"]},
    {field:"observationStatusCategory", expression:"eq", value:"Vulnerable"}
  ],
  returns: [
    "hostMachineId",
    "hostName",
    "hostRiskScore",
    "internetExposed",
    "publicFacing",
    "externalIp",
    "accountId",
    "cloudProvider",
    "machineTags",
    "severity",
    "observationStatusCategory",
    "packageStatus",
    "vulnId",
    "vulnPublicExploitAvailable"
  ]
}')

lacework api post /api/v2/VulnerabilityObservations/Hosts/search \
  -d "$BODY" \
  --account "$ACCOUNT" --api_key "$API_KEY" --api_secret "$API_SECRET" \
  --json --noninteractive
```

For multi-value filters, use `values`, not `value`:

```json
{"field": "severity", "expression": "in", "values": ["Critical", "High"]}
```

Useful report grouping:

- Follow `paging.urls.nextPage` until it is null before final grouping or counts.
- Group by `hostMachineId` or `hostName`.
- Count Critical and High observations per host.
- Track max `hostRiskScore`.
- Include `internetExposed`, `publicFacing`, `externalIp`, `cloudProvider`, `accountId`.
- Extract cloud instance metadata from `machineTags`, such as `InstanceId`, `VpcId`, `Zone`, `AmiId`, and `Name`.
- Count observations where `vulnPublicExploitAvailable` is `true`.
- Use `observationStatusCategory = Vulnerable` for currently vulnerable observations.

## High-risk exposed hosts

Use this when the report should start from host risk score rather than severity.

```bash
BODY=$(jq -cn '{
  filters: [
    {field:"hostRiskScore", expression:"ge", value:8},
    {field:"internetExposed", expression:"eq", value:1}
  ],
  returns: [
    "hostMachineId",
    "hostName",
    "hostRiskScore",
    "internetExposed",
    "publicFacing",
    "externalIp",
    "accountId",
    "cloudProvider",
    "machineTags",
    "severity",
    "packageStatus",
    "vulnId"
  ]
}')

lacework api post /api/v2/VulnerabilityObservations/Hosts/search \
  -d "$BODY" \
  --account "$ACCOUNT" --api_key "$API_KEY" --api_secret "$API_SECRET" \
  --json --noninteractive
```

## Current image vulnerability risk

Use `POST /api/v2/VulnerabilityObservations/Images/search` to report container image risk for images with active containers.

```bash
BODY=$(jq -cn '{
  filters: [
    {field:"severity", expression:"in", values:["Critical","High"]},
    {field:"hasActiveContainers", expression:"eq", value:1}
  ],
  returns: [
    "imageId",
    "imageNames",
    "imageRepositories",
    "imageTags",
    "imageRiskScore",
    "hasActiveContainers",
    "activeContainerCount",
    "severity",
    "vulnId",
    "vulnPublicExploitAvailable"
  ]
}')

lacework api post /api/v2/VulnerabilityObservations/Images/search \
  -d "$BODY" \
  --account "$ACCOUNT" --api_key "$API_KEY" --api_secret "$API_SECRET" \
  --json --noninteractive
```

For broader inventory context, remove the `hasActiveContainers` filter and prioritize rows where `hasActiveContainers` is true or `activeContainerCount` is greater than zero.

## Open-port exposure with host risk

For questions like "0.0.0.0/0 can reach port 22 and host risk score is at least 8", use a two-step workflow:

1. Use LQL or inventory/config data to identify network resources that allow the ingress path.
2. Use host vulnerability observations to identify high-risk exposed hosts.
3. Join results by account, instance ID, VPC, security group, hostname, or resource tags when available.

Example AWS security group LQL for SSH open to the world:

```lql
{
  source {
    LW_CFG_AWS_EC2_SECURITY_GROUPS sg,
    array_to_rows(sg.RESOURCE_CONFIG:IpPermissions) as (ip),
    array_to_rows(ip:IpRanges) as (range)
  }
  filter {
    range:CidrIp = '0.0.0.0/0'
    AND ip:FromPort <= 22
    AND ip:ToPort >= 22
  }
  return distinct {
    sg.ACCOUNT_ID,
    sg.RESOURCE_ID,
    sg.RESOURCE_REGION,
    sg.ARN
  }
}
```

Validate LQL syntax with:

```bash
lacework query validate --file <query_file> \
  --account "$ACCOUNT" --api_key "$API_KEY" --api_secret "$API_SECRET" \
  --json --noninteractive
```

Then run the high-risk exposed hosts query above and correlate the two result sets.

## Pagination

Observation APIs can return large result sets. Always inspect `paging` before summarizing:

```json
{
  "paging": {
    "rows": 5000,
    "totalRows": 5349,
    "urls": {
      "nextPage": "https://<account>.lacework.net/api/v2/VulnerabilityObservations/Hosts/<cursor>"
    }
  }
}
```

If `paging.urls.nextPage` is non-null, fetch it and append `data[]` to the first page before grouping:

```bash
cp first-page.json all-pages.json
NEXT_URL=$(jq -r '.paging.urls.nextPage // empty' first-page.json)

while [ -n "$NEXT_URL" ]; do
  NEXT_PATH=$(python3 -c 'from urllib.parse import urlparse; import sys; u=urlparse(sys.argv[1]); print(u.path + (("?" + u.query) if u.query else ""))' "$NEXT_URL")

  lacework api get "$NEXT_PATH" \
    --account "$ACCOUNT" --api_key "$API_KEY" --api_secret "$API_SECRET" \
    --json --noninteractive > next-page.json

  jq -s '{data: (.[0].data + .[1].data), paging: .[1].paging}' \
    all-pages.json next-page.json > combined.json
  mv combined.json all-pages.json

  NEXT_URL=$(jq -r '.paging.urls.nextPage // empty' next-page.json)
done
```

The CLI API helper expects the path from `nextPage`, not the full URL.

## Notes

- Observation APIs return current-state vulnerability observations and do not require a time window.
- Observation requests page through `paging.urls.nextPage`. Use that rather than a `limit` field.
- `packageStatus` is tenant/data dependent and may be `N/A`; do not require `packageStatus = Active` unless the user specifically needs package activity semantics and the field is known to be populated.
- Prefer `observationStatusCategory = Vulnerable` for "active", current, or unresolved vulnerability semantics.
