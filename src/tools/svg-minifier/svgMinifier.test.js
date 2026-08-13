import { describe, expect, it } from 'vitest';
import { minifySvg, toBase64DataUri, toCssDataUri } from './svgMinifier.utils.js';

const EXPORTED_SVG = `<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE svg PUBLIC "-//W3C//DTD SVG 1.1//EN" "http://www.w3.org/Graphics/SVG/1.1/DTD/svg11.dtd">
<!-- Exported from an editor -->
<svg xmlns="http://www.w3.org/2000/svg" xmlns:inkscape="http://www.inkscape.org/namespaces/inkscape"
  xmlns:sodipodi="http://sodipodi.sourceforge.net/DTD/sodipodi-0.dtd" viewBox="0 0 24 24"
  inkscape:version="1.3" sodipodi:docname="icon.svg">
  <path d="M 1 2 L 3 4" points="1, 2 3, 4" />
  <circle cx="12" cy="12" r="8" />
</svg>`;

function decodeBase64(value) {
  const encoded = value.replace('data:image/svg+xml;base64,', '');
  const bytes = Uint8Array.from(atob(encoded), (character) => character.charCodeAt(0));
  return new TextDecoder().decode(bytes);
}

function decodeCss(value) {
  const encoded = value.match(/^background-image: url\("data:image\/svg\+xml,(.*)"\);$/)?.[1] || '';
  return decodeURIComponent(encoded).replace(/'/g, '"');
}

describe('minifySvg', () => {
  it('strips declarations, comments, metadata, and inter-tag whitespace safely', () => {
    const result = minifySvg(EXPORTED_SVG);

    expect(result.error).toBeUndefined();
    expect(result.minified).toBe(
      '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24">' +
        '<path d="M 1 2 L 3 4" points="1, 2 3, 4" />' +
        '<circle cx="12" cy="12" r="8" /></svg>',
    );
    expect(result.minified).not.toContain('<?xml');
    expect(result.minified).not.toContain('<!DOCTYPE');
    expect(result.minified).not.toContain('<!--');
    expect(result.minified).not.toContain('inkscape:');
    expect(result.minified).not.toContain('sodipodi:');
    expect(result.minified).toContain('d="M 1 2 L 3 4"');
    expect(result.minified).toContain('points="1, 2 3, 4"');
    expect(result.minified).toContain('viewBox="0 0 24 24"');
  });

  it('reports UTF-8 byte savings instead of string code-unit length', () => {
    const input = '<svg>\n  <!-- 한글 -->\n  <title>é</title>\n</svg>';
    const result = minifySvg(input);

    expect(result.minified).toBe('<svg><title>é</title></svg>');
    expect(result.originalBytes).toBe(new TextEncoder().encode(input).length);
    expect(result.minifiedBytes).toBe(new TextEncoder().encode(result.minified).length);
    expect(result.savedPercent).toBeGreaterThan(0);
  });

  it('preserves text-node and attribute-value internals', () => {
    const input = '<svg viewBox="0  0  24  24"><text>  Keep   this text  </text></svg>';
    const result = minifySvg(input);

    expect(result.minified).toBe(input);
  });

  it('returns descriptive, non-throwing errors for missing or unbalanced SVG roots', () => {
    expect(() => minifySvg('<div></div>')).not.toThrow();
    expect(minifySvg('<div></div>').error).toMatch(/root <svg>/i);
    expect(minifySvg('<svg><path></svg>').error).toMatch(/unbalanced/i);
    expect(minifySvg('<svg><path></path>').error).toMatch(/unclosed <svg>/i);
  });
});

describe('SVG data URIs', () => {
  it('round-trips the readable CSS data URI after its quote normalization is restored', () => {
    const minified = '<svg viewBox="0 0 24 24"><path fill="#fff" d="M0 0" /></svg>';
    const output = toCssDataUri(minified);

    expect(output).toContain('background-image: url("data:image/svg+xml,');
    expect(output).toContain('%23fff');
    expect(output).toContain('%3Csvg');
    expect(output).toContain('%20');
    expect(decodeCss(output)).toBe(minified);
  });

  it('round-trips a UTF-8 base64 data URI, including non-Latin1 text', () => {
    const minified = '<svg><title>Crème 서울</title><path d="M0 0" /></svg>';

    expect(decodeBase64(toBase64DataUri(minified))).toBe(minified);
  });
});
