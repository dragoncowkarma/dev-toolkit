import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import HarTool, {
  MAX_HIGHLIGHTED_TOKENS,
  MAX_PREVIEW_CHARACTERS,
} from './HarTool.jsx';

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
          content: { mimeType: 'application/json', text: '{"id":1,"ok":true}' },
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

  it('applies JSON token classes to valid request and response previews', () => {
    render(<HarTool />);

    fireEvent.change(screen.getByLabelText('Paste raw HAR JSON'), { target: { value: harText } });
    fireEvent.click(screen.getByRole('button', { name: 'Analyze HAR' }));

    const inspector = screen.getByLabelText('Request inspector');
    const tokenText = (className) => Array.from(inspector.querySelectorAll(className))
      .map((element) => element.textContent);

    expect(tokenText('.har-code__key')).toContain('"name"');
    expect(tokenText('.har-code__string')).toContain('"Ada"');
    expect(tokenText('.har-code__literal')).toContain('true');
    expect(tokenText('.har-code__number')).toContain('1');
  });

  it('updates the visible waterfall when filters change', () => {
    render(<HarTool />);

    fireEvent.change(screen.getByLabelText('Paste raw HAR JSON'), { target: { value: harText } });
    fireEvent.click(screen.getByRole('button', { name: 'Analyze HAR' }));
    fireEvent.change(screen.getByLabelText('URL'), { target: { value: 'missing.example' } });

    expect(screen.getByText('No requests match these filters.')).toBeInTheDocument();
  });

  it('truncates oversized response previews before syntax highlighting', () => {
    const largeHar = JSON.parse(harText);
    const omittedTail = 'this tail should not render in the preview';
    largeHar.log.entries[0].response.content.text = JSON.stringify({
      body: `${'x'.repeat(MAX_PREVIEW_CHARACTERS)}${omittedTail}`,
    });

    render(<HarTool />);

    fireEvent.change(screen.getByLabelText('Paste raw HAR JSON'), {
      target: { value: JSON.stringify(largeHar) },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Analyze HAR' }));

    const preview = screen.getByText(/Preview truncated to/);
    expect(preview).not.toHaveTextContent(omittedTail);
    expect(preview.querySelectorAll('.har-code__key')).toHaveLength(0);
  });

  it('limits the number of highlighted JSON tokens', () => {
    const largeHar = JSON.parse(harText);
    largeHar.log.entries[0].response.content.text = JSON.stringify({
      values: Array.from({ length: MAX_HIGHLIGHTED_TOKENS + 100 }, (_, index) => index),
    });

    render(<HarTool />);

    fireEvent.change(screen.getByLabelText('Paste raw HAR JSON'), {
      target: { value: JSON.stringify(largeHar) },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Analyze HAR' }));

    const responseHeading = screen.getByRole('heading', { name: 'Response body' });
    const preview = responseHeading.parentElement.querySelector('.har-code');

    expect(preview.querySelectorAll('span')).toHaveLength(MAX_HIGHLIGHTED_TOKENS + 1);
    expect(preview).toHaveTextContent('Preview truncated to 2,000 highlighted tokens.');
  });

  it('shows a user-friendly error for malformed pasted JSON', () => {
    render(<HarTool />);

    fireEvent.change(screen.getByLabelText('Paste raw HAR JSON'), { target: { value: '{bad' } });
    fireEvent.click(screen.getByRole('button', { name: 'Analyze HAR' }));

    expect(screen.getByRole('alert')).toHaveTextContent('This is not valid JSON.');
  });
});

describe('HarTool Copy as cURL', () => {
  it('copies the equivalent curl command for the selected request', async () => {
    const writeText = vi.fn().mockResolvedValue(undefined);
    Object.assign(navigator, { clipboard: { writeText } });

    render(<HarTool />);

    fireEvent.change(screen.getByLabelText('Paste raw HAR JSON'), { target: { value: harText } });
    fireEvent.click(screen.getByRole('button', { name: 'Analyze HAR' }));

    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: 'Copy as cURL' }));
    });

    await waitFor(() => expect(writeText).toHaveBeenCalledTimes(1));
    const command = writeText.mock.calls[0][0];
    expect(command).toContain("-X 'POST'");
    expect(command).toContain("'https://api.example.test/users'");
    expect(command).toContain("-H 'Authorization: redacted'");
    expect(command).toContain(`--data-raw '{"name":"Ada"}'`);
    expect(screen.getByRole('button', { name: '✓ Copied' })).toBeInTheDocument();
  });

  it('reports a copy failure when the clipboard write is denied', async () => {
    Object.assign(navigator, {
      clipboard: { writeText: vi.fn().mockRejectedValue(new Error('denied')) },
    });

    render(<HarTool />);

    fireEvent.change(screen.getByLabelText('Paste raw HAR JSON'), { target: { value: harText } });
    fireEvent.click(screen.getByRole('button', { name: 'Analyze HAR' }));

    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: 'Copy as cURL' }));
    });

    expect(await screen.findByRole('alert')).toHaveTextContent('Failed to copy cURL command.');
  });
});

describe('HarTool Copy as fetch', () => {
  it('copies a fetch snippet for the selected request', async () => {
    const writeText = vi.fn().mockResolvedValue(undefined);
    Object.assign(navigator, { clipboard: { writeText } });

    render(<HarTool />);

    fireEvent.change(screen.getByLabelText('Paste raw HAR JSON'), { target: { value: harText } });
    fireEvent.click(screen.getByRole('button', { name: 'Analyze HAR' }));

    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: 'Copy as fetch' }));
    });

    await waitFor(() => expect(writeText).toHaveBeenCalledTimes(1));
    expect(writeText).toHaveBeenCalledWith(expect.stringContaining('fetch('));
    expect(screen.getByRole('status')).toHaveTextContent('Copied fetch snippet');
  });

  it('reports a fetch copy failure when the clipboard write is denied', async () => {
    Object.assign(navigator, {
      clipboard: { writeText: vi.fn().mockRejectedValue(new Error('denied')) },
    });

    render(<HarTool />);

    fireEvent.change(screen.getByLabelText('Paste raw HAR JSON'), { target: { value: harText } });
    fireEvent.click(screen.getByRole('button', { name: 'Analyze HAR' }));

    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: 'Copy as fetch' }));
    });

    expect(await screen.findByRole('alert')).toHaveTextContent('Failed to copy fetch snippet.');
  });
});

describe('HarTool Copy as HTTPie', () => {
  it('copies an HTTPie command for the selected request', async () => {
    const writeText = vi.fn().mockResolvedValue(undefined);
    Object.assign(navigator, { clipboard: { writeText } });

    render(<HarTool />);

    fireEvent.change(screen.getByLabelText('Paste raw HAR JSON'), { target: { value: harText } });
    fireEvent.click(screen.getByRole('button', { name: 'Analyze HAR' }));

    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: 'Copy as HTTPie' }));
    });

    await waitFor(() => expect(writeText).toHaveBeenCalledTimes(1));
    expect(writeText).toHaveBeenCalledWith(expect.stringContaining('http POST'));
    expect(screen.getByRole('status')).toHaveTextContent('Copied HTTPie command');
  });

  it('reports an HTTPie copy failure when the clipboard write is denied', async () => {
    Object.assign(navigator, {
      clipboard: { writeText: vi.fn().mockRejectedValue(new Error('denied')) },
    });

    render(<HarTool />);

    fireEvent.change(screen.getByLabelText('Paste raw HAR JSON'), { target: { value: harText } });
    fireEvent.click(screen.getByRole('button', { name: 'Analyze HAR' }));

    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: 'Copy as HTTPie' }));
    });

    expect(await screen.findByRole('alert')).toHaveTextContent('Failed to copy HTTPie command.');
  });
});

describe('HarTool Copy as Python', () => {
  it('copies a Python requests snippet for the selected request', async () => {
    const writeText = vi.fn().mockResolvedValue(undefined);
    Object.assign(navigator, { clipboard: { writeText } });

    render(<HarTool />);

    fireEvent.change(screen.getByLabelText('Paste raw HAR JSON'), { target: { value: harText } });
    fireEvent.click(screen.getByRole('button', { name: 'Analyze HAR' }));

    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: 'Copy as Python' }));
    });

    await waitFor(() => expect(writeText).toHaveBeenCalledTimes(1));
    expect(writeText).toHaveBeenCalledWith(expect.stringContaining('requests.post('));
    expect(screen.getByRole('status')).toHaveTextContent('Copied Python snippet');
  });

  it('reports a Python copy failure when the clipboard write is denied', async () => {
    Object.assign(navigator, {
      clipboard: { writeText: vi.fn().mockRejectedValue(new Error('denied')) },
    });

    render(<HarTool />);

    fireEvent.change(screen.getByLabelText('Paste raw HAR JSON'), { target: { value: harText } });
    fireEvent.click(screen.getByRole('button', { name: 'Analyze HAR' }));

    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: 'Copy as Python' }));
    });

    expect(await screen.findByRole('alert')).toHaveTextContent('Failed to copy Python snippet.');
  });
});

describe('HarTool Copy as Go', () => {
  it('copies a Go net/http snippet for the selected request', async () => {
    const writeText = vi.fn().mockResolvedValue(undefined);
    Object.assign(navigator, { clipboard: { writeText } });

    render(<HarTool />);

    fireEvent.change(screen.getByLabelText('Paste raw HAR JSON'), { target: { value: harText } });
    fireEvent.click(screen.getByRole('button', { name: 'Analyze HAR' }));

    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: 'Copy as Go' }));
    });

    await waitFor(() => expect(writeText).toHaveBeenCalledTimes(1));
    expect(writeText).toHaveBeenCalledWith(expect.stringContaining('http.NewRequest'));
    expect(screen.getByRole('status')).toHaveTextContent('Copied Go snippet');
  });

  it('reports a Go copy failure when the clipboard write is denied', async () => {
    Object.assign(navigator, {
      clipboard: { writeText: vi.fn().mockRejectedValue(new Error('denied')) },
    });

    render(<HarTool />);

    fireEvent.change(screen.getByLabelText('Paste raw HAR JSON'), { target: { value: harText } });
    fireEvent.click(screen.getByRole('button', { name: 'Analyze HAR' }));

    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: 'Copy as Go' }));
    });

    expect(await screen.findByRole('alert')).toHaveTextContent('Failed to copy Go snippet.');
  });
});

describe('HarTool Copy as Node', () => {
  it('copies an axios snippet for the selected request', async () => {
    const writeText = vi.fn().mockResolvedValue(undefined);
    Object.assign(navigator, { clipboard: { writeText } });

    render(<HarTool />);

    fireEvent.change(screen.getByLabelText('Paste raw HAR JSON'), { target: { value: harText } });
    fireEvent.click(screen.getByRole('button', { name: 'Analyze HAR' }));

    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: 'Copy as Node' }));
    });

    await waitFor(() => expect(writeText).toHaveBeenCalledTimes(1));
    expect(writeText).toHaveBeenCalledWith(expect.stringContaining("import axios from 'axios';"));
    expect(screen.getByRole('status')).toHaveTextContent('Copied Node.js snippet');
  });

  it('shows an error message when clipboard copy fails', async () => {
    Object.assign(navigator, {
      clipboard: { writeText: vi.fn().mockRejectedValue(new Error('denied')) },
    });

    render(<HarTool />);

    fireEvent.change(screen.getByLabelText('Paste raw HAR JSON'), { target: { value: harText } });
    fireEvent.click(screen.getByRole('button', { name: 'Analyze HAR' }));

    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: 'Copy as Node' }));
    });

    expect(await screen.findByRole('alert')).toHaveTextContent('Failed to copy Node.js snippet.');
  });
});
