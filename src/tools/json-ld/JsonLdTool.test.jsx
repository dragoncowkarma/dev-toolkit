import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';
import JsonLdTool from './JsonLdTool.jsx';

afterEach(() => {
  cleanup();
});

describe('JsonLdTool', () => {
  it('inspects embedded Schema.org JSON-LD and renders its hierarchy', () => {
    render(<JsonLdTool />);
    fireEvent.change(screen.getByLabelText('JSON-LD document'), {
      target: {
        value: '<script type="application/ld+json">' +
          '{"@context":"https://schema.org","@type":"Article",' +
          '"author":{"@type":"Person"}}</script>',
      },
    });

    expect(screen.getByRole('status')).toHaveTextContent('Valid JSON structure.');
    expect(screen.getByLabelText('JSON-LD summary')).toHaveTextContent('Entities2');
    expect(screen.getByLabelText('JSON-LD summary')).toHaveTextContent('Schema.org');
    expect(screen.getByRole('heading', { name: 'Parsed hierarchy' })).toBeInTheDocument();
    expect(screen.getByText('@context')).toBeInTheDocument();
  });

  it('shows a parse error for invalid JSON', () => {
    render(<JsonLdTool />);
    fireEvent.change(screen.getByLabelText('JSON-LD document'), { target: { value: '{' } });

    expect(screen.getByRole('alert')).toHaveTextContent('Could not parse this JSON-LD.');
  });

  it('clears both the input and inspection output', () => {
    render(<JsonLdTool />);
    const input = screen.getByLabelText('JSON-LD document');
    fireEvent.change(input, { target: { value: '{"@type":"Thing"}' } });
    fireEvent.click(screen.getByRole('button', { name: 'Clear' }));

    expect(input).toHaveValue('');
    expect(screen.queryByLabelText('JSON-LD summary')).not.toBeInTheDocument();
  });
});
