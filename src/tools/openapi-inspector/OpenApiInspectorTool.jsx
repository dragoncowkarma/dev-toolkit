import { useEffect, useState } from 'react';
import { useCopyFeedback } from '../../hooks/useCopyFeedback.js';
import { generateApiSummaryText, inspectOpenApi } from './openApiInspector.utils.js';
import './openApiInspector.css';

const SAMPLE_SPEC = `openapi: 3.0.3
info:
  title: Sample Petstore API
  version: 1.0.0
servers:
  - url: https://api.example.com/v1
paths:
  /pets:
    get:
      summary: List all pets
      operationId: listPets
      tags:
        - Pets
      parameters:
        - name: limit
          in: query
      responses:
        '200':
          description: A paged array of pets
          content:
            application/json:
              schema:
                $ref: '#/components/schemas/Pet'
    post:
      summary: Create a pet
      operationId: createPet
      tags:
        - Pets
      responses:
        '201':
          description: Null response
components:
  schemas:
    Pet:
      type: object
      properties:
        id:
          type: integer
        name:
          type: string
  securitySchemes:
    ApiKeyAuth:
      type: apiKey
      in: header
      name: X-API-Key
`;

/**
 * Renders the OpenAPI Spec Inspector tool for validating and summarizing OpenAPI specs.
 *
 * @returns {React.JSX.Element} OpenAPI Inspector UI component.
 */
export default function OpenApiInspectorTool() {
  const [input, setInput] = useState(SAMPLE_SPEC);
  const [result, setResult] = useState(() => inspectOpenApi(SAMPLE_SPEC));
  const [copyError, setCopyError] = useState('');
  const [copyStatus, showCopyFeedback] = useCopyFeedback({
    initialValue: null,
    resetValue: null,
    duration: 2000,
  });

  useEffect(() => {
    setResult(inspectOpenApi(input));
    setCopyError('');
  }, [input]);

  function handleClear() {
    setInput('');
    setCopyError('');
  }

  function handleLoadSample() {
    setInput(SAMPLE_SPEC);
    setCopyError('');
  }

  async function handleCopyJson() {
    if (!result.normalizedJson) return;
    try {
      await navigator.clipboard.writeText(result.normalizedJson);
      showCopyFeedback('json');
      setCopyError('');
    } catch {
      setCopyError('Failed to copy normalized JSON to clipboard.');
    }
  }

  async function handleCopySummary() {
    if (!result.summary) return;
    const summaryText = generateApiSummaryText(result.summary);
    try {
      await navigator.clipboard.writeText(summaryText);
      showCopyFeedback('summary');
      setCopyError('');
    } catch {
      setCopyError('Failed to copy API summary to clipboard.');
    }
  }

  const { parseError, errors, warnings, summary } = result;
  const hasAlert = parseError || errors.length > 0 || copyError;

  return (
    <section className="openapi-tool" aria-label="OpenAPI Spec Inspector Tool">
      <div className="openapi-toolbar">
        <div className="toolbar-title-group">
          <h2 className="tool-title">OpenAPI Spec Inspector</h2>
          <p className="tool-description">
            Validate and summarize OpenAPI 3.0/3.1 documents locally.
          </p>
        </div>

        <div className="toolbar-actions">
          <button type="button" className="btn" onClick={handleLoadSample}>
            Sample Spec
          </button>
          <button type="button" className="btn" onClick={handleClear}>
            Clear
          </button>
          <button
            type="button"
            className="btn"
            onClick={handleCopyJson}
            disabled={!result.normalizedJson}
            aria-label="Copy normalized JSON"
          >
            {copyStatus === 'json' ? '✓ JSON Copied' : 'Copy JSON'}
          </button>
          <button
            type="button"
            className="btn"
            onClick={handleCopySummary}
            disabled={!summary}
            aria-label="Copy API summary"
          >
            {copyStatus === 'summary' ? '✓ Summary Copied' : 'Copy Summary'}
          </button>
        </div>
      </div>

      {copyStatus && (
        <div className="sr-only" role="status" aria-live="polite">
          {copyStatus === 'json'
            ? 'Normalized JSON copied to clipboard'
            : 'API summary copied to clipboard'}
        </div>
      )}

      {hasAlert && (
        <div className="openapi-alert" role="alert">
          <strong>⚠ Document Validation Errors:</strong>
          {parseError && <div>{parseError}</div>}
          {copyError && <div>{copyError}</div>}
          {errors.length > 0 && (
            <ul className="alert-list">
              {errors.map((err, idx) => (
                <li key={`err-${idx}`}>
                  <code>{err.path}</code>: {err.message}
                </li>
              ))}
            </ul>
          )}
        </div>
      )}

      {warnings.length > 0 && (
        <div className="openapi-warning">
          <strong>⚡ Document Warnings:</strong>
          <ul className="alert-list">
            {warnings.map((warn, idx) => (
              <li key={`warn-${idx}`}>
                <code>{warn.path}</code>: {warn.message}
              </li>
            ))}
          </ul>
        </div>
      )}

      <div className="openapi-panels">
        <div className="panel">
          <div className="panel-header">
            <label className="panel-label" htmlFor="openapi-input">
              OpenAPI Document (JSON or YAML)
            </label>
          </div>
          <textarea
            id="openapi-input"
            className="panel-textarea"
            placeholder="Paste an OpenAPI 3.0 or 3.1 JSON/YAML document here..."
            value={input}
            onChange={(e) => setInput(e.target.value)}
            spellCheck={false}
          />
        </div>

        <div className="panel">
          <div className="panel-header">
            <span className="panel-label">API Summary</span>
          </div>

          {!summary ? (
            <div className="summary-card">
              <p className="tool-description">
                Provide a valid OpenAPI 3.0.x or 3.1.x document to see the API summary.
              </p>
            </div>
          ) : (
            <div className="summary-card">
              <div className="summary-header">
                <h3 className="api-title">{summary.title}</h3>
                <div className="meta-badges">
                  <span className="badge badge-primary">v{summary.version}</span>
                  <span className="badge">OpenAPI {summary.openApiVersion}</span>
                  <span className="badge">{summary.pathCount} Paths</span>
                  <span className="badge">{summary.operationCount} Operations</span>
                </div>
              </div>

              {summary.servers.length > 0 && (
                <div>
                  <div className="section-title">Servers</div>
                  <div className="servers-list">
                    {summary.servers.map((url, idx) => (
                      <code key={idx}>{url}</code>
                    ))}
                  </div>
                </div>
              )}

              {summary.securitySchemes.length > 0 && (
                <div>
                  <div className="section-title">Security Schemes</div>
                  <div className="schemes-list">
                    {summary.securitySchemes.map((s, idx) => (
                      <div key={idx}>
                        <strong>{s.key}</strong> ({s.type}
                        {s.scheme ? `, ${s.scheme}` : ''})
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {summary.operations.length > 0 && (
                <div>
                  <div className="section-title">Operations</div>
                  <div className="operations-list">
                    {summary.operations.map((op, idx) => (
                      <div key={idx} className="op-item">
                        <div className="op-header">
                          <span className={`method-badge ${op.method.toLowerCase()}`}>
                            {op.method}
                          </span>
                          <span className="op-path">{op.path}</span>
                          {op.operationId && (
                            <span className="op-id">[{op.operationId}]</span>
                          )}
                        </div>
                        <div className="op-details">
                          {op.summary && <div>{op.summary}</div>}
                          {op.tags.length > 0 && (
                            <div>
                              <strong>Tags:</strong> {op.tags.join(', ')}
                            </div>
                          )}
                          {op.parameters.length > 0 && (
                            <div>
                              <strong>Params:</strong>{' '}
                              {op.parameters
                                .map((p) => (p.in ? `${p.name} (${p.in})` : p.name))
                                .join(', ')}
                            </div>
                          )}
                          {op.responses.length > 0 && (
                            <div>
                              <strong>Responses:</strong> {op.responses.join(', ')}
                            </div>
                          )}
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>
          )}
        </div>
      </div>
    </section>
  );
}
