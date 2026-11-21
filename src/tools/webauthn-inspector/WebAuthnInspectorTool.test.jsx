import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import WebAuthnInspectorTool from './WebAuthnInspectorTool.jsx';

describe('WebAuthnInspectorTool', () => {
  it('surfaces malformed CBOR input in an accessible alert', () => {
    render(<WebAuthnInspectorTool />);
    fireEvent.change(screen.getByLabelText('WebAuthn data'), { target: { value: 'oQ' } });
    fireEvent.click(screen.getByRole('button', { name: 'Inspect WebAuthn data' }));
    expect(screen.getByRole('alert')).toHaveTextContent(/Malformed attestationObject/);
  });
});
