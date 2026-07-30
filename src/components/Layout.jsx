import React, { useEffect, useMemo, useState } from 'react';
import Sidebar from './Sidebar.jsx';
import LoadingSpinner from './LoadingSpinner.jsx';
import ToolErrorBoundary from './ToolErrorBoundary.jsx';
import './Layout.css';

function getFallbackToolId(tools, defaultToolId) {
  return tools.some((tool) => tool.id === defaultToolId)
    ? defaultToolId
    : tools[0]?.id;
}

function isToolRouteHash(hash, tools) {
  if (!hash || hash === '#' || hash === '#/') {
    return true;
  }
  if (hash.startsWith('#/')) {
    return true;
  }
  const rawId = hash.startsWith('#') ? hash.substring(1) : hash;
  return tools.some((tool) => tool.id === rawId);
}

function getToolIdFromHash(hash = window.location.hash, tools = []) {
  let rawId = '';
  if (hash.startsWith('#/')) {
    rawId = hash.substring(2);
  } else if (hash.startsWith('#')) {
    rawId = hash.substring(1);
  }
  if (tools.some((tool) => tool.id === rawId)) {
    return rawId;
  }
  return null;
}

/**
 * Provides the responsive application shell and renders the active tool.
 *
 * @param {object} props Component props.
 * @param {Array<object>} props.tools Tool definitions and their React components.
 * @param {string} props.defaultToolId Initially selected tool identifier.
 * @returns {React.JSX.Element} The main application layout.
 */
export default function Layout({ tools, defaultToolId }) {
  const [activeToolId, setActiveToolId] = useState(() => {
    const hashId = getToolIdFromHash(window.location.hash, tools);
    if (hashId) {
      return hashId;
    }
    return getFallbackToolId(tools, defaultToolId);
  });
  const [isSidebarCollapsed, setIsSidebarCollapsed] = useState(false);
  const [isMobileOpen, setIsMobileOpen] = useState(false);

  const activeTool = useMemo(
    () => tools.find((tool) => tool.id === activeToolId) ?? tools[0],
    [activeToolId, tools],
  );

  const handleSelectTool = (toolId) => {
    setActiveToolId(toolId);
    const expectedHash = `#/${toolId}`;
    if (window.location.hash !== expectedHash) {
      window.location.hash = expectedHash;
    }
  };

  useEffect(() => {
    if (activeTool) {
      document.title = `${activeTool.name} - Dev Toolkit`;
    } else {
      document.title = 'Dev Toolkit';
    }
  }, [activeTool]);

  useEffect(() => {
    const expectedHash = `#/${activeToolId}`;
    const currentHash = window.location.hash;

    if (currentHash !== expectedHash) {
      const isInvalidToolRoute =
        isToolRouteHash(currentHash, tools) && !getToolIdFromHash(currentHash, tools);
      if (isInvalidToolRoute && window.history?.replaceState) {
        window.history.replaceState(null, '', expectedHash);
      } else {
        window.location.hash = expectedHash;
      }
    }
  }, [activeToolId, tools]);

  useEffect(() => {
    const handleHashChange = () => {
      const hash = window.location.hash;
      const hashId = getToolIdFromHash(hash, tools);
      if (hashId) {
        setActiveToolId(hashId);
      } else if (isToolRouteHash(hash, tools)) {
        const fallbackId = getFallbackToolId(tools, defaultToolId);
        setActiveToolId(fallbackId);
      }
    };

    window.addEventListener('hashchange', handleHashChange);
    return () => window.removeEventListener('hashchange', handleHashChange);
  }, [tools, defaultToolId]);

  useEffect(() => {
    if (!isMobileOpen) {
      return undefined;
    }

    const handleKeyDown = (event) => {
      if (event.key === 'Escape') {
        setIsMobileOpen(false);
      }
    };

    document.addEventListener('keydown', handleKeyDown);
    return () => document.removeEventListener('keydown', handleKeyDown);
  }, [isMobileOpen]);

  if (!activeTool) {
    return (
      <main className="layout__empty">
        <h1>No tools available</h1>
        <p>Add a tool definition to start using Dev Toolkit.</p>
      </main>
    );
  }

  const ActiveToolComponent = activeTool.component;
  const layoutClassName = [
    'layout',
    isSidebarCollapsed ? 'layout--sidebar-collapsed' : '',
  ]
    .filter(Boolean)
    .join(' ');

  return (
    <div className={layoutClassName}>
      <a className="layout__skip-link" href="#main-content">
        Skip to main content
      </a>

      <div className="sr-only" aria-live="polite" aria-atomic="true" role="status">
        {`Active tool: ${activeTool.name}`}
      </div>

      <Sidebar
        tools={tools}
        activeToolId={activeTool.id}
        isCollapsed={isSidebarCollapsed}
        isMobileOpen={isMobileOpen}
        onSelectTool={handleSelectTool}
        onToggleCollapse={() => setIsSidebarCollapsed((isCollapsed) => !isCollapsed)}
        onCloseMobile={() => setIsMobileOpen(false)}
      />

      <div className="layout__page">
        <header className="layout__mobile-header">
          <button
            className="layout__menu-button"
            type="button"
            onClick={() => setIsMobileOpen(true)}
            aria-controls="tool-navigation"
            aria-expanded={isMobileOpen}
            aria-label="Open tool navigation"
          >
            <span aria-hidden="true" />
            <span aria-hidden="true" />
            <span aria-hidden="true" />
          </button>

          <div className="layout__mobile-brand">
            <span aria-hidden="true">⚡</span>
            <strong>Dev Toolkit</strong>
          </div>

          <span className="layout__mobile-tool-icon" aria-hidden="true">
            {activeTool.icon}
          </span>
        </header>

        <div className="layout__content">
          <header className="layout__content-header">
            <div>
              <p className="layout__breadcrumb">Tools / {activeTool.category}</p>
              <h1>{activeTool.name}</h1>
            </div>
            <span className="layout__local-badge">
              <span aria-hidden="true" />
              Runs locally
            </span>
          </header>

          <main id="main-content" className="layout__main" tabIndex="-1">
            <ToolErrorBoundary resetKey={activeTool.id}>
              <React.Suspense fallback={<LoadingSpinner />}>
                <ActiveToolComponent
                  tool={activeTool}
                  onBack={() => handleSelectTool(defaultToolId)}
                />
              </React.Suspense>
            </ToolErrorBoundary>
          </main>

          <footer className="layout__footer">
            <p>Private by design. Your data stays in your browser.</p>
            <span>Built by the autonomous AI swarm.</span>
          </footer>
        </div>
      </div>
    </div>
  );
}
