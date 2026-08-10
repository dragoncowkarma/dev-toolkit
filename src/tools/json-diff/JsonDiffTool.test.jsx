import { act, cleanup, fireEvent, render, screen, within } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import JsonDiffTool from './JsonDiffTool.jsx';

function fillInputs(original, changed) {
  fireEvent.change(screen.getByLabelText('Original JSON'), { target: { value: original } });
  fireEvent.change(screen.getByLabelText('Changed JSON'), { target: { value: changed } });
}

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

describe('JsonDiffTool', () => {
  it('renders path-based changes and an accessible summary', () => {
    render(<JsonDiffTool />);
    fillInputs('{"user":{"name":"Ada"},"old":true}',
      '{"user":{"name":"Grace"},"new":true}');

    expect(screen.getByText('$.user.name')).toBeInTheDocument();
    expect(screen.getByText('1 added, 1 removed, 1 changed')).toHaveAttribute(
      'aria-live',
      'polite',
    );
    expect(screen.getAllByText('changed')).toHaveLength(1);
  });

  it('reports structurally equal reordered JSON without changes', () => {
    render(<JsonDiffTool />);
    fillInputs('{"a":1,"b":2}', '{\n  "b": 2, "a": 1\n}');

    expect(screen.getByText('The JSON documents are structurally equal.')).toBeInTheDocument();
    expect(screen.getByText('0 added, 0 removed, 0 changed')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Copy diff result to clipboard' })).toBeDisabled();
  });

  it('shows side-specific accessible alerts for malformed JSON', () => {
    render(<JsonDiffTool />);
    fillInputs('{', ']');

    const alerts = screen.getAllByRole('alert');
    expect(alerts).toHaveLength(2);
    expect(alerts[0]).toHaveTextContent('Invalid original JSON:');
    expect(alerts[1]).toHaveTextContent('Invalid changed JSON:');
  });

  it('loads and clears both sample documents', () => {
    render(<JsonDiffTool />);
    const sampleButton = screen.getByRole('button', { name: 'Load sample' });
    fireEvent.click(sampleButton);

    expect(sampleButton).toHaveAttribute('aria-pressed', 'true');
    expect(screen.getByLabelText('Original JSON').value).toContain('query');
    expect(screen.getByLabelText('Changed JSON').value).toContain('compare');

    fireEvent.click(screen.getByRole('button', { name: 'Clear inputs' }));
    expect(screen.getByLabelText('Original JSON')).toHaveValue('');
    expect(screen.getByLabelText('Changed JSON')).toHaveValue('');
    expect(sampleButton).toHaveAttribute('aria-pressed', 'false');
  });

  it('copies formatted change records and announces feedback', async () => {
    const writeText = vi.fn().mockResolvedValue(undefined);
    Object.assign(navigator, { clipboard: { writeText } });
    render(<JsonDiffTool />);
    fillInputs('{"count":1}', '{"count":2}');

    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: 'Copy diff result to clipboard' }));
      await Promise.resolve();
    });

    expect(JSON.parse(writeText.mock.calls[0][0])).toEqual([
      { path: '$.count', type: 'changed', oldValue: 1, newValue: 2 },
    ]);
    expect(screen.getByText('Diff result copied to clipboard.')).toHaveAttribute(
      'aria-live',
      'polite',
    );
  });

  it('renders formatted old and new values in the changed record', () => {
    render(<JsonDiffTool />);
    fillInputs('{"value":{"a":1}}', '{"value":[1,2]}');

    const change = screen.getByRole('listitem');
    expect(within(change).getByText('Old value')).toBeInTheDocument();
    expect(within(change).getByText('New value')).toBeInTheDocument();
    expect(change).toHaveTextContent('"a": 1');
  });
});
