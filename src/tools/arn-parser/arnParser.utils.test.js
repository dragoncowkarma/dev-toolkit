import { describe, expect, it } from 'vitest';
import { parseArn, parseArnBatch, splitResource } from './arnParser.utils.js';

describe('parseArn - valid ARNs', () => {
  it('parses an IAM role ARN with a nested path', () => {
    const result = parseArn('arn:aws:iam::123456789012:role/path/to/role');
    expect(result.isValid).toBe(true);
    expect(result.errors).toEqual([]);
    expect(result.partition).toBe('aws');
    expect(result.service).toBe('iam');
    expect(result.region).toBe('');
    expect(result.accountId).toBe('123456789012');
    expect(result.resourceType).toBe('role');
    expect(result.resourceId).toBe('path/to/role');
  });

  it('parses an S3 bucket ARN with no region or account ID', () => {
    const result = parseArn('arn:aws:s3:::my-bucket');
    expect(result.isValid).toBe(true);
    expect(result.region).toBe('');
    expect(result.accountId).toBe('');
    expect(result.resourceType).toBeNull();
    expect(result.resourceId).toBe('my-bucket');
  });

  it('parses an S3 object ARN', () => {
    const result = parseArn('arn:aws:s3:::my-bucket/path/to/object.txt');
    expect(result.isValid).toBe(true);
    expect(result.resourceType).toBe('my-bucket');
    expect(result.resourceId).toBe('path/to/object.txt');
  });

  it('parses a Lambda function ARN', () => {
    const result = parseArn('arn:aws:lambda:us-east-1:123456789012:function:my-function');
    expect(result.isValid).toBe(true);
    expect(result.service).toBe('lambda');
    expect(result.region).toBe('us-east-1');
    expect(result.resourceType).toBe('function');
    expect(result.resourceId).toBe('my-function');
  });

  it('parses a DynamoDB table ARN', () => {
    const result = parseArn('arn:aws:dynamodb:us-east-1:123456789012:table/my-table');
    expect(result.isValid).toBe(true);
    expect(result.service).toBe('dynamodb');
    expect(result.resourceType).toBe('table');
    expect(result.resourceId).toBe('my-table');
  });

  it('parses a CloudWatch Logs log group ARN with embedded colons and slashes', () => {
    const result = parseArn(
      'arn:aws:logs:us-east-1:123456789012:log-group:/my/log-group:*'
    );
    expect(result.isValid).toBe(true);
    expect(result.resourceType).toBe('log-group');
    expect(result.resourceId).toBe('/my/log-group:*');
  });

  it('accepts aws-cn and aws-us-gov partitions without warnings', () => {
    const cn = parseArn('arn:aws-cn:s3:::my-bucket');
    const gov = parseArn('arn:aws-us-gov:s3:::my-bucket');
    expect(cn.isValid).toBe(true);
    expect(cn.warnings).toEqual([]);
    expect(gov.isValid).toBe(true);
    expect(gov.warnings).toEqual([]);
  });

  it('trims surrounding whitespace', () => {
    const result = parseArn('  arn:aws:s3:::my-bucket  ');
    expect(result.isValid).toBe(true);
    expect(result.resourceId).toBe('my-bucket');
  });
});

describe('parseArn - warnings', () => {
  it('warns (but does not fail) on an unrecognized partition', () => {
    const result = parseArn('arn:aws-mars:s3:::my-bucket');
    expect(result.isValid).toBe(true);
    expect(result.warnings).toEqual([expect.stringMatching(/Unrecognized partition/)]);
  });
});

describe('parseArn - malformed ARNs', () => {
  it('rejects input with too few segments', () => {
    const result = parseArn('arn:aws:s3');
    expect(result.isValid).toBe(false);
    expect(result.errors).toEqual([expect.stringMatching(/Too few segments/)]);
  });

  it('rejects an empty resource segment', () => {
    const result = parseArn('arn:aws:s3:::');
    expect(result.isValid).toBe(false);
    expect(result.errors).toEqual([expect.stringMatching(/Resource segment is empty/)]);
  });

  it('rejects a missing "arn:" literal prefix', () => {
    const result = parseArn('arm:aws:s3:::my-bucket');
    expect(result.isValid).toBe(false);
    expect(result.errors).toEqual([expect.stringMatching(/Missing "arn:" literal prefix/)]);
  });

  it('rejects a non-numeric account ID', () => {
    const result = parseArn('arn:aws:iam::not-an-account:role/MyRole');
    expect(result.isValid).toBe(false);
    expect(result.errors).toEqual([expect.stringMatching(/Account ID/)]);
  });

  it('rejects an account ID with the wrong length', () => {
    const result = parseArn('arn:aws:iam::12345:role/MyRole');
    expect(result.isValid).toBe(false);
    expect(result.errors).toEqual([expect.stringMatching(/Account ID/)]);
  });

  it('rejects an implausible region', () => {
    const result = parseArn('arn:aws:ec2:not-a-region:123456789012:instance/i-123');
    expect(result.isValid).toBe(false);
    expect(result.errors).toEqual([expect.stringMatching(/does not look like a valid AWS region/)]);
  });

  it('rejects an empty string without throwing', () => {
    const result = parseArn('');
    expect(result.isValid).toBe(false);
    expect(result.errors).toEqual(['ARN is empty.']);
  });

  it('never throws for non-string input', () => {
    expect(() => parseArn(undefined)).not.toThrow();
    expect(() => parseArn(null)).not.toThrow();
    expect(() => parseArn(42)).not.toThrow();
  });

  it('reports multiple simultaneous errors', () => {
    const result = parseArn('notarn:aws:iam:bad-region:12345:role/MyRole');
    expect(result.isValid).toBe(false);
    expect(result.errors.length).toBeGreaterThan(1);
  });
});

describe('splitResource', () => {
  it('returns null resourceType when there is no separator', () => {
    expect(splitResource('my-bucket')).toEqual({ resourceType: null, resourceId: 'my-bucket' });
  });

  it('splits on "/" when it appears before ":"', () => {
    expect(splitResource('role/path/to/role')).toEqual({
      resourceType: 'role',
      resourceId: 'path/to/role',
    });
  });

  it('splits on ":" when it appears before "/"', () => {
    expect(splitResource('log-group:/my/log-group:*')).toEqual({
      resourceType: 'log-group',
      resourceId: '/my/log-group:*',
    });
  });

  it('handles an empty resource', () => {
    expect(splitResource('')).toEqual({ resourceType: null, resourceId: '' });
  });
});

describe('parseArnBatch', () => {
  it('parses one ARN per line, independently', () => {
    const input = [
      'arn:aws:s3:::valid-bucket',
      'not-an-arn',
      'arn:aws:iam::123456789012:role/MyRole',
    ].join('\n');
    const results = parseArnBatch(input);
    expect(results).toHaveLength(3);
    expect(results[0].result.isValid).toBe(true);
    expect(results[1].result.isValid).toBe(false);
    expect(results[2].result.isValid).toBe(true);
    expect(results.map((r) => r.lineNumber)).toEqual([1, 2, 3]);
  });

  it('skips blank lines but preserves line numbers for surviving entries', () => {
    const input = 'arn:aws:s3:::bucket-a\n\n\narn:aws:s3:::bucket-b';
    const results = parseArnBatch(input);
    expect(results).toHaveLength(2);
    expect(results[0].lineNumber).toBe(1);
    expect(results[1].lineNumber).toBe(4);
  });

  it('returns an empty array for empty input', () => {
    expect(parseArnBatch('')).toEqual([]);
    expect(parseArnBatch('   \n  \n')).toEqual([]);
  });
});
