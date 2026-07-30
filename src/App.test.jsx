import { cleanup, render, screen, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';
import App from './App.jsx';

afterEach(() => {
  cleanup();
});

describe('App Component', () => {
  it('renders application with lazy loaded tools wrapped in Suspense', async () => {
    render(<App />);

    await waitFor(() => {
      expect(screen.getByRole('heading', { level: 1, name: 'Base64' })).toBeInTheDocument();
    });
  });
});
