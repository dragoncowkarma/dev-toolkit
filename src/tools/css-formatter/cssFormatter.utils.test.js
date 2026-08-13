import { describe, expect, it } from 'vitest';
import { formatCss, minifyCss } from './cssFormatter.utils.js';

describe('formatCss', () => {
  it('returns an empty, non-error result for empty input', () => {
    expect(formatCss('')).toEqual({ output: '', warning: null });
    expect(formatCss('   \n\t ')).toEqual({ output: '', warning: null });
  });

  it('formats a simple rule with 2-space indentation by default', () => {
    const result = formatCss('.a{color:red;font-size:12px}');
    expect(result.warning).toBeNull();
    expect(result.output).toBe('.a {\n  color: red;\n  font-size: 12px;\n}');
  });

  it('formats with 4-space indentation when requested', () => {
    const result = formatCss('.a{color:red}', { indentSize: 4 });
    expect(result.output).toBe('.a {\n    color: red;\n}');
  });

  it('formats nested @media blocks with growing indentation', () => {
    const css = '@media (max-width:600px){.a{padding:1px}}';
    const result = formatCss(css);
    expect(result.output).toBe(
      '@media (max-width: 600px) {\n  .a {\n    padding: 1px;\n  }\n}',
    );
  });

  it('splits comma-separated selector lists onto their own lines', () => {
    const result = formatCss('.a, .b, .c { color: red; }');
    expect(result.output).toBe('.a,\n.b,\n.c {\n  color: red;\n}');
  });

  it('does not split commas nested inside a selector function', () => {
    const result = formatCss('.a:not(.b, .c) { color: red; }');
    expect(result.output).toBe('.a:not(.b, .c) {\n  color: red;\n}');
  });

  it('preserves quoted strings verbatim, including internal spacing', () => {
    const result = formatCss('.a { content: "  a   b  "; }');
    expect(result.output).toBe('.a {\n  content: "  a   b  ";\n}');
  });

  it('preserves data: URLs untouched, including their internal semicolons', () => {
    const css = '.a { background: url("data:image/png;base64,AAAA=="); }';
    const result = formatCss(css);
    expect(result.output).toBe(
      '.a {\n  background: url("data:image/png;base64,AAAA==");\n}',
    );
  });

  it('preserves calc() expressions and custom properties without corrupting them', () => {
    const css = '.a { width: calc(var(--gap) * 2 - 1px); }';
    const result = formatCss(css);
    expect(result.output).toBe(
      '.a {\n  width: calc(var(--gap) * 2 - 1px);\n}',
    );
  });

  it('treats an escaped ")" inside an unquoted url() as part of the URL value', () => {
    const css = '.a { background: url(foo\\)bar); }';
    const result = formatCss(css);
    expect(result.warning).toBeNull();
    expect(result.output).toBe(
      '.a {\n  background: url(foo\\)bar);\n}',
    );
  });

  it('places a standalone comment on its own line', () => {
    const css = '/* header */\n.a { color: red; }';
    const result = formatCss(css);
    expect(result.output).toBe('/* header */\n.a {\n  color: red;\n}');
  });

  it('keeps an inline comment attached to the declaration it annotates', () => {
    const css = '.a { color: red /* note */; }';
    const result = formatCss(css);
    expect(result.output).toBe('.a {\n  color: red /* note */;\n}');
  });

  it('normalizes !important spacing', () => {
    const result = formatCss('.a{color:red   !important;}');
    expect(result.output).toBe('.a {\n  color: red !important;\n}');
  });

  it('formats an at-rule statement without a block', () => {
    const result = formatCss('@charset "UTF-8"; .a { color: red; }');
    expect(result.output).toBe('@charset "UTF-8";\n.a {\n  color: red;\n}');
  });

  it('adds a missing trailing semicolon on the last declaration in a block', () => {
    const result = formatCss('.a { color: red; font-size: 12px }');
    expect(result.output).toBe('.a {\n  color: red;\n  font-size: 12px;\n}');
  });

  it('falls back to the original input with a warning for unbalanced braces', () => {
    const result = formatCss('.a { color: red;');
    expect(result.output).toBe('.a { color: red;');
    expect(result.warning).toMatch(/malformed|unbalanced/i);
  });

  it('falls back to the original input with a warning for a stray closing brace', () => {
    const result = formatCss('.a { color: red; } }');
    expect(result.output).toBe('.a { color: red; } }');
    expect(result.warning).toMatch(/malformed|unbalanced/i);
  });

  it('falls back to the original input with a warning for a stray closing parenthesis', () => {
    const result = formatCss('.a { color: rgb(1, 2, 3)); }');
    expect(result.output).toBe('.a { color: rgb(1, 2, 3)); }');
    expect(result.warning).toMatch(/malformed|unbalanced/i);
  });

  it('preserves a balanced brace block inside a custom property value', () => {
    const css = '.a { --theme: { color: red; }; color: blue; }';
    const result = formatCss(css);
    expect(result.warning).toBeNull();
    expect(result.output).toBe(
      '.a {\n  --theme: { color: red; };\n  color: blue;\n}',
    );
  });

  it('falls back to the original input with a warning for an unterminated comment', () => {
    const result = formatCss('/* unterminated');
    expect(result.output).toBe('/* unterminated');
    expect(result.warning).toMatch(/malformed|unbalanced/i);
  });

  it('falls back with a warning for a rule followed by an unterminated comment', () => {
    const result = formatCss('.a{} /* unterminated');
    expect(result.output).toBe('.a{} /* unterminated');
    expect(result.warning).toMatch(/malformed|unbalanced/i);
  });

  it('falls back to the original input with a warning for a string left open by a newline', () => {
    // An unescaped newline before the closing quote makes this an
    // unterminated string, not a normally-closed one - it must not be
    // silently "closed" at the newline and rendered as if it were valid.
    const css = '.a { content: "unterminated\n; color: red; }';
    const result = formatCss(css);
    expect(result.output).toBe(css);
    expect(result.warning).toMatch(/malformed|unbalanced/i);
  });

  it('falls back to the original input with a warning for a string left open by a CR', () => {
    // CSS input preprocessing treats a bare CR exactly like an LF, so an
    // unescaped CR before the closing quote must also be a bad string.
    const css = '.a { content: "unterminated\r; color: red; }';
    const result = formatCss(css);
    expect(result.output).toBe(css);
    expect(result.warning).toMatch(/malformed|unbalanced/i);
  });

  it('falls back to the original input with a warning for a string left open by a CRLF', () => {
    const css = '.a { content: "unterminated\r\n; color: red; }';
    const result = formatCss(css);
    expect(result.output).toBe(css);
    expect(result.warning).toMatch(/malformed|unbalanced/i);
  });

  it('falls back with a warning for a string left open by a form feed', () => {
    const css = '.a { content: "unterminated\f; color: red; }';
    const result = formatCss(css);
    expect(result.output).toBe(css);
    expect(result.warning).toMatch(/malformed|unbalanced/i);
  });

  it('treats an escaped CRLF line continuation inside a string as valid, not unterminated', () => {
    // A backslash immediately followed by a newline is a valid in-string
    // line continuation, regardless of which CSS newline form (LF, CR,
    // FF, or CRLF) it uses - it must not trip "bad string" detection. CSS
    // input preprocessing normalizes CR/FF/CRLF to LF before tokenization,
    // so the preserved string content comes back with a plain LF.
    const css = '.a { content: "line\\\r\nbreak"; }';
    const result = formatCss(css);
    expect(result.warning).toBeNull();
    expect(result.output).toBe('.a {\n  content: "line\\\nbreak";\n}');
  });

  it('treats an escaped lone CR line continuation inside a string as valid', () => {
    const css = '.a { content: "line\\\rbreak"; }';
    const result = formatCss(css);
    expect(result.warning).toBeNull();
    expect(result.output).toBe('.a {\n  content: "line\\\nbreak";\n}');
  });

  it('treats an escaped form feed line continuation inside a string as valid', () => {
    const css = '.a { content: "line\\\fbreak"; }';
    const result = formatCss(css);
    expect(result.warning).toBeNull();
    expect(result.output).toBe('.a {\n  content: "line\\\nbreak";\n}');
  });

  it('does not corrupt a functional pseudo-class colon inside an @supports condition', () => {
    // `selector(:hover)` is a functional selector() condition, not a media
    // feature - the `:hover` colon must survive untouched, not become
    // `: hover` as though it were `(min-width: 600px)`.
    const css = '@supports selector(:hover) { .a { color: red; } }';
    const result = formatCss(css);
    expect(result.warning).toBeNull();
    expect(result.output).toBe(
      '@supports selector(:hover) {\n  .a {\n    color: red;\n  }\n}',
    );
  });

  it('does not corrupt a nested pseudo-class colon such as :not(:hover)', () => {
    const result = formatCss('.a:not(:hover) { color: red; }');
    expect(result.output).toBe('.a:not(:hover) {\n  color: red;\n}');
  });

  it('still spaces a real media feature colon alongside an unrelated selector colon', () => {
    const css = '@supports (selector(:hover)) and (display: grid) { .a { color: red; } }';
    const result = formatCss(css);
    expect(result.output).toBe(
      '@supports (selector(:hover)) and (display: grid) {\n  .a {\n    color: red;\n  }\n}',
    );
  });

  it('does not corrupt a pseudo-class colon on a compound selector inside :is()', () => {
    // `:is(div:hover)` takes a selector list, not a media feature - the `:hover`
    // colon is directly preceded by the identifier `div`, the same shape as a
    // real feature colon like `(min-width: 600px)`, so the check has to key off
    // whether the paren itself is a bare feature group, not just the character
    // before the colon.
    const result = formatCss(':is(div:hover) { color: red; }');
    expect(result.output).toBe(':is(div:hover) {\n  color: red;\n}');
  });

  it('never throws for non-string input and reports it as empty', () => {
    expect(() => formatCss(undefined)).not.toThrow();
    expect(formatCss(null)).toEqual({ output: '', warning: null });
  });
});

describe('minifyCss', () => {
  it('returns an empty, non-error result for empty input', () => {
    expect(minifyCss('')).toEqual({ output: '', warning: null });
  });

  it('removes whitespace and redundant separators from a simple rule', () => {
    const result = minifyCss('.a {\n  color: red;\n  font-size: 12px;\n}');
    expect(result.output).toBe('.a{color:red;font-size:12px}');
  });

  it('drops the trailing semicolon before a closing brace', () => {
    const result = minifyCss('.a { color: red; }');
    expect(result.output).toBe('.a{color:red}');
  });

  it('strips regular comments entirely', () => {
    const result = minifyCss('.a { color: red; /* drop me */ }');
    expect(result.output).toBe('.a{color:red}');
  });

  it('does not turn a comment between selector tokens into a descendant combinator', () => {
    // `.item/* note */:hover` targets a hovered `.item` itself. Stripping the
    // comment must not introduce a space, which would instead select a
    // hovered descendant of `.item` - a different selector entirely.
    const result = minifyCss('.item/* note */:hover { color: red; }');
    expect(result.output).toBe('.item:hover{color:red}');
  });

  it('keeps a token boundary when a comment sits directly between two identifiers', () => {
    // Deleting the comment outright here would fuse "red" and "blue" into a
    // single token ("redblue"), so a single space must be reintroduced.
    const result = minifyCss('.a { color: red/* c */blue; }');
    expect(result.output).toBe('.a{color:red blue}');
  });

  it('keeps a token boundary across a run of consecutive removable comments', () => {
    // Two back-to-back comments between "red" and "blue" have no directly
    // adjacent real character on either side (each one's neighbor is the
    // other comment's placeholder), so the boundary check must look past
    // the whole run rather than only the immediately adjacent character.
    const result = minifyCss('.a { color: red/* one *//* two */blue; }');
    expect(result.output).toBe('.a{color:red blue}');
  });

  it('keeps a token boundary across three consecutive removable comments', () => {
    const result = minifyCss('.a { color: red/* a *//* b *//* c */blue; }');
    expect(result.output).toBe('.a{color:red blue}');
  });

  it('does not introduce a boundary space when a comment run sits at a real boundary', () => {
    // Here the comments sit between "red" and a space that already
    // separates it from "!important" - no space should be manufactured.
    const result = minifyCss('.a { color: red/* one *//* two */ !important; }');
    expect(result.output).toBe('.a{color:red!important}');
  });

  it('preserves "important" /*! ... */ comments', () => {
    const result = minifyCss('/*! keep me */\n.a { color: red; }');
    expect(result.output).toBe('/*! keep me */.a{color:red}');
  });

  it('preserves quoted strings verbatim, including internal spacing', () => {
    const result = minifyCss('.a { content: "  a   b  "; }');
    expect(result.output).toBe('.a{content:"  a   b  "}');
  });

  it('preserves data: URLs untouched, including their internal semicolons', () => {
    const css = '.a { background: url("data:image/png;base64,AAAA=="); }';
    const result = minifyCss(css);
    expect(result.output).toBe('.a{background:url("data:image/png;base64,AAAA==")}');
  });

  it('preserves calc() expressions, including required operator spacing', () => {
    const css = '.a { width: calc(100% - 10px); }';
    const result = minifyCss(css);
    expect(result.output).toBe('.a{width:calc(100% - 10px)}');
  });

  it('treats an escaped ")" inside an unquoted url() as part of the URL value', () => {
    const css = '.a { background: url(foo\\)bar); }';
    const result = minifyCss(css);
    expect(result.warning).toBeNull();
    expect(result.output).toBe('.a{background:url(foo\\)bar)}');
  });

  it('preserves the descendant-combinator space between a compound and a pseudo-class', () => {
    // `div :hover` (descendant of any :hover) and `div:hover` are different
    // selectors - minification must never delete this token boundary.
    const result = minifyCss('div :hover { color: blue; }');
    expect(result.output).toBe('div :hover{color:blue}');
  });

  it('tightens spacing inside media feature parentheses', () => {
    const result = minifyCss('@media ( max-width: 600px ) { .a { color: red; } }');
    expect(result.output).toBe('@media (max-width:600px){.a{color:red}}');
  });

  it('does not corrupt a functional pseudo-class colon inside an @supports condition', () => {
    const css = '@supports selector(:hover) { .a { color: red; } }';
    const result = minifyCss(css);
    expect(result.output).toBe('@supports selector(:hover){.a{color:red}}');
  });

  it('does not corrupt a pseudo-class colon on a compound selector inside :is()', () => {
    const result = minifyCss(':is(div:hover) { color: red; }');
    expect(result.output).toBe(':is(div:hover){color:red}');
  });

  it('removes spacing around !important', () => {
    const result = minifyCss('.a { color: red   !important; }');
    expect(result.output).toBe('.a{color:red!important}');
  });

  it('compacts comma-separated selector lists without a space', () => {
    const result = minifyCss('.a, .b, .c { color: red; }');
    expect(result.output).toBe('.a,.b,.c{color:red}');
  });

  it('falls back to the original input with a warning for unbalanced braces', () => {
    const result = minifyCss('.a { color: red');
    expect(result.output).toBe('.a { color: red');
    expect(result.warning).toMatch(/malformed|unbalanced/i);
  });

  it('falls back to the original input with a warning for a stray closing parenthesis', () => {
    const result = minifyCss('.a { color: rgb(1, 2, 3)); }');
    expect(result.output).toBe('.a { color: rgb(1, 2, 3)); }');
    expect(result.warning).toMatch(/malformed|unbalanced/i);
  });

  it('preserves a balanced brace block inside a custom property value', () => {
    // The `{ color: red; }` block is opaque value content for the `--theme`
    // custom property, not a nested rule - it must survive intact and the
    // following `color: blue` declaration must stay a sibling declaration.
    const css = '.a { --theme: { color: red; }; color: blue; }';
    const result = minifyCss(css);
    expect(result.warning).toBeNull();
    expect(result.output).toBe('.a{--theme:{ color: red; };color:blue}');
  });

  it('falls back to the original input with a warning for an unterminated comment', () => {
    const result = minifyCss('/* unterminated');
    expect(result.output).toBe('/* unterminated');
    expect(result.warning).toMatch(/malformed|unbalanced/i);
  });

  it('falls back with a warning for a rule followed by an unterminated comment', () => {
    const result = minifyCss('.a{} /* unterminated');
    expect(result.output).toBe('.a{} /* unterminated');
    expect(result.warning).toMatch(/malformed|unbalanced/i);
  });

  it('falls back to the original input with a warning for a string left open by a newline', () => {
    const css = '.a { content: "unterminated\n; color: red; }';
    const result = minifyCss(css);
    expect(result.output).toBe(css);
    expect(result.warning).toMatch(/malformed|unbalanced/i);
  });

  it('falls back to the original input with a warning for a string left open by a CR', () => {
    const css = '.a { content: "unterminated\r; color: red; }';
    const result = minifyCss(css);
    expect(result.output).toBe(css);
    expect(result.warning).toMatch(/malformed|unbalanced/i);
  });

  it('falls back to the original input with a warning for a string left open by a CRLF', () => {
    const css = '.a { content: "unterminated\r\n; color: red; }';
    const result = minifyCss(css);
    expect(result.output).toBe(css);
    expect(result.warning).toMatch(/malformed|unbalanced/i);
  });

  it('falls back with a warning for a string left open by a form feed', () => {
    const css = '.a { content: "unterminated\f; color: red; }';
    const result = minifyCss(css);
    expect(result.output).toBe(css);
    expect(result.warning).toMatch(/malformed|unbalanced/i);
  });

  it('treats an escaped CRLF line continuation inside a string as valid, not unterminated', () => {
    const css = '.a { content: "line\\\r\nbreak"; }';
    const result = minifyCss(css);
    expect(result.warning).toBeNull();
    expect(result.output).toBe('.a{content:"line\\\nbreak"}');
  });

  it('treats an escaped lone CR line continuation inside a string as valid', () => {
    const css = '.a { content: "line\\\rbreak"; }';
    const result = minifyCss(css);
    expect(result.warning).toBeNull();
    expect(result.output).toBe('.a{content:"line\\\nbreak"}');
  });

  it('treats an escaped form feed line continuation inside a string as valid', () => {
    const css = '.a { content: "line\\\fbreak"; }';
    const result = minifyCss(css);
    expect(result.warning).toBeNull();
    expect(result.output).toBe('.a{content:"line\\\nbreak"}');
  });

  it('never throws for non-string input and reports it as empty', () => {
    expect(() => minifyCss(42)).not.toThrow();
    expect(minifyCss(undefined)).toEqual({ output: '', warning: null });
  });
});
