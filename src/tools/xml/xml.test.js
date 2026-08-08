import { describe, expect, it } from 'vitest';
import { formatXml, minifyXml, validateXml, SAMPLE_XML } from './xml.utils';

describe('xml.utils validation errors', () => {
  it('reports unclosed tag error with line and column', () => {
    const xml = '<root>\n  <child>';
    const res = validateXml(xml);
    expect(res.valid).toBe(false);
    expect(res.error.line).toBe(2);
    expect(res.error.column).toBe(3);
    expect(res.error.message).toContain("Unclosed tag '<child>'");
  });

  it('reports tag mismatch error with line and column', () => {
    const xml = '<root>\n  <a>test</b>\n</root>';
    const res = validateXml(xml);
    expect(res.valid).toBe(false);
    expect(res.error.line).toBe(2);
    expect(res.error.column).toBe(10);
    expect(res.error.message).toContain("Mismatched closing tag '</b>', expected '</a>'");
  });

  it('reports improper nesting error with line and column', () => {
    const xml = '<a><b></a></b>';
    const res = validateXml(xml);
    expect(res.valid).toBe(false);
    expect(res.error.line).toBe(1);
    expect(res.error.column).toBe(7);
    expect(res.error.message).toContain("Mismatched closing tag '</a>', expected '</b>'");
  });

  it('reports quote-less attribute error with line and column', () => {
    const xml = '<root><item key=val /></root>';
    const res = validateXml(xml);
    expect(res.valid).toBe(false);
    expect(res.error.line).toBe(1);
    expect(res.error.column).toBe(13);
    expect(res.error.message).toContain(
      "Attribute 'key' in tag '<item>' must have a quoted value"
    );
  });

  it('reports duplicate attribute name error with line and column', () => {
    const xml = '<root><item key="1" key="2" /></root>';
    const res = validateXml(xml);
    expect(res.valid).toBe(false);
    expect(res.error.line).toBe(1);
    expect(res.error.column).toBe(21);
    expect(res.error.message).toContain("Duplicate attribute 'key' in tag '<item>'");
  });

  it('reports missing root element error', () => {
    const xml = '<!-- only a comment -->';
    const res = validateXml(xml);
    expect(res.valid).toBe(false);
    expect(res.error.line).toBe(1);
    expect(res.error.column).toBe(1);
    expect(res.error.message).toContain('Root element is missing');
  });

  it('reports multiple root elements error with line and column', () => {
    const xml = '<a/>\n<b/>';
    const res = validateXml(xml);
    expect(res.valid).toBe(false);
    expect(res.error.line).toBe(2);
    expect(res.error.column).toBe(1);
    expect(res.error.message).toContain("Multiple root elements found: '<b>'");
  });
});

describe('xml.utils formatting (beautify)', () => {
  it('formats with 2 spaces indentation option', () => {
    const xml = '<root><child><item>val</item></child></root>';
    const formatted = formatXml(xml, '2');
    expect(formatted).toBe(
      '<root>\n' +
      '  <child>\n' +
      '    <item>val</item>\n' +
      '  </child>\n' +
      '</root>'
    );
  });

  it('formats with 4 spaces indentation option', () => {
    const xml = '<root><child>val</child></root>';
    const formatted = formatXml(xml, '4');
    expect(formatted).toBe(
      '<root>\n' +
      '    <child>val</child>\n' +
      '</root>'
    );
  });

  it('formats with tab indentation option', () => {
    const xml = '<root><child>val</child></root>';
    const formatted = formatXml(xml, 'tab');
    expect(formatted).toBe(
      '<root>\n' +
      '\t<child>val</child>\n' +
      '</root>'
    );
  });

  it('keeps mixed content inline without introducing extra line breaks', () => {
    const xml = '<p>Hello <b>world</b>!</p>';
    const formatted = formatXml(xml, '2');
    expect(formatted).toBe('<p>Hello <b>world</b>!</p>');
  });

  it('never escapes or re-indents CDATA content', () => {
    const xml = '<root><data><![CDATA[if (a < b && b > c) {\n' +
      '  console.log("no escape &");\n' +
      '}]]></data></root>';
    const formatted = formatXml(xml, '2');
    expect(formatted).toContain(
      '<![CDATA[if (a < b && b > c) {\n  console.log("no escape &");\n}]]>'
    );
  });
});

describe('xml.utils minification', () => {
  it('removes insignificant element-level whitespace while preserving text content', () => {
    const xml = `<root>
  <child>  text with spaces  </child>
  <item />
</root>`;
    const minified = minifyXml(xml);
    expect(minified).toBe('<root><child>text with spaces</child><item/></root>');
  });

  it('preserves CDATA and entity references during minification', () => {
    const xml = '<root attr="&amp;"><![CDATA[ <raw> & text ]]></root>';
    const minified = minifyXml(xml);
    expect(minified).toBe('<root attr="&amp;"><![CDATA[ <raw> & text ]]></root>');
  });
});

describe('xml.utils roundtrip preservation', () => {
  it('preserves comments, CDATA, PIs, DOCTYPE, self-closing tags, and namespaces', () => {
    const formatted1 = formatXml(SAMPLE_XML, '2');
    const minified = minifyXml(formatted1);
    const formatted2 = formatXml(minified, '2');

    expect(formatted2).toBe(formatted1);
    expect(formatted2).toContain('<?xml version="1.0" encoding="UTF-8"?>');
    expect(formatted2).toContain('<!DOCTYPE note SYSTEM "Note.dtd">');
    expect(formatted2).toContain('<!-- Sample XML Document');
    expect(formatted2).toContain('<![CDATA[if (a < b && b > c)');
    expect(formatted2).toContain('<soap:Envelope');
    expect(formatted2).toContain('<ex:Author name="DevTool"/>');
    expect(formatted2).toContain(
      '<p>Welcome to <b>XML Formatter</b>! It handles <i>mixed content</i> seamlessly.</p>'
    );
  });
});

describe('xml.utils performance scaling', () => {
  it('parses large XML document with 8,000+ elements in linear time', () => {
    const items = [];
    for (let i = 0; i < 8000; i++) {
      items.push(`<item id="${i}">content ${i}</item>`);
    }
    const xml = `<root>\n${items.join('\n')}\n</root>`;

    const start = performance.now();
    const res = validateXml(xml);
    const elapsed = performance.now() - start;

    expect(res.valid).toBe(true);
    expect(elapsed).toBeLessThan(1000);
  });
});

