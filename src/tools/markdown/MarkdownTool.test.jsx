import { act, cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import MarkdownTool from './MarkdownTool.jsx';

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

describe('MarkdownTool live preview', () => {
  it('shows an empty state before any markdown is typed', () => {
    render(<MarkdownTool />);
    expect(
      screen.getByText(/Nothing to preview yet/i)
    ).toBeInTheDocument();
  });

  it('renders headers and emphasis in the live preview as input changes', () => {
    render(<MarkdownTool />);
    fireEvent.change(screen.getByLabelText('Markdown input'), {
      target: { value: '# Title\n\n**bold** text' },
    });

    const preview = screen.getByTestId('markdown-preview');
    expect(preview.querySelector('h1')).toHaveTextContent('Title');
    expect(preview.querySelector('strong')).toHaveTextContent('bold');
  });

  it('escapes script tags instead of rendering them in the preview', () => {
    render(<MarkdownTool />);
    fireEvent.change(screen.getByLabelText('Markdown input'), {
      target: { value: '<script>window.__xss = true;</script>' },
    });

    const preview = screen.getByTestId('markdown-preview');
    expect(preview.querySelector('script')).not.toBeInTheDocument();
    expect(preview.textContent).toContain('<script>');
  });
});

describe('MarkdownTool tab switching', () => {
  it('switches between the Preview and Raw HTML tabs', () => {
    render(<MarkdownTool />);
    fireEvent.change(screen.getByLabelText('Markdown input'), {
      target: { value: '# Title' },
    });

    expect(screen.getByTestId('markdown-preview')).toBeInTheDocument();

    fireEvent.click(screen.getByRole('tab', { name: 'Raw HTML' }));

    expect(screen.queryByTestId('markdown-preview')).not.toBeInTheDocument();
    const htmlSource = screen.getByTestId('markdown-html-source');
    expect(htmlSource).toHaveTextContent('<h1>Title</h1>');

    fireEvent.click(screen.getByRole('tab', { name: 'Preview' }));
    expect(screen.getByTestId('markdown-preview')).toBeInTheDocument();
  });
});

describe('MarkdownTool actions', () => {
  it('loads sample markdown and renders it in the preview', () => {
    render(<MarkdownTool />);
    fireEvent.click(screen.getByRole('button', { name: 'Load sample markdown' }));

    expect(screen.getByLabelText('Markdown input').value).toContain('# Markdown Previewer');
    expect(screen.getByTestId('markdown-preview').querySelector('h1')).toHaveTextContent(
      'Markdown Previewer'
    );
  });

  it('clears the input and returns to the empty state', () => {
    render(<MarkdownTool />);
    fireEvent.change(screen.getByLabelText('Markdown input'), {
      target: { value: '# Title' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Clear markdown input' }));

    expect(screen.getByLabelText('Markdown input')).toHaveValue('');
    expect(screen.getByText(/Nothing to preview yet/i)).toBeInTheDocument();
  });

  it('copies the generated HTML to the clipboard', async () => {
    const writeText = vi.fn().mockResolvedValue(undefined);
    Object.assign(navigator, { clipboard: { writeText } });

    render(<MarkdownTool />);
    fireEvent.change(screen.getByLabelText('Markdown input'), {
      target: { value: '# Title' },
    });

    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: 'Copy generated HTML to clipboard' }));
    });

    expect(writeText).toHaveBeenCalledWith('<h1>Title</h1>');
    expect(await screen.findByRole('status')).toHaveTextContent('HTML copied to clipboard!');
  });

  it('reports a copy failure without crashing', async () => {
    const writeText = vi.fn().mockRejectedValue(new Error('denied'));
    Object.assign(navigator, { clipboard: { writeText } });

    render(<MarkdownTool />);
    fireEvent.change(screen.getByLabelText('Markdown input'), {
      target: { value: '# Title' },
    });

    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: 'Copy generated HTML to clipboard' }));
    });

    expect(await screen.findByRole('status')).toHaveTextContent('Failed to copy HTML.');
  });

  it('disables copy and download actions when there is nothing to export', () => {
    render(<MarkdownTool />);

    expect(screen.getByRole('button', { name: 'Copy generated HTML to clipboard' })).toBeDisabled();
    expect(screen.getByRole('button', { name: 'Download markdown file' })).toBeDisabled();
    expect(screen.getByRole('button', { name: 'Download HTML file' })).toBeDisabled();
  });
});
