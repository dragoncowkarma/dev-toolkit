import { describe, expect, it } from 'vitest';
import {
  buildSriTag,
  computeSriDigest,
  formatSriIntegrity,
  generateSriIntegrity,
  parseSriIntegrity,
  validateSriIntegrity,
} from './sriGenerator.utils.js';

describe('SRI Generator utilities', () => {
  it('computes the SHA-256 Base64 digest for a W3C SRI example asset', async () => {
    await expect(computeSriDigest('sha256', 'hello')).resolves.toBe(
      'LPJNul+wow4m6DsqxbninhsWHlwfp0JecwQzYpOLmCQ='
    );
  });

  it('formats single and multi-algorithm integrity values', async () => {
    await expect(generateSriIntegrity('sha384', 'hello')).resolves.toBe(
      'sha384-WeF0h3dEjGnea4ANejO7+5/xtGPkQ1TDVTvNucZm+pASWjx5+QOXvfX2oT3oKGhP'
    );
    const integrity = await generateSriIntegrity(['sha256', 'SHA-512'], 'hello');
    expect(integrity.split(' ')).toHaveLength(2);
    expect(integrity).toMatch(/^sha256-[A-Za-z0-9+/]+={0,2} sha512-[A-Za-z0-9+/]+={0,2}$/);
  });

  it('hashes empty text and preserves whitespace as resource content', async () => {
    await expect(generateSriIntegrity('sha256', '')).resolves.toBe(
      'sha256-47DEQpj8HBSa+/TImW+5JCeuQeRkm5NMpJWZG3hSuFU='
    );
    await expect(computeSriDigest('sha256', ' hello ')).resolves.not.toBe(
      await computeSriDigest('sha256', 'hello')
    );
  });

  it('formats valid script and link tags and omits CORS when requested', () => {
    const integrity = 'sha256-LPJNul+wow4m6DsqxbninhsWHlwfp0JecwQzYpOLmCQ=';
    expect(buildSriTag('script', 'https://cdn.example.com/app.js', integrity, 'anonymous')).toBe(
      '<script src="https://cdn.example.com/app.js" integrity="' + integrity +
        '" crossorigin="anonymous"></script>'
    );
    expect(buildSriTag('link', 'theme.css', integrity)).toBe(
      '<link rel="stylesheet" href="theme.css" integrity="' + integrity + '">'
    );
  });

  it('parses whitespace-separated values and validates integrity content', async () => {
    const integrity = await generateSriIntegrity(['sha256', 'sha384'], 'resource body');
    const parsed = parseSriIntegrity(`  ${integrity.replace(' ', '\n')}  `);
    expect(parsed.tokens).toEqual(integrity.split(' '));
    await expect(validateSriIntegrity('resource body', integrity)).resolves.toMatchObject({
      isMatch: true,
      matchedAlgorithms: ['sha256', 'sha384'],
    });
    await expect(validateSriIntegrity('changed body', integrity)).resolves.toMatchObject({
      isMatch: false,
      matchedAlgorithms: [],
    });
  });

  it('rejects malformed hashes and unsupported algorithms', () => {
    expect(() => formatSriIntegrity([])).toThrow('At least one SRI hash');
    expect(() => parseSriIntegrity('sha384-not base64'))
      .toThrow('Invalid SRI hash token');
    expect(() => buildSriTag(
      'image',
      '',
      'sha256-LPJNul+wow4m6DsqxbninhsWHlwfp0JecwQzYpOLmCQ='
    )).toThrow('Unsupported target');
  });
});
