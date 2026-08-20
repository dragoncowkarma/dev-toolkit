function sourceLines(text) {
  return text === '' ? [] : text.split(/\r\n|\n|\r/);
}

function invalidJsonlError(line, content, error) {
  return {
    line,
    content,
    reason: error instanceof Error ? error.message : 'Invalid JSON value.',
  };
}

/**
 * Parses JSON Lines text while retaining valid records when other lines fail.
 *
 * Blank or whitespace-only lines are ignored, but remain included in totalLines.
 *
 * @param {string} text JSON Lines source text.
 * @returns {{values: unknown[], errors: Array<{line: number, content: string, reason: string}>,
 *   stats: object}}
 */
export function parseJsonl(text) {
  const lines = sourceLines(text);
  const values = [];
  const errors = [];
  let validLines = 0;

  lines.forEach((content, index) => {
    if (!content.trim()) return;

    try {
      values.push(JSON.parse(content));
      validLines += 1;
    } catch (error) {
      errors.push(invalidJsonlError(index + 1, content, error));
    }
  });

  return {
    values,
    errors,
    stats: {
      totalLines: lines.length,
      validLines,
      invalidLines: errors.length,
      parsedObjects: values.length,
    },
  };
}

/**
 * Converts JSON Lines text into a formatted JSON array while exposing line errors.
 *
 * @param {string} text JSON Lines source text.
 * @param {number} [indent=2] Number of spaces used for the array output.
 * @returns {{output: string, values: unknown[], errors: Array<object>, stats: object}}
 */
export function jsonlToJsonArray(text, indent = 2) {
  const result = parseJsonl(text);
  return {
    ...result,
    output: JSON.stringify(result.values, null, indent),
  };
}

/**
 * Converts a JSON array source string into compact, one-value-per-line JSONL.
 *
 * @param {string} text JSON array source text.
 * @returns {{output: string, values: unknown[], stats: object}}
 * @throws {Error} When the source is invalid JSON or is not an array.
 */
export function jsonArrayToJsonl(text) {
  const values = JSON.parse(text);
  if (!Array.isArray(values)) {
    throw new Error('JSON input must be an array to convert it to JSONL.');
  }

  return {
    values,
    output: values.map((value) => JSON.stringify(value)).join('\n'),
    stats: {
      totalLines: values.length,
      validLines: values.length,
      invalidLines: 0,
      parsedObjects: values.length,
    },
  };
}
