import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';
import EmailAuthParserTool from './EmailAuthParserTool.jsx';

afterEach(cleanup);

describe('EmailAuthParserTool', () => {
  it('renders the parser controls and updates the selected record type', () => {
    render(<EmailAuthParserTool />);

    expect(screen.getByText('Paste a TXT record to inspect it.')).toBeInTheDocument();
    expect(screen.getByLabelText('Record type')).toHaveValue('auto');

    fireEvent.change(screen.getByLabelText('Record type'), { target: { value: 'dmarc' } });

    expect(screen.getByLabelText('Record type')).toHaveValue('dmarc');
  });

  it('clears the input and parsed results', () => {
    render(<EmailAuthParserTool />);
    const input = screen.getByLabelText('DNS TXT record');

    fireEvent.change(input, { target: { value: 'v=DMARC1; p=reject' } });
    expect(screen.getByRole('status')).toHaveTextContent('No validation problems found.');

    fireEvent.click(screen.getByRole('button', { name: 'Clear' }));

    expect(input).toHaveValue('');
    expect(screen.getByText('Paste a TXT record to inspect it.')).toBeInTheDocument();
  });

  it('displays validation errors and warnings', () => {
    render(<EmailAuthParserTool />);

    fireEvent.change(screen.getByLabelText('DNS TXT record'), {
      target: { value: 'v=DMARC1; p=discard; pct=101' },
    });

    expect(screen.getByRole('heading', { name: 'Errors' })).toBeInTheDocument();
    expect(screen.getByText('DMARC p= must be none, quarantine, or reject.')).toBeInTheDocument();
    expect(screen.getByText('DMARC pct= must be an integer from 0 to 100.')).toBeInTheDocument();
  });
});
