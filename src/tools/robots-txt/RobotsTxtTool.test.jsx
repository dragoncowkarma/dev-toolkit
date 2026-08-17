import { act, cleanup, fireEvent, render, screen, within } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import RobotsTxtTool from './RobotsTxtTool.jsx';

const SAMPLE = [
  'User-agent: *',
  'Disallow: /admin',
  'Disallow: /fish',
  'Allow: /fish/salmon.html',
  '',
  'User-agent: Googlebot',
  'Disallow: /private',
  '',
  'Sitemap: https://example.com/sitemap.xml',
].join('\n');

function getRobotsInput() {
  return screen.getByLabelText('robots.txt content');
}

function typeRobots(value) {
  fireEvent.change(getRobotsInput(), { target: { value } });
}

beforeEach(() => {
  vi.useFakeTimers();
});

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
  vi.useRealTimers();
});

describe('RobotsTxtTool parsing view', () => {
  it('renders grouped user-agent rules after pasting a robots.txt sample', () => {
    render(<RobotsTxtTool />);

    typeRobots(SAMPLE);

    const wildcardGroup = screen.getByRole('article', { name: 'Rules for user-agent *' });
    expect(within(wildcardGroup).getByText('/admin')).toBeInTheDocument();
    expect(within(wildcardGroup).getByText('/fish')).toBeInTheDocument();

    const googleGroup = screen.getByRole('article', { name: 'Rules for user-agent googlebot' });
    expect(within(googleGroup).getByText('/private')).toBeInTheDocument();
  });

  it('renders the Sitemap list', () => {
    render(<RobotsTxtTool />);

    typeRobots(SAMPLE);

    const sitemapSection = screen.getByRole('region', { name: 'Sitemap entries' });
    expect(within(sitemapSection).getByText('https://example.com/sitemap.xml')).toBeInTheDocument();
  });

  it('shows an alert plus a collapsible list for ignored lines, without blocking parsing', () => {
    render(<RobotsTxtTool />);

    typeRobots('This is not valid\nUser-agent: *\nDisallow: /admin');

    expect(screen.getByRole('alert')).toHaveTextContent('1 line could not be parsed');
    fireEvent.click(screen.getByText('Ignored lines (1)'));
    const ignoredList = screen.getByText('Ignored lines (1)').closest('details');
    expect(within(ignoredList).getByText(/This is not valid/)).toBeInTheDocument();

    const wildcardGroup = screen.getByRole('article', { name: 'Rules for user-agent *' });
    expect(within(wildcardGroup).getByText('/admin')).toBeInTheDocument();
  });
});

describe('RobotsTxtTool path tester', () => {
  it('shows the correct verdict with evidence (rule + line number)', () => {
    render(<RobotsTxtTool />);

    typeRobots(SAMPLE);

    fireEvent.change(screen.getByLabelText('User-agent'), { target: { value: '*' } });
    fireEvent.change(screen.getByLabelText('Path'), { target: { value: '/admin/settings' } });

    const verdict = screen.getByRole('status', { name: 'Path test verdict' });
    expect(verdict).toHaveTextContent('DISALLOWED');
    expect(verdict).toHaveTextContent('Disallow: /admin (line 2)');
  });

  it('reflects a more specific user-agent selecting its own group', () => {
    render(<RobotsTxtTool />);

    typeRobots(SAMPLE);

    fireEvent.change(screen.getByLabelText('User-agent'), { target: { value: 'Googlebot/2.1' } });
    fireEvent.change(screen.getByLabelText('Path'), { target: { value: '/private' } });

    expect(screen.getByText(/Selected group: "googlebot"/)).toBeInTheDocument();
    expect(screen.getByText('DISALLOWED')).toBeInTheDocument();
  });

  it('shows "no matching rule" default-allow evidence when nothing applies', () => {
    render(<RobotsTxtTool />);

    typeRobots(SAMPLE);

    fireEvent.change(screen.getByLabelText('User-agent'), { target: { value: '*' } });
    fireEvent.change(screen.getByLabelText('Path'), { target: { value: '/no-rule-here' } });

    expect(screen.getByText(/No matching rule/)).toBeInTheDocument();
    expect(screen.getByText('ALLOWED')).toBeInTheDocument();
  });
});

describe('RobotsTxtTool copy feedback', () => {
  it('copies the verdict summary and shows visible feedback', async () => {
    const writeText = vi.fn().mockResolvedValue(undefined);
    Object.assign(navigator, { clipboard: { writeText } });

    render(<RobotsTxtTool />);
    typeRobots(SAMPLE);
    fireEvent.change(screen.getByLabelText('Path'), { target: { value: '/admin/settings' } });

    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: 'Copy verdict' }));
    });

    expect(writeText).toHaveBeenCalledWith(expect.stringContaining('DISALLOWED'));
    expect(screen.getByText('Verdict summary copied to clipboard.')).toBeInTheDocument();
  });

  it('shows failure feedback when the clipboard write rejects', async () => {
    const writeText = vi.fn().mockRejectedValue(new Error('denied'));
    Object.assign(navigator, { clipboard: { writeText } });

    render(<RobotsTxtTool />);
    typeRobots(SAMPLE);

    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: 'Copy verdict' }));
    });

    const status = screen.getByText('Unable to copy the verdict summary to the clipboard.');
    expect(status).toHaveAttribute('aria-live', 'polite');
  });
});

describe('RobotsTxtTool sample loading and clearing', () => {
  it('loads a sample robots.txt', () => {
    render(<RobotsTxtTool />);

    fireEvent.click(screen.getByRole('button', { name: 'Load sample robots.txt' }));

    expect(getRobotsInput().value).toContain('User-agent: *');
    expect(getRobotsInput().value).toContain('Sitemap:');
  });

  it('clears the input on Clear', () => {
    render(<RobotsTxtTool />);

    typeRobots(SAMPLE);
    expect(screen.getByRole('article', { name: 'Rules for user-agent *' })).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: 'Clear' }));

    expect(getRobotsInput().value).toBe('');
    expect(screen.queryByRole('article', { name: 'Rules for user-agent *' }))
      .not.toBeInTheDocument();
  });
});

describe('RobotsTxtTool accessibility', () => {
  it('exposes the tool as a labeled region', () => {
    expect(() => render(<RobotsTxtTool />)).not.toThrow();
    expect(screen.getByRole('region', { name: 'Robots.txt Tester Tool' })).toBeInTheDocument();
  });

  it('gives the raw input, user-agent, and path controls accessible names', () => {
    render(<RobotsTxtTool />);

    expect(screen.getByLabelText('robots.txt content')).toBeInTheDocument();
    expect(screen.getByLabelText('User-agent')).toBeInTheDocument();
    expect(screen.getByLabelText('Path')).toBeInTheDocument();
  });

  it('marks the live verdict region with aria-live="polite"', () => {
    render(<RobotsTxtTool />);
    typeRobots(SAMPLE);

    const verdict = screen.getByRole('status', { name: 'Path test verdict' });
    expect(verdict).toHaveAttribute('aria-live', 'polite');
  });
});
