import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import JavaClassFileInspectorTool from './JavaClassFileInspectorTool.jsx';

describe('JavaClassFileInspectorTool', () => {
  it('announces malformed input accessibly', () => {
    render(<JavaClassFileInspectorTool />);
    fireEvent.change(screen.getByLabelText(/Hexadecimal or Base64/), {
      target: { value: '00000000' },
    });
    expect(screen.getByRole('alert')).toHaveTextContent(/magic number/);
  });
});
