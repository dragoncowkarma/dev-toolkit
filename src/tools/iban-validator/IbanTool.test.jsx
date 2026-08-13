import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import IbanTool from './IbanTool.jsx';

afterEach(cleanup);

describe('IbanTool', () => {
  it('loads a sample and displays formatted, parsed validation results', () => {
    render(<IbanTool />);
    fireEvent.click(screen.getByRole('button', { name: 'Load Germany sample' }));

    expect(screen.getByText('DE89 3704 0044 0532 0130 00')).toBeInTheDocument();
    expect(screen.getByText('370400440532013000')).toBeInTheDocument();
    expect(screen.getByText('89')).toBeInTheDocument();
  });

  it('shows a wired alert for a checksum failure and clears it', () => {
    render(<IbanTool />);
    const input = screen.getByLabelText('IBAN');
    fireEvent.change(input, { target: { value: 'DE89370400440532013001' } });

    expect(input).toHaveAttribute('aria-invalid', 'true');
    expect(input).toHaveAttribute('aria-describedby', 'iban-validation-error');
    expect(screen.getByRole('alert')).toHaveTextContent('checksum failed');

    fireEvent.click(screen.getByRole('button', { name: 'Clear IBAN' }));
    expect(input).toHaveValue('');
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
  });

  it('constructs German check digits and announces a copy operation', async () => {
    const writeText = vi.fn().mockResolvedValue(undefined);
    Object.assign(navigator, { clipboard: { writeText } });
    render(<IbanTool />);
    fireEvent.change(screen.getByLabelText('Country code'), { target: { value: 'DE' } });
    fireEvent.change(screen.getByLabelText('BBAN'), { target: { value: '370400440532013000' } });
    fireEvent.click(screen.getByRole('button', { name: 'Calculate check digits' }));

    expect(screen.getByLabelText('Constructed IBAN details')).toHaveTextContent('89');
    fireEvent.click(screen.getByRole('button', { name: 'Copy constructed IBAN' }));

    expect(await screen.findByRole('status')).toHaveTextContent('Constructed IBAN copied');
    expect(writeText).toHaveBeenCalledWith('DE89370400440532013000');
  });

  it('shows a role alert for an unrecognized construction country', () => {
    render(<IbanTool />);
    fireEvent.change(screen.getByLabelText('Country code'), { target: { value: 'ZZ' } });
    fireEvent.change(screen.getByLabelText('BBAN'), { target: { value: '123456789012345678' } });
    fireEvent.click(screen.getByRole('button', { name: 'Calculate check digits' }));

    expect(screen.getByRole('alert')).toHaveTextContent('unrecognized IBAN country code');
  });
});
