import React from 'react';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import Sidebar from './Sidebar.jsx';

function buildTools() {
  return [
    {
      id: 'base64',
      name: 'Base64',
      description: 'Encode and decode Base64 strings without leaving your browser.',
      icon: '⌁',
      category: 'Encoder',
    },
    {
      id: 'json',
      name: 'JSON Formatter',
      description: 'Format, validate, and minify JSON with a clear structured view.',
      icon: '{ }',
      category: 'Formatter',
    },
    {
      id: 'uuid',
      name: 'UUID Generator',
      description: 'Generate and format random UUID v4 or time-ordered UUID v7 batches.',
      icon: '⌗',
      category: 'Generator',
    },
  ];
}

function renderSidebar(overrides = {}) {
  const onSelectTool = vi.fn();
  const onToggleCollapse = vi.fn();
  const onCloseMobile = vi.fn();

  const props = {
    tools: buildTools(),
    activeToolId: 'base64',
    isCollapsed: false,
    isMobileOpen: false,
    onSelectTool,
    onToggleCollapse,
    onCloseMobile,
    ...overrides,
  };

  render(<Sidebar {...props} />);

  return { onSelectTool, onToggleCollapse, onCloseMobile };
}

afterEach(() => {
  cleanup();
});

describe('Sidebar search input', () => {
  it('has an accessible name and type="search"', () => {
    renderSidebar();

    const input = screen.getByRole('searchbox', { name: 'Filter tools' });
    expect(input).toHaveAttribute('type', 'search');
  });

  it('narrows the tool list as the user types', () => {
    renderSidebar();

    const input = screen.getByRole('searchbox', { name: 'Filter tools' });
    fireEvent.change(input, { target: { value: 'json' } });

    expect(screen.getByRole('button', { name: /JSON Formatter/ })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /^Base64/ })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /UUID Generator/ })).not.toBeInTheDocument();
  });

  it('matches on category', () => {
    renderSidebar();

    const input = screen.getByRole('searchbox', { name: 'Filter tools' });
    fireEvent.change(input, { target: { value: 'encoder' } });

    expect(screen.getByRole('button', { name: /^Base64/ })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /JSON Formatter/ })).not.toBeInTheDocument();
  });

  it('shows an empty state message when nothing matches', () => {
    renderSidebar();

    const input = screen.getByRole('searchbox', { name: 'Filter tools' });
    fireEvent.change(input, { target: { value: 'nonexistent-tool-xyz' } });

    expect(screen.getByText('No tools match "nonexistent-tool-xyz"')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /^Base64/ })).not.toBeInTheDocument();
  });

  it('focuses the search input when "/" is pressed outside of an editable element', () => {
    renderSidebar();

    const input = screen.getByRole('searchbox', { name: 'Filter tools' });
    expect(input).not.toHaveFocus();

    fireEvent.keyDown(window, { key: '/' });

    expect(input).toHaveFocus();
  });

  it('ignores "/" when a text input already has focus', () => {
    render(
      <div>
        <input aria-label="Some other field" />
        <Sidebar
          tools={buildTools()}
          activeToolId="base64"
          isCollapsed={false}
          isMobileOpen={false}
          onSelectTool={vi.fn()}
          onToggleCollapse={vi.fn()}
          onCloseMobile={vi.fn()}
        />
      </div>,
    );

    const otherField = screen.getByLabelText('Some other field');
    otherField.focus();
    expect(otherField).toHaveFocus();

    fireEvent.keyDown(window, { key: '/' });

    const searchInput = screen.getByRole('searchbox', { name: 'Filter tools' });
    expect(otherField).toHaveFocus();
    expect(searchInput).not.toHaveFocus();
  });

  it('clears the query and restores the full list on Escape while focused', () => {
    renderSidebar();

    const input = screen.getByRole('searchbox', { name: 'Filter tools' });
    fireEvent.change(input, { target: { value: 'json' } });
    expect(screen.queryByRole('button', { name: /^Base64/ })).not.toBeInTheDocument();

    input.focus();
    fireEvent.keyDown(input, { key: 'Escape' });

    expect(input).toHaveValue('');
    expect(screen.getByRole('button', { name: /^Base64/ })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /JSON Formatter/ })).toBeInTheDocument();
  });

  it('removes its keydown listener on unmount', () => {
    const removeEventListenerSpy = vi.spyOn(window, 'removeEventListener');
    const { unmount } = render(<Sidebar {...{
      tools: buildTools(),
      activeToolId: 'base64',
      isCollapsed: false,
      isMobileOpen: false,
      onSelectTool: vi.fn(),
      onToggleCollapse: vi.fn(),
      onCloseMobile: vi.fn(),
    }} />);

    unmount();

    expect(removeEventListenerSpy).toHaveBeenCalledWith('keydown', expect.any(Function));
    removeEventListenerSpy.mockRestore();
  });
});

describe('Sidebar active tool with filtering', () => {
  it('keeps the active tool unchanged when it is filtered out of view', () => {
    const { onSelectTool } = renderSidebar({ activeToolId: 'base64' });

    const input = screen.getByRole('searchbox', { name: 'Filter tools' });
    fireEvent.change(input, { target: { value: 'json' } });

    expect(screen.queryByRole('button', { name: /^Base64/ })).not.toBeInTheDocument();
    expect(onSelectTool).not.toHaveBeenCalled();

    const jsonButton = screen.getByRole('button', { name: /JSON Formatter/ });
    expect(jsonButton).not.toHaveAttribute('aria-current');
  });
});

describe('Sidebar tool selection', () => {
  it('calls onSelectTool and onCloseMobile and resets the query', () => {
    const { onSelectTool, onCloseMobile } = renderSidebar();

    const input = screen.getByRole('searchbox', { name: 'Filter tools' });
    fireEvent.change(input, { target: { value: 'json' } });

    const jsonButton = screen.getByRole('button', { name: /JSON Formatter/ });
    fireEvent.click(jsonButton);

    expect(onSelectTool).toHaveBeenCalledWith('json');
    expect(onCloseMobile).toHaveBeenCalledTimes(1);
    expect(input).toHaveValue('');
    expect(screen.getByRole('button', { name: /^Base64/ })).toBeInTheDocument();
  });
});
