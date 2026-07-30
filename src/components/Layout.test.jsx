import React from 'react';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import Layout from './Layout.jsx';

function WorkingTool({ tool }) {
  return <p>{tool.name} content</p>;
}

function BrokenTool() {
  throw new Error('chunk failed to load');
}

function buildTools() {
  return [
    {
      id: 'good',
      name: 'Good Tool',
      description: 'Renders fine.',
      icon: '✓',
      category: 'Test',
      component: WorkingTool,
    },
    {
      id: 'broken',
      name: 'Broken Tool',
      description: 'Always throws.',
      icon: '✗',
      category: 'Test',
      component: BrokenTool,
    },
  ];
}

describe('Layout Component', () => {
  let consoleErrorSpy;

  beforeEach(() => {
    consoleErrorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
  });

  afterEach(() => {
    cleanup();
    consoleErrorSpy.mockRestore();
  });

  it('renders the active tool normally', () => {
    render(<Layout tools={buildTools()} defaultToolId="good" />);

    expect(screen.getByText('Good Tool content')).toBeInTheDocument();
  });

  it('shows a fallback while a lazy tool is loading (Suspense regression)', async () => {
    const LazyTool = React.lazy(
      () =>
        new Promise((resolve) => {
          setTimeout(
            () => resolve({ default: ({ tool }) => <p>{tool.name} loaded</p> }),
            10,
          );
        }),
    );
    const tools = [
      {
        id: 'lazy',
        name: 'Lazy Tool',
        description: 'Loads asynchronously.',
        icon: '⏳',
        category: 'Test',
        component: LazyTool,
      },
    ];

    render(<Layout tools={tools} defaultToolId="lazy" />);

    expect(screen.getByRole('status')).toBeInTheDocument();
    expect(screen.getByText('Loading tool...')).toBeInTheDocument();

    await waitFor(() => {
      expect(screen.getByText('Lazy Tool loaded')).toBeInTheDocument();
    });
  });

  it('isolates a failing active tool to the tool area without unmounting the sidebar', () => {
    render(<Layout tools={buildTools()} defaultToolId="broken" />);

    const alert = screen.getByRole('alert');
    expect(alert).toBeInTheDocument();
    expect(alert).toHaveTextContent("This tool couldn't be loaded");

    expect(screen.getByRole('button', { name: 'Good Tool' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Broken Tool' })).toBeInTheDocument();
  });

  it('recovers when the user selects a different tool from the sidebar after an error', () => {
    render(<Layout tools={buildTools()} defaultToolId="broken" />);

    expect(screen.getByRole('alert')).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: 'Good Tool' }));

    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
    expect(screen.getByText('Good Tool content')).toBeInTheDocument();
  });
});
