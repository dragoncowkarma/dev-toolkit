import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import JsonSchemaTool from './JsonSchemaTool.jsx';

describe('JsonSchemaTool Component', () => {
  it('renders initial state with sample JSON and generated schema', () => {
    render(<JsonSchemaTool />);

    const inputArea = screen.getByLabelText('Sample JSON Input');
    const outputArea = screen.getByLabelText('Generated JSON Schema Output');

    expect(inputArea.value).toContain('Jane Doe');
    expect(outputArea.value).toContain('https://json-schema.org/draft/2020-12/schema');
    expect(outputArea.value).toContain('"user"');
  });

  it('updates generated schema live when sample JSON input changes', () => {
    render(<JsonSchemaTool />);

    const inputArea = screen.getByLabelText('Sample JSON Input');
    const outputArea = screen.getByLabelText('Generated JSON Schema Output');

    fireEvent.change(inputArea, { target: { value: '{"count": 42}' } });

    expect(outputArea.value).toContain('"count"');
    expect(outputArea.value).toContain('"type": "number"');
  });

  it('updates draft schema URI when draft option changes', () => {
    render(<JsonSchemaTool />);

    const draftSelect = screen.getByLabelText('JSON Schema Draft Standard');
    const outputArea = screen.getByLabelText('Generated JSON Schema Output');

    fireEvent.change(draftSelect, { target: { value: 'draft-07' } });

    expect(outputArea.value).toContain('http://json-schema.org/draft-07/schema#');
  });

  it('toggles required properties when requiredMode changes', () => {
    render(<JsonSchemaTool />);

    const requiredSelect = screen.getByLabelText('Required Properties Mode');
    const outputArea = screen.getByLabelText('Generated JSON Schema Output');

    expect(outputArea.value).toContain('"required"');

    fireEvent.change(requiredSelect, { target: { value: 'none' } });

    expect(outputArea.value).not.toContain('"required"');
  });

  it('infers integer type when inferIntegers checkbox is checked', () => {
    render(<JsonSchemaTool />);

    const inputArea = screen.getByLabelText('Sample JSON Input');
    const inferIntegersCheck = screen.getByLabelText('Infer integer types');
    const outputArea = screen.getByLabelText('Generated JSON Schema Output');

    fireEvent.change(inputArea, { target: { value: '{"age": 25}' } });
    expect(outputArea.value).toContain('"type": "number"');

    fireEvent.click(inferIntegersCheck);
    expect(outputArea.value).toContain('"type": "integer"');
  });

  it('attaches leaf examples when includeExamples checkbox is checked', () => {
    render(<JsonSchemaTool />);

    const inputArea = screen.getByLabelText('Sample JSON Input');
    const includeExamplesCheck = screen.getByLabelText('Include examples in leaf schemas');
    const outputArea = screen.getByLabelText('Generated JSON Schema Output');

    fireEvent.change(inputArea, { target: { value: '{"city": "Seoul"}' } });
    expect(outputArea.value).not.toContain('"examples"');

    fireEvent.click(includeExamplesCheck);
    expect(outputArea.value).toContain('"examples"');
    expect(outputArea.value).toContain('"Seoul"');
  });

  it('adds title to schema when title input is provided', () => {
    render(<JsonSchemaTool />);

    const titleInput = screen.getByLabelText('Root Schema Title');
    const outputArea = screen.getByLabelText('Generated JSON Schema Output');

    fireEvent.change(titleInput, { target: { value: 'User Profile' } });

    expect(outputArea.value).toContain('"title": "User Profile"');
  });

  it('shows role="alert" on invalid JSON while preserving output pane', () => {
    render(<JsonSchemaTool />);

    const inputArea = screen.getByLabelText('Sample JSON Input');
    const outputArea = screen.getByLabelText('Generated JSON Schema Output');

    const previousOutput = outputArea.value;

    fireEvent.change(inputArea, { target: { value: '{"broken": }' } });

    const alertElement = screen.getByRole('alert');
    expect(alertElement).toBeDefined();
    expect(alertElement.textContent).toContain('Invalid JSON Payload');

    expect(outputArea.value).toBe(previousOutput);
  });

  it('loads preset on clicking Sample JSON button', () => {
    render(<JsonSchemaTool />);

    const clearButton = screen.getByRole('button', { name: /Clear sample JSON input/i });
    fireEvent.click(clearButton);

    const inputArea = screen.getByLabelText('Sample JSON Input');
    expect(inputArea.value).toBe('');

    const presetButton = screen.getByRole('button', { name: /Load sample JSON preset/i });
    fireEvent.click(presetButton);

    expect(inputArea.value).toContain('Jane Doe');
  });

  it('clears inputs when clicking Clear button', () => {
    render(<JsonSchemaTool />);

    const inputArea = screen.getByLabelText('Sample JSON Input');
    const outputArea = screen.getByLabelText('Generated JSON Schema Output');

    const clearButton = screen.getByRole('button', { name: /Clear sample JSON input/i });
    fireEvent.click(clearButton);

    expect(inputArea.value).toBe('');
    expect(outputArea.value).toBe('');
  });

  it('copies generated schema and displays copy feedback', async () => {
    const writeTextMock = vi.fn().mockResolvedValue(undefined);
    Object.assign(navigator, {
      clipboard: {
        writeText: writeTextMock,
      },
    });

    render(<JsonSchemaTool />);

    const copyButton = screen.getByRole('button', { name: /Copy generated JSON schema/i });
    fireEvent.click(copyButton);

    expect(writeTextMock).toHaveBeenCalled();

    await waitFor(() => {
      expect(screen.getByText('Copied schema to clipboard!')).toBeDefined();
    });
  });

  it('renders count readout in status region', () => {
    render(<JsonSchemaTool />);

    const inputArea = screen.getByLabelText('Sample JSON Input');
    fireEvent.change(inputArea, { target: { value: '{"a": 1, "b": 2}' } });

    const statusRegion = screen.getByText(/2 properties across 1 object/i);
    expect(statusRegion).toBeDefined();
    expect(statusRegion.getAttribute('role')).toBe('status');
    expect(statusRegion.getAttribute('aria-live')).toBe('polite');
  });
});
