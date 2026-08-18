import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';
import VinValidatorTool from './VinValidatorTool.jsx';

afterEach(cleanup);

describe('VinValidatorTool', () => {
  it('renders correctly and loads a sample VIN on button click', () => {
    render(<VinValidatorTool />);

    expect(
      screen.getByRole('heading', { level: 2, name: /VIN Validator & Decoder/i }),
    ).toBeInTheDocument();

    const sampleButton = screen.getByRole('button', { name: /Load USA \(Honda 2017\)/i });
    fireEvent.click(sampleButton);

    const input = screen.getByLabelText(/Vehicle Identification Number/i);
    expect(input).toHaveValue('1HG CR2F8 5 HA000000');

    const details = screen.getByLabelText('Validated VIN details');
    expect(details).toBeInTheDocument();
    expect(details).toHaveTextContent('Valid North American VIN');
    expect(details).toHaveTextContent('North America (United States)');
    expect(details).toHaveTextContent('1987 or 2017');
  });

  it('loads an X check digit sample and displays valid status', () => {
    render(<VinValidatorTool />);

    const sampleButton = screen.getByRole('button', { name: /Load USA \(Ford 2017 - X check\)/i });
    fireEvent.click(sampleButton);

    const details = screen.getByLabelText('Validated VIN details');
    expect(details).toHaveTextContent('Valid North American VIN');
    expect(details).toHaveTextContent("Expected: 'X'");
  });

  it('handles invalid check digit and displays accessible error alert', () => {
    render(<VinValidatorTool />);

    const input = screen.getByLabelText(/Vehicle Identification Number/i);
    fireEvent.change(input, { target: { value: '1HGCR2F83HA000000' } });

    expect(input).toHaveAttribute('aria-invalid', 'true');
    expect(input).toHaveAttribute('aria-describedby', 'vin-validation-error');

    const alert = screen.getByRole('alert');
    expect(alert).toHaveTextContent("Check digit mismatch: position 9 is '3'");
  });

  it('handles disallowed character I and displays appropriate error', () => {
    render(<VinValidatorTool />);

    const input = screen.getByLabelText(/Vehicle Identification Number/i);
    fireEvent.change(input, { target: { value: '1HGCR2F85HI000000' } });

    expect(screen.getByRole('alert')).toHaveTextContent("Disallowed letter 'I' found");
  });

  it('clears input when Clear VIN button is clicked', () => {
    render(<VinValidatorTool />);

    const input = screen.getByLabelText(/Vehicle Identification Number/i);
    fireEvent.change(input, { target: { value: '1HGCR2F85HA000000' } });
    expect(input).toHaveValue('1HGCR2F85HA000000');

    fireEvent.click(screen.getByRole('button', { name: 'Clear VIN' }));
    expect(input).toHaveValue('');
  });
});
