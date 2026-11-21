import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';
import DicomHeaderInspector from './DicomHeaderInspectorTool.jsx';

afterEach(cleanup);

describe('DicomHeaderInspector', () => {
  it('shows an accessible error for malformed file input', async () => {
    render(<DicomHeaderInspector />);
    const input = screen.getByLabelText('Choose a DICOM file');
    const invalidFile = new File([new Uint8Array(131)], 'broken.dcm', {
      type: 'application/dicom',
    });
    Object.defineProperty(invalidFile, 'arrayBuffer', {
      value: () => Promise.resolve(new ArrayBuffer(131)),
    });
    Object.defineProperty(input, 'files', { value: [invalidFile], configurable: true });

    fireEvent.change(input);

    expect(await screen.findByRole('alert'))
      .toHaveTextContent('shorter than the required 132');
  });

  it('loads the client-side sample', () => {
    render(<DicomHeaderInspector />);

    fireEvent.click(screen.getByRole('button', { name: 'Load Sample DICOM' }));

    expect(screen.getByText('sample.dcm')).toBeInTheDocument();
    expect(screen.getByText('Sample^Patient')).toBeInTheDocument();
  });
});
