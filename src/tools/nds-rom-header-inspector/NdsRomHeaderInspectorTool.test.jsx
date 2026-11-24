import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import NdsRomHeaderInspectorTool from './NdsRomHeaderInspectorTool.jsx';
import {
  bytesToHexString,
  createSyntheticBanner,
  createSyntheticHeader,
  HEADER_SIZE,
  MAX_BANNER_SIZE,
} from './ndsRomHeaderInspector.utils.js';

describe('NdsRomHeaderInspectorTool UI', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  afterEach(() => {
    cleanup();
    vi.restoreAllMocks();
  });

  it('renders initial empty state with semantic landmarks and controls', () => {
    render(<NdsRomHeaderInspectorTool />);

    expect(
      screen.getByRole('region', { name: 'Nintendo DS ROM Header Inspector' })
    ).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'File Upload' })).toHaveAttribute(
      'aria-pressed',
      'true'
    );
    expect(screen.getByRole('button', { name: 'Load Sample' })).toBeInTheDocument();
    expect(
      screen.getByLabelText(/Upload Nintendo DS ROM File Dropzone/)
    ).toBeInTheDocument();
  });

  it('loads and displays a sample valid NDS header', async () => {
    render(<NdsRomHeaderInspectorTool />);

    const loadBtn = screen.getByRole('button', { name: 'Load Sample' });
    fireEvent.click(loadBtn);

    expect(await screen.findByText('Cartridge Information')).toBeInTheDocument();
    expect(screen.getByText('MARIO KART')).toBeInTheDocument();
    expect(screen.getByText('AMKE')).toBeInTheDocument();
    expect(screen.getByText(/Nintendo \(01\)/)).toBeInTheDocument();
    expect(screen.getByText('0 (0x00)')).toBeInTheDocument();
    expect(screen.getByText('✓ Valid Header')).toBeInTheDocument();
    expect(
      screen.getByRole('table', { name: 'ARM Processors Memory and Binary Layout' })
    ).toBeInTheDocument();
    expect(
      screen.getByRole('table', { name: 'Checksum Verifications' })
    ).toBeInTheDocument();
  });

  it('switches to paste mode and displays error on truncated input with role="alert"', async () => {
    render(<NdsRomHeaderInspectorTool />);

    const pasteModeBtn = screen.getByRole('button', { name: 'Paste Hex / Base64' });
    fireEvent.click(pasteModeBtn);

    expect(pasteModeBtn).toHaveAttribute('aria-pressed', 'true');
    const textarea = screen.getByLabelText(/Paste ROM Header Bytes/);

    // Enter truncated hex
    fireEvent.change(textarea, { target: { value: '4D 41 52 49 4F' } });

    const alert = await screen.findByRole('alert');
    expect(alert).toHaveTextContent(/Truncated ROM header/);
  });

  it('parses valid pasted hex bytes and displays header summary', async () => {
    const sample = createSyntheticHeader({ gameTitle: 'ZELDA PH' });
    const hex = bytesToHexString(sample);

    render(<NdsRomHeaderInspectorTool />);

    const pasteModeBtn = screen.getByRole('button', { name: 'Paste Hex / Base64' });
    fireEvent.click(pasteModeBtn);

    const textarea = screen.getByLabelText(/Paste ROM Header Bytes/);
    fireEvent.change(textarea, { target: { value: hex } });

    expect(await screen.findByText('ZELDA PH')).toBeInTheDocument();
    expect(screen.getByText('✓ Valid Header')).toBeInTheDocument();
  });

  it('clears data when Clear button is clicked', async () => {
    render(<NdsRomHeaderInspectorTool />);

    const loadBtn = screen.getByRole('button', { name: 'Load Sample' });
    fireEvent.click(loadBtn);

    expect(await screen.findByText('MARIO KART')).toBeInTheDocument();

    const clearBtn = screen.getByRole('button', { name: 'Clear' });
    fireEvent.click(clearBtn);

    expect(screen.queryByText('MARIO KART')).not.toBeInTheDocument();
    expect(screen.queryByText('Cartridge Information')).not.toBeInTheDocument();
  });

  it('handles file upload selection', async () => {
    const sample = createSyntheticHeader({ gameTitle: 'METROID' });
    const file = new File([sample], 'metroid.nds', { type: 'application/octet-stream' });

    render(<NdsRomHeaderInspectorTool />);

    const fileInput = screen.getByLabelText('Select NDS ROM file');
    fireEvent.change(fileInput, { target: { files: [file] } });

    expect(await screen.findByText('METROID')).toBeInTheDocument();
    expect(screen.getByText('metroid.nds')).toBeInTheDocument();
  });

  it('copies summary to clipboard', async () => {
    const writeTextMock = vi.fn().mockResolvedValue(undefined);
    Object.assign(navigator, {
      clipboard: {
        writeText: writeTextMock,
      },
    });

    render(<NdsRomHeaderInspectorTool />);

    fireEvent.click(screen.getByRole('button', { name: 'Load Sample' }));
    expect(await screen.findByText('MARIO KART')).toBeInTheDocument();

    const copyBtn = screen.getByRole('button', { name: 'Copy Summary' });
    fireEvent.click(copyBtn);

    await waitFor(() => {
      expect(writeTextMock).toHaveBeenCalledTimes(1);
    });
    expect(writeTextMock.mock.calls[0][0]).toContain('Nintendo DS ROM Header Summary');
    expect(writeTextMock.mock.calls[0][0]).toContain('Total ROM Size: ');
    expect(writeTextMock.mock.calls[0][0]).toContain('Device Size:   32.0 MB');
    expect(screen.getByText('Copied!')).toBeInTheDocument();
  });

  it('displays chip capacity correctly for device capacity 0 (128.0 KB)', async () => {
    const writeTextMock = vi.fn().mockResolvedValue(undefined);
    Object.assign(navigator, {
      clipboard: {
        writeText: writeTextMock,
      },
    });

    const sample = createSyntheticHeader({ gameTitle: 'HOMEBREW', deviceCapacity: 0 });
    const hex = bytesToHexString(sample);

    render(<NdsRomHeaderInspectorTool />);

    const pasteModeBtn = screen.getByRole('button', { name: 'Paste Hex / Base64' });
    fireEvent.click(pasteModeBtn);

    const textarea = screen.getByLabelText(/Paste ROM Header Bytes/);
    fireEvent.change(textarea, { target: { value: hex } });

    expect(await screen.findByText('HOMEBREW')).toBeInTheDocument();
    expect(screen.getByText('Chip Capacity')).toBeInTheDocument();
    expect(screen.getByText('128.0 KB')).toBeInTheDocument();

    const copyBtn = screen.getByRole('button', { name: 'Copy Summary' });
    fireEvent.click(copyBtn);

    await waitFor(() => {
      expect(writeTextMock).toHaveBeenCalledTimes(1);
    });
    expect(writeTextMock.mock.calls[0][0]).toContain('Device Size:   128.0 KB');
  });

  it('displays Unknown chip capacity for boundary and malformed capacity values', async () => {
    const writeTextMock = vi.fn().mockResolvedValue(undefined);
    Object.assign(navigator, {
      clipboard: {
        writeText: writeTextMock,
      },
    });

    const sample = createSyntheticHeader({ gameTitle: 'OVERFLOW31', deviceCapacity: 31 });
    const hex = bytesToHexString(sample);

    render(<NdsRomHeaderInspectorTool />);

    const pasteModeBtn = screen.getByRole('button', { name: 'Paste Hex / Base64' });
    fireEvent.click(pasteModeBtn);

    const textarea = screen.getByLabelText(/Paste ROM Header Bytes/);
    fireEvent.change(textarea, { target: { value: hex } });

    expect(await screen.findByText('OVERFLOW31')).toBeInTheDocument();
    expect(screen.getByText('Chip Capacity')).toBeInTheDocument();
    expect(screen.getByText('Unknown')).toBeInTheDocument();
    // Ensure negative byte sizes or '0 B' are never displayed
    expect(screen.queryByText('-281474976710656')).not.toBeInTheDocument();
    expect(screen.queryByText('0 B')).not.toBeInTheDocument();

    const copyBtn = screen.getByRole('button', { name: 'Copy Summary' });
    fireEvent.click(copyBtn);

    await waitFor(() => {
      expect(writeTextMock).toHaveBeenCalledTimes(1);
    });
    expect(writeTextMock.mock.calls[0][0]).toContain('Device Size:   Unknown');
  });

  it('displays full calculated end address when ARM9 exceeds 0xFFFFFFFF', async () => {
    const sample = createSyntheticHeader({
      arm9RomOffset: 0xffffffff,
      arm9Size: 2,
      totalRomSize: 0xffffffff,
    });
    const hex = bytesToHexString(sample);

    render(<NdsRomHeaderInspectorTool />);

    fireEvent.click(screen.getByRole('button', { name: 'Paste Hex / Base64' }));
    fireEvent.change(screen.getByLabelText(/Paste ROM Header Bytes/), { target: { value: hex } });

    expect(await screen.findByText('✕ Issues Detected')).toBeInTheDocument();
    expect(
      screen.getByText('ARM9 binary extends beyond total ROM size (0x100000001 > 0xFFFFFFFF).')
    ).toBeInTheDocument();
  });

  it('displays full calculated end address when ARM7 exceeds 0xFFFFFFFF', async () => {
    const sample = createSyntheticHeader({
      arm7RomOffset: 0xffffffff,
      arm7Size: 2,
      totalRomSize: 0xffffffff,
    });
    const hex = bytesToHexString(sample);

    render(<NdsRomHeaderInspectorTool />);

    fireEvent.click(screen.getByRole('button', { name: 'Paste Hex / Base64' }));
    fireEvent.change(screen.getByLabelText(/Paste ROM Header Bytes/), { target: { value: hex } });

    expect(await screen.findByText('✕ Issues Detected')).toBeInTheDocument();
    expect(
      screen.getByText('ARM7 binary extends beyond total ROM size (0x100000001 > 0xFFFFFFFF).')
    ).toBeInTheDocument();
  });

  it('copies summary with validation warnings preserving full unwrapped end address', async () => {
    const writeTextMock = vi.fn().mockResolvedValue(undefined);
    Object.assign(navigator, {
      clipboard: {
        writeText: writeTextMock,
      },
    });

    const sample = createSyntheticHeader({
      arm9RomOffset: 0xffffffff,
      arm9Size: 2,
      totalRomSize: 0xffffffff,
    });
    const hex = bytesToHexString(sample);

    render(<NdsRomHeaderInspectorTool />);

    fireEvent.click(screen.getByRole('button', { name: 'Paste Hex / Base64' }));
    fireEvent.change(screen.getByLabelText(/Paste ROM Header Bytes/), { target: { value: hex } });

    expect(await screen.findByText('✕ Issues Detected')).toBeInTheDocument();

    const copyBtn = screen.getByRole('button', { name: 'Copy Summary' });
    fireEvent.click(copyBtn);

    await waitFor(() => {
      expect(writeTextMock).toHaveBeenCalledTimes(1);
    });
    const copiedSummary = writeTextMock.mock.calls[0][0];
    expect(copiedSummary).toContain('Validation Warnings:');
    expect(copiedSummary).toContain(
      'ARM9 binary extends beyond total ROM size (0x100000001 > 0xFFFFFFFF).'
    );
    expect(copiedSummary).toContain('ROM Offset:  0xFFFFFFFF');
    expect(copiedSummary).toContain('Total ROM Size: 4.0 GB (4294967295 bytes)');
  });

  it('loads sample with banner and displays multilingual titles and banner CRC-16', async () => {
    render(<NdsRomHeaderInspectorTool />);

    const loadBtn = screen.getByRole('button', { name: 'Load Sample' });
    fireEvent.click(loadBtn);

    expect(await screen.findByText('Icon & Title Banner')).toBeInTheDocument();
    expect(screen.getByText('✓ Valid Banner')).toBeInTheDocument();
    expect(screen.getByText(/Version 1 \(Original NDS\)/)).toBeInTheDocument();

    // Check multilingual titles
    expect(screen.getByText('Japanese')).toBeInTheDocument();
    expect(screen.getByText('English')).toBeInTheDocument();
    expect(screen.getByText('French')).toBeInTheDocument();
    expect(screen.getByText('German')).toBeInTheDocument();
    expect(screen.getByText('Italian')).toBeInTheDocument();
    expect(screen.getByText('Spanish')).toBeInTheDocument();

    // Check decoded lines
    expect(screen.getByText('マリオカートDS')).toBeInTheDocument();
    expect(screen.getByText('任天堂')).toBeInTheDocument();
    expect(screen.getAllByText('Mario Kart DS').length).toBeGreaterThan(0);
    expect(screen.getAllByText('Nintendo').length).toBeGreaterThan(0);

    // Check banner CRC-16 table
    expect(
      screen.getByRole('table', { name: 'Banner Checksums' })
    ).toBeInTheDocument();
    expect(screen.getByText('v1 CRC-16')).toBeInTheDocument();
  });

  it('copies summary with complete banner block information', async () => {
    const writeTextMock = vi.fn().mockResolvedValue(undefined);
    Object.assign(navigator, {
      clipboard: {
        writeText: writeTextMock,
      },
    });

    render(<NdsRomHeaderInspectorTool />);

    fireEvent.click(screen.getByRole('button', { name: 'Load Sample' }));
    expect(await screen.findByText('Icon & Title Banner')).toBeInTheDocument();

    const copyBtn = screen.getByRole('button', { name: 'Copy Summary' });
    fireEvent.click(copyBtn);

    await waitFor(() => {
      expect(writeTextMock).toHaveBeenCalledTimes(1);
    });
    const copiedSummary = writeTextMock.mock.calls[0][0];
    expect(copiedSummary).toContain('Icon/Title Banner:');
    expect(copiedSummary).toContain('Offset:        0x00000200');
    expect(copiedSummary).toContain('Version:       0x0001 (Version 1 (Original NDS))');
    expect(copiedSummary).toContain('v1 CRC-16:     Expected');
    expect(copiedSummary).toContain('VALID');
    expect(copiedSummary).toContain('Banner Titles:');
    expect(copiedSummary).toContain('  Japanese:');
    expect(copiedSummary).toContain('    マリオカートDS');
    expect(copiedSummary).toContain('    任天堂');
    expect(copiedSummary).toContain('  English:');
    expect(copiedSummary).toContain('    Mario Kart DS');
    expect(copiedSummary).toContain('    Nintendo');
  });

  it('displays diagnostic in UI when banner block is truncated', async () => {
    const sample = createSyntheticHeader({
      includeBanner: true,
      bannerOffset: 0x200,
      totalSize: 0x200 + 0x100, // Only 256 bytes instead of 0x840
    });
    const hex = bytesToHexString(sample);

    render(<NdsRomHeaderInspectorTool />);

    fireEvent.click(screen.getByRole('button', { name: 'Paste Hex / Base64' }));
    fireEvent.change(screen.getByLabelText(/Paste ROM Header Bytes/), { target: { value: hex } });

    expect(await screen.findByText('✕ Issues Detected')).toBeInTheDocument();
    expect(screen.getAllByText(/Truncated banner block/).length).toBeGreaterThan(0);
    expect(screen.getByText('✕ Banner Issues')).toBeInTheDocument();
  });

  it('handles unknown banner version without throwing when copying summary', async () => {
    const writeTextMock = vi.fn().mockResolvedValue(undefined);
    Object.assign(navigator, {
      clipboard: {
        writeText: writeTextMock,
      },
    });

    const banner = createSyntheticBanner({ version: 0x9999 });
    const total = 0x200 + banner.length;
    const rom = new Uint8Array(total);
    rom.set(
      createSyntheticHeader({ bannerOffset: 0x200, totalSize: total }).subarray(0, 0x160),
      0
    );
    rom.set(banner, 0x200);
    const hex = bytesToHexString(rom);

    render(<NdsRomHeaderInspectorTool />);

    fireEvent.click(screen.getByRole('button', { name: 'Paste Hex / Base64' }));
    fireEvent.change(screen.getByLabelText(/Paste ROM Header Bytes/), { target: { value: hex } });

    expect(await screen.findByText('Icon & Title Banner')).toBeInTheDocument();
    expect(screen.getByText(/0x9999 \(Unknown Version\)/)).toBeInTheDocument();
    expect(screen.getAllByText(/Unknown banner version: 0x9999/).length).toBeGreaterThan(0);

    const copyBtn = screen.getByRole('button', { name: 'Copy Summary' });
    expect(() => fireEvent.click(copyBtn)).not.toThrow();

    await waitFor(() => {
      expect(writeTextMock).toHaveBeenCalledTimes(1);
    });
    const copiedSummary = writeTextMock.mock.calls[0][0];
    expect(copiedSummary).toContain('Version:       0x9999 (Unknown Version)');
    expect(copiedSummary).toContain('Diagnostic:    Unknown banner version: 0x9999');
  });

  it('reads bounded slices for large files without full allocation', async () => {
    // 512 MB file with banner placed at 0x4000
    const bannerOffset = 0x4000;
    const banner = createSyntheticBanner({ version: 0x0001 });
    const headerBytes = createSyntheticHeader({
      bannerOffset,
      totalRomSize: 512 * 1024 * 1024,
    });

    const sliceCalls = [];
    const mockFile = {
      name: 'large_game.nds',
      size: 512 * 1024 * 1024,
      slice: vi.fn((start, end) => {
        sliceCalls.push({ start, end, length: end - start });
        if (start === 0) {
          return new Blob([headerBytes.subarray(0, HEADER_SIZE)]);
        }
        if (start === bannerOffset) {
          return new Blob([banner]);
        }
        return new Blob([new Uint8Array(end - start)]);
      }),
    };

    render(<NdsRomHeaderInspectorTool />);

    const fileInput = screen.getByLabelText('Select NDS ROM file');
    fireEvent.change(fileInput, { target: { files: [mockFile] } });

    expect(await screen.findByText('Icon & Title Banner')).toBeInTheDocument();
    expect(screen.getByText('✓ Valid Banner')).toBeInTheDocument();

    // Verify bounded slices: header at [0, 0x200], banner at [0x4000, 0x4000 + 0x2400]
    expect(mockFile.slice).toHaveBeenCalledTimes(2);
    expect(sliceCalls[0]).toEqual({ start: 0, end: HEADER_SIZE, length: HEADER_SIZE });
    expect(sliceCalls[1]).toEqual({
      start: bannerOffset,
      end: bannerOffset + MAX_BANNER_SIZE,
      length: MAX_BANNER_SIZE,
    });
    // Ensure we never sliced the full 512MB
    for (const call of sliceCalls) {
      expect(call.length).toBeLessThanOrEqual(MAX_BANNER_SIZE);
    }
  });

  it('handles malformed banner offset 0xffffffff with only header slice', async () => {
    const malformedHeader = createSyntheticHeader({
      bannerOffset: 0xffffffff,
      totalRomSize: 512 * 1024 * 1024,
    });

    const mockFile = {
      name: 'malformed_banner.nds',
      size: 512 * 1024 * 1024,
      slice: vi.fn((start, end) => {
        return new Blob([malformedHeader.subarray(start, end)]);
      }),
    };

    render(<NdsRomHeaderInspectorTool />);

    const fileInput = screen.getByLabelText('Select NDS ROM file');
    fireEvent.change(fileInput, { target: { files: [mockFile] } });

    expect(await screen.findByText('Icon & Title Banner')).toBeInTheDocument();
    expect(screen.getByText('✕ Issues Detected')).toBeInTheDocument();
    expect(screen.getAllByText(/beyond end of file/).length).toBeGreaterThan(0);

    // Only 1 slice call for the header (0..0x200); banner slice is never attempted for 0xffffffff
    expect(mockFile.slice).toHaveBeenCalledTimes(1);
    expect(mockFile.slice).toHaveBeenCalledWith(0, HEADER_SIZE);
  });
});
