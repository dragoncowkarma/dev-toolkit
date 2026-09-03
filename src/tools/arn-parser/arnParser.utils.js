const KNOWN_PARTITIONS = new Set(['aws', 'aws-cn', 'aws-us-gov']);

// Loose match for real-world AWS region codes, e.g. us-east-1, ap-southeast-2,
// cn-north-1, us-gov-west-1. Intentionally permissive since AWS adds regions
// over time and this is only used to flag obviously-malformed values.
const REGION_PATTERN = /^[a-z]{2,3}(-gov|-iso[a-z]?)?-[a-z]+-\d+$/;

const ACCOUNT_ID_PATTERN = /^\d{12}$/;

/**
 * Splits a raw ARN string into its 6 top-level colon-delimited segments,
 * without breaking apart the resource segment (which may itself contain
 * colons, e.g. `log-group:/my/log-group:*`).
 *
 * @param {string} arn - Raw ARN string.
 * @returns {{ segments: string[], resource: string }} The first five
 *   colon-delimited segments (`arn`, partition, service, region, account-id)
 *   plus the remaining raw resource string (segment 6 onward, unsplit).
 */
function splitArnSegments(arn) {
  const segments = [];
  let rest = arn;
  for (let i = 0; i < 5; i += 1) {
    const idx = rest.indexOf(':');
    if (idx === -1) {
      segments.push(rest);
      rest = '';
      break;
    }
    segments.push(rest.slice(0, idx));
    rest = rest.slice(idx + 1);
  }
  return { segments, resource: rest };
}

/**
 * Splits an ARN's resource segment into a resource type and resource ID,
 * using whichever of `/` or `:` appears first (matching AWS's own
 * `resource-type/resource-id` and `resource-type:resource-id` conventions).
 *
 * @param {string} resource - The raw resource segment (segment 6+ of the ARN).
 * @returns {{ resourceType: string | null, resourceId: string }} The split
 *   resource type (null when no separator is present) and resource ID.
 */
export function splitResource(resource) {
  if (!resource) {
    return { resourceType: null, resourceId: '' };
  }
  const slashIdx = resource.indexOf('/');
  const colonIdx = resource.indexOf(':');
  const candidates = [slashIdx, colonIdx].filter((idx) => idx !== -1);
  if (candidates.length === 0) {
    return { resourceType: null, resourceId: resource };
  }
  const sepIdx = Math.min(...candidates);
  return {
    resourceType: resource.slice(0, sepIdx),
    resourceId: resource.slice(sepIdx + 1),
  };
}

/**
 * Parses and validates a single AWS ARN string, fully client-side.
 *
 * @param {string} input - A single ARN, e.g.
 *   `arn:aws:iam::123456789012:role/path/to/role`.
 * @returns {object} Parsed components plus validation errors/warnings. Never
 *   throws — malformed input is reported via `errors` with `isValid: false`.
 */
export function parseArn(input) {
  const raw = typeof input === 'string' ? input : '';
  const trimmed = raw.trim();

  const result = {
    raw,
    isValid: false,
    errors: [],
    warnings: [],
    partition: '',
    service: '',
    region: '',
    accountId: '',
    resource: '',
    resourceType: null,
    resourceId: '',
  };

  if (trimmed === '') {
    result.errors.push('ARN is empty.');
    return result;
  }

  const { segments, resource } = splitArnSegments(trimmed);

  if (segments.length < 5) {
    result.errors.push(
      `Too few segments: expected at least 6 colon-delimited parts ` +
        `(arn:partition:service:region:account-id:resource), found ${segments.length}.`
    );
    return result;
  }

  if (resource === '') {
    result.errors.push('Resource segment is empty.');
    return result;
  }

  const [literal, partition, service, region, accountId] = segments;

  if (literal !== 'arn') {
    result.errors.push(`Missing "arn:" literal prefix (found "${literal}").`);
  }

  if (!partition) {
    result.errors.push('Partition segment is empty.');
  } else if (!KNOWN_PARTITIONS.has(partition)) {
    const known = [...KNOWN_PARTITIONS].join(', ');
    result.warnings.push(`Unrecognized partition "${partition}" (known partitions: ${known}).`);
  }

  if (!service) {
    result.errors.push('Service segment is empty.');
  }

  if (region !== '' && !REGION_PATTERN.test(region)) {
    result.errors.push(`Region "${region}" does not look like a valid AWS region.`);
  }

  if (accountId !== '' && !ACCOUNT_ID_PATTERN.test(accountId)) {
    result.errors.push(
      `Account ID "${accountId}" must be empty or exactly 12 digits.`
    );
  }

  const { resourceType, resourceId } = splitResource(resource);

  result.partition = partition;
  result.service = service;
  result.region = region;
  result.accountId = accountId;
  result.resource = resource;
  result.resourceType = resourceType;
  result.resourceId = resourceId;
  result.isValid = result.errors.length === 0;

  return result;
}

/**
 * Parses multiple ARNs, one per line, skipping blank lines. Each line is
 * validated independently so a malformed line doesn't affect the others.
 *
 * @param {string} input - Multi-line text, one ARN per line.
 * @returns {Array<{ line: string, lineNumber: number, result: object }>}
 *   Per-line parse results, in input order.
 */
export function parseArnBatch(input) {
  const text = typeof input === 'string' ? input : '';
  return text
    .split('\n')
    .map((line, index) => ({ line, lineNumber: index + 1, result: line.trim() }))
    .filter((entry) => entry.result !== '')
    .map((entry) => ({
      line: entry.line.trim(),
      lineNumber: entry.lineNumber,
      result: parseArn(entry.line),
    }));
}
