import { act, cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import JsonTypeGeneratorTool from './JsonTypeGeneratorTool.jsx';

afterEach(() => { cleanup(); vi.restoreAllMocks(); });

function enterJson(source = '{"id": 1, "name": "Ada"}') {
  fireEvent.change(screen.getByLabelText('Sample JSON'), { target: { value: source } });
}

describe('JsonTypeGeneratorTool', () => {
  it('generates declarations live and announces the result', () => {
    render(<JsonTypeGeneratorTool />);
    enterJson();
    expect(screen.getByLabelText('TypeScript declaration')).toHaveValue(
      'export interface Root {\n  id: number;\n  name: string;\n}',
    );
    expect(screen.getByRole('status')).toHaveAttribute('aria-live', 'polite');
  });

  it('applies every declaration control', () => {
    render(<JsonTypeGeneratorTool />);
    enterJson('[{"id": 1}, {"id": 2, "label": "two"}]');
    fireEvent.change(screen.getByLabelText('Root type name'), { target: { value: 'Item' } });
    fireEvent.change(screen.getByLabelText('Declaration style'), { target: { value: 'type' } });
    fireEvent.change(screen.getByLabelText('Indentation'), { target: { value: '    ' } });
    fireEvent.click(screen.getByLabelText('Optional properties'));
    fireEvent.click(screen.getByLabelText('Readonly properties'));
    expect(screen.getByLabelText('TypeScript declaration')).toHaveValue(
      'export type Item = {\n    readonly id: number;\n    readonly label: string | undefined;\n}[];',
    );
  });

  it('retains the last valid output while reporting invalid JSON accessibly', () => {
    render(<JsonTypeGeneratorTool />);
    enterJson();
    const prior = screen.getByLabelText('TypeScript declaration').value;
    enterJson('{"id": }');
    expect(screen.getByRole('alert')).toHaveTextContent('Invalid JSON:');
    expect(screen.getByLabelText('TypeScript declaration')).toHaveValue(prior);
  });

  it('copies output with polite feedback', async () => {
    const writeText = vi.fn().mockResolvedValue(undefined);
    Object.assign(navigator, { clipboard: { writeText } });
    render(<JsonTypeGeneratorTool />);
    enterJson();
    await act(async () => { fireEvent.click(screen.getByRole('button', { name: 'Copy TypeScript declaration' })); await Promise.resolve(); });
    expect(writeText).toHaveBeenCalled();
    expect(screen.getByText('Type declaration copied to clipboard.')).toHaveAttribute('aria-live', 'polite');
  });

  it('loads a representative sample and clears source and output', () => {
    render(<JsonTypeGeneratorTool />);
    fireEvent.click(screen.getByRole('button', { name: 'Load representative JSON sample' }));
    expect(screen.getByLabelText('Sample JSON')).toHaveValue(expect.stringContaining('Ada Lovelace'));
    expect(screen.getByLabelText('TypeScript declaration')).not.toHaveValue('');
    fireEvent.click(screen.getByRole('button', { name: 'Clear JSON input and generated declaration' }));
    expect(screen.getByLabelText('Sample JSON')).toHaveValue('');
    expect(screen.getByLabelText('TypeScript declaration')).toHaveValue('');
  });
});
