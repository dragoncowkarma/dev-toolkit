import { describe, expect, it } from 'vitest';
import {
  analyzeSelectorList,
  calculateSpecificity,
  compareSpecificity,
  sortSpecificity,
  splitSelectorList,
} from './cssSpecificity.utils.js';

describe('calculateSpecificity', () => {
  it('counts IDs, classes, attributes, pseudo-classes, types, and pseudo-elements', () => {
    const result = calculateSpecificity('main#app .card[data-state="active"]:hover::before');
    expect(result.error).toBeNull();
    expect(result.specificity).toEqual([1, 3, 2]);
    expect(result.cascade).toEqual([0, 1, 3, 2]);
    expect(result.tokens.map((item) => item.type)).toContain('Attribute');
  });

  it('uses the most specific argument for :is(), :not(), and :has()', () => {
    expect(calculateSpecificity('article:is(.featured, #hero)').specificity).toEqual([1, 0, 1]);
    expect(calculateSpecificity(':not(.quiet, #loud)').specificity).toEqual([1, 0, 0]);
    expect(calculateSpecificity('div:has(> .note, #notice)').specificity).toEqual([1, 0, 1]);
  });

  it('gives :where() zero specificity and handles nested functional selectors', () => {
    const result = calculateSpecificity(':where(#layout) article:is(:not(.a), #hero)');
    expect(result.error).toBeNull();
    expect(result.specificity).toEqual([1, 0, 1]);
  });

  it('adds the pseudo-class plus the most specific of-selector for nth-child', () => {
    expect(calculateSpecificity('li:nth-child(2n + 1 of .item, #selected)').specificity)
      .toEqual([1, 1, 1]);
    expect(calculateSpecificity('li:nth-last-child(odd)').specificity).toEqual([0, 1, 1]);
  });

  it('detects inline style and important declaration priority separately from specificity', () => {
    const inline = calculateSpecificity('style="color: rebeccapurple !important"');
    const rule = calculateSpecificity('.button { color: red !important; }');
    expect(inline.cascade).toEqual([1, 0, 0, 0]);
    expect(inline.important).toBe(true);
    expect(rule.specificity).toEqual([0, 1, 0]);
    expect(rule.important).toBe(true);
  });

  it('returns non-throwing errors for malformed selectors', () => {
    expect(calculateSpecificity('div[').error).toMatch(/closing bracket/);
    expect(calculateSpecificity(':is(.ok, )').error).toMatch(/Invalid selector list/);
    expect(calculateSpecificity(':where()').error).toMatch(/Invalid selector/);
    expect(calculateSpecificity('#').error).toMatch(/needs a name/);
  });

  it('counts a namespaced type selector once and ignores a universal local name', () => {
    expect(calculateSpecificity('svg|a.icon').specificity).toEqual([0, 1, 1]);
    expect(calculateSpecificity('svg|*').specificity).toEqual([0, 0, 0]);
  });
});

describe('selector list comparison', () => {
  it('keeps commas inside functional pseudo-classes together', () => {
    expect(splitSelectorList(':is(.one, .two), #app')).toEqual([':is(.one, .two)', '#app']);
  });

  it('supports comma-separated and multi-line selectors and sorts them by cascade priority', () => {
    const analyses = analyzeSelectorList('p, #app\n.card');
    expect(analyses.map((item) => item.specificity)).toEqual([[0, 0, 1], [1, 0, 0], [0, 1, 0]]);
    expect(sortSpecificity(analyses).map((item) => item.selector)).toEqual(['#app', '.card', 'p']);
    expect(sortSpecificity(analyses, 'ascending').map((item) => item.selector))
      .toEqual(['p', '.card', '#app']);
  });

  it('places important declarations above otherwise more specific normal declarations', () => {
    const important = calculateSpecificity('p { color: red !important; }');
    const normal = calculateSpecificity('#app .card');
    expect(compareSpecificity(important, normal)).toBeGreaterThan(0);
  });
});
