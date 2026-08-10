const DEFAULT_NAMESPACE_PREFIX = 'default';

function getParserError(document) {
  const parserError = document.querySelector('parsererror');
  return parserError?.textContent?.trim() || '';
}

function getErrorLocation(message) {
  const location = message.match(/(?:line|Line)\s*(\d+).*?(?:column|col)\s*(\d+)/);
  return location ? ` at line ${location[1]}, column ${location[2]}` : '';
}

/** Parses XML source and returns a renderable validation result. */
export function parseXmlInput(source) {
  if (!source.trim()) return { ok: false, document: null, error: '' };

  const document = new DOMParser().parseFromString(source, 'application/xml');
  const parserError = getParserError(document);
  if (parserError) {
    return {
      ok: false,
      document: null,
      error: `Invalid XML${getErrorLocation(parserError)}: ${parserError}`,
    };
  }

  return { ok: true, document, error: '' };
}

/** Creates an XPath namespace resolver from namespace declarations in an XML document. */
export function createNamespaceResolver(document) {
  const namespaces = { xml: 'http://www.w3.org/XML/1998/namespace' };
  const root = document.documentElement;

  for (const attribute of root?.attributes || []) {
    if (attribute.name === 'xmlns') {
      namespaces[DEFAULT_NAMESPACE_PREFIX] = attribute.value;
    } else if (attribute.prefix === 'xmlns') {
      namespaces[attribute.localName] = attribute.value;
    }
  }

  return (prefix) => namespaces[prefix] || null;
}

/** Converts a DOM result node into XML or text suitable for display and copying. */
export function serializeResultNode(node) {
  if (node.nodeType === Node.ATTRIBUTE_NODE) return `${node.name}="${node.value}"`;
  if (node.nodeType === Node.TEXT_NODE || node.nodeType === Node.CDATA_SECTION_NODE) {
    return node.textContent || '';
  }
  return new XMLSerializer().serializeToString(node);
}

function evaluateNodeSet(result) {
  const nodes = [];
  let node = result.iterateNext();
  while (node) {
    nodes.push(node);
    node = result.iterateNext();
  }
  return { type: 'NodeSet', value: nodes, output: nodes.map(serializeResultNode).join('\n\n') };
}

function evaluateScalar(result) {
  switch (result.resultType) {
    case XPathResult.STRING_TYPE:
      return { type: 'String', value: result.stringValue, output: result.stringValue };
    case XPathResult.NUMBER_TYPE:
      return { type: 'Number', value: result.numberValue, output: String(result.numberValue) };
    case XPathResult.BOOLEAN_TYPE:
      return { type: 'Boolean', value: result.booleanValue, output: String(result.booleanValue) };
    default:
      throw new Error(`Unsupported scalar result type: ${result.resultType}`);
  }
}

/** Evaluates an XPath expression and returns its node-set or scalar result. */
export function evaluateXPath(document, expression) {
  const resolver = createNamespaceResolver(document);
  const result = document.evaluate(
    expression,
    document,
    resolver,
    XPathResult.ANY_TYPE,
    null,
  );
  if (result.resultType === XPathResult.UNORDERED_NODE_ITERATOR_TYPE) {
    return evaluateNodeSet(result);
  }
  return evaluateScalar(result);
}

/** Safely evaluates XML and XPath input for direct UI rendering. */
export function evaluateXPathInput(xmlInput, expression) {
  if (!xmlInput.trim() || !expression.trim()) {
    return { ready: false, type: '', count: 0, nodes: [], output: '', error: '' };
  }

  const parsed = parseXmlInput(xmlInput);
  if (!parsed.ok) {
    return { ready: false, type: '', count: 0, nodes: [], output: '', error: parsed.error };
  }

  try {
    const result = evaluateXPath(parsed.document, expression);
    const nodes = result.type === 'NodeSet' ? result.value : [];
    return {
      ready: true,
      type: result.type,
      count: nodes.length,
      nodes,
      output: result.output,
      error: '',
    };
  } catch (error) {
    return {
      ready: false,
      type: '',
      count: 0,
      nodes: [],
      output: '',
      error: `Invalid XPath: ${error.message || 'Unable to evaluate expression.'}`,
    };
  }
}
