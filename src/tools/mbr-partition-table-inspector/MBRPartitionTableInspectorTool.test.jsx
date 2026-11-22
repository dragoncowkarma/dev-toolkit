import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';
import MBRPartitionTableInspectorTool from './MBRPartitionTableInspectorTool.jsx';

function createMbr(type = 0x83) {
  const bytes = new Uint8Array(512);
  bytes[0x1be] = 0x80;
  bytes[0x1be + 4] = type;
  new DataView(bytes.buffer).setUint32(0x1be + 8, 2048, true);
  new DataView(bytes.buffer).setUint32(0x1be + 12, 4096, true);
  bytes[0x1fe] = 0x55;
  bytes[0x1ff] = 0xaa;
  return bytes.buffer;
}

function uploadBytes(bytes, name = 'disk.img') {
  const file = new File(['placeholder'], name, { type: 'application/octet-stream' });
  Object.defineProperty(file, 'arrayBuffer', { value: () => Promise.resolve(bytes) });
  const input = screen.getByLabelText('Choose a disk image to inspect');
  Object.defineProperty(input, 'files', { value: [file], configurable: true });
  fireEvent.change(input);
}

afterEach(cleanup);

describe('MBRPartitionTableInspectorTool', () => {
  it('loads a valid MBR and renders its partition table', async () => {
    render(<MBRPartitionTableInspectorTool />);
    uploadBytes(createMbr());

    expect(await screen.findByText('0x55AA (valid)')).toBeInTheDocument();
    expect(screen.getByText('Linux (0x83)')).toBeInTheDocument();
    expect(screen.getByText('2.0 MiB')).toBeInTheDocument();
  });

  it('shows an alert for a bad boot signature', async () => {
    render(<MBRPartitionTableInspectorTool />);
    const bytes = new Uint8Array(createMbr());
    bytes[0x1ff] = 0;
    uploadBytes(bytes.buffer);

    expect(await screen.findByRole('alert')).toHaveTextContent('Invalid MBR boot signature');
  });

  it('shows an alert for a truncated input', async () => {
    render(<MBRPartitionTableInspectorTool />);
    uploadBytes(new ArrayBuffer(511));

    expect(await screen.findByRole('alert')).toHaveTextContent('too short');
  });

  it('renders the GPT protective MBR note', async () => {
    render(<MBRPartitionTableInspectorTool />);
    uploadBytes(createMbr(0xee));

    await waitFor(() => {
      expect(screen.getByText(/GPT protective MBR detected/)).toBeInTheDocument();
    });
    expect(screen.getByText('GPT protective (0xEE)')).toBeInTheDocument();
  });
});
