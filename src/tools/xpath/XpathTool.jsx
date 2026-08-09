import { useMemo, useState } from 'react';
import { evaluateXPathInput } from './xpath.utils.js';
import './xpath.css';

const BOOKSTORE_XML = `<bookstore>
  <book id="1"><title>XPath Essentials</title><price>24.99</price></book>
  <book id="2"><title>XML in Practice</title><price>19.50</price></book>
</bookstore>`;
const RSS_XML = `<rss xmlns="http://purl.org/rss/1.0/"><channel>
  <title>Example Feed</title><item><title>First post</title></item>
</channel></rss>`;

const SAMPLES = [
  { label: 'Bookstore nodes', xml: BOOKSTORE_XML, expression: "//book[@id='1']" },
  { label: 'Book count', xml: BOOKSTORE_XML, expression: 'count(//book)' },
  { label: 'RSS titles', xml: RSS_XML, expression: '//default:item/default:title/text()' },
];

function statusLabel(result) {
  if (result.type === 'NodeSet') {
    return `${result.count} matching node${result.count === 1 ? '' : 's'} (NodeSet)`;
  }
  return `${result.type} result`;
}

/** Renders a browser-native XML DOM XPath evaluator. */
export default function XpathTool() {
  const [xmlInput, setXmlInput] = useState('');
  const [expression, setExpression] = useState('');
  const [selectedSample, setSelectedSample] = useState('');
  const [copyStatus, setCopyStatus] = useState('');
  const result = useMemo(() => evaluateXPathInput(xmlInput, expression), [xmlInput, expression]);

  function updateXml(event) {
    setXmlInput(event.target.value);
    setSelectedSample('');
    setCopyStatus('');
  }

  function updateExpression(event) {
    setExpression(event.target.value);
    setSelectedSample('');
    setCopyStatus('');
  }

  function loadSample(sample) {
    setXmlInput(sample.xml);
    setExpression(sample.expression);
    setSelectedSample(sample.label);
    setCopyStatus('');
  }

  async function copyOutput() {
    if (!result.ready || !result.output) return;
    try {
      if (!navigator.clipboard?.writeText) throw new Error('Clipboard API is unavailable.');
      await navigator.clipboard.writeText(result.output);
      setCopyStatus('Extracted result copied to clipboard.');
    } catch {
      setCopyStatus('Failed to copy extracted result to clipboard.');
    }
  }

  return (
    <section className="xpath-tool" aria-labelledby="xpath-tool-title">
      <header className="xpath-tool__intro">
        <p className="xpath-tool__eyebrow">XML</p>
        <h2 id="xpath-tool-title">XPath Evaluator</h2>
        <p>Evaluate browser-native XPath expressions against XML and extract matching data.</p>
      </header>
      <div className="xpath-tool__samples" aria-label="XPath sample presets">
        {SAMPLES.map((sample) => (
          <button
            key={sample.label}
            type="button"
            aria-pressed={selectedSample === sample.label}
            aria-label={`Load ${sample.label} sample`}
            onClick={() => loadSample(sample)}
          >
            {sample.label}
          </button>
        ))}
      </div>
      <div className="xpath-tool__panes">
        <div className="xpath-tool__pane">
          <label htmlFor="xpath-xml-input">XML input</label>
          <textarea
            id="xpath-xml-input"
            value={xmlInput}
            onChange={updateXml}
            aria-label="XML input"
          />
        </div>
        <div className="xpath-tool__pane">
          <label htmlFor="xpath-expression">XPath expression</label>
          <input
            id="xpath-expression"
            value={expression}
            onChange={updateExpression}
            aria-label="XPath expression"
            placeholder="//item[@id='1']"
            spellCheck="false"
          />
          <p className="xpath-tool__hint">Use `default:` for default XML namespaces.</p>
          <div className="xpath-tool__output-heading">
            <label htmlFor="xpath-output">Extracted result</label>
            <button
              type="button"
              onClick={copyOutput}
              disabled={!result.ready || !result.output}
              aria-label="Copy extracted result"
            >
              Copy result
            </button>
          </div>
          <textarea id="xpath-output" value={result.output} readOnly aria-label="XPath output" />
        </div>
      </div>
      {result.ready && (
        <p className="xpath-tool__status" role="status" aria-live="polite">
          {statusLabel(result)}
        </p>
      )}
      {result.error && <p className="xpath-tool__error" role="alert">{result.error}</p>}
      {copyStatus && (
        <p className="xpath-tool__copy-status" role="status" aria-live="polite">
          {copyStatus}
        </p>
      )}
    </section>
  );
}
