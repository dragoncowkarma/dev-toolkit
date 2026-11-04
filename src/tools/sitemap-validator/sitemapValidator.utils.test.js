import { describe, expect, it } from 'vitest';
import {
  isValidLastmod,
  validateSitemap,
} from './sitemapValidator.utils.js';

const URLSET_START = '<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">';
const URLSET_END = '</urlset>';

describe('validateSitemap', () => {
  it('extracts and validates URL sitemap entries', () => {
    const report = validateSitemap(`${URLSET_START}
      <url>
        <loc>https://example.com/?a=1&amp;b=2</loc>
        <lastmod>2026-11-03</lastmod><changefreq>weekly</changefreq><priority>0.8</priority>
      </url>
    ${URLSET_END}`);

    expect(report.sitemapType).toBe('urlset');
    expect(report.entryCount).toBe(1);
    expect(report.validUrlCount).toBe(1);
    expect(report.entries[0]).toMatchObject({
      loc: 'https://example.com/?a=1&b=2',
      lastmod: '2026-11-03',
      changefreq: 'weekly',
      priority: '0.8',
      issues: [],
    });
  });

  it('handles sitemap indexes', () => {
    const report = validateSitemap(`
      <sitemapindex xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
        <sitemap>
          <loc>https://example.com/pages.xml</loc><lastmod>2026-11-03T12:30:00Z</lastmod>
        </sitemap>
      </sitemapindex>`);

    expect(report.sitemapType).toBe('sitemapindex');
    expect(report.entries).toHaveLength(1);
    expect(report.entries[0].changefreq).toBe('');
    expect(report.isValid).toBe(true);
  });

  it('warns for invalid lastmod, changefreq, and priority values', () => {
    const report = validateSitemap(`${URLSET_START}
      <url><loc>https://example.com/</loc><lastmod>2026-02-30</lastmod>
        <changefreq>sometimes</changefreq><priority>1.4</priority></url>
    ${URLSET_END}`);

    expect(report.errors).toHaveLength(0);
    expect(report.warnings).toHaveLength(3);
    expect(report.entries[0].issues.map((issue) => issue.field)).toEqual([
      'lastmod', 'changefreq', 'priority',
    ]);
  });

  it('recognizes allowed date-only and full date-time lastmod formats', () => {
    expect(isValidLastmod('2026-11-03')).toBe(true);
    expect(isValidLastmod('2026-11-03T12:30:45.123+09:00')).toBe(true);
    expect(isValidLastmod('2026-11-03T25:30:45Z')).toBe(false);
    expect(isValidLastmod('2026-11-03T12:30:45+25:99')).toBe(false);
    expect(isValidLastmod('03-11-2026')).toBe(false);
  });

  it('reports duplicate locations and invalid absolute URLs', () => {
    const report = validateSitemap(`${URLSET_START}
      <url><loc>/relative</loc></url>
      <url><loc>https://example.com/</loc></url>
      <url><loc>https://example.com/</loc></url>
    ${URLSET_END}`);

    expect(report.errors).toHaveLength(1);
    expect(report.warnings).toHaveLength(1);
    expect(report.entries[2].issues[0].message).toMatch(/Duplicate URL/);
  });

  it('rejects URI characters that must be percent-encoded', () => {
    const report = validateSitemap(`${URLSET_START}
      <url><loc>https://example.com/&quot;quoted&quot;</loc></url>
    ${URLSET_END}`);

    expect(report.entries[0].issues[0].message).toMatch(/valid absolute URI/);
  });

  it('accepts escaped XML entities and rejects malformed XML', () => {
    const escaped = validateSitemap(`${URLSET_START}
      <url><loc>https://example.com/?q=one&amp;sort=two</loc></url>${URLSET_END}`);
    const malformed = validateSitemap(
      `${URLSET_START}<url><loc>https://example.com/?q=one&sort=two</loc></url>${URLSET_END}`,
    );

    expect(escaped.errors).toHaveLength(0);
    expect(malformed.errors[0].message).toMatch(/Malformed XML/);
  });

  it('warns for unrecognized extension namespaces without failing the sitemap', () => {
    const report = validateSitemap(`<urlset
      xmlns="http://www.sitemaps.org/schemas/sitemap/0.9"
      xmlns:custom="https://example.com/custom">
      <url><loc>https://example.com/</loc></url></urlset>`);

    expect(report.isValid).toBe(true);
    expect(report.warnings[0].message).toMatch(/Unrecognized extension namespace/);
  });

  it('extracts recognized image, news, and video sitemap extensions', () => {
    const report = validateSitemap(`<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9"
      xmlns:image="http://www.google.com/schemas/sitemap-image/1.1"
      xmlns:news="http://www.google.com/schemas/sitemap-news/0.9"
      xmlns:video="http://www.google.com/schemas/sitemap-video/1.1">
      <url><loc>https://example.com/article</loc>
        <image:image><image:loc>https://example.com/image.jpg</image:loc></image:image>
        <news:news><news:title>Headline</news:title></news:news>
        <video:video>
          <video:content_loc>https://example.com/video.mp4</video:content_loc>
        </video:video>
      </url>
    </urlset>`);

    expect(report.entries[0].extensions).toEqual([
      { type: 'image', location: 'https://example.com/image.jpg', title: '' },
      { type: 'news', location: '', title: 'Headline' },
      { type: 'video', location: 'https://example.com/video.mp4', title: '' },
    ]);
  });
});
