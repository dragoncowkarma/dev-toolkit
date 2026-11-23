import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import RadianceHdrHeaderInspectorTool from './RadianceHdrHeaderInspectorTool.jsx';
import * as hdrUtils from './radianceHdrHeaderInspector.utils.js';

vi.mock('./radianceHdrHeaderInspector.utils.js', async (importOriginal) => {
  const actual = await importOriginal();
  return {
    ...actual,
    readLeadingHeaderBytes: vi.fn(actual.readLeadingHeaderBytes),
  };
});

function selectFile(input, file) {
  Object.defineProperty(input, 'files', { value: [file], configurable: true });
  fireEvent.change(input);
}

function createDeferred() {
  let resolve;
  let reject;
  const promise = new Promise((res, rej) => {
    resolve = res;
    reject = rej;
  });
  return { promise, resolve, reject };
}

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

describe('RadianceHdrHeaderInspectorTool', () => {
  it('presents insufficient scanline data as unknown rather than flat', async () => {
    render(<RadianceHdrHeaderInspectorTool />);
    const text = '#?RADIANCE\nFORMAT=32-bit_rle_rgbe\n\n-Y 4 +X 64\n';
    const file = new File([text], 'header-only.hdr');
    await act(async () => {
      selectFile(screen.getByLabelText('Upload a Radiance HDR file'), file);
    });
    await waitFor(() => {
      expect(screen.getByTestId('hdr-scanline-encoding')).toHaveTextContent('unknown');
    });
    expect(screen.getByTestId('hdr-scanline-encoding')).not.toHaveTextContent('flat');
    expect(screen.getByTestId('hdr-scanline-unknown-note')).toHaveTextContent(
      /not verified/i,
    );
  });

  it('parses and displays a valid uploaded Radiance HDR file', async () => {
    render(<RadianceHdrHeaderInspectorTool />);

    const sampleBytes = hdrUtils.buildSampleRadianceHdrBytes('rgbe');
    const file = new File([sampleBytes], 'studio.hdr', {
      type: 'image/vnd.radiance',
    });
    const fileInput = screen.getByLabelText('Upload a Radiance HDR file');

    await act(async () => {
      selectFile(fileInput, file);
    });

    await waitFor(() => {
      expect(screen.getByTestId('hdr-magic')).toHaveTextContent('#?RADIANCE');
    });
    expect(screen.getByTestId('hdr-format')).toHaveTextContent('32-bit_rle_rgbe');
    expect(screen.getByTestId('hdr-dimensions')).toHaveTextContent('768 × 512');
    expect(screen.getByTestId('hdr-orientation')).toHaveTextContent('-Y +X');
    expect(screen.getByTestId('hdr-scanline-encoding')).toHaveTextContent('new RLE');
    expect(screen.getAllByText('SOFTWARE')).toHaveLength(1);
    expect(screen.getAllByText('COLORCORR')).toHaveLength(1);
    expect(screen.getAllByText('PRIMARIES')).toHaveLength(1);
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
  });

  it('shows errors for invalid magic, unsupported format, and truncated header', async () => {
    render(<RadianceHdrHeaderInspectorTool />);
    const fileInput = screen.getByLabelText('Upload a Radiance HDR file');

    // 1. Missing magic line
    const badMagicFile = new File(['NOT_AN_HDR\n'], 'bad.hdr');
    await act(async () => {
      selectFile(fileInput, badMagicFile);
    });
    expect(await screen.findByRole('alert')).toHaveTextContent(
      /Missing Radiance HDR magic line/,
    );

    // 2. Unsupported format
    const badFormatFile = new File(
      ['#?RADIANCE\nFORMAT=8-bit_png\n\n-Y 10 +X 10\n'],
      'unsupported.hdr',
    );
    await act(async () => {
      selectFile(fileInput, badFormatFile);
    });
    await waitFor(() => {
      expect(screen.getByRole('alert')).toHaveTextContent(
        /Unsupported Radiance HDR format "8-bit_png"/,
      );
    });

    // 3. Truncated header
    const truncatedFile = new File(
      ['#?RADIANCE\nFORMAT=32-bit_rle_rgbe\n'],
      'truncated.hdr',
    );
    await act(async () => {
      selectFile(fileInput, truncatedFile);
    });
    await waitFor(() => {
      expect(screen.getByRole('alert')).toHaveTextContent(
        /Truncated Radiance HDR header/,
      );
    });
  });

  it('ignores a file read that finishes after Clear', async () => {
    const deferred = createDeferred();
    hdrUtils.readLeadingHeaderBytes.mockReturnValueOnce(deferred.promise);

    render(<RadianceHdrHeaderInspectorTool />);

    const fileInput = screen.getByLabelText('Upload a Radiance HDR file');
    const file = new File([hdrUtils.buildSampleRadianceHdrBytes('rgbe')], 'slow.hdr');

    selectFile(fileInput, file);
    fireEvent.click(screen.getByRole('button', { name: 'Clear' }));

    await act(async () => {
      deferred.resolve(hdrUtils.buildSampleRadianceHdrBytes('rgbe'));
      await Promise.resolve();
    });

    expect(screen.queryByTestId('hdr-format')).not.toBeInTheDocument();
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
  });

  it('ignores stale out-of-order reads when older read resolves after newer read', async () => {
    const deferredOld = createDeferred();
    const deferredNew = createDeferred();
    hdrUtils.readLeadingHeaderBytes
      .mockReturnValueOnce(deferredOld.promise)
      .mockReturnValueOnce(deferredNew.promise);

    render(<RadianceHdrHeaderInspectorTool />);

    const fileInput = screen.getByLabelText('Upload a Radiance HDR file');
    const oldFile = new File(
      [hdrUtils.buildSampleRadianceHdrBytes('rgbe')],
      'first-rgbe.hdr',
    );
    const newFile = new File(
      [hdrUtils.buildSampleRadianceHdrBytes('xyze')],
      'second-xyze.hdr',
    );

    selectFile(fileInput, oldFile);
    selectFile(fileInput, newFile);

    await act(async () => {
      deferredNew.resolve(hdrUtils.buildSampleRadianceHdrBytes('xyze'));
      await Promise.resolve();
    });

    expect(screen.getByTestId('hdr-format')).toHaveTextContent('32-bit_rle_xyze');

    await act(async () => {
      deferredOld.resolve(hdrUtils.buildSampleRadianceHdrBytes('rgbe'));
      await Promise.resolve();
    });

    expect(screen.getByTestId('hdr-format')).toHaveTextContent('32-bit_rle_xyze');
    expect(screen.getByText(/second-xyze\.hdr/)).toBeInTheDocument();
  });
});
