import {
  memo,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from 'react';
import {
  formatXml,
  minifyXml,
  validateXml,
  SAMPLE_XML,
} from './xml.utils';
import './xml.css';

const EDITOR_LINE_HEIGHT = 20;
const VIRTUAL_OVERSCAN = 6;
const DEFAULT_VIEWPORT_HEIGHT = 400;

function countLines(value) {
  let count = 1;
  let searchFrom = 0;
  let nextNewline = value.indexOf('\n', searchFrom);
  while (nextNewline !== -1) {
    count += 1;
    searchFrom = nextNewline + 1;
    nextNewline = value.indexOf('\n', searchFrom);
  }
  return count;
}

function getVirtualRange(itemCount, scrollTop, viewportHeight, rowHeight) {
  const safeItemCount = Math.max(itemCount, 1);
  const firstVisible = Math.floor(scrollTop / rowHeight);
  const lastVisible = Math.ceil((scrollTop + viewportHeight) / rowHeight);
  const start = Math.min(
    Math.max(firstVisible - VIRTUAL_OVERSCAN, 0),
    safeItemCount - 1
  );
  const end = Math.min(
    Math.max(lastVisible + VIRTUAL_OVERSCAN, start + 1),
    safeItemCount
  );
  return { start, end };
}

function useVirtualViewport(elementRef) {
  const [viewport, setViewport] = useState({
    height: DEFAULT_VIEWPORT_HEIGHT,
    scrollTop: 0,
  });

  const handleScroll = useCallback((event) => {
    const scrollTop = event.currentTarget.scrollTop;
    setViewport((current) => (
      current.scrollTop === scrollTop ? current : { ...current, scrollTop }
    ));
  }, []);

  useEffect(() => {
    const element = elementRef.current;
    if (!element) return undefined;

    const updateHeight = () => {
      const height = element.clientHeight || DEFAULT_VIEWPORT_HEIGHT;
      setViewport((current) => (
        current.height === height ? current : { ...current, height }
      ));
    };

    updateHeight();

    if (typeof ResizeObserver !== 'undefined') {
      const observer = new ResizeObserver(updateHeight);
      observer.observe(element);
      return () => observer.disconnect();
    }

    window.addEventListener('resize', updateHeight);
    return () => window.removeEventListener('resize', updateHeight);
  }, [elementRef]);

  return { ...viewport, handleScroll };
}

const VirtualizedXmlEditor = memo(function VirtualizedXmlEditor({ value, onChange }) {
  const textareaRef = useRef(null);
  const lineCount = useMemo(() => countLines(value), [value]);
  const { height, scrollTop, handleScroll } = useVirtualViewport(textareaRef);
  const { start, end } = getVirtualRange(
    lineCount,
    scrollTop,
    height,
    EDITOR_LINE_HEIGHT
  );
  const visibleLineNumbers = useMemo(
    () => Array.from({ length: end - start }, (_, index) => start + index + 1),
    [end, start]
  );
  const lineNumberOffset = 12 + (start * EDITOR_LINE_HEIGHT) - scrollTop;

  return (
    <div className="editor-container">
      <div className="line-numbers" aria-hidden="true">
        <div
          className="line-numbers-window"
          style={{ transform: `translateY(${lineNumberOffset}px)` }}
        >
          {visibleLineNumbers.map((lineNumber) => (
            <div key={lineNumber} className="line-number-item">
              {lineNumber}
            </div>
          ))}
        </div>
      </div>
      <textarea
        ref={textareaRef}
        className="editor-textarea"
        placeholder="Paste or type your XML here..."
        value={value}
        onChange={onChange}
        onScroll={handleScroll}
        aria-label="XML Input Area"
        spellCheck="false"
      />
    </div>
  );
});

export default function XmlTool({ onBack }) {
  const [input, setInput] = useState('');
  const [output, setOutput] = useState('');
  const [indent, setIndent] = useState('2');
  const [validation, setValidation] = useState({ valid: true, error: null });
  const [toast, setToast] = useState('');
  const [ariaLiveMessage, setAriaLiveMessage] = useState('');

  useEffect(() => {
    if (!input.trim()) {
      setValidation({ valid: true, error: null });
      return;
    }
    const result = validateXml(input);
    setValidation(result);
  }, [input]);

  const handleInputChange = useCallback((e) => {
    setInput(e.target.value);
    setOutput('');
  }, []);

  const handleFormat = () => {
    const result = validateXml(input);
    if (result.valid) {
      try {
        const formatted = formatXml(input, indent);
        setInput(formatted);
        setOutput(formatted);
      } catch (err) {
        setValidation({
          valid: false,
          error: { message: err.message, line: 1, column: 1, snippet: '' },
        });
      }
    } else {
      setValidation(result);
    }
  };

  const handleMinify = () => {
    const result = validateXml(input);
    if (result.valid) {
      try {
        const minified = minifyXml(input);
        setInput(minified);
        setOutput(minified);
      } catch (err) {
        setValidation({
          valid: false,
          error: { message: err.message, line: 1, column: 1, snippet: '' },
        });
      }
    } else {
      setValidation(result);
    }
  };

  const handleClear = () => {
    setInput('');
    setOutput('');
    setValidation({ valid: true, error: null });
    setAriaLiveMessage('Inputs cleared');
  };

  const handleLoadSample = () => {
    setInput(SAMPLE_XML);
    try {
      const formatted = formatXml(SAMPLE_XML, indent);
      setOutput(formatted);
    } catch {
      // sample is static valid XML
    }
    setAriaLiveMessage('Sample XML loaded');
  };

  const handleCopy = () => {
    const textToCopy = output || input;
    if (!textToCopy) {
      setAriaLiveMessage('Nothing to copy');
      return;
    }

    navigator.clipboard.writeText(textToCopy)
      .then(() => {
        setToast('Copied to clipboard!');
        setAriaLiveMessage('Copied output to clipboard!');
        setTimeout(() => setToast(''), 3000);
      })
      .catch((err) => {
        console.error('Failed to copy: ', err);
        setAriaLiveMessage('Failed to copy to clipboard');
      });
  };

  const handleDownload = () => {
    const textToDownload = output || input;
    if (!textToDownload) return;

    const blob = new Blob([textToDownload], { type: 'application/xml' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = 'document.xml';
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
    setAriaLiveMessage('Downloaded XML file');
  };

  const formattedOutputText = useMemo(() => {
    if (output) return output;
    if (!input.trim()) return '';
    try {
      return formatXml(input, indent);
    } catch {
      return '';
    }
  }, [input, output, indent]);

  return (
    <section className="xml-tool-container" aria-label="XML Formatter & Validator Tool">
      <div className="sr-only" aria-live="polite" aria-atomic="true">
        {ariaLiveMessage}
      </div>

      {toast && (
        <div className="toast" role="alert">
          <span>✅</span> {toast}
        </div>
      )}

      <div className="tool-header-row">
        <div className="tool-title-group">
          {onBack && (
            <button className="back-button" onClick={onBack} aria-label="Go back to tool dashboard">
              <span>←</span> Back
            </button>
          )}
          <h2 className="tool-title">XML Formatter &amp; Validator</h2>
        </div>
        <div className="panel-actions">
          <button className="btn" onClick={handleLoadSample} aria-label="Load sample XML">
            📋 Load Sample
          </button>
          <button className="btn" onClick={handleClear} aria-label="Clear inputs">
            🗑️ Clear
          </button>
        </div>
      </div>

      <div className="xml-workspace-grid">
        {/* Input Panel */}
        <div className="xml-panel">
          <div className="panel-header">
            <h3 className="panel-title">
              Input XML
              {input.trim() === '' ? (
                <span className="status-badge empty">Empty</span>
              ) : validation.valid ? (
                <span className="status-badge valid">Valid</span>
              ) : (
                <span className="status-badge invalid">Invalid</span>
              )}
            </h3>
            <div className="panel-actions">
              <label 
                htmlFor="indent-select" 
                style={{ fontSize: '0.8rem', color: 'var(--color-text-muted)' }}
              >
                Indent:
              </label>
              <select 
                id="indent-select"
                className="select-input" 
                value={indent} 
                onChange={(e) => {
                  setIndent(e.target.value);
                  setOutput('');
                }}
                aria-label="Indent size"
              >
                <option value="2">2 Spaces</option>
                <option value="4">4 Spaces</option>
                <option value="tab">Tabs</option>
              </select>
              <button 
                className="btn btn-primary" 
                onClick={handleFormat} 
                disabled={!validation.valid || !input.trim()}
                aria-label="Format XML"
              >
                Format
              </button>
              <button 
                className="btn" 
                onClick={handleMinify} 
                disabled={!validation.valid || !input.trim()}
                aria-label="Minify XML"
              >
                Minify
              </button>
            </div>
          </div>

          <VirtualizedXmlEditor value={input} onChange={handleInputChange} />
        </div>

        {/* Output Panel */}
        <div className="xml-panel">
          <div className="panel-header">
            <h3 className="panel-title">Output</h3>
            <div className="panel-actions">
              <button 
                className="btn" 
                onClick={handleCopy} 
                disabled={!input.trim() || !validation.valid}
                aria-label="Copy output to clipboard"
              >
                📋 Copy
              </button>
              <button 
                className="btn" 
                onClick={handleDownload} 
                disabled={!input.trim() || !validation.valid}
                aria-label="Download output as file"
              >
                💾 Download
              </button>
            </div>
          </div>

          <div className="output-container">
            {validation.valid ? (
              <pre style={{ 
                margin: 0, 
                fontFamily: 'inherit', 
                fontSize: 'inherit', 
                color: 'inherit', 
                whiteSpace: 'pre-wrap', 
                wordBreak: 'break-all' 
              }}>
                {formattedOutputText}
              </pre>
            ) : (
              <div className="error-snippet-container" role="alert">
                <div className="error-message">
                  ❌ XML Validation Error:
                </div>
                <div style={{ color: 'var(--color-text)', marginBottom: '0.5rem' }}>
                  {validation.error?.message}
                </div>
                {validation.error?.snippet && (
                  <pre style={{ 
                    margin: 0, 
                    fontFamily: 'inherit', 
                    color: 'var(--color-error-light)' 
                  }}>
                    {validation.error.snippet}
                  </pre>
                )}
              </div>
            )}
          </div>
        </div>
      </div>
    </section>
  );
}
