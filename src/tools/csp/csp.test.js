import { describe, expect, it } from 'vitest';
import {
  evaluateCsp,
  normalizeCspSources,
  parseCsp,
  serializeCspHeader,
} from './csp.utils.js';

describe('parseCsp', () => {
  it('parses a complete CSP header into lower-case directive maps', () => {
    const result = parseCsp(
      "Content-Security-Policy: default-src 'self'; script-src 'self' https://cdn.example.com; "
        + "upgrade-insecure-requests",
    );

    expect(result.error).toBeNull();
    expect(result.directives).toEqual({
      'default-src': ["'self'"],
      'script-src': ["'self'", 'https://cdn.example.com'],
      'upgrade-insecure-requests': [],
    });
  });

  it('accepts directive-only input and normalizes repeated whitespace and sources', () => {
    const result = parseCsp("  img-src   'self'   data: data: ; object-src 'none' ");
    expect(result).toEqual({
      directives: { 'img-src': ["'self'", 'data:'], 'object-src': ["'none'"] },
      error: null,
    });
  });

  it('returns an error instead of throwing for invalid directive syntax', () => {
    const result = parseCsp("default-src 'self'; invalid:directive https:");
    expect(result.directives).toEqual({ 'default-src': ["'self'"] });
    expect(result.error).toMatchObject({ segment: 2, message: expect.stringContaining('Invalid') });
  });

  it('returns an error for unbalanced or invalid source quotes', () => {
    const result = parseCsp("script-src 'self https://cdn.example.com");
    expect(result.directives).toEqual({});
    expect(result.error?.message).toContain('Invalid quote usage');
    expect(() => parseCsp(null)).not.toThrow();
  });

  it('reports duplicate directives without throwing', () => {
    const result = parseCsp("default-src 'self'; default-src https://example.com");
    expect(result.directives).toEqual({ 'default-src': ["'self'"] });
    expect(result.error?.message).toContain('Duplicate CSP directive');
  });
});

describe('CSP normalization and serialization', () => {
  it('normalizes source lists by trimming and retaining unique source order', () => {
    expect(normalizeCspSources([" 'self' ", 'https://cdn.example.com', "'self'", '', null]))
      .toEqual(["'self'", 'https://cdn.example.com']);
  });

  it('serializes a sorted, normalized complete header', () => {
    const header = serializeCspHeader({
      'Script-Src': [' https://cdn.example.com ', "'self'", "'self'"],
      'default-src': ["'self'"],
    });
    expect(header).toBe(
      "Content-Security-Policy: default-src 'self'; script-src https://cdn.example.com 'self'",
    );
  });

  it('can serialize a directive-only value and valueless directives', () => {
    expect(serializeCspHeader({ 'upgrade-insecure-requests': [] }, { includeHeader: false }))
      .toBe('upgrade-insecure-requests');
  });
});

describe('evaluateCsp', () => {
  it('flags dangerous source expressions with evidence and remediation', () => {
    const assessment = evaluateCsp({
      'default-src': ["'self'"],
      'script-src': ["'unsafe-inline'", "'unsafe-eval'", '*', 'http:'],
    });
    expect(assessment.level).toBe('HIGH');
    expect(assessment.findings.map((finding) => finding.id)).toEqual(expect.arrayContaining([
      'unsafe-inline', 'unsafe-eval', 'wildcard-source', 'http-source',
      'missing-object-src', 'missing-base-uri', 'missing-frame-ancestors',
    ]));
    expect(assessment.findings.every((finding) => finding.evidence && finding.advisory)).toBe(true);
  });

  it('flags each missing baseline directive at its assigned risk level', () => {
    const assessment = evaluateCsp({});
    expect(assessment.level).toBe('MEDIUM');
    expect(assessment.findings).toEqual(expect.arrayContaining([
      expect.objectContaining({ id: 'missing-default-src', level: 'MEDIUM' }),
      expect.objectContaining({ id: 'missing-object-src', level: 'MEDIUM' }),
      expect.objectContaining({ id: 'missing-base-uri', level: 'MEDIUM' }),
      expect.objectContaining({ id: 'missing-frame-ancestors', level: 'LOW' }),
    ]));
  });

  it('returns PASS for a policy with explicit hardened baseline directives', () => {
    const assessment = evaluateCsp({
      'default-src': ["'self'"],
      'object-src': ["'none'"],
      'base-uri': ["'self'"],
      'frame-ancestors': ["'none'"],
    });
    expect(assessment).toEqual({ level: 'PASS', findings: [] });
  });
});
