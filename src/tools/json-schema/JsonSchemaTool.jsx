import { useEffect, useId, useMemo, useRef, useState } from 'react';
import { generateSchema, formatSchema, getSchemaStats } from './jsonSchema.utils.js';
import './jsonSchema.css';

const SAMPLE_PRESET = `{
  "user": {
    "id": 101,
    "name": "Jane Doe",
    "email": "jane@example.com",
    "role": "admin",
    "isActive": true
  },
  "tags": ["developer", "maintainer"],
  "score": 98.5
}`;

/**
 * Renders the JSON Schema Generator component.
 * Converts sample JSON payloads into inferred JSON Schema documents.
 */
export default function JsonSchemaTool() {
  const [inputJson, setInputJson] = useState(SAMPLE_PRESET);
  const [draft, setDraft] = useState('2020-12');
  const [requiredMode, setRequiredMode] = useState('all');
  const [inferIntegers, setInferIntegers] = useState(false);
  const [includeExamples, setIncludeExamples] = useState(false);
  const [title, setTitle] = useState('');

  const [lastValidSchema, setLastValidSchema] = useState(() => {
    const initialResult = generateSchema(SAMPLE_PRESET, {
      draft: '2020-12',
      requiredMode: 'all',
      inferIntegers: false,
      includeExamples: false,
      title: '',
    });
    return initialResult.schema;
  });

  const [copyFeedback, setCopyFeedback] = useState('');
  const copyFeedbackTimeoutRef = useRef(null);

  const jsonInputId = useId();
  const schemaOutputId = useId();
  const draftSelectId = useId();
  const requiredModeSelectId = useId();
  const titleInputId = useId();
  const inferIntegersId = useId();
  const includeExamplesId = useId();

  const options = useMemo(
    () => ({
      draft,
      requiredMode,
      inferIntegers,
      includeExamples,
      title,
    }),
    [draft, requiredMode, inferIntegers, includeExamples, title]
  );

  const inferenceResult = useMemo(
    () => generateSchema(inputJson, options),
    [inputJson, options]
  );

  useEffect(() => {
    if (inferenceResult.schema) {
      setLastValidSchema(inferenceResult.schema);
    }
  }, [inferenceResult.schema]);

  useEffect(() => () => {
    if (copyFeedbackTimeoutRef.current !== null) {
      clearTimeout(copyFeedbackTimeoutRef.current);
      copyFeedbackTimeoutRef.current = null;
    }
  }, []);

  const currentValidSchema = inferenceResult.schema || lastValidSchema;

  const outputSchemaText = useMemo(() => {
    if (!currentValidSchema) return '';
    return formatSchema(currentValidSchema, 2);
  }, [currentValidSchema]);

  const stats = useMemo(
    () => getSchemaStats(currentValidSchema),
    [currentValidSchema]
  );

  const countReadoutText = `${stats.propertyCount} ${
    stats.propertyCount === 1 ? 'property' : 'properties'
  } across ${stats.objectCount} ${
    stats.objectCount === 1 ? 'object' : 'objects'
  }`;

  const handleCopy = async () => {
    if (!outputSchemaText) return;
    try {
      await navigator.clipboard.writeText(outputSchemaText);
      setCopyFeedback('Copied schema to clipboard!');
      if (copyFeedbackTimeoutRef.current !== null) {
        clearTimeout(copyFeedbackTimeoutRef.current);
      }
      copyFeedbackTimeoutRef.current = setTimeout(() => {
        copyFeedbackTimeoutRef.current = null;
        setCopyFeedback('');
      }, 3000);
    } catch {
      setCopyFeedback('Failed to copy schema.');
    }
  };

  const handleClear = () => {
    setInputJson('');
    setLastValidSchema(null);
    setCopyFeedback('');
  };

  const handleLoadPreset = () => {
    setInputJson(SAMPLE_PRESET);
    setCopyFeedback('');
  };

  return (
    <section className="json-schema" aria-labelledby="json-schema-title-heading">
      <div className="json-schema__header">
        <span className="json-schema__eyebrow">Generator</span>
        <h2 id="json-schema-title-heading">JSON Schema Generator</h2>
        <p>
          Infer a structured JSON Schema document directly from a sample JSON payload.
        </p>

        <div className="json-schema__actions">
          <button
            type="button"
            className="json-schema__button json-schema__button--primary"
            onClick={handleCopy}
            disabled={!outputSchemaText}
            aria-label="Copy generated JSON schema"
          >
            📋 Copy Schema
          </button>
          <button
            type="button"
            className="json-schema__button"
            onClick={handleLoadPreset}
            aria-label="Load sample JSON preset"
          >
            📄 Sample JSON
          </button>
          <button
            type="button"
            className="json-schema__button"
            onClick={handleClear}
            aria-label="Clear sample JSON input"
          >
            🗑️ Clear
          </button>
        </div>
      </div>

      <div className="json-schema__options" aria-label="JSON Schema generator options">
        <div className="json-schema__options-grid">
          <div className="json-schema__field">
            <label className="json-schema__label" htmlFor={draftSelectId}>
              Schema Draft
            </label>
            <select
              id={draftSelectId}
              className="json-schema__select"
              value={draft}
              onChange={(e) => setDraft(e.target.value)}
            >
              <option value="2020-12">Draft 2020-12</option>
              <option value="draft-07">Draft 07</option>
            </select>
          </div>

          <div className="json-schema__field">
            <label className="json-schema__label" htmlFor={requiredModeSelectId}>
              Required Mode
            </label>
            <select
              id={requiredModeSelectId}
              className="json-schema__select"
              value={requiredMode}
              onChange={(e) => setRequiredMode(e.target.value)}
            >
              <option value="all">Required (All Properties)</option>
              <option value="none">Optional (Omit Required)</option>
            </select>
          </div>

          <div className="json-schema__field">
            <label className="json-schema__label" htmlFor={titleInputId}>
              Schema Title (Optional)
            </label>
            <input
              id={titleInputId}
              type="text"
              className="json-schema__input-text"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="e.g. User Profile"
            />
          </div>

          <label className="json-schema__checkbox-field" htmlFor={inferIntegersId}>
            <input
              id={inferIntegersId}
              type="checkbox"
              className="json-schema__checkbox"
              checked={inferIntegers}
              onChange={(e) => setInferIntegers(e.target.checked)}
            />
            Infer integer numbers
          </label>

          <label className="json-schema__checkbox-field" htmlFor={includeExamplesId}>
            <input
              id={includeExamplesId}
              type="checkbox"
              className="json-schema__checkbox"
              checked={includeExamples}
              onChange={(e) => setIncludeExamples(e.target.checked)}
            />
            Include leaf examples
          </label>
        </div>
      </div>

      {inferenceResult.error && (
        <div className="json-schema__alert" role="alert">
          <span>⚠️</span>
          <div>
            <strong>Invalid JSON Payload:</strong> {inferenceResult.error}
          </div>
        </div>
      )}

      <div className="json-schema__workspace">
        <div className="json-schema__pane">
          <div className="json-schema__pane-header">
            <label className="json-schema__pane-title" htmlFor={jsonInputId}>
              Sample JSON Input
            </label>
          </div>
          <textarea
            id={jsonInputId}
            className="json-schema__textarea"
            value={inputJson}
            onChange={(e) => setInputJson(e.target.value)}
            placeholder="Paste or type sample JSON payload..."
            spellCheck="false"
          />
        </div>

        <div className="json-schema__pane">
          <div className="json-schema__pane-header">
            <label className="json-schema__pane-title" htmlFor={schemaOutputId}>
              Generated JSON Schema Output
            </label>
          </div>
          <textarea
            id={schemaOutputId}
            className="json-schema__textarea"
            value={outputSchemaText}
            readOnly
            placeholder="Generated JSON Schema will appear here..."
            spellCheck="false"
          />
        </div>
      </div>

      <div className="json-schema__status-row">
        <p className="json-schema__count" role="status" aria-live="polite">
          {countReadoutText}
        </p>
        <p className="json-schema__feedback" role="status" aria-live="polite">
          {copyFeedback}
        </p>
      </div>
    </section>
  );
}
