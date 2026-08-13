import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';
import EmailHeaderTool from './EmailHeaderTool.jsx';

afterEach(() => {
  cleanup();
});

describe('EmailHeaderTool', () => {
  it('shows an alert and no report for malformed input', () => {
    render(<EmailHeaderTool />);
    fireEvent.change(screen.getByLabelText(/raw email headers/i), {
      target: { value: 'body only' },
    });
    fireEvent.click(screen.getByRole('button', { name: /analyze/i }));
    expect(screen.getByRole('alert')).toHaveTextContent(/malformed/i);
    expect(screen.queryByRole('heading', { name: /header fields/i })).not.toBeInTheDocument();
  });

  it('renders decoded fields, an ordered hop report, and lets raw values be restored', () => {
    render(<EmailHeaderTool />);
    const raw = [
      'Subject: =?UTF-8?B?7ISc7Jq4?=',
      'Received: by final; Tue, 12 Aug 2026 10:01:00 +0000',
      'Received: by origin; Tue, 12 Aug 2026 10:00:00 +0000',
      'Authentication-Results: mx.example; spf=pass dkim=pass dmarc=pass',
    ].join('\n');
    fireEvent.change(screen.getByLabelText(/raw email headers/i), { target: { value: raw } });
    fireEvent.click(screen.getByRole('button', { name: /analyze/i }));
    expect(screen.getByRole('heading', { name: /header fields/i })).toBeInTheDocument();
    expect(screen.getByText('서울')).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: /delivery hops/i })).toBeInTheDocument();
    expect(screen.getAllByText('pass', { exact: true })).toHaveLength(3);
    fireEvent.click(screen.getByLabelText(/show raw header values/i));
    expect(screen.getByText('=?UTF-8?B?7ISc7Jq4?=')).toBeInTheDocument();
  });
});
