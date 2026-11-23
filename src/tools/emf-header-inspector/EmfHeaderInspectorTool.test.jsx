import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { expect, it } from 'vitest';
import EmfHeaderInspectorTool from './EmfHeaderInspectorTool.jsx';

it('reports invalid input accessibly', () => {
  render(<EmfHeaderInspectorTool />);
  fireEvent.change(screen.getByLabelText('EMF file contents'), { target: { value: 'xyz' } });
  expect(screen.getByRole('alert')).toHaveTextContent(/hexadecimal/i);
});

it('ignores an older file read after text changes', async () => {
  render(<EmfHeaderInspectorTool />);
  let resolveRead;
  const file = new File(['x'], 'test.emf');
  file.arrayBuffer = () => new Promise((resolve) => { resolveRead = resolve; });
  fireEvent.change(screen.getByLabelText('Or upload an EMF file'), { target: { files: [file] } });
  fireEvent.change(screen.getByLabelText('EMF file contents'), { target: { value: 'xyz' } });
  resolveRead(new ArrayBuffer(88));
  await waitFor(() => expect(screen.getByRole('alert')).toHaveTextContent(/hexadecimal/i));
});
