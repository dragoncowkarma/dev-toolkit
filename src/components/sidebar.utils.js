/**
 * Filters a list of tools by a free-text query, matching against each
 * tool's name, description, and category. Matching is case-insensitive
 * and ignores leading/trailing whitespace on the query.
 *
 * @param {Array<{name: string, description: string, category: string}>} tools Tools to filter.
 * @param {string} query Raw search query (may include surrounding whitespace).
 * @returns {Array<object>} Tools matching the query, preserving original order.
 *   When the query is empty or whitespace-only, the original array order is returned.
 */
export function filterTools(tools, query) {
  const normalizedQuery = (query ?? '').trim().toLowerCase();

  if (!normalizedQuery) {
    return tools;
  }

  return tools.filter((tool) => {
    return (
      tool.name.toLowerCase().includes(normalizedQuery) ||
      tool.description.toLowerCase().includes(normalizedQuery) ||
      tool.category.toLowerCase().includes(normalizedQuery)
    );
  });
}

/**
 * Sentinel value meaning "no category filter applied" (i.e. show every
 * tool). This is `null` rather than a display string so that a real
 * metadata category (e.g. one literally named "All") can never collide
 * with the reset control.
 */
export const ALL_CATEGORY = null;

/**
 * Canonical vocabulary for the `category` field of every `src/tools/<slug>/meta.js`.
 * Names are PascalCase, singular, English nouns; established acronyms (e.g. `JSON`)
 * keep their conventional all-caps spelling.
 *
 * This is a build/test-time contract on the catalog data, enforced by the tool
 * catalog contract tests — it is deliberately NOT a runtime allowlist.
 * `getToolCategories()` still derives the rendered controls from the tools it is
 * given, and `filterToolsByCategory()` still compares with exact `===`, so a
 * miscased category surfaces as a failing test rather than being silently
 * folded into a neighbouring button at runtime.
 *
 * Adding a category is a deliberate change to this constant, not something a new
 * tool may do implicitly by inventing a spelling.
 *
 * @type {ReadonlyArray<string>}
 */
export const TOOL_CATEGORIES = Object.freeze([
  'Calculator',
  'Comparison',
  'Converter',
  'Crypto',
  'CSS',
  'Decoder',
  'Encoder',
  'Formatter',
  'Generator',
  'Inspector',
  'JSON',
  'Reference',
  'Scheduler',
  'Tester',
  'Text',
  'Utility',
  'Web',
]);

/**
 * Derives the sorted list of distinct, non-empty tool categories present in
 * a tools array. Used to render category controls without maintaining a
 * hard-coded category list.
 *
 * @param {Array<{category: string}>} tools Tools to inspect.
 * @returns {Array<string>} Distinct category names, sorted alphabetically.
 */
export function getToolCategories(tools) {
  const categories = new Set();

  tools.forEach((tool) => {
    if (tool.category) {
      categories.add(tool.category);
    }
  });

  return Array.from(categories).sort((a, b) => a.localeCompare(b));
}

/**
 * Filters a list of tools down to those matching a selected category.
 * The `ALL_CATEGORY` sentinel (or any other falsy value) disables filtering.
 * Real category names are always non-empty strings, so this never
 * mistakes an actual category for the "no filter" sentinel.
 *
 * @param {Array<{category: string}>} tools Tools to filter.
 * @param {string|null} category Selected category, or `ALL_CATEGORY` for no filter.
 * @returns {Array<object>} Tools matching the category, preserving original order.
 */
export function filterToolsByCategory(tools, category) {
  if (!category) {
    return tools;
  }

  return tools.filter((tool) => tool.category === category);
}
