import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';
import HarTool from './HarTool.jsx';

afterEach(cleanup);

const harText = JSON.stringify({
  log: {
    entries: [
      {
        startedDateTime: '2026-09-04T00:00:00.000Z',
        request: {
          method: 'POST',
          url: 'https://api.example.test/users',
          headers: [{ name: 'Authorization', value: 'redacted' }],
          queryString: [{ name: 'page', value: '1' }],
          postData: { mimeType: 'application/json', text: '{"name":"Ada"}' },
        },
        response: {
          status: 201,
          bodySize: 99,
          headers: [{ name: 'Content-Type', value: 'application/json' }],
          content: { mimeType: 'application/json', text: '{"id":1}' },
        },
        timings: { wait: 30, receive: 10 },
      },
    ],
  },
});

describe('HarTool', () => {
  it('analyzes pasted content and reveals request details', () => {
    render(<HarTool />);

    fireEvent.change(screen.getByLabelText('Paste raw HAR JSON'), { target: { value: harText } });
    fireEvent.click(screen.getByRole('button', { name: 'Analyze HAR' }));

    expect(screen.getByLabelText('Overview statistics')).toHaveTextContent('Total requests1');
    expect(screen.getByLabelText('Request inspector')).toHaveTextContent('Authorization');
    expect(screen.getByLabelText('Request inspector')).toHaveTextContent('"name": "Ada"');
    expect(screen.getByLabelText('Request inspector')).toHaveTextContent('"id": 1');
  });

  it('updates the visible waterfall when filters change', () => {
    render(<HarTool />);

    fireEvent.change(screen.getByLabelText('Paste raw HAR JSON'), { target: { value: harText } });
    fireEvent.click(screen.getByRole('button', { name: 'Analyze HAR' }));
    fireEvent.change(screen.getByLabelText('URL'), { target: { value: 'missing.example' } });

    expect(screen.getByText('No requests match these filters.')).toBeInTheDocument();
  });

  it('shows a user-friendly error for malformed pasted JSON', () => {
    render(<HarTool />);

    fireEvent.change(screen.getByLabelText('Paste raw HAR JSON'), { target: { value: '{bad' } });
    fireEvent.click(screen.getByRole('button', { name: 'Analyze HAR' }));

    expect(screen.getByRole('alert')).toHaveTextContent('This is not valid JSON.');
  });
});
