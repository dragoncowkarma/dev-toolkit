import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import React from 'react';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import Layout from './Layout.jsx';

const TEST_TOOLS = [
  {
    id: 'base64',
    name: 'Base64',
    description: 'Base64 tool description',
    icon: '⌁',
    category: 'Encoder',
    component: () => <div data-testid="tool-base64">Base64 Tool</div>,
  },
  {
    id: 'json',
    name: 'JSON Formatter',
    description: 'JSON tool description',
    icon: '{ }',
    category: 'Formatter',
    component: () => <div data-testid="tool-json">JSON Tool</div>,
  },
];

describe('Layout URL hash routing', () => {
  const originalTitle = document.title;

  beforeEach(() => {
    window.location.hash = '';
  });

  afterEach(() => {
    cleanup();
    window.location.hash = '';
    document.title = originalTitle;
  });

  it('defaults to base64 tool and sets hash when no hash is present', () => {
    render(<Layout tools={TEST_TOOLS} defaultToolId="base64" />);

    expect(screen.getByTestId('tool-base64')).toBeInTheDocument();
    expect(window.location.hash).toBe('#/base64');
    expect(document.title).toBe('Base64 - Dev Toolkit');
  });

  it('loads the tool specified in URL hash on initial render', () => {
    window.location.hash = '#/json';
    render(<Layout tools={TEST_TOOLS} defaultToolId="base64" />);

    expect(screen.getByTestId('tool-json')).toBeInTheDocument();
    expect(document.title).toBe('JSON Formatter - Dev Toolkit');
  });

  it('falls back to default tool if URL hash is invalid', () => {
    window.location.hash = '#/nonexistent';
    render(<Layout tools={TEST_TOOLS} defaultToolId="base64" />);

    expect(screen.getByTestId('tool-base64')).toBeInTheDocument();
    expect(window.location.hash).toBe('#/base64');
    expect(document.title).toBe('Base64 - Dev Toolkit');
  });

  it('updates URL hash and title when selecting a tool from sidebar', () => {
    render(<Layout tools={TEST_TOOLS} defaultToolId="base64" />);

    const jsonBtn = screen.getByRole('button', { name: /JSON Formatter/i });
    fireEvent.click(jsonBtn);

    expect(screen.getByTestId('tool-json')).toBeInTheDocument();
    expect(window.location.hash).toBe('#/json');
    expect(document.title).toBe('JSON Formatter - Dev Toolkit');
  });

  it('handles window hashchange events for browser back/forward navigation', () => {
    render(<Layout tools={TEST_TOOLS} defaultToolId="base64" />);

    expect(screen.getByTestId('tool-base64')).toBeInTheDocument();

    window.location.hash = '#/json';
    fireEvent(window, new Event('hashchange'));

    expect(screen.getByTestId('tool-json')).toBeInTheDocument();
    expect(document.title).toBe('JSON Formatter - Dev Toolkit');
  });

  it('preserves non-default active tool when non-tool anchor like skip link (#main-content) is activated', () => {
    window.location.hash = '#/json';
    render(<Layout tools={TEST_TOOLS} defaultToolId="base64" />);

    expect(screen.getByTestId('tool-json')).toBeInTheDocument();

    const skipLink = screen.getByRole('link', { name: /skip to main content/i });
    expect(skipLink).toHaveAttribute('href', '#main-content');

    window.location.hash = '#main-content';
    fireEvent(window, new Event('hashchange'));

    expect(screen.getByTestId('tool-json')).toBeInTheDocument();
    expect(document.title).toBe('JSON Formatter - Dev Toolkit');
  });

  it('updates URL hash when selecting a tool from sidebar after a non-tool hash (#main-content) is active', () => {
    render(<Layout tools={TEST_TOOLS} defaultToolId="base64" />);

    expect(screen.getByTestId('tool-base64')).toBeInTheDocument();
    expect(window.location.hash).toBe('#/base64');

    window.location.hash = '#main-content';
    fireEvent(window, new Event('hashchange'));

    expect(screen.getByTestId('tool-base64')).toBeInTheDocument();
    expect(window.location.hash).toBe('#main-content');

    const jsonBtn = screen.getByRole('button', { name: /JSON Formatter/i });
    fireEvent.click(jsonBtn);

    expect(screen.getByTestId('tool-json')).toBeInTheDocument();
    expect(window.location.hash).toBe('#/json');
    expect(document.title).toBe('JSON Formatter - Dev Toolkit');
  });
});
