import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';
import Asn1DecoderTool from './Asn1DecoderTool.jsx';

afterEach(() => {
  cleanup();
});

describe('Asn1DecoderTool', () => {
  it('renders malformed DER errors inline without throwing', () => {
    render(<Asn1DecoderTool />);

    fireEvent.change(screen.getByLabelText('DER hex'), { target: { value: '30 03 02 01' } });
    fireEvent.click(screen.getByRole('button', { name: 'Decode DER' }));

    expect(screen.getByRole('alert')).toHaveTextContent(/truncated/i);
    expect(screen.queryByLabelText('Decoded ASN.1 DER tree')).not.toBeInTheDocument();
  });

  it('renders a decoded tree and supports collapsing constructed values', () => {
    render(<Asn1DecoderTool />);

    fireEvent.change(screen.getByLabelText('DER hex'), { target: { value: '30 03 02 01 01' } });
    fireEvent.click(screen.getByRole('button', { name: 'Decode DER' }));

    const tree = screen.getByLabelText('Decoded ASN.1 DER tree');
    expect(tree).toHaveTextContent('SEQUENCE');
    expect(tree).toHaveTextContent('INTEGER');

    const button = screen.getByRole('button', { name: 'Collapse Universal SEQUENCE (tag 16)' });
    fireEvent.click(button);
    expect(button).toHaveAttribute('aria-expanded', 'false');
    expect(screen.queryByText('Universal INTEGER (tag 2)')).not.toBeInTheDocument();
  });
});
