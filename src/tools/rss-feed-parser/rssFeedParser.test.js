import { describe, expect, it } from 'vitest';
import { parseFeedXml } from './rssFeedParser.utils.js';

const validRss = `<?xml version="1.0"?>
<rss version="2.0"><channel><title>Example RSS</title><link>https://example.com</link>
<description>Example feed</description>
<pubDate>Mon, 03 Nov 2026 12:30:00 +0000</pubDate>
<item><title>First post</title><link>https://example.com/first</link>
<pubDate>Tue, 04 Nov 2026 12:30:00 +0000</pubDate><author>Author</author>
<description>Summary</description></item></channel></rss>`;

const validAtom = `<?xml version="1.0"?>
<feed xmlns="http://www.w3.org/2005/Atom"><id>https://example.com/feed</id>
<title>Example Atom</title>
<updated>2026-11-03T12:30:00Z</updated>
<subtitle>Atom subtitle</subtitle>
<link href="https://example.com"/><entry><title>First entry</title>
<link href="https://example.com/first"/>
<published>2026-11-03T12:30:00+00:00</published><author><name>Author</name></author>
<summary>Summary</summary></entry></feed>`;

describe('parseFeedXml', () => {
  it('parses a valid RSS 2.0 feed', () => {
    const result = parseFeedXml(validRss);
    expect(result.errors).toEqual([]);
    expect(result.feed).toMatchObject({ format: 'RSS 2.0', title: 'Example RSS' });
    expect(result.feed.entries[0]).toMatchObject({ title: 'First post', author: 'Author' });
  });

  it('parses a valid Atom 1.0 feed', () => {
    const result = parseFeedXml(validAtom);
    expect(result.errors).toEqual([]);
    expect(result.feed).toMatchObject({ format: 'Atom 1.0', title: 'Example Atom' });
    expect(result.feed.entries[0]).toMatchObject({ title: 'First entry', author: 'Author' });
  });

  it('reports malformed XML', () => {
    expect(parseFeedXml('<rss><channel></rss>').errors).toContain('XML is not well-formed.');
  });

  it('reports missing RSS required elements and links with context', () => {
    const result = parseFeedXml('<rss><channel><title>Only title</title></channel></rss>');
    expect(result.errors).toContain('RSS <channel> is missing required <link>.');
    expect(result.errors).toContain('RSS <channel> is missing required <description>.');
    expect(result.errors).toContain('RSS <channel> is missing a required link.');
  });

  it('reports invalid RSS and Atom dates and link URLs', () => {
    const rss = validRss.replace('Mon, 03 Nov 2026 12:30:00 +0000', 'yesterday');
    expect(parseFeedXml(rss).errors.join(' ')).toMatch(/RSS <channel> has an invalid RFC 822 date/);
    const atom = validAtom
      .replace('2026-11-03T12:30:00Z', '2026-11-03')
      .replace('https://example.com"/>', 'not a URL"/>');
    expect(parseFeedXml(atom).errors.join(' ')).toMatch(/Atom <feed> has an invalid RFC 3339 date/);
    expect(parseFeedXml(atom).errors.join(' ')).toMatch(
      /Atom <feed> has an invalid link URL/
    );
  });

  it('rejects unsupported RSS and Atom format declarations', () => {
    expect(parseFeedXml(validRss.replace('version="2.0"', 'version="0.91"')).errors).toContain(
      'RSS <rss> must declare version="2.0".'
    );
    const withoutAtomNamespace = validAtom.replace('xmlns="http://www.w3.org/2005/Atom"', '');
    expect(parseFeedXml(withoutAtomNamespace).errors).toContain(
      'Atom <feed> must use the http://www.w3.org/2005/Atom namespace.'
    );
  });

  it('rejects calendar-invalid RFC 3339 timestamps', () => {
    const atom = validAtom.replace('2026-11-03T12:30:00Z', '2026-02-30T12:30:00Z');
    expect(parseFeedXml(atom).errors.join(' ')).toMatch(/invalid RFC 3339 date/);
  });
});
