import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';
import BencodeTool from './BencodeTool.jsx';

afterEach(() => cleanup());

describe('BencodeTool', () => {
  it('renders decoded values and reports malformed input accessibly', async () => {
    render(<BencodeTool />);

    const input = screen.getByLabelText('Bencode text or file');
    fireEvent.change(input, { target: { value: 'd3:foo3:bare' } });

    await waitFor(() => expect(screen.getByLabelText('Decoded tree')).toHaveValue(
      JSON.stringify({ foo: 'bar' }, null, 2)
    ));

    fireEvent.change(input, { target: { value: 'l4:spam' } });

    expect(await screen.findByRole('alert')).toHaveTextContent('Unterminated list');
  });

  it('encodes JSON input using canonical Bencode ordering', async () => {
    render(<BencodeTool />);

    fireEvent.click(screen.getByRole('button', { name: 'Encode' }));
    fireEvent.change(screen.getByLabelText('JSON input'), {
      target: { value: '{"zoo":"last","apple":"first"}' },
    });

    await waitFor(() => expect(screen.getByLabelText('Canonical Bencode')).toHaveValue(
      'd5:apple5:first3:zoo4:laste'
    ));
  });
});
