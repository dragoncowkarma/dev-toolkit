import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { beforeEach, expect, it, vi } from 'vitest';
import UdfVolumeInspectorTool from './UdfVolumeInspectorTool.jsx';
import { inspectUdf } from './udf.utils.js';

vi.mock('./udf.utils.js', () => ({ inspectUdf: vi.fn() }));
beforeEach(() => vi.resetAllMocks());
it('clears a previous result when a new selection fails', async () => {
  inspectUdf.mockResolvedValueOnce({ fileSize: 123, nsr: 'NSR03',
    anchor: { identifier: 2, checksum: 1, serial: 1, location: 256 },
    extentLocation: 257, extentLength: 2048, primary: null, revision: null });
  inspectUdf.mockRejectedValueOnce(new Error('Bad descriptor tag checksum.'));
  render(<UdfVolumeInspectorTool />);
  const input = screen.getByLabelText('Select an image file');
  fireEvent.change(input, { target: { files: [new File(['a'], 'good.udf')] } });
  expect(await screen.findByText('good.udf')).toBeInTheDocument();
  fireEvent.change(input, { target: { files: [new File(['b'], 'bad.udf')] } });
  await waitFor(() => expect(screen.getByRole('alert')).toHaveTextContent('checksum'));
  expect(screen.queryByText('good.udf')).not.toBeInTheDocument();
});
