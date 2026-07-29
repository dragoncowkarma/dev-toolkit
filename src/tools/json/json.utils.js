/**
 * Calculates the line and column number from an absolute character position in a text.
 * @param {string} text - The input text.
 * @param {number} position - The 0-indexed character position.
 * @returns {{line: number, column: number}}
 * The line (1-indexed) and column (1-indexed) coordinates.
 */
function getLineColumn(text, position) {
  if (position < 0 || position > text.length) {
    return { line: 1, column: 1 };
  }
  const lines = text.substring(0, position).split('\n');
  const line = lines.length;
  const column = lines[lines.length - 1].length + 1;
  return { line, column };
}

/**
 * Generates a visual error snippet showcasing where the syntax error occurred.
 * @param {string} text - The full input text.
 * @param {number} position - The error position.
 * @param {number} line - The 1-indexed error line.
 * @param {number} column - The 1-indexed error column.
 * @returns {string} A formatted string highlighting the error line and position.
 */
function getErrorSnippet(text, position, line, column) {
  const lines = text.split('\n');
  const errorLineIdx = line - 1;
  if (errorLineIdx < 0 || errorLineIdx >= lines.length) {
    return '';
  }

  const startLine = Math.max(0, errorLineIdx - 2);
  const endLine = Math.min(lines.length - 1, errorLineIdx + 2);
  
  let snippet = '';
  for (let i = startLine; i <= endLine; i++) {
    const lineNum = i + 1;
    const isErrorLine = i === errorLineIdx;
    const prefix = `${isErrorLine ? '>' : ' '} ${lineNum.toString().padStart(4, ' ')} | `;
    snippet += `${prefix}${lines[i]}\n`;
    if (isErrorLine) {
      const padding = ' '.repeat(prefix.length + column - 1);
      snippet += `${padding}^\n`;
    }
  }
  return snippet;
}

/**
 * Validates a JSON string and provides detailed error coordinates and visualization on failure.
 * @param {string} text - The JSON text to validate.
 * @returns {{
 *   isValid: boolean,
 *   message: string,
 *   line?: number,
 *   column?: number,
 *   position?: number,
 *   snippet?: string
 * }} Validation results.
 */
export function validateJson(text) {
  if (!text || text.trim() === '') {
    return {
      isValid: false,
      message: 'JSON input is empty.',
      line: 1,
      column: 1,
      position: 0,
      snippet: '  1 | \n      ^'
    };
  }

  try {
    JSON.parse(text);
    return {
      isValid: true,
      message: 'Valid JSON string.',
      line: null,
      column: null,
      position: null,
      snippet: ''
    };
  } catch (error) {
    const message = error.message;
    let position = null;
    let line = null;
    let column = null;

    // 1. Check for modern standard/V8 error format: "at position 42"
    const posMatch = message.match(/position\s+(\d+)/i);
    if (posMatch) {
      position = parseInt(posMatch[1], 10);
      const loc = getLineColumn(text, position);
      line = loc.line;
      column = loc.column;
    } else {
      // 2. Check for alternative standard: "line 2 column 5"
      const lineColMatch = message.match(/line\s+(\d+)\s+column\s+(\d+)/i) || 
                           message.match(/line\s+(\d+),\s+column\s+(\d+)/i);
      if (lineColMatch) {
        line = parseInt(lineColMatch[1], 10);
        column = parseInt(lineColMatch[2], 10);
        
        // Convert line/column to position
        const lines = text.split('\n');
        let pos = 0;
        for (let i = 0; i < line - 1; i++) {
          pos += lines[i].length + 1; // +1 for newline character
        }
        pos += (column - 1);
        position = pos;
      }
    }

    // Fallback if no position coordinates could be parsed from error message
    if (position === null) {
      position = 0;
      line = 1;
      column = 1;
    }

    const snippet = getErrorSnippet(text, position, line, column);

    return {
      isValid: false,
      message,
      line,
      column,
      position,
      snippet
    };
  }
}

/**
 * Formats a valid JSON string with configurable indentation.
 * @param {string} text - The JSON text to format.
 * @param {string|number} indent - The indentation configuration ('2', '4', 'tab').
 * @returns {string} The formatted JSON string.
 */
export function formatJson(text, indent = '2') {
  const parsed = JSON.parse(text);
  let space = 2;
  if (indent === '4') {
    space = 4;
  } else if (indent === 'tab') {
    space = '\t';
  } else if (typeof indent === 'number') {
    space = indent;
  }
  return JSON.stringify(parsed, null, space);
}

/**
 * Minifies a valid JSON string.
 * @param {string} text - The JSON text to minify.
 * @returns {string} The minified JSON string.
 */
export function minifyJson(text) {
  const parsed = JSON.parse(text);
  return JSON.stringify(parsed);
}
