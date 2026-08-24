import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';
import BsonDecoderTool from './BsonDecoderTool.jsx';
import { bytesToHex, encodeJsonToBson } from '../bson-encoder/bson.utils.js';

afterEach(() => {
  document.body.innerHTML = '';
});

describe('BsonDecoderTool', () => {
  it('decodes pasted hexadecimal BSON into formatted JSON', async () => {
    render(<BsonDecoderTool />);
    const bytes = encodeJsonToBson('{"name":"Ada","items":[1,true,null]}');

    fireEvent.change(screen.getByLabelText('BSON bytes'), {
      target: { value: bytesToHex(bytes) },
    });

    await waitFor(() => {
      expect(screen.getByLabelText('Formatted JSON')).toHaveValue(
        JSON.stringify({ name: 'Ada', items: [1, true, null] }, null, 2)
      );
    });
  });

  it('shows a clear error for malformed input without rendering stale output', async () => {
    render(<BsonDecoderTool />);

    fireEvent.change(screen.getByLabelText('BSON bytes'), { target: { value: 'not bson!' } });

    expect(await screen.findByRole('alert')).toHaveTextContent('Invalid Base64 BSON input.');
    expect(screen.getByLabelText('Formatted JSON')).toHaveValue('');
  });
});
