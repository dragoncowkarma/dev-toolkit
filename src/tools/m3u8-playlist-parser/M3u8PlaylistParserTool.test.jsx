import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import M3u8PlaylistParserTool from './M3u8PlaylistParserTool.jsx';

describe('M3u8PlaylistParserTool', () => {
  it('loads a sample playlist and presents its parsed summary', () => {
    render(<M3u8PlaylistParserTool />);
    fireEvent.click(screen.getByRole('button', { name: 'Load master sample' }));

    expect(screen.getByLabelText('Playlist summary')).toHaveTextContent('Master');
    expect(screen.getByRole('table')).toBeInTheDocument();
  });

  it('announces validation errors and filters parsed entries', () => {
    render(<M3u8PlaylistParserTool />);
    fireEvent.change(screen.getByLabelText('Playlist source'), {
      target: { value: '#EXTINF:5,Missing header\nsegment.ts' },
    });

    expect(screen.getByRole('alert')).toHaveTextContent('#EXTM3U must be the first line');
    fireEvent.change(screen.getByLabelText('Filter segments'), { target: { value: 'absent' } });
    expect(screen.getByRole('table')).toBeInTheDocument();
  });
});
