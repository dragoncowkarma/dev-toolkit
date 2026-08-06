import { describe, expect, it } from 'vitest';
import {
  ALL_CATEGORY,
  filterTools,
  filterToolsByCategory,
  getToolCategories,
} from './sidebar.utils.js';

function buildTools() {
  return [
    {
      id: 'base64',
      name: 'Base64',
      description: 'Encode and decode Base64 strings without leaving your browser.',
      category: 'Encoder',
    },
    {
      id: 'json',
      name: 'JSON Formatter',
      description: 'Format, validate, and minify JSON with a clear structured view.',
      category: 'Formatter',
    },
    {
      id: 'uuid',
      name: 'UUID Generator',
      description: 'Generate and format random UUID v4 or time-ordered UUID v7 batches.',
      category: 'Generator',
    },
  ];
}

describe('filterTools', () => {
  it('matches by tool name', () => {
    const result = filterTools(buildTools(), 'Base64');
    expect(result.map((tool) => tool.id)).toEqual(['base64']);
  });

  it('matches by description', () => {
    const result = filterTools(buildTools(), 'minify');
    expect(result.map((tool) => tool.id)).toEqual(['json']);
  });

  it('matches by category', () => {
    const result = filterTools(buildTools(), 'Generator');
    expect(result.map((tool) => tool.id)).toEqual(['uuid']);
  });

  it('is case-insensitive', () => {
    const result = filterTools(buildTools(), 'bAsE64');
    expect(result.map((tool) => tool.id)).toEqual(['base64']);
  });

  it('ignores leading and trailing whitespace', () => {
    const result = filterTools(buildTools(), '  json  ');
    expect(result.map((tool) => tool.id)).toEqual(['json']);
  });

  it('returns the original order for an empty query', () => {
    const tools = buildTools();
    expect(filterTools(tools, '')).toEqual(tools);
  });

  it('returns the original order for a whitespace-only query', () => {
    const tools = buildTools();
    expect(filterTools(tools, '   ')).toEqual(tools);
  });

  it('returns an empty array when nothing matches', () => {
    const result = filterTools(buildTools(), 'nonexistent-tool-xyz');
    expect(result).toEqual([]);
  });
});

describe('getToolCategories', () => {
  it('derives the distinct, sorted set of categories from tool metadata', () => {
    expect(getToolCategories(buildTools())).toEqual(['Encoder', 'Formatter', 'Generator']);
  });

  it('does not duplicate a category shared by multiple tools', () => {
    const tools = [
      ...buildTools(),
      { id: 'url', name: 'URL Encoder', description: 'Encode URLs.', category: 'Encoder' },
    ];

    expect(getToolCategories(tools)).toEqual(['Encoder', 'Formatter', 'Generator']);
  });

  it('ignores tools without a category', () => {
    const tools = [...buildTools(), { id: 'misc', name: 'Misc', description: 'No category.' }];

    expect(getToolCategories(tools)).toEqual(['Encoder', 'Formatter', 'Generator']);
  });

  it('reflects a brand new category without any hard-coded list', () => {
    const tools = [
      ...buildTools(),
      { id: 'new-tool', name: 'New Tool', description: 'Something new.', category: 'Analyzer' },
    ];

    expect(getToolCategories(tools)).toEqual(['Analyzer', 'Encoder', 'Formatter', 'Generator']);
  });

  it('includes a real category literally named "All"', () => {
    const tools = [
      ...buildTools(),
      { id: 'grep', name: 'Grep', description: 'Search everything.', category: 'All' },
    ];

    expect(getToolCategories(tools)).toEqual(['All', 'Encoder', 'Formatter', 'Generator']);
  });
});

describe('filterToolsByCategory', () => {
  it('returns every tool when the category is the ALL_CATEGORY sentinel', () => {
    const tools = buildTools();
    expect(filterToolsByCategory(tools, ALL_CATEGORY)).toEqual(tools);
  });

  it('returns every tool when no category is provided', () => {
    const tools = buildTools();
    expect(filterToolsByCategory(tools, undefined)).toEqual(tools);
  });

  it('returns only tools matching the selected category', () => {
    const result = filterToolsByCategory(buildTools(), 'Formatter');
    expect(result.map((tool) => tool.id)).toEqual(['json']);
  });

  it('returns an empty array when no tool matches the selected category', () => {
    const result = filterToolsByCategory(buildTools(), 'Nonexistent');
    expect(result).toEqual([]);
  });

  it('filters to a real category literally named "All" instead of disabling the filter', () => {
    const tools = [
      ...buildTools(),
      { id: 'grep', name: 'Grep', description: 'Search everything.', category: 'All' },
    ];

    const result = filterToolsByCategory(tools, 'All');
    expect(result.map((tool) => tool.id)).toEqual(['grep']);
  });
});
