import React, { useState } from 'react';
import JsonTool from './tools/json/JsonTool';

const TOOLS = [
  { id: 'base64', name: 'Base64', desc: 'Encode & Decode Base64 strings', icon: '🔐', status: 'planned' },
  { id: 'json', name: 'JSON Formatter', desc: 'Format, validate & minify JSON', icon: '📋', status: 'available' },
  { id: 'url', name: 'URL Encoder', desc: 'Encode & Decode URL strings', icon: '🔗', status: 'planned' },
  { id: 'hash', name: 'Hash Generator', desc: 'Generate MD5, SHA-1, SHA-256 hashes', icon: '🔑', status: 'planned' },
  { id: 'regex', name: 'Regex Tester', desc: 'Test & debug regular expressions', icon: '🧪', status: 'planned' },
  { id: 'diff', name: 'Text Diff', desc: 'Compare two texts side by side', icon: '📝', status: 'planned' },
];

function ToolCard({ tool, onClick }) {
  const isAvailable = tool.status === 'available';
  return (
    <div 
      className={`tool-card ${isAvailable ? 'clickable' : ''}`} 
      onClick={isAvailable ? onClick : undefined}
      style={{ cursor: isAvailable ? 'pointer' : 'default' }}
      role={isAvailable ? "button" : undefined}
      tabIndex={isAvailable ? 0 : undefined}
      onKeyDown={isAvailable ? (e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); onClick(); } } : undefined}
    >
      <div className="tool-icon">{tool.icon}</div>
      <h3 className="tool-name">{tool.name}</h3>
      <p className="tool-desc">{tool.desc}</p>
      <span className={`tool-status status-${tool.status}`}>
        {tool.status === 'planned' ? '🚧 Coming Soon' : '✅ Available'}
      </span>
    </div>
  );
}

export default function App() {
  const [activeTool, setActiveTool] = useState(null);

  return (
    <div className="app">
      <header className="header">
        <div className="header-content">
          <div className="logo" style={{ cursor: 'pointer' }} onClick={() => setActiveTool(null)}>
            <span className="logo-icon">⚡</span>
            <h1>Dev Toolkit</h1>
          </div>
          <p className="tagline">All-in-One Developer Tools</p>
        </div>
      </header>

      <main className="main">
        {activeTool === 'json' ? (
          <JsonTool onBack={() => setActiveTool(null)} />
        ) : (
          <>
            <section className="hero">
              <h2>Essential utilities, always at hand.</h2>
              <p>A curated collection of developer tools built by an autonomous AI swarm.</p>
            </section>

            <section className="tools-grid">
              {TOOLS.map((tool) => (
                <ToolCard 
                  key={tool.id} 
                  tool={tool} 
                  onClick={() => setActiveTool(tool.id)} 
                />
              ))}
            </section>
          </>
        )}
      </main>

      <footer className="footer">
        <p>Built autonomously by the AI Swarm 🤖 &middot; <a href="https://github.com/dragoncowkarma/dev-toolkit" target="_blank" rel="noopener noreferrer">GitHub</a></p>
      </footer>
    </div>
  );
}
