import { describe, expect, it } from 'vitest';
import { evaluatePath, parseRobotsTxt } from './robotsTxt.utils.js';

describe('parseRobotsTxt never throws', () => {
  it('returns empty results for null, undefined, and empty input', () => {
    expect(parseRobotsTxt(null)).toEqual({ groups: [], sitemaps: [], ignoredLines: [] });
    expect(parseRobotsTxt(undefined)).toEqual({ groups: [], sitemaps: [], ignoredLines: [] });
    expect(parseRobotsTxt('')).toEqual({ groups: [], sitemaps: [], ignoredLines: [] });
  });

  it('does not throw for non-string and binary-garbage input', () => {
    expect(() => parseRobotsTxt(42)).not.toThrow();
    expect(() => parseRobotsTxt({})).not.toThrow();
    expect(() => parseRobotsTxt(['User-agent: *'])).not.toThrow();
    expect(() => parseRobotsTxt('\x00\x01\uFFFD binary \x07 garbage')).not.toThrow();
  });
});

describe('parseRobotsTxt grouping', () => {
  it('groups Allow/Disallow/Crawl-delay rules under a single User-agent', () => {
    const result = parseRobotsTxt([
      'User-agent: *',
      'Disallow: /admin',
      'Allow: /admin/public',
      'Crawl-delay: 5',
    ].join('\n'));

    expect(result.groups).toEqual([
      {
        userAgent: '*',
        rules: [
          { type: 'disallow', value: '/admin', line: 2 },
          { type: 'allow', value: '/admin/public', line: 3 },
          { type: 'crawl-delay', value: '5', line: 4 },
        ],
      },
    ]);
    expect(result.ignoredLines).toEqual([]);
  });

  it('merges two separate User-agent: Foo blocks into one rule set, preserving order/lines', () => {
    const result = parseRobotsTxt([
      'User-agent: Foo',
      'Disallow: /a',
      '',
      'User-agent: Bar',
      'Disallow: /z',
      '',
      'User-agent: Foo',
      'Disallow: /b',
    ].join('\n'));

    const foo = result.groups.find((group) => group.userAgent === 'foo');
    expect(foo.rules).toEqual([
      { type: 'disallow', value: '/a', line: 2 },
      { type: 'disallow', value: '/b', line: 8 },
    ]);
    // Merging preserves first-appearance order among distinct tokens.
    expect(result.groups.map((group) => group.userAgent)).toEqual(['foo', 'bar']);
  });

  it('shares one rule set across consecutive User-agent lines in the same group', () => {
    const result = parseRobotsTxt([
      'User-agent: A',
      'User-agent: B',
      'Disallow: /x',
    ].join('\n'));

    expect(result.groups).toHaveLength(2);
    const [a, b] = result.groups;
    expect(a.rules).toEqual([{ type: 'disallow', value: '/x', line: 3 }]);
    expect(b.rules).toEqual([{ type: 'disallow', value: '/x', line: 3 }]);
  });

  it('is case-insensitive for directive field names and user-agent tokens', () => {
    const result = parseRobotsTxt([
      'user-AGENT: Foo',
      'DISALLOW: /a',
      'USER-AGENT: foo',
      'allow: /b',
    ].join('\n'));

    expect(result.groups).toHaveLength(1);
    expect(result.groups[0].userAgent).toBe('foo');
    expect(result.groups[0].rules).toEqual([
      { type: 'disallow', value: '/a', line: 2 },
      { type: 'allow', value: '/b', line: 4 },
    ]);
  });

  it('deduplicates a token repeated within one consecutive User-agent run', () => {
    const result = parseRobotsTxt([
      'User-agent: Foo',
      'User-agent: foo',
      'Disallow: /a',
    ].join('\n'));

    expect(result.groups).toHaveLength(1);
    expect(result.groups[0].userAgent).toBe('foo');
    expect(result.groups[0].rules).toEqual([{ type: 'disallow', value: '/a', line: 3 }]);
  });
});

describe('parseRobotsTxt sitemaps', () => {
  it('collects Sitemap lines file-wide regardless of position relative to groups', () => {
    const result = parseRobotsTxt([
      'Sitemap: https://example.com/sitemap-0.xml',
      'User-agent: *',
      'Disallow: /admin',
      'Sitemap: https://example.com/sitemap-1.xml',
      '',
      'User-agent: Bingbot',
      'Disallow: /private',
      'Sitemap: https://example.com/sitemap-2.xml',
    ].join('\n'));

    expect(result.sitemaps).toEqual([
      { url: 'https://example.com/sitemap-0.xml', line: 1 },
      { url: 'https://example.com/sitemap-1.xml', line: 4 },
      { url: 'https://example.com/sitemap-2.xml', line: 8 },
    ]);
    // Sitemap lines do not break the group in progress.
    expect(result.groups.find((group) => group.userAgent === '*').rules).toHaveLength(1);
  });
});

describe('parseRobotsTxt lenient handling', () => {
  it('reports malformed/unrecognized lines in ignoredLines without stopping the parse', () => {
    const result = parseRobotsTxt([
      'This is not a directive',
      'User-agent: *',
      'Disallow: /admin',
      'Unknown-Field: value',
      'Allow: /public',
    ].join('\n'));

    expect(result.ignoredLines).toEqual([
      { line: 1, text: 'This is not a directive' },
      { line: 4, text: 'Unknown-Field: value' },
    ]);
    expect(result.groups[0].rules).toEqual([
      { type: 'disallow', value: '/admin', line: 3 },
      { type: 'allow', value: '/public', line: 5 },
    ]);
  });

  it('ignores rules that appear before any User-agent line', () => {
    const result = parseRobotsTxt([
      'Disallow: /orphan',
      'User-agent: *',
      'Disallow: /admin',
    ].join('\n'));

    expect(result.ignoredLines).toEqual([{ line: 1, text: 'Disallow: /orphan' }]);
    expect(result.groups[0].rules).toEqual([{ type: 'disallow', value: '/admin', line: 3 }]);
  });

  it('treats comments and blank lines as non-fatal separators, not ignored lines', () => {
    const result = parseRobotsTxt([
      '# a full-line comment',
      'User-agent: * # inline comment',
      '',
      'Disallow: /admin # another comment',
    ].join('\n'));

    expect(result.ignoredLines).toEqual([]);
    expect(result.groups[0].userAgent).toBe('*');
    expect(result.groups[0].rules).toEqual([{ type: 'disallow', value: '/admin', line: 4 }]);
  });
});

describe('evaluatePath matching semantics', () => {
  const { groups } = parseRobotsTxt([
    'User-agent: *',
    'Disallow: /admin',
    'Disallow: /fish',
    'Allow: /fish/salmon.html',
    'Disallow: ',
  ].join('\n'));

  // Kept isolated from `groups` above: a broader "Disallow: /fish" rule would also match the
  // query-string path here, defeating the point of testing the `$` end-anchor in isolation.
  const { groups: anchorGroups } = parseRobotsTxt([
    'User-agent: *',
    'Disallow: /fish/*.php$',
  ].join('\n'));

  it('matches a plain path prefix rule', () => {
    expect(evaluatePath(groups, { userAgent: '*', path: '/admin/settings' })).toEqual({
      verdict: 'DISALLOWED',
      matchedRule: { type: 'disallow', value: '/admin', line: 2 },
      group: '*',
    });
  });

  it('matches /fish prefix for /fish.html and /fish/salmon.html, case-sensitively', () => {
    expect(evaluatePath(groups, { userAgent: '*', path: '/fish.html' }).verdict)
      .toBe('DISALLOWED');
    expect(evaluatePath(groups, { userAgent: '*', path: '/Fish.asp' }).verdict)
      .toBe('ALLOWED');
  });

  it('resolves an overlapping Allow vs Disallow by longest-match-wins', () => {
    const result = evaluatePath(groups, { userAgent: '*', path: '/fish/salmon.html' });
    expect(result.verdict).toBe('ALLOWED');
    expect(result.matchedRule).toEqual({ type: 'allow', value: '/fish/salmon.html', line: 4 });
  });

  it('matches a `*` mid-pattern wildcard and `$` end-anchor, excluding trailing content', () => {
    expect(evaluatePath(anchorGroups, { userAgent: '*', path: '/fish/x.php' })).toEqual({
      verdict: 'DISALLOWED',
      matchedRule: { type: 'disallow', value: '/fish/*.php$', line: 2 },
      group: '*',
    });
    expect(evaluatePath(anchorGroups, { userAgent: '*', path: '/fish/x.php?y=1' })).toEqual({
      verdict: 'ALLOWED',
      matchedRule: null,
      group: '*',
    });
  });

  it('treats an empty Disallow value as no restriction', () => {
    const result = evaluatePath(groups, { userAgent: '*', path: '/anything' });
    expect(result).toEqual({ verdict: 'ALLOWED', matchedRule: null, group: '*' });
  });

  it('breaks an exact-length tie between Allow and Disallow in favor of Allow', () => {
    const { groups: tieGroups } = parseRobotsTxt([
      'User-agent: *',
      'Disallow: /p',
      'Allow: /p',
    ].join('\n'));
    const result = evaluatePath(tieGroups, { userAgent: '*', path: '/p' });
    expect(result.verdict).toBe('ALLOWED');
    expect(result.matchedRule).toEqual({ type: 'allow', value: '/p', line: 3 });
  });
});

describe('evaluatePath user-agent selection', () => {
  const { groups } = parseRobotsTxt([
    'User-agent: *',
    'Disallow: /all',
    '',
    'User-agent: Googlebot',
    'Disallow: /google-only',
  ].join('\n'));

  it('selects the most specific matching group over the wildcard', () => {
    const result = evaluatePath(groups, { userAgent: 'Googlebot/2.1', path: '/google-only' });
    expect(result).toEqual({
      verdict: 'DISALLOWED',
      matchedRule: { type: 'disallow', value: '/google-only', line: 5 },
      group: 'googlebot',
    });
  });

  it('falls back to the wildcard group when no specific token matches', () => {
    const result = evaluatePath(groups, { userAgent: 'Bingbot', path: '/all' });
    expect(result).toEqual({
      verdict: 'DISALLOWED',
      matchedRule: { type: 'disallow', value: '/all', line: 2 },
      group: '*',
    });
  });

  it('returns "no applicable group" when neither a specific nor wildcard group exists', () => {
    const { groups: specificOnly } = parseRobotsTxt('User-agent: Googlebot\nDisallow: /x');
    const result = evaluatePath(specificOnly, { userAgent: 'Bingbot', path: '/x' });
    expect(result).toEqual({ verdict: 'ALLOWED', matchedRule: null, group: null });
  });

  it('combines rules from every matching specific group, not just the longest token', () => {
    const { groups: overlapping } = parseRobotsTxt([
      'User-agent: Googlebot',
      'Disallow: /private',
      '',
      'User-agent: Googlebot-News',
      'Disallow: /news',
    ].join('\n'));

    // "Googlebot-News/1.0" contains both the "googlebot" and "googlebot-news" product tokens,
    // so both groups' rules must apply - not only the longest-token ("googlebot-news") match.
    const privateResult = evaluatePath(overlapping, {
      userAgent: 'Googlebot-News/1.0',
      path: '/private',
    });
    expect(privateResult.verdict).toBe('DISALLOWED');
    expect(privateResult.matchedRule).toEqual({ type: 'disallow', value: '/private', line: 2 });

    const newsResult = evaluatePath(overlapping, {
      userAgent: 'Googlebot-News/1.0',
      path: '/news',
    });
    expect(newsResult.verdict).toBe('DISALLOWED');
    expect(newsResult.matchedRule).toEqual({ type: 'disallow', value: '/news', line: 5 });

    // Plain "Googlebot" only matches the "googlebot" token, so /news stays allowed for it.
    const googlebotOnly = evaluatePath(overlapping, { userAgent: 'Googlebot', path: '/news' });
    expect(googlebotOnly.verdict).toBe('ALLOWED');
  });
});

describe('evaluatePath percent-encoding normalization', () => {
  it('matches a percent-encoded unreserved octet against its literal equivalent', () => {
    const { groups } = parseRobotsTxt([
      'User-agent: *',
      'Disallow: /catalog/item',
    ].join('\n'));

    // %69 decodes to the unreserved character "i", so this must be caught just like the literal
    // "/catalog/item" would be.
    const result = evaluatePath(groups, { userAgent: '*', path: '/catalog/%69tem' });
    expect(result.verdict).toBe('DISALLOWED');
    expect(result.matchedRule).toEqual({ type: 'disallow', value: '/catalog/item', line: 2 });
  });

  it('does not decode a reserved escape such as %2F into a literal path separator', () => {
    const { groups } = parseRobotsTxt([
      'User-agent: *',
      'Disallow: /a/b',
    ].join('\n'));

    // %2F must stay distinct from a literal "/", so this does not match "/a/b".
    const result = evaluatePath(groups, { userAgent: '*', path: '/a%2Fb' });
    expect(result.verdict).toBe('ALLOWED');
  });

  it('implicitly allows /robots.txt even under a blanket Disallow: /', () => {
    const { groups } = parseRobotsTxt([
      'User-agent: *',
      'Disallow: /',
    ].join('\n'));

    const result = evaluatePath(groups, { userAgent: '*', path: '/robots.txt' });
    expect(result).toEqual({ verdict: 'ALLOWED', matchedRule: null, group: '*' });

    // The exemption is for the file itself, not for other paths under a blanket disallow.
    expect(evaluatePath(groups, { userAgent: '*', path: '/anything-else' }).verdict)
      .toBe('DISALLOWED');
  });
});
