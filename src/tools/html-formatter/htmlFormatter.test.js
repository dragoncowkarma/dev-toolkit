import { describe, expect, it } from 'vitest';
import { formatHtml, minifyHtml, parseHtmlDocument } from './htmlFormatter.utils.js';

describe('parseHtmlDocument', () => {
  it('rejects non-string input', () => {
    expect(() => parseHtmlDocument(123)).toThrow(TypeError);
  });

  it('parses an empty document', () => {
    const result = parseHtmlDocument('');
    expect(result).toEqual({ ok: true, nodes: [] });
  });
});

describe('formatHtml - nesting and indentation', () => {
  const source = '<div><p>Hello</p><span><b>World</b></span></div>';

  it('formats ordinary nested markup with 2-space indentation by default', () => {
    const result = formatHtml('<div>\n  <p>Hello</p>\n</div>');
    expect(result.ok).toBe(true);
    expect(result.result).toBe('<div>\n  <p>Hello</p>\n</div>');
  });

  it('produces correct nesting for deeper structures', () => {
    const input = '<ul>\n<li>One</li>\n<li>Two</li>\n</ul>';
    const result = formatHtml(input, '2');
    expect(result.result).toBe('<ul>\n  <li>One</li>\n  <li>Two</li>\n</ul>');
  });

  it('supports 4-space indentation', () => {
    const input = '<div>\n<p>Hi</p>\n</div>';
    const result = formatHtml(input, '4');
    expect(result.result).toBe('<div>\n    <p>Hi</p>\n</div>');
  });

  it('supports tab indentation', () => {
    const input = '<div>\n<p>Hi</p>\n</div>';
    const result = formatHtml(input, 'tab');
    expect(result.result).toBe('<div>\n\t<p>Hi</p>\n</div>');
  });

  it('keeps siblings adjacent when the source has no separating whitespace', () => {
    const result = formatHtml(source);
    // No text node existed between the tags in the source, so formatting must not
    // insert whitespace that would change rendering.
    expect(result.result).toBe(source);
  });

  it('aligns a closing tag with its opening tag rather than its children', () => {
    const input = '<section>\n<p>Text</p>\n</section>';
    const result = formatHtml(input, '2');
    expect(result.result.endsWith('\n</section>')).toBe(true);
  });
});

describe('formatHtml - void elements', () => {
  it('formats void elements without a closing tag or children', () => {
    const input = '<div>\n<img src="a.png" alt="A">\n<br>\n<input type="text">\n</div>';
    const result = formatHtml(input, '2');
    expect(result.result).toBe(
      '<div>\n  <img src="a.png" alt="A">\n  <br>\n  <input type="text">\n</div>'
    );
  });

  it('preserves an explicit self-closing slash on a void element', () => {
    const result = formatHtml('<br/>');
    expect(result.result).toBe('<br/>');
  });
});

describe('formatHtml - comments and doctype', () => {
  it('preserves comment content and the doctype declaration verbatim', () => {
    const input = '<!DOCTYPE html>\n<!-- top level comment -->\n<div><!-- inner --></div>';
    const result = formatHtml(input, '2');
    expect(result.result).toBe(
      '<!DOCTYPE html>\n<!-- top level comment -->\n<div><!-- inner --></div>'
    );
  });

  it('preserves a doctype written in any case', () => {
    const result = formatHtml('<!doctype HTML>');
    expect(result.result).toBe('<!doctype HTML>');
  });
});

describe('formatHtml - quoted attributes', () => {
  it('does not treat a greater-than sign inside a quoted attribute as the tag end', () => {
    const input = '<div title="a > b" class=\'c d\'>text</div>';
    const result = formatHtml(input);
    expect(result.ok).toBe(true);
    expect(result.result).toBe(input);
  });

  it('preserves attribute values, quote style, and order exactly', () => {
    const input = '<input data-a="1" data-b=\'2\' data-c=three disabled>';
    const result = formatHtml(input);
    expect(result.result).toBe(input);
  });
});

describe('formatHtml - raw-text elements', () => {
  it('preserves script content exactly, including markup-like text', () => {
    const input = '<script>\nif (a < b && c > 1) { console.log("<div>"); }\n</script>';
    const result = formatHtml(input);
    expect(result.result).toBe(input);
  });

  it('preserves style content exactly', () => {
    const input = '<style>\n.a > .b { color: red; }\n</style>';
    const result = formatHtml(input);
    expect(result.result).toBe(input);
  });

  it('preserves textarea content exactly, including embedded tags as literal text', () => {
    const input = '<textarea>  keep <b>this</b> literal  </textarea>';
    const result = formatHtml(input);
    expect(result.result).toBe(input);
  });

  it('preserves pre content and whitespace exactly', () => {
    const input = '<pre>\n  line one\n    line two\n</pre>';
    const result = formatHtml(input, '4');
    expect(result.result).toBe(input);
  });
});

describe('formatHtml - malformed input errors', () => {
  it('reports an unterminated comment with a one-based line and column', () => {
    const result = formatHtml('text\n<!-- never closed');
    expect(result.ok).toBe(false);
    expect(result.error.message).toBe('Unterminated comment');
    expect(result.error.line).toBe(2);
    expect(result.error.column).toBe(1);
  });

  it('reports an unterminated tag', () => {
    const result = formatHtml('<div class="a"');
    expect(result.ok).toBe(false);
    expect(result.error.message).toMatch(/Unterminated tag/);
  });

  it('reports an unterminated element (missing closing tag)', () => {
    const result = formatHtml('<div><p>Hi</p>');
    expect(result.ok).toBe(false);
    expect(result.error.message).toBe('Unterminated tag <div>');
  });

  it('reports an unterminated quoted attribute value with its location', () => {
    const result = formatHtml('<div class="unterminated>text</div>');
    expect(result.ok).toBe(false);
    expect(result.error.message).toBe('Unterminated quoted attribute value for "class"');
    expect(result.error.line).toBe(1);
    expect(result.error.column).toBeGreaterThan(1);
  });

  it('reports an unterminated raw-text element', () => {
    const result = formatHtml('<script>var x = 1;');
    expect(result.ok).toBe(false);
    expect(result.error.message).toBe('Unterminated <script> element');
  });

  it('reports an unterminated pre element', () => {
    const result = formatHtml('<pre>code without a closing tag');
    expect(result.ok).toBe(false);
    expect(result.error.message).toBe('Unterminated <pre> element');
  });
});

describe('minifyHtml', () => {
  it('removes whitespace-only text between tags', () => {
    const input = '<div>\n  <p>Hello</p>\n  <p>World</p>\n</div>';
    const result = minifyHtml(input);
    expect(result.ok).toBe(true);
    expect(result.result).toBe('<div><p>Hello</p><p>World</p></div>');
  });

  it('preserves text-node content and its internal whitespace exactly', () => {
    const input = '<p>  Hello   World  </p>';
    const result = minifyHtml(input);
    expect(result.result).toBe('<p>  Hello   World  </p>');
  });

  it('preserves whitespace between inline content that carries meaning', () => {
    const input = '<p>Hello <b>World</b>!</p>';
    const result = minifyHtml(input);
    expect(result.result).toBe('<p>Hello <b>World</b>!</p>');
  });

  it('collapses whitespace between adjacent inline elements to a single space', () => {
    const input = '<p><span>Hello</span> <span>world</span></p>';
    const result = minifyHtml(input);
    expect(result.ok).toBe(true);
    expect(result.result).toBe('<p><span>Hello</span> <span>world</span></p>');
  });

  it('collapses whitespace between adjacent anchor elements to a single space', () => {
    const input = '<p><a href="/a">a</a> <a href="/b">b</a></p>';
    const result = minifyHtml(input);
    expect(result.result).toBe('<p><a href="/a">a</a> <a href="/b">b</a></p>');
  });

  it('preserves a word-boundary space across a comment between inline elements', () => {
    const input = '<p><span>Hello</span> <!-- separator --> <span>world</span></p>';
    const result = minifyHtml(input);
    expect(result.ok).toBe(true);
    expect(result.result).toBe('<p><span>Hello</span> <!-- separator --><span>world</span></p>');
  });

  it('does not invent a space across a comment when the source has no whitespace', () => {
    const input = '<p><span>Hello</span><!-- separator --><span>world</span></p>';
    const result = minifyHtml(input);
    expect(result.result).toBe('<p><span>Hello</span><!-- separator --><span>world</span></p>');
  });

  it('preserves a word-boundary space between del and ins elements', () => {
    // Regression test: del/ins are ordinary inline/phrasing elements but were previously
    // missing from the inline allowlist, so the space between them was incorrectly dropped.
    const input = '<p><del>Hello</del> <ins>world</ins></p>';
    const result = minifyHtml(input);
    expect(result.ok).toBe(true);
    expect(result.result).toBe('<p><del>Hello</del> <ins>world</ins></p>');
  });

  it('conservatively treats an unrecognized/custom element as inline', () => {
    // General rule: word-boundary preservation is based on a denylist of known block-level
    // elements, so any tag not on that list (including custom elements) is treated as inline
    // and its surrounding whitespace is preserved rather than dropped.
    const input = '<p><my-widget>Hello</my-widget> <my-widget>world</my-widget></p>';
    const result = minifyHtml(input);
    expect(result.ok).toBe(true);
    expect(result.result).toBe('<p><my-widget>Hello</my-widget> <my-widget>world</my-widget></p>');
  });

  it('still drops whitespace between block-level elements entirely', () => {
    const input = '<div><span>Hi</span> <p>World</p></div>';
    const result = minifyHtml(input);
    // <p> is block-level, so the space at its boundary is not a word-boundary and is dropped.
    expect(result.result).toBe('<div><span>Hi</span><p>World</p></div>');
  });

  it('preserves comments while minifying', () => {
    const input = '<div>\n  <!-- keep me -->\n  <p>Hi</p>\n</div>';
    const result = minifyHtml(input);
    expect(result.result).toBe('<div><!-- keep me --><p>Hi</p></div>');
  });

  it('preserves the exact content of script, style, textarea, and pre elements', () => {
    const input = [
      '<script>\n  var x = 1;\n</script>',
      '<style>\n  .a { color: red; }\n</style>',
      '<textarea>\n  keep this\n</textarea>',
      '<pre>\n  keep this too\n</pre>',
    ].join('\n');
    // Whitespace-only text nodes between the top-level tags are structurally insignificant
    // and get removed, but each raw element's own content stays byte-exact.
    const result = minifyHtml(input);
    expect(result.result).toBe(input.replace(/>\n</g, '><'));
  });

  it('returns the same structured errors as formatHtml for malformed input', () => {
    const result = minifyHtml('<!-- unterminated');
    expect(result.ok).toBe(false);
    expect(result.error.message).toBe('Unterminated comment');
  });
});

describe('minifyHtml - inline white-space CSS', () => {
  it('keeps a multi-space word-boundary run verbatim under white-space: pre', () => {
    // Regression test: collapsing this run to one space changes the rendered text, since
    // `white-space: pre` (unlike the default `normal`) renders runs of spaces verbatim.
    const input = '<p style="white-space: pre"><span>Hello</span>  <span>world</span></p>';
    const result = minifyHtml(input);
    expect(result.ok).toBe(true);
    expect(result.result).toBe(input);
  });

  it('keeps whitespace verbatim under white-space: pre-wrap', () => {
    const input = '<p style="white-space: pre-wrap"><span>Hello</span>   <span>world</span></p>';
    const result = minifyHtml(input);
    expect(result.result).toBe(input);
  });

  it('keeps whitespace verbatim under white-space: break-spaces', () => {
    const input = '<p style="white-space: break-spaces"><span>Hello</span>  <span>world</span></p>';
    const result = minifyHtml(input);
    expect(result.result).toBe(input);
  });

  it('keeps a newline separating inline content under white-space: pre-line', () => {
    // Regression test: under `white-space: pre-line`, the source newline between the two spans
    // renders as a line break, so collapsing it to a plain space (the `normal` behavior) would
    // change "Hello" and "world" from two rendered lines into one.
    const input = '<p style="white-space: pre-line"><span>Hello</span>\n<span>world</span></p>';
    const result = minifyHtml(input);
    expect(result.ok).toBe(true);
    expect(result.result).toBe(input);
  });

  it('still collapses whitespace when white-space is a non-preserving value', () => {
    const input = '<p style="white-space: normal"><span>Hello</span>  <span>world</span></p>';
    const result = minifyHtml(input);
    expect(result.result).toBe(
      '<p style="white-space: normal"><span>Hello</span> <span>world</span></p>'
    );
  });

  it('still collapses whitespace when the style attribute has no white-space declaration', () => {
    const input = '<p style="color: red"><span>Hello</span>  <span>world</span></p>';
    const result = minifyHtml(input);
    expect(result.result).toBe('<p style="color: red"><span>Hello</span> <span>world</span></p>');
  });

  it('inherits a preserving white-space value into nested elements without their own style', () => {
    const input = '<div style="white-space: pre">'
      + '<p><span>Hello</span>  <span>world</span></p>'
      + '</div>';
    const result = minifyHtml(input);
    expect(result.result).toBe(input);
  });

  it('lets a nested element override an inherited preserving white-space value', () => {
    const input = '<div style="white-space: pre">'
      + '<p style="white-space: normal"><span>Hello</span>  <span>world</span></p>'
      + '</div>';
    const result = minifyHtml(input);
    expect(result.result).toBe(
      '<div style="white-space: pre">'
        + '<p style="white-space: normal"><span>Hello</span> <span>world</span></p>'
        + '</div>'
    );
  });

  it('honors the last white-space declaration when the attribute repeats the property', () => {
    const input = '<p style="white-space: pre; white-space: normal">'
      + '<span>Hello</span>  <span>world</span></p>';
    const result = minifyHtml(input);
    expect(result.result).toBe(
      '<p style="white-space: pre; white-space: normal">'
        + '<span>Hello</span> <span>world</span></p>'
    );
  });

  it('honors an earlier !important declaration over a later non-important override', () => {
    // CSS cascade: `!important` wins over a normal declaration regardless of source order, so
    // the earlier `pre !important` here beats the later plain `normal` and the two source
    // spaces between the spans must survive verbatim.
    const input = '<p style="white-space: pre !important; white-space: normal">'
      + '<span>Hello</span>  <span>world</span></p>';
    const result = minifyHtml(input);
    expect(result.result).toBe(input);
  });

  it('honors the last !important declaration over an earlier !important one', () => {
    const input = '<p style="white-space: pre !important; white-space: normal !important">'
      + '<span>Hello</span>  <span>world</span></p>';
    const result = minifyHtml(input);
    expect(result.result).toBe(
      '<p style="white-space: pre !important; white-space: normal !important">'
        + '<span>Hello</span> <span>world</span></p>'
    );
  });

  it('preserves whitespace-only text at a block-element boundary under white-space: pre', () => {
    // Even though <p> is block-level (normally a hard boundary for minification), a preserving
    // white-space value means this tool cannot safely assume the whitespace is invisible.
    const input = '<div style="white-space: pre">  <p>Hello</p>  </div>';
    const result = minifyHtml(input);
    expect(result.result).toBe(input);
  });

  it('treats white-space: pre matching case-insensitively', () => {
    const input = '<p style="WHITE-SPACE: PRE"><span>Hello</span>  <span>world</span></p>';
    const result = minifyHtml(input);
    expect(result.result).toBe(input);
  });
});

describe('format/minify round trips', () => {
  const source = [
    '<!DOCTYPE html>',
    '<html lang="en">',
    '<head>',
    '<meta charset="UTF-8">',
    '<title>Sample</title>',
    '<style>body{margin:0}</style>',
    '</head>',
    '<body>',
    '<!-- content -->',
    '<div class="a" data-note="x > y">',
    '<p>Hello <b>World</b>!</p>',
    '<img src="a.png" alt="A">',
    '<pre>  keep\n  me  </pre>',
    '</div>',
    '</body>',
    '</html>',
  ].join('\n');

  it('is idempotent: formatting already-formatted output changes nothing further', () => {
    const first = formatHtml(source, '2');
    const second = formatHtml(first.result, '2');
    expect(second.result).toBe(first.result);
  });

  it('is idempotent: minifying already-minified output changes nothing further', () => {
    const first = minifyHtml(source);
    const second = minifyHtml(first.result);
    expect(second.result).toBe(first.result);
  });

  it('minifying formatted output equals minifying the original source', () => {
    const formatted = formatHtml(source, '2');
    expect(minifyHtml(formatted.result).result).toBe(minifyHtml(source).result);
  });
});
