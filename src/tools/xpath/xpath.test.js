import { describe, expect, it } from 'vitest';
import {
  createNamespaceResolver,
  evaluateXPath,
  evaluateXPathInput,
  parseXmlInput,
  serializeResultNode,
} from './xpath.utils.js';

const XML = '<root><item id="1">One</item><item id="2">Two</item></root>';

describe('XML DOM XPath evaluation', () => {
  it('parses well-formed XML and returns a detailed error for malformed XML', () => {
    expect(parseXmlInput(XML).ok).toBe(true);
    expect(parseXmlInput('<root><item></root>').error).toMatch(/^Invalid XML/);
  });

  it('evaluates element, attribute, and text node sets in document order', () => {
    const document = parseXmlInput(XML).document;
    const elements = evaluateXPath(document, '//item');
    const attributes = evaluateXPath(document, '//item/@id');
    const textNodes = evaluateXPath(document, '//item/text()');

    expect(elements.type).toBe('NodeSet');
    expect(elements.output).toContain('<item id="1">One</item>');
    expect(attributes.output).toBe('id="1"\n\nid="2"');
    expect(textNodes.output).toBe('One\n\nTwo');
    expect(serializeResultNode(attributes.value[0])).toBe('id="1"');
  });

  it('evaluates number, string, and boolean scalar expressions', () => {
    const document = parseXmlInput(XML).document;

    expect(evaluateXPath(document, 'count(//item)')).toMatchObject({
      type: 'Number', output: '2',
    });
    expect(evaluateXPath(document, 'string(//item[@id="1"])')).toMatchObject({
      type: 'String', output: 'One',
    });
    expect(evaluateXPath(document, 'boolean(//item[@id="3"])')).toMatchObject({
      type: 'Boolean', output: 'false',
    });
  });

  it('resolves declared prefix and default namespaces', () => {
    const prefixed = parseXmlInput('<root xmlns:x="urn:example"><x:item>Yes</x:item></root>');
    const defaulted = parseXmlInput('<root xmlns="urn:example"><item>Yes</item></root>');

    expect(evaluateXPath(prefixed.document, '//x:item').output).toContain('x:item');
    expect(createNamespaceResolver(defaulted.document)('default')).toBe('urn:example');
  });

  it('turns XPath syntax errors into safe renderable errors', () => {
    expect(evaluateXPathInput(XML, '//item[').error).toMatch(/^Invalid XPath:/);
    expect(evaluateXPathInput('', '//item').ready).toBe(false);
  });
});
