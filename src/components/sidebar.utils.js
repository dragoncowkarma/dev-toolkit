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
