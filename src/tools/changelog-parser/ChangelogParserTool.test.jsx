import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import ChangelogParserTool from './ChangelogParserTool.jsx';

const CHANGELOG = `# Changelog

## [Unreleased]

### Added
- Search support

## [1.0.0] - 2026-10-25

### Fixed
- Copy control

[Unreleased]: https://example.com/compare/v1.0.0...HEAD
[1.0.0]: https://example.com/releases/tag/v1.0.0`;

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

describe('ChangelogParserTool', () => {
  it('parses pasted Markdown and filters by version', async () => {
    render(<ChangelogParserTool />);

    fireEvent.change(screen.getByLabelText('Keep a Changelog Markdown'), {
      target: { value: CHANGELOG },
    });

    expect(await screen.findByRole('heading', { name: 'Parsed releases' })).toBeInTheDocument();
    expect(screen.getByText('Search support')).toBeInTheDocument();

    fireEvent.change(screen.getByLabelText('Version'), { target: { value: '1.0.0' } });

    expect(screen.getByText('Copy control')).toBeInTheDocument();
    expect(screen.queryByText('Search support')).not.toBeInTheDocument();
  });

  it('loads Markdown files through the file input', async () => {
    render(<ChangelogParserTool />);
    const file = new File([CHANGELOG], 'CHANGELOG.md', { type: 'text/markdown' });
    Object.defineProperty(file, 'text', { value: vi.fn().mockResolvedValue(CHANGELOG) });

    const input = screen.getByLabelText('Load a changelog Markdown file');
    Object.defineProperty(input, 'files', { value: [file], configurable: true });
    fireEvent.change(input);

    expect(await screen.findByText('Search support')).toBeInTheDocument();
    expect(screen.getByRole('status')).toHaveTextContent('Loaded CHANGELOG.md.');
  });

  it('exposes validation errors in an accessible alert', () => {
    render(<ChangelogParserTool />);

    fireEvent.change(screen.getByLabelText('Keep a Changelog Markdown'), {
      target: { value: '## [broken] - 2026-02-30\n\n### Added\n- Item' },
    });

    expect(screen.getByRole('alert')).toHaveTextContent('invalid SemVer version');
    expect(screen.getByRole('alert')).toHaveTextContent('invalid release date');
  });

  it('copies the selected release notes and announces the result', async () => {
    const writeText = vi.fn().mockResolvedValue(undefined);
    Object.assign(navigator, { clipboard: { writeText } });
    render(<ChangelogParserTool />);

    fireEvent.change(screen.getByLabelText('Keep a Changelog Markdown'), {
      target: { value: CHANGELOG },
    });
    fireEvent.change(screen.getByLabelText('Version'), { target: { value: '1.0.0' } });
    fireEvent.click(screen.getByRole('button', { name: 'Copy release notes' }));

    await waitFor(() => {
      expect(writeText).toHaveBeenCalledWith(expect.stringContaining('## 1.0.0 - 2026-10-25'));
    });
    expect(screen.getByRole('status')).toHaveTextContent('Release notes copied to clipboard.');
  });
});
