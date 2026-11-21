import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';
import SevenZipHeaderInspectorTool from './SevenZipHeaderInspectorTool.jsx';
import { calculateCrc32 } from './7z-header-inspector.utils.js';

function createSignatureHeader({ crcIsValid = true, validSignature = true } = {}) {
  const bytes = new Uint8Array(32);
  bytes.set([0x37, 0x7a, 0xbc, 0xaf, 0x27, 0x1c]);
  if (!validSignature) bytes[0] = 0;
  bytes[6] = 0;
  bytes[7] = 4;
  const view = new DataView(bytes.buffer);
  view.setBigUint64(12, 42n, true);
  view.setBigUint64(20, 12n, true);
  view.setUint32(28, 0xa1b2c3d4, true);
  view.setUint32(8, calculateCrc32(bytes.slice(12)), true);
  if (!crcIsValid) bytes[8] ^= 0xff;
  return bytes;
}

async function uploadBytes(bytes) {
  const file = new File([bytes], 'archive.7z', { type: 'application/x-7z-compressed' });
  fireEvent.change(screen.getByLabelText('Choose a 7z file to inspect'), {
    target: { files: [file] },
  });
}

afterEach(cleanup);

describe('SevenZipHeaderInspectorTool', () => {
  it('displays validated signature-header details', async () => {
    render(<SevenZipHeaderInspectorTool />);
    await uploadBytes(createSignatureHeader());

    expect(await screen.findByText('0.4')).toBeInTheDocument();
    expect(screen.getByText('42')).toBeInTheDocument();
    expect(screen.getByText('12')).toBeInTheDocument();
    expect(screen.getAllByText('0xA1B2C3D4')).toHaveLength(1);
  });

  it('shows an accessible error for a CRC mismatch', async () => {
    render(<SevenZipHeaderInspectorTool />);
    await uploadBytes(createSignatureHeader({ crcIsValid: false }));

    expect(await screen.findByRole('alert')).toHaveTextContent('Start header CRC32 mismatch');
  });

  it('shows an accessible error for truncated input', async () => {
    render(<SevenZipHeaderInspectorTool />);
    await uploadBytes(new Uint8Array(31));

    expect(await screen.findByRole('alert')).toHaveTextContent('too short');
  });

  it('shows an accessible error for invalid magic', async () => {
    render(<SevenZipHeaderInspectorTool />);
    await uploadBytes(createSignatureHeader({ validSignature: false }));

    expect(await screen.findByRole('alert')).toHaveTextContent('Invalid 7-Zip signature');
  });
});
