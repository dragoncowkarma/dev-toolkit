import { act, cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import IsinValidatorTool from './IsinValidatorTool.jsx';

afterEach(() => {
  cleanup();
  vi.useRealTimers();
  vi.restoreAllMocks();
});

describe('IsinValidatorTool', () => {
  it('renders initial state with empty input and instructions', () => {
    render(<IsinValidatorTool />);

    const input = screen.getByLabelText(
      'International Securities Identification Number (ISIN)'
    );
    expect(input).toBeInTheDocument();
    expect(input).toHaveValue('');

    expect(
      screen.getByText(/Enter a 12-character International Securities Identification Number/i)
    ).toBeInTheDocument();

    expect(screen.getByRole('button', { name: 'Clear' })).toBeDisabled();
    expect(screen.getByRole('button', { name: 'Copy' })).toBeDisabled();
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
    expect(screen.queryByRole('status')).not.toBeInTheDocument();
  });

  it('validates an authentic ISIN correctly', () => {
    render(<IsinValidatorTool />);

    const input = screen.getByLabelText(
      'International Securities Identification Number (ISIN)'
    );
    fireEvent.change(input, { target: { value: 'US0378331005' } });

    expect(screen.queryByRole('alert')).not.toBeInTheDocument();

    const status = screen.getByRole('status');
    expect(status).toHaveTextContent(/Valid ISIN/i);
    expect(status).toHaveTextContent(/ISO 6166/i);

    expect(screen.getByText('US')).toBeInTheDocument();
    expect(screen.getByText('037833100')).toBeInTheDocument();
    expect(screen.getByText('30280378331005')).toBeInTheDocument();

    expect(input).toHaveAttribute('aria-invalid', 'false');
  });

  it('reports a checksum mismatch with expected check digit', () => {
    render(<IsinValidatorTool />);

    const input = screen.getByLabelText(
      'International Securities Identification Number (ISIN)'
    );
    fireEvent.change(input, { target: { value: 'US0378331006' } });

    const alert = screen.getByRole('alert');
    expect(alert).toBeInTheDocument();
    expect(alert).toHaveTextContent(/Checksum mismatch/i);
    expect(alert).toHaveTextContent(/Expected check digit 5, but got 6/i);

    expect(input).toHaveAttribute('aria-invalid', 'true');
    expect(screen.queryByText(/Valid ISIN/i)).not.toBeInTheDocument();
  });

  it('reports invalid length for inputs shorter or longer than 12 characters', () => {
    render(<IsinValidatorTool />);

    const input = screen.getByLabelText(
      'International Securities Identification Number (ISIN)'
    );

    // Too short (11 chars)
    fireEvent.change(input, { target: { value: 'US037833100' } });
    let alert = screen.getByRole('alert');
    expect(alert).toHaveTextContent(/Invalid length/i);
    expect(alert).toHaveTextContent(/must be exactly 12 characters/i);
    expect(input).toHaveAttribute('aria-invalid', 'true');

    // Too long (13 chars)
    fireEvent.change(input, { target: { value: 'US03783310055' } });
    alert = screen.getByRole('alert');
    expect(alert).toHaveTextContent(/Invalid length/i);
    expect(alert).toHaveTextContent(/must be exactly 12 characters/i);
    expect(input).toHaveAttribute('aria-invalid', 'true');
  });

  it('reports invalid characters and format errors', () => {
    render(<IsinValidatorTool />);

    const input = screen.getByLabelText(
      'International Securities Identification Number (ISIN)'
    );

    // Lowercase country code
    fireEvent.change(input, { target: { value: 'us0378331005' } });
    expect(screen.getByRole('alert')).toHaveTextContent(
      /First 2 characters must be uppercase letters/i
    );

    // Digits in country code
    fireEvent.change(input, { target: { value: '120378331005' } });
    expect(screen.getByRole('alert')).toHaveTextContent(
      /First 2 characters must be uppercase letters/i
    );

    // Non-alphanumeric character in NSIN
    fireEvent.change(input, { target: { value: 'US037833-005' } });
    expect(screen.getByRole('alert')).toHaveTextContent(
      /Characters 3–11 must be uppercase alphanumeric/i
    );

    // Non-numeric check digit
    fireEvent.change(input, { target: { value: 'US037833100X' } });
    expect(screen.getByRole('alert')).toHaveTextContent(
      /Character 12 must be a numeric check digit/i
    );
  });

  it('loads preset samples on click', () => {
    render(<IsinValidatorTool />);

    const sampleButton = screen.getByRole('button', { name: 'BMW AG (DE)' });
    fireEvent.click(sampleButton);

    const input = screen.getByLabelText(
      'International Securities Identification Number (ISIN)'
    );
    expect(input).toHaveValue('DE0005190003');
    expect(screen.getByRole('status')).toHaveTextContent(/Valid ISIN/i);
  });

  it('clears input when clicking Clear', () => {
    render(<IsinValidatorTool />);

    const input = screen.getByLabelText(
      'International Securities Identification Number (ISIN)'
    );
    fireEvent.change(input, { target: { value: 'US0378331005' } });
    expect(input).toHaveValue('US0378331005');

    const clearButton = screen.getByRole('button', { name: 'Clear' });
    fireEvent.click(clearButton);

    expect(input).toHaveValue('');
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
    expect(screen.queryByRole('status')).not.toBeInTheDocument();
  });

  it('copies ISIN text to clipboard and announces confirmation', async () => {
    const writeText = vi.fn().mockResolvedValue(undefined);
    Object.assign(navigator, { clipboard: { writeText } });

    render(<IsinValidatorTool />);

    const input = screen.getByLabelText(
      'International Securities Identification Number (ISIN)'
    );
    fireEvent.change(input, { target: { value: 'US0378331005' } });

    const copyBtn = screen.getByRole('button', { name: 'Copy' });
    await act(async () => {
      fireEvent.click(copyBtn);
    });

    expect(writeText).toHaveBeenCalledWith('US0378331005');

    const statuses = screen.getAllByRole('status');
    const politeStatus = statuses.find(
      (el) => el.getAttribute('aria-live') === 'polite' && el.textContent.includes('Copied')
    );
    expect(politeStatus).toBeInTheDocument();
  });

  it('reports clipboard copy failure gracefully', async () => {
    const writeText = vi.fn().mockRejectedValue(new Error('Permission denied'));
    Object.assign(navigator, { clipboard: { writeText } });

    render(<IsinValidatorTool />);

    const input = screen.getByLabelText(
      'International Securities Identification Number (ISIN)'
    );
    fireEvent.change(input, { target: { value: 'US0378331005' } });

    const copyBtn = screen.getByRole('button', { name: 'Copy' });
    await act(async () => {
      fireEvent.click(copyBtn);
    });

    expect(screen.getByRole('alert')).toHaveTextContent(/Failed to copy to clipboard/i);
  });
});
