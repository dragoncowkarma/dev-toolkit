import { fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';
import { cleanup } from '@testing-library/react';
import Iso9660InspectorTool from './Iso9660InspectorTool.jsx';
import { LOGICAL_SECTOR_SIZE, VOLUME_DESCRIPTOR_SECTOR } from './iso9660.utils.js';

afterEach(cleanup);

function isoFile() {
  const image = new Uint8Array((VOLUME_DESCRIPTOR_SECTOR + 2) * LOGICAL_SECTOR_SIZE);
  const primaryOffset = VOLUME_DESCRIPTOR_SECTOR * LOGICAL_SECTOR_SIZE;
  image[primaryOffset] = 1;
  image.set(new TextEncoder().encode('CD001'), primaryOffset + 1);
  image.set(new TextEncoder().encode('LOCAL_DISC'), primaryOffset + 40);
  const terminatorOffset = (VOLUME_DESCRIPTOR_SECTOR + 1) * LOGICAL_SECTOR_SIZE;
  image[terminatorOffset] = 255;
  image.set(new TextEncoder().encode('CD001'), terminatorOffset + 1);
  return new File([image], 'local.iso', { type: 'application/x-iso9660-image' });
}

describe('Iso9660InspectorTool', () => {
  it('inspects a local file selected through the file picker', async () => {
    render(<Iso9660InspectorTool />);
    const input = screen.getByLabelText('Choose an ISO image to inspect');
    fireEvent.change(input, { target: { files: [isoFile()] } });

    expect(await screen.findByText('Primary Volume Descriptor')).toBeInTheDocument();
    expect(screen.getByText('LOCAL_DISC')).toBeInTheDocument();
    expect(screen.getByText('Inspecting: local.iso')).toBeInTheDocument();
  });

  it('announces malformed local images as an alert', async () => {
    render(<Iso9660InspectorTool />);
    const shortFile = new File([new Uint8Array(12)], 'short.iso');
    fireEvent.change(screen.getByLabelText('Choose an ISO image to inspect'), {
      target: { files: [shortFile] },
    });

    expect(await screen.findByText(/Truncated volume descriptor/)).toBeInTheDocument();
  });
});
