/**
 * Utility functions for XML parsing, formatting, minification, and validation.
 * Built with zero external dependencies (no DOMParser/XMLSerializer).
 */

function getLineCol(input, index) {
  let line = 1;
  let column = 1;
  for (let i = 0; i < index && i < input.length; i++) {
    if (input[i] === '\n') {
      line++;
      column = 1;
    } else {
      column++;
    }
  }
  return { line, column };
}

function makeSnippet(input, line, column) {
  if (!input) return '';
  const lines = input.split('\n');
  const lineText = lines[line - 1] || '';
  const pointer = ' '.repeat(Math.max(0, column - 1)) + '^';
  return `${lineText}\n${pointer}`;
}

function isWhitespace(ch) {
  return ch === ' ' || ch === '\t' || ch === '\r' || ch === '\n';
}

function isNameStartChar(ch) {
  if (!ch) return false;
  return /[a-zA-Z_:]/.test(ch) || ch.charCodeAt(0) > 127;
}

function isNameChar(ch) {
  if (!ch) return false;
  return /[a-zA-Z0-9_\-.:]/.test(ch) || ch.charCodeAt(0) > 127;
}

export function parseXml(input) {
  if (input === undefined || input === null || input.trim() === '') {
    return {
      nodes: [],
      error: {
        message: 'XML document is empty',
        line: 1,
        column: 1,
        snippet: '',
      },
    };
  }

  const nodes = [];
  const tagStack = [];
  let pos = 0;
  const len = input.length;
  let rootElementCount = 0;

  while (pos < len) {
    if (input[pos] === '<') {
      const markPos = pos;
      const { line, column } = getLineCol(input, pos);

      // Processing Instruction: <?
      if (input.startsWith('<?', pos)) {
        const end = input.indexOf('?>', pos + 2);
        if (end === -1) {
          const snippet = makeSnippet(input, line, column);
          return {
            nodes: [],
            error: {
              message: `Unclosed processing instruction '<?' at line ${line}, column ${column}`,
              line,
              column,
              snippet,
            },
          };
        }
        const value = input.slice(pos + 2, end);
        const node = { type: 'pi', value };
        if (tagStack.length === 0) {
          nodes.push(node);
        } else {
          tagStack[tagStack.length - 1].children.push(node);
        }
        pos = end + 2;
        continue;
      }

      // Comment: <!--
      if (input.startsWith('<!--', pos)) {
        const end = input.indexOf('-->', pos + 4);
        if (end === -1) {
          const snippet = makeSnippet(input, line, column);
          return {
            nodes: [],
            error: {
              message: `Unclosed comment '<!--' at line ${line}, column ${column}`,
              line,
              column,
              snippet,
            },
          };
        }
        const value = input.slice(pos + 4, end);
        const node = { type: 'comment', value };
        if (tagStack.length === 0) {
          nodes.push(node);
        } else {
          tagStack[tagStack.length - 1].children.push(node);
        }
        pos = end + 3;
        continue;
      }

      // CDATA: <![CDATA[
      if (input.startsWith('<![CDATA[', pos)) {
        if (tagStack.length === 0) {
          const snippet = makeSnippet(input, line, column);
          return {
            nodes: [],
            error: {
              message: `CDATA section found outside root element at line ${line}, column ${column}`,
              line,
              column,
              snippet,
            },
          };
        }
        const end = input.indexOf(']]>', pos + 9);
        if (end === -1) {
          const snippet = makeSnippet(input, line, column);
          return {
            nodes: [],
            error: {
              message: `Unclosed CDATA section at line ${line}, column ${column}`,
              line,
              column,
              snippet,
            },
          };
        }
        const value = input.slice(pos + 9, end);
        const node = { type: 'cdata', value };
        tagStack[tagStack.length - 1].children.push(node);
        pos = end + 3;
        continue;
      }

      // DOCTYPE: <!DOCTYPE
      if (input.slice(pos, pos + 9).toUpperCase() === '<!DOCTYPE') {
        let inSquare = false;
        let endPos = -1;
        let i = pos + 9;

        while (i < len) {
          const c = input[i];
          if (c === '[') inSquare = true;
          else if (c === ']') inSquare = false;
          else if (c === '>' && !inSquare) {
            endPos = i;
            break;
          }
          i++;
        }

        if (endPos === -1) {
          const snippet = makeSnippet(input, line, column);
          return {
            nodes: [],
            error: {
              message: `Unclosed DOCTYPE declaration at line ${line}, column ${column}`,
              line,
              column,
              snippet,
            },
          };
        }
        const value = input.slice(pos + 9, endPos);
        const node = { type: 'doctype', value };
        if (tagStack.length === 0) {
          nodes.push(node);
        } else {
          tagStack[tagStack.length - 1].children.push(node);
        }
        pos = endPos + 1;
        continue;
      }

      // Closing Tag: </
      if (input.startsWith('</', pos)) {
        pos += 2;
        while (pos < len && isWhitespace(input[pos])) pos++;

        const nameStart = pos;
        while (pos < len && isNameChar(input[pos])) pos++;
        const closeName = input.slice(nameStart, pos);

        if (!closeName || !isNameStartChar(closeName[0])) {
          const snippet = makeSnippet(input, line, column);
          return {
            nodes: [],
            error: {
              message: `Invalid closing tag name at line ${line}, column ${column}`,
              line,
              column,
              snippet,
            },
          };
        }

        while (pos < len && isWhitespace(input[pos])) pos++;

        if (pos >= len || input[pos] !== '>') {
          const closeLc = getLineCol(input, pos);
          const snippet = makeSnippet(input, closeLc.line, closeLc.column);
          return {
            nodes: [],
            error: {
              message: `Unclosed closing tag '</${closeName}' at line ` +
                `${closeLc.line}, column ${closeLc.column}`,
              line: closeLc.line,
              column: closeLc.column,
              snippet,
            },
          };
        }

        pos++; // skip '>'

        if (tagStack.length === 0) {
          const snippet = makeSnippet(input, line, column);
          return {
            nodes: [],
            error: {
              message: `Unexpected closing tag '</${closeName}>' without matching ` +
                `opening tag at line ${line}, column ${column}`,
              line,
              column,
              snippet,
            },
          };
        }

        const topTag = tagStack[tagStack.length - 1];
        if (topTag.name !== closeName) {
          const snippet = makeSnippet(input, line, column);
          return {
            nodes: [],
            error: {
              message: `Mismatched closing tag '</${closeName}>', expected ` +
                `'</${topTag.name}>' at line ${line}, column ${column}`,
              line,
              column,
              snippet,
            },
          };
        }

        tagStack.pop();
        continue;
      }

      // Opening or Self-Closing Tag: <
      pos++; // skip '<'
      if (pos >= len || !isNameStartChar(input[pos])) {
        const snippet = makeSnippet(input, line, column);
        return {
          nodes: [],
          error: {
            message: `Invalid tag name at line ${line}, column ${column}`,
            line,
            column,
            snippet,
          },
        };
      }

      const nameStart = pos;
      while (pos < len && isNameChar(input[pos])) pos++;
      const tagName = input.slice(nameStart, pos);

      const attributes = [];
      const seenAttrNames = new Set();
      let parseError = null;

      while (pos < len) {
        while (pos < len && isWhitespace(input[pos])) pos++;

        if (pos >= len) break;
        if (input[pos] === '>' || input.startsWith('/>', pos)) break;

        const attrLc = getLineCol(input, pos);

        if (!isNameStartChar(input[pos])) {
          const snippet = makeSnippet(input, attrLc.line, attrLc.column);
          parseError = {
            message: `Invalid attribute name in tag '<${tagName}>' at line ` +
              `${attrLc.line}, column ${attrLc.column}`,
            line: attrLc.line,
            column: attrLc.column,
            snippet,
          };
          break;
        }

        const aStart = pos;
        while (pos < len && isNameChar(input[pos])) pos++;
        const attrName = input.slice(aStart, pos);

        if (seenAttrNames.has(attrName)) {
          const snippet = makeSnippet(input, attrLc.line, attrLc.column);
          parseError = {
            message: `Duplicate attribute '${attrName}' in tag '<${tagName}>' at line ` +
              `${attrLc.line}, column ${attrLc.column}`,
            line: attrLc.line,
            column: attrLc.column,
            snippet,
          };
          break;
        }
        seenAttrNames.add(attrName);

        while (pos < len && isWhitespace(input[pos])) pos++;

        if (pos >= len || input[pos] !== '=') {
          const snippet = makeSnippet(input, attrLc.line, attrLc.column);
          parseError = {
            message: `Attribute '${attrName}' in tag '<${tagName}>' must have a quoted ` +
              `value at line ${attrLc.line}, column ${attrLc.column}`,
            line: attrLc.line,
            column: attrLc.column,
            snippet,
          };
          break;
        }

        pos++; // skip '='
        while (pos < len && isWhitespace(input[pos])) pos++;

        if (pos >= len) {
          const snippet = makeSnippet(input, attrLc.line, attrLc.column);
          parseError = {
            message: `Unclosed attribute value for '${attrName}' in tag '<${tagName}>' ` +
              `at line ${attrLc.line}, column ${attrLc.column}`,
            line: attrLc.line,
            column: attrLc.column,
            snippet,
          };
          break;
        }

        const quote = input[pos];
        if (quote !== '"' && quote !== "'") {
          const snippet = makeSnippet(input, attrLc.line, attrLc.column);
          parseError = {
            message: `Attribute '${attrName}' in tag '<${tagName}>' must have a quoted ` +
              `value at line ${attrLc.line}, column ${attrLc.column}`,
            line: attrLc.line,
            column: attrLc.column,
            snippet,
          };
          break;
        }

        pos++; // skip opening quote
        const valStart = pos;
        const closingQuotePos = input.indexOf(quote, pos);

        if (closingQuotePos === -1) {
          const qLc = getLineCol(input, pos);
          const snippet = makeSnippet(input, qLc.line, qLc.column);
          parseError = {
            message: `Unclosed attribute value for '${attrName}' in tag '<${tagName}>' ` +
              `at line ${qLc.line}, column ${qLc.column}`,
            line: qLc.line,
            column: qLc.column,
            snippet,
          };
          break;
        }

        const attrVal = input.slice(valStart, closingQuotePos);
        pos = closingQuotePos + 1;

        attributes.push({ name: attrName, value: attrVal, quote });
      }

      if (parseError) {
        return { nodes: [], error: parseError };
      }

      while (pos < len && isWhitespace(input[pos])) pos++;

      if (pos >= len) {
        const snippet = makeSnippet(input, line, column);
        return {
          nodes: [],
          error: {
            message: `Unclosed tag '<${tagName}' at line ${line}, column ${column}`,
            line,
            column,
            snippet,
          },
        };
      }

      const isSelfClosing = input.startsWith('/>', pos);
      if (isSelfClosing) {
        pos += 2;
      } else if (input[pos] === '>') {
        pos++;
      } else {
        const snippet = makeSnippet(input, line, column);
        return {
          nodes: [],
          error: {
            message: `Unclosed tag '<${tagName}' at line ${line}, column ${column}`,
            line,
            column,
            snippet,
          },
        };
      }

      const elementNode = {
        type: 'element',
        name: tagName,
        attributes,
        selfClosing: isSelfClosing,
        children: [],
        line,
        column,
        startPos: markPos,
      };

      if (tagStack.length === 0) {
        rootElementCount++;
        if (rootElementCount > 1) {
          const snippet = makeSnippet(input, line, column);
          return {
            nodes: [],
            error: {
              message: `Multiple root elements found: '<${tagName}>' at line ` +
                `${line}, column ${column}`,
              line,
              column,
              snippet,
            },
          };
        }
        nodes.push(elementNode);
      } else {
        tagStack[tagStack.length - 1].children.push(elementNode);
      }

      if (!isSelfClosing) {
        tagStack.push(elementNode);
      }
      continue;
    }

    // Text Content
    const nextAngle = input.indexOf('<', pos);
    const textEnd = nextAngle === -1 ? len : nextAngle;
    const textVal = input.slice(pos, textEnd);
    pos = textEnd;

    if (textVal.length > 0) {
      if (tagStack.length === 0) {
        if (textVal.trim().length > 0) {
          const textLc = getLineCol(input, pos - textVal.length);
          const snippet = makeSnippet(input, textLc.line, textLc.column);
          return {
            nodes: [],
            error: {
              message: `Text content found outside root element at line ` +
                `${textLc.line}, column ${textLc.column}`,
              line: textLc.line,
              column: textLc.column,
              snippet,
            },
          };
        }
      } else {
        tagStack[tagStack.length - 1].children.push({
          type: 'text',
          value: textVal,
        });
      }
    }
  }

  // EOF Checks
  if (tagStack.length > 0) {
    const unclosed = tagStack[tagStack.length - 1];
    const snippet = makeSnippet(input, unclosed.line, unclosed.column);
    return {
      nodes: [],
      error: {
        message: `Unclosed tag '<${unclosed.name}>' at line ${unclosed.line}, ` +
          `column ${unclosed.column}`,
        line: unclosed.line,
        column: unclosed.column,
        snippet,
      },
    };
  }

  if (rootElementCount === 0) {
    return {
      nodes: [],
      error: {
        message: 'Root element is missing at line 1, column 1',
        line: 1,
        column: 1,
        snippet: makeSnippet(input, 1, 1),
      },
    };
  }

  return { nodes, error: null };
}

export function validateXml(input) {
  const { error } = parseXml(input);
  if (error) {
    return { valid: false, error };
  }
  return { valid: true, error: null };
}

function hasMixedContent(children) {
  const hasElement = children.some((c) => c.type === 'element');
  const hasNonEmptyText = children.some(
    (c) => c.type === 'text' && c.value.trim() !== ''
  );
  return hasElement && hasNonEmptyText;
}

function serializeInlineChildren(children) {
  let result = '';
  for (const child of children) {
    if (child.type === 'text') {
      result += child.value;
    } else if (child.type === 'cdata') {
      result += `<![CDATA[${child.value}]]>`;
    } else if (child.type === 'comment') {
      result += `<!--${child.value}-->`;
    } else if (child.type === 'pi') {
      result += `<?${child.value}?>`;
    } else if (child.type === 'element') {
      const attrStr = child.attributes
        .map((a) => `${a.name}=${a.quote}${a.value}${a.quote}`)
        .join(' ');
      if (child.selfClosing) {
        result += attrStr ? `<${child.name} ${attrStr}/>` : `<${child.name}/>`;
      } else {
        const open = attrStr ? `<${child.name} ${attrStr}>` : `<${child.name}>`;
        result += `${open}${serializeInlineChildren(child.children)}</${child.name}>`;
      }
    }
  }
  return result;
}

function formatNode(node, indentStr, level) {
  const indent = indentStr.repeat(level);
  if (node.type === 'pi') {
    return `${indent}<?${node.value}?>\n`;
  }
  if (node.type === 'doctype') {
    return `${indent}<!DOCTYPE${node.value}>\n`;
  }
  if (node.type === 'comment') {
    return `${indent}<!--${node.value}-->\n`;
  }
  if (node.type === 'cdata') {
    return `${indent}<![CDATA[${node.value}]]>\n`;
  }
  if (node.type === 'text') {
    const trimmed = node.value.trim();
    return trimmed ? `${indent}${trimmed}\n` : '';
  }
  if (node.type === 'element') {
    const attrStr = node.attributes
      .map((a) => `${a.name}=${a.quote}${a.value}${a.quote}`)
      .join(' ');
    const openTag = attrStr ? `<${node.name} ${attrStr}>` : `<${node.name}>`;
    const selfCloseTag = attrStr ? `<${node.name} ${attrStr}/>` : `<${node.name}/>`;

    if (node.selfClosing) {
      return `${indent}${selfCloseTag}\n`;
    }

    if (node.children.length === 0) {
      return `${indent}<${node.name}${attrStr ? ' ' + attrStr : ''}></${node.name}>\n`;
    }

    if (hasMixedContent(node.children)) {
      const inlineStr = serializeInlineChildren(node.children);
      return `${indent}${openTag}${inlineStr}</${node.name}>\n`;
    }

    const significant = node.children.filter(
      (c) => c.type !== 'text' || c.value.trim() !== ''
    );

    if (significant.length === 1 && significant[0].type === 'text') {
      const textVal = significant[0].value.trim();
      if (!textVal.includes('\n')) {
        return `${indent}${openTag}${textVal}</${node.name}>\n`;
      }
    }

    let inner = '';
    for (const child of significant) {
      inner += formatNode(child, indentStr, level + 1);
    }
    return `${indent}${openTag}\n${inner}${indent}</${node.name}>\n`;
  }
  return '';
}

export function formatXml(input, indentOption = '2') {
  const { nodes, error } = parseXml(input);
  if (error) {
    throw new Error(error.message);
  }

  let indentStr = '  ';
  if (indentOption === '4' || indentOption === 4) {
    indentStr = '    ';
  } else if (indentOption === 'tab' || indentOption === '\t') {
    indentStr = '\t';
  }

  let result = '';
  for (const node of nodes) {
    result += formatNode(node, indentStr, 0);
  }

  return result.trimEnd();
}

function minifyNode(node) {
  if (node.type === 'pi') {
    return `<?${node.value}?>`;
  }
  if (node.type === 'doctype') {
    return `<!DOCTYPE${node.value}>`;
  }
  if (node.type === 'comment') {
    return `<!--${node.value}-->`;
  }
  if (node.type === 'cdata') {
    return `<![CDATA[${node.value}]]>`;
  }
  if (node.type === 'text') {
    return node.value.trim();
  }
  if (node.type === 'element') {
    const attrStr = node.attributes
      .map((a) => `${a.name}=${a.quote}${a.value}${a.quote}`)
      .join(' ');
    const openTag = attrStr ? `<${node.name} ${attrStr}>` : `<${node.name}>`;
    const selfCloseTag = attrStr ? `<${node.name} ${attrStr}/>` : `<${node.name}/>`;

    if (node.selfClosing) {
      return selfCloseTag;
    }
    if (node.children.length === 0) {
      return `<${node.name}${attrStr ? ' ' + attrStr : ''}></${node.name}>`;
    }

    if (hasMixedContent(node.children)) {
      return `${openTag}${serializeInlineChildren(node.children)}</${node.name}>`;
    }

    const significant = node.children.filter(
      (c) => c.type !== 'text' || c.value.trim() !== ''
    );
    let inner = '';
    for (const child of significant) {
      if (child.type === 'text') {
        inner += child.value.trim();
      } else {
        inner += minifyNode(child);
      }
    }
    return `${openTag}${inner}</${node.name}>`;
  }
  return '';
}

export function minifyXml(input) {
  const { nodes, error } = parseXml(input);
  if (error) {
    throw new Error(error.message);
  }

  let result = '';
  for (const node of nodes) {
    if (node.type === 'text' && !node.value.trim()) {
      continue;
    }
    result += minifyNode(node);
  }

  return result;
}

export const SAMPLE_XML = `<?xml version="1.0" encoding="UTF-8"?>
<?xml-stylesheet type="text/xsl" href="style.xsl"?>
<!DOCTYPE note SYSTEM "Note.dtd">
<!-- Sample XML Document demonstrating CDATA, namespaces, and comments -->
<soap:Envelope xmlns:soap="http://schemas.xmlsoap.org/soap/envelope/" xmlns:ex="http://example.com/ns">
  <soap:Header>
    <ex:AuthToken token="abc123_&amp;_xyz"/>
  </soap:Header>
  <soap:Body>
    <ex:Article id="101" active="true">
      <ex:Title>XML Formatter &amp; Validator</ex:Title>
      <ex:Content>
        <p>Welcome to <b>XML Formatter</b>! It handles <i>mixed content</i> seamlessly.</p>
      </ex:Content>
      <ex:CodeData>
        <![CDATA[if (a < b && b > c) { console.log("XML & CDATA"); }]]>
      </ex:CodeData>
      <ex:Metadata>
        <ex:Author name="DevTool"/>
        <ex:Tags>
          <ex:Tag>xml</ex:Tag>
          <ex:Tag>formatter</ex:Tag>
        </ex:Tags>
      </ex:Metadata>
    </ex:Article>
  </soap:Body>
</soap:Envelope>`;
