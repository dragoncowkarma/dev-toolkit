import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import VmdkHeaderInspectorTool from './VmdkHeaderInspectorTool.jsx';
import * as utils from './vmdkHeaderInspector.utils.js';

vi.mock('./vmdkHeaderInspector.utils.js', async (importOriginal) => {
  const actual = await importOriginal();
  return {
    ...actual,
    readHeaderBytesFromFile: vi.fn(actual.readHeaderBytesFromFile),
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

describe('VmdkHeaderInspectorTool', () => {
  it('renders an aria-live polite results region and empty guidance initially', () => {
    const { container } = render(<VmdkHeaderInspectorTool />);
    const liveRegion = container.querySelector('.vmdk-results');
    expect(liveRegion).toHaveAttribute('aria-live', 'polite');
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
  });

  it('loads a sample VMDK header and renders all parsed sparse extent fields', () => {
    render(<VmdkHeaderInspectorTool />);

    fireEvent.click(screen.getByRole('button', { name: 'Load Sample' }));

    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
    expect(screen.getByText('magicNumber')).toBeInTheDocument();
    expect(screen.getByText('0x564D444B ("KDMV")')).toBeInTheDocument();
    expect(screen.getByText('version')).toBeInTheDocument();
    expect(screen.getByText('flags')).toBeInTheDocument();
    expect(screen.getByText('capacity')).toBeInTheDocument();
    expect(screen.getByText('grainSize')).toBeInTheDocument();
    expect(screen.getByText('descriptorOffset')).toBeInTheDocument();
    expect(screen.getByText('descriptorSize')).toBeInTheDocument();
    expect(screen.getByText('numGTEsPerGT')).toBeInTheDocument();
    expect(screen.getByText('rgdOffset')).toBeInTheDocument();
    expect(screen.getByText('gdOffset')).toBeInTheDocument();
    expect(screen.getByText('overHead')).toBeInTheDocument();
    expect(screen.getByText('uncleanShutdown')).toBeInTheDocument();
    expect(screen.getByText('compressAlgorithm')).toBeInTheDocument();
  });

  it('parses Base64-encoded VMDK headers when switched to Base64 mode', () => {
    render(<VmdkHeaderInspectorTool />);

    fireEvent.click(screen.getByRole('button', { name: 'Base64' }));
    const sampleBase64 = utils.bytesToBase64(
      utils.buildSampleVmdkHeader({ version: 3, compressAlgorithm: 1 }),
    );

    fireEvent.change(screen.getByLabelText('Base64 Header Input'), {
      target: { value: sampleBase64 },
    });

    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
    expect(screen.getByText('Version 3')).toBeInTheDocument();
    expect(screen.getByText('1 (DEFLATE)')).toBeInTheDocument();
  });

  it('displays a role="alert" error for truncated and wrong-magic inputs without crashing', () => {
    render(<VmdkHeaderInspectorTool />);

    const textarea = screen.getByLabelText('Raw Hex Header Input');
    fireEvent.change(textarea, { target: { value: '4B 44 4D 56 01 00 00 00' } });
    expect(screen.getByRole('alert')).toHaveTextContent(/512 bytes/i);

    const wrongMagicHex = utils.bytesToHex(
      utils.buildSampleVmdkHeader({ magicNumber: 0x11223344 }),
    );
    fireEvent.change(textarea, { target: { value: wrongMagicHex } });
    expect(screen.getByRole('alert')).toHaveTextContent(/Invalid VMDK magic number/i);
  });

  it('inspects uploaded VMDK files by reading only the 512-byte header', async () => {
    render(<VmdkHeaderInspectorTool />);

    const diskBytes = new Uint8Array(1024);
    diskBytes.set(utils.buildSampleVmdkHeader({ version: 2, uncleanShutdown: 1 }), 0);
    const file = new File([diskBytes], 'vm-disk.vmdk', { type: 'application/octet-stream' });

    const fileInput = screen.getByLabelText('Upload a VMDK file to inspect its header');
    await act(async () => selectFile(fileInput, file));

    await waitFor(() => expect(screen.getByText('vm-disk.vmdk')).toBeInTheDocument());
    expect(screen.getByText(/Read 512 of 512 header bytes/)).toBeInTheDocument();
    expect(screen.getByText('Version 2')).toBeInTheDocument();
    expect(screen.getByText('Unclean shutdown detected')).toBeInTheDocument();
  });

  it('ignores stale file reads that resolve after Clear', async () => {
    let resolveRead;
    const pending = new Promise((res) => {
      resolveRead = res;
    });
    utils.readHeaderBytesFromFile.mockReturnValueOnce(pending);

    render(<VmdkHeaderInspectorTool />);
    const file = new File([utils.buildSampleVmdkHeader()], 'stale.vmdk');
    selectFile(screen.getByLabelText('Upload a VMDK file to inspect its header'), file);

    fireEvent.click(screen.getByRole('button', { name: 'Clear' }));

    await act(async () => {
      resolveRead({
        ok: true,
        bytes: utils.buildSampleVmdkHeader(),
        totalFileSize: 512,
      });
      await Promise.resolve();
    });

    expect(screen.queryByText('stale.vmdk')).not.toBeInTheDocument();
    expect(screen.queryByText('magicNumber')).not.toBeInTheDocument();
  });

  it('copies JSON summary and reports clipboard failures cleanly', async () => {
    const writeText = vi.fn().mockResolvedValueOnce(undefined).mockRejectedValueOnce(new Error());
    Object.assign(navigator, { clipboard: { writeText } });

    render(<VmdkHeaderInspectorTool />);
    fireEvent.click(screen.getByRole('button', { name: 'Load Sample' }));

    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: 'Copy JSON' }));
    });
    expect(writeText).toHaveBeenCalledTimes(1);
    expect(screen.getByRole('status')).toHaveTextContent('Copied VMDK header summary');

    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: /Copied|Copy JSON/ }));
    });
    expect(await screen.findByRole('alert')).toHaveTextContent(
      'Failed to copy summary to clipboard.',
    );
    expect(screen.getByText('magicNumber')).toBeInTheDocument();
  });
});
