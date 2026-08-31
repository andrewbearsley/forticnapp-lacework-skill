# LQL reference

Use this reference when building Lacework Query Language queries for CSPM, compliance policies, or inventory extraction.

## Basic structure

```lql
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

## Syntax rules

- Use `<>` for not equal. Do not use `!=`.
- Use single quotes for strings.
- Access nested JSON with colon notation: `RESOURCE_CONFIG:Field.SubField`.
- Use `IS NULL` and `IS NOT NULL` for null checks.
- Use `AND`, `OR`, and `NOT` for boolean logic.
- Use `IN` with nested source blocks for set comparisons.
- Use `::string` when a JSON path must be cast before comparison.

## Common AWS datasources

| Resource Level | Datasource | Description |
| --- | --- | --- |
| Account | `LW_CFG_AWS_ACCOUNTS` | AWS accounts |
| Account | `LW_CFG_AWS_ACCOUNT_GET_ALTERNATE_CONTACT` | Account alternate contacts |
| EC2 | `LW_CFG_AWS_EC2_INSTANCES` | EC2 instances |
| EC2 | `LW_CFG_AWS_EC2_SECURITY_GROUPS` | Security groups |
| EC2 | `LW_CFG_AWS_EC2_VOLUMES` | EBS volumes |
| S3 | `LW_CFG_AWS_S3` | S3 buckets |
| S3 | `LW_CFG_AWS_S3_GET_BUCKET_ENCRYPTION` | Bucket encryption config |
| IAM | `LW_CFG_AWS_IAM_USERS` | IAM users |
| IAM | `LW_CFG_AWS_IAM_ROLES` | IAM roles |
| IAM | `LW_CFG_AWS_IAM_POLICIES` | IAM policies |
| Lambda | `LW_CFG_AWS_LAMBDA` | Lambda functions |
| RDS | `LW_CFG_AWS_RDS_DB_INSTANCES` | RDS instances |

## Standard compliance return fields

Return these fields for compliance-style findings:

```lql
return distinct {
    ACCOUNT_ID,
    RESOURCE_ID as RESOURCE_KEY,
    RESOURCE_REGION,
    RESOURCE_TYPE,
    SERVICE,
    '<FailureReason>' as COMPLIANCE_FAILURE_REASON
}
```

For account-level findings, use `ACCOUNT_ID as RESOURCE_KEY`.

## Account-level missing configuration

Use `NOT IN` when checking accounts that lack a related configuration.

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

## Direct resource filter

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

## Array iteration

Use `array_to_rows()` and `value_exists()` for arrays such as security group rules or tags.

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

## Cross-resource joins

Use `with` to join related datasources.

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

## Empty config and casting

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

## Explore datasources

```bash
lacework query list-sources --json --noninteractive
lacework query show-source <DATASOURCE> --json --noninteractive
lacework query preview-source <DATASOURCE> --json --noninteractive
```

## Useful functions

| Function | Purpose |
| --- | --- |
| `array_to_rows(arr)` | Iterate array elements |
| `value_exists(arr, alias, condition)` | Check whether any element matches |
| `length(arr)` | Get array length |
| `contains(str, substr)` | Match substring |
| `starts_with(str, prefix)` | Match string prefix |
| `ends_with(str, suffix)` | Match string suffix |
| `regex_match(str, pattern)` | Match regular expression |
