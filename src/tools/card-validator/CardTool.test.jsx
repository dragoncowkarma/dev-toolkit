import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import CardTool from './CardTool.jsx';

afterEach(cleanup);

describe('CardTool', () => {
  it('loads a Visa sample and displays formatted, parsed validation results', () => {
    render(<CardTool />);
    fireEvent.click(screen.getByRole('button', { name: 'Load Visa sample' }));

    expect(screen.getByText('4111 1111 1111 1111')).toBeInTheDocument();
    expect(screen.getByText('Visa')).toBeInTheDocument();
    expect(screen.getByText('16')).toBeInTheDocument();
    expect(screen.getByText('1111')).toBeInTheDocument();
  });

  it('loads a Mastercard sample and detects the correct network', () => {
    render(<CardTool />);
    fireEvent.click(screen.getByRole('button', { name: 'Load Mastercard sample' }));

    expect(screen.getByText('Mastercard')).toBeInTheDocument();
  });

  it('loads an American Express sample and formats it 4-6-5', () => {
    render(<CardTool />);
    fireEvent.click(screen.getByRole('button', { name: 'Load American Express sample' }));

    expect(screen.getByText('3400 000000 00009')).toBeInTheDocument();
    expect(screen.getByText('American Express')).toBeInTheDocument();
  });

  it('shows a wired alert for a checksum failure and clears it', () => {
    render(<CardTool />);
    const input = screen.getByLabelText('Card number');
    fireEvent.change(input, { target: { value: '4111111111111112' } });

    expect(input).toHaveAttribute('aria-invalid', 'true');
    expect(input).toHaveAttribute('aria-describedby', 'card-validation-error');
    expect(screen.getByRole('alert')).toHaveTextContent('Luhn');

    fireEvent.click(screen.getByRole('button', { name: 'Clear card number' }));
    expect(input).toHaveValue('');
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
  });

  it('shows a role alert for a non-digit character after normalization', () => {
    render(<CardTool />);
    fireEvent.change(screen.getByLabelText('Card number'), {
      target: { value: '4111 1111 1111 111X' },
    });

    expect(screen.getByRole('alert')).toHaveTextContent('only digits');
  });

  it('shows a role alert for a card number under 8 digits', () => {
    render(<CardTool />);
    fireEvent.change(screen.getByLabelText('Card number'), { target: { value: '1234567' } });

    expect(screen.getByRole('alert')).toHaveTextContent('at least 8');
  });

  it('shows a role alert for a card number over 19 digits', () => {
    render(<CardTool />);
    fireEvent.change(screen.getByLabelText('Card number'), {
      target: { value: '12345678901234567890' },
    });

    expect(screen.getByRole('alert')).toHaveTextContent('at most 19');
  });

  it('computes a Luhn check digit and announces a copy operation', async () => {
    const writeText = vi.fn().mockResolvedValue(undefined);
    Object.assign(navigator, { clipboard: { writeText } });
    render(<CardTool />);
    fireEvent.change(screen.getByLabelText('Partial number (final digit omitted)'), {
      target: { value: '411111111111111' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Calculate check digit' }));

    expect(screen.getByLabelText('Constructed card details')).toHaveTextContent('1');
    fireEvent.click(screen.getByRole('button', { name: 'Copy constructed number' }));

    expect(await screen.findByRole('status')).toHaveTextContent('Constructed card number copied');
    expect(writeText).toHaveBeenCalledWith('4111111111111111');
  });

  it('shows a role alert for an invalid partial-number computation', () => {
    render(<CardTool />);
    fireEvent.change(screen.getByLabelText('Partial number (final digit omitted)'), {
      target: { value: '123' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Calculate check digit' }));

    expect(screen.getByRole('alert')).toHaveTextContent('at least 8');
  });

  it('clears the computation panel', () => {
    render(<CardTool />);
    const input = screen.getByLabelText('Partial number (final digit omitted)');
    fireEvent.change(input, { target: { value: '411111111111111' } });
    fireEvent.click(screen.getByRole('button', { name: 'Calculate check digit' }));
    fireEvent.click(screen.getByRole('button', { name: 'Clear computation' }));

    expect(input).toHaveValue('');
    expect(screen.queryByLabelText('Constructed card details')).not.toBeInTheDocument();
  });
});
