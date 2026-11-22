import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';
import RegfHeaderInspectorTool from './RegfHeaderInspectorTool.jsx';

afterEach(cleanup);

describe('RegfHeaderInspectorTool', () => {
  it('offers local file, Hex, and Base64 input modes', () => {
    render(<RegfHeaderInspectorTool />);

    expect(screen.getByRole('button', { name: 'File' })).toHaveAttribute('aria-pressed', 'true');
    expect(screen.getByRole('button', { name: 'Hex' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Base64' })).toBeInTheDocument();
    expect(screen.getByLabelText('Choose a Windows Registry hive file')).toBeInTheDocument();
  });

  it('shows a clear truncated-input error for decoded text', () => {
    render(<RegfHeaderInspectorTool />);
    fireEvent.click(screen.getByRole('button', { name: 'Hex' }));
    fireEvent.change(screen.getByLabelText('Hexadecimal bytes'), {
      target: { value: '72 65 67 66' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Inspect header' }));

    expect(screen.getByRole('alert')).toHaveTextContent(
      'Truncated REGF header: expected at least 512 bytes, got 4.'
    );
  });
});
