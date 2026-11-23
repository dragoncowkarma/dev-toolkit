import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { expect, it } from 'vitest';
import WmfHeaderInspectorTool from './WmfHeaderInspectorTool.jsx';

it('reports invalid input accessibly and renders valid WMF headers', () => {
  render(<WmfHeaderInspectorTool />);
  const textarea = screen.getByLabelText('WMF file contents');
  fireEvent.change(textarea, { target: { value: 'xyz' } });
  expect(screen.getByRole('alert')).toHaveTextContent(/hexadecimal/i);

  const validNonPlaceableHex = '0100 0900 0003 09000000 0200 05000000 0000';
  fireEvent.change(textarea, { target: { value: validNonPlaceableHex } });
  expect(screen.getByRole('heading', { name: 'Header summary' })).toBeInTheDocument();
  expect(screen.getByText('No (standard WMF)')).toBeInTheDocument();
});

it('ignores an older file read after text changes', async () => {
  render(<WmfHeaderInspectorTool />);
  let resolveRead;
  const file = new File(['x'], 'test.wmf');
  file.arrayBuffer = () => new Promise((resolve) => { resolveRead = resolve; });
  fireEvent.change(screen.getByLabelText('Or upload a WMF file'), { target: { files: [file] } });
  fireEvent.change(screen.getByLabelText('WMF file contents'), { target: { value: 'xyz' } });
  resolveRead(new ArrayBuffer(40));
  await waitFor(() => expect(screen.getByRole('alert')).toHaveTextContent(/hexadecimal/i));
});
