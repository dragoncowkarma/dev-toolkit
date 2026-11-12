import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';
import CsrDecoderTool from './CsrDecoderTool.jsx';
describe('CsrDecoderTool', () => {
  afterEach(cleanup);
  it('loads and decodes a sample', () => {
    render(<CsrDecoderTool />);
    fireEvent.click(screen.getByRole('button', { name: /rsa.*sample/i }));
    expect(screen.getByText('Public Key')).toBeInTheDocument();
    expect(screen.getByText(/RSA Encryption/)).toBeInTheDocument();
  });
  it('shows an accessible error', () => {
    render(<CsrDecoderTool />);
    fireEvent.change(screen.getByLabelText(/pem certificate/i), { target: { value: 'bad' } });
    fireEvent.click(screen.getByRole('button', { name: /decode csr/i }));
    expect(screen.getByRole('alert')).toHaveTextContent(/Invalid CSR/);
  });
});
