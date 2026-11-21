import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import PsdHeaderInspectorTool from './PsdHeaderInspectorTool.jsx';

describe('PsdHeaderInspectorTool', () => {
  it('announces invalid pasted bytes as an accessible error', () => {
    render(<PsdHeaderInspectorTool />);
    fireEvent.change(screen.getByLabelText('Hexadecimal or Base64 bytes'), {
      target: { value: 'not PSD data' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Inspect pasted bytes' }));
    expect(screen.getByRole('alert')).toHaveTextContent(
      'Input must be valid hexadecimal or Base64 bytes.'
    );
  });
});
