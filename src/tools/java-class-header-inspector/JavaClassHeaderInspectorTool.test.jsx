import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';
import JavaClassHeaderInspectorTool from './JavaClassHeaderInspectorTool.jsx';

afterEach(cleanup);

describe('JavaClassHeaderInspectorTool', () => {
  it('loads and displays the client-side sample', () => {
    render(<JavaClassHeaderInspectorTool />);

    fireEvent.click(screen.getByRole('button', { name: 'Load sample' }));

    expect(screen.getByRole('heading', { name: 'SampleClass.class' })).toBeInTheDocument();
    expect(screen.getByText('61 (Java 17)')).toBeInTheDocument();
    expect(screen.getByText('SampleClass')).toBeInTheDocument();
  });

  it('shows an accessible error when an invalid class file is chosen', async () => {
    render(<JavaClassHeaderInspectorTool />);
    const file = {
      name: 'invalid.class',
      arrayBuffer: async () => new Uint8Array([0, 0, 0, 0]).buffer,
    };
    const input = screen.getByLabelText('Choose a Java class file');

    Object.defineProperty(input, 'files', { value: [file], configurable: true });
    fireEvent.change(input);

    expect(await screen.findByRole('alert')).toHaveTextContent(/magic number/i);
    expect(screen.queryByRole('heading')).not.toBeInTheDocument();
  });
});
