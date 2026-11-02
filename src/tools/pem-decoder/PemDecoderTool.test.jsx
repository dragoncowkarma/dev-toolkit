import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';
import PemDecoderTool from './PemDecoderTool.jsx';

afterEach(() => cleanup());

describe('PemDecoderTool', () => {
  it('shows decoded blocks and renders their reused ASN.1 DER tree', () => {
    render(<PemDecoderTool />);
    fireEvent.change(screen.getByLabelText('PEM text'), {
      target: { value: '-----BEGIN CERTIFICATE-----\nMAMCAQE=\n-----END CERTIFICATE-----' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Parse PEM' }));
    expect(screen.getByLabelText('Decoded PEM block')).toHaveTextContent('CERTIFICATE (5 byte(s))');
    fireEvent.click(screen.getByRole('button', { name: 'View as ASN.1 DER' }));
    expect(screen.getByLabelText('Decoded ASN.1 DER tree')).toHaveTextContent('SEQUENCE');
    expect(screen.getByLabelText('Decoded ASN.1 DER tree')).toHaveTextContent('INTEGER');
  });

  it('shows malformed input errors inline', () => {
    render(<PemDecoderTool />);
    fireEvent.change(screen.getByLabelText('PEM text'), {
      target: { value: '-----BEGIN CERTIFICATE-----\ninvalid!\n-----END CERTIFICATE-----' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Parse PEM' }));
    expect(screen.getByRole('alert')).toHaveTextContent(/invalid Base64/i);
  });
});
