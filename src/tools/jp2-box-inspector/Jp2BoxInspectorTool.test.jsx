import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import Jp2BoxInspectorTool from './Jp2BoxInspectorTool.jsx';
import * as jp2Utils from './jp2BoxInspector.utils.js';

vi.mock('./jp2BoxInspector.utils.js', async (importOriginal) => {
  const actual = await importOriginal();
  return {
    ...actual,
    readFileAsUint8Array: vi.fn(actual.readFileAsUint8Array),
  };
});

function selectFile(input, file) {
  Object.defineProperty(input, 'files', { value: [file], configurable: true });
  fireEvent.change(input);
}

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

describe('Jp2BoxInspectorTool', () => {
  it('inspects an uploaded valid JP2 file and renders ftyp, ihdr, colr, and res', async () => {
    render(<Jp2BoxInspectorTool />);

    const bytes = jp2Utils.buildSampleJp2Buffer({ width: 320, height: 240 });
    const file = new File([bytes], 'photo.jp2', { type: 'image/jp2' });
    const input = screen.getByLabelText('Upload a JP2, J2K, or J2C file');

    await act(async () => {
      selectFile(input, file);
    });

    await waitFor(() => {
      expect(screen.getByText(/320 × 240 px/)).toBeInTheDocument();
    });

    expect(screen.getByLabelText('File Type Box (ftyp)')).toBeInTheDocument();
    expect(screen.getByLabelText('Image Header Box (ihdr)')).toBeInTheDocument();
    expect(screen.getByLabelText('Colour Specification Box (colr)')).toBeInTheDocument();
    expect(screen.getByLabelText('Resolution Superbox (res )')).toBeInTheDocument();
    expect(screen.getByLabelText('JP2 Box Hierarchy')).toBeInTheDocument();
  });

  it('supports drag-and-drop and keyboard accessible dropzone activation', async () => {
    render(<Jp2BoxInspectorTool />);

    const dropzone = screen.getByRole('button', {
      name: /Drop a \.jp2, \.j2k, or \.j2c file here/i,
    });
    const input = screen.getByLabelText('Upload a JP2, J2K, or J2C file');
    const clickSpy = vi.spyOn(input, 'click');

    fireEvent.keyDown(dropzone, { key: 'Enter' });
    expect(clickSpy).toHaveBeenCalledTimes(1);

    const codestream = jp2Utils.buildSampleCodestreamBuffer();
    const droppedFile = new File([codestream], 'stream.j2k', {
      type: 'application/octet-stream',
    });

    await act(async () => {
      fireEvent.drop(dropzone, {
        dataTransfer: { files: [droppedFile] },
      });
    });

    const alert = await screen.findByRole('alert');
    expect(alert).toHaveTextContent(/SOC marker 0xFF4F/i);
    expect(alert).toHaveTextContent(/unavailable/i);
  });

  it('renders an accessible error alert for malformed JP2 files', async () => {
    render(<Jp2BoxInspectorTool />);

    const badFile = new File([new Uint8Array([1, 2, 3, 4])], 'broken.jp2', {
      type: 'image/jp2',
    });
    const input = screen.getByLabelText('Upload a JP2, J2K, or J2C file');

    await act(async () => {
      selectFile(input, badFile);
    });

    const alert = await screen.findByRole('alert');
    expect(alert).toHaveTextContent(/too short/i);
  });

  it('loads built-in samples, copies JSON report, and clears state', async () => {
    const writeText = vi.fn().mockResolvedValue(undefined);
    Object.assign(navigator, { clipboard: { writeText } });

    render(<Jp2BoxInspectorTool />);

    fireEvent.click(screen.getByRole('button', { name: 'Load ICC + BPCC Sample' }));

    expect(screen.getByLabelText('Bits Per Component Box (bpcc)')).toBeInTheDocument();
    expect(screen.getByText(/Restricted ICC Profile/)).toBeInTheDocument();

    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: 'Copy JSON' }));
    });

    expect(writeText).toHaveBeenCalledTimes(1);
    expect(screen.getByRole('status')).toHaveTextContent('Copied to clipboard');

    fireEvent.click(screen.getByRole('button', { name: 'Clear' }));
    expect(screen.queryByLabelText('Container Summary')).not.toBeInTheDocument();
  });
});
