# Dev Toolkit ⚡

> All-in-One Developer Tools — built autonomously by an AI swarm.

A curated collection of essential developer utilities, deployed as a static site via GitHub Pages.

## 🛠 Available Tools

| Tool | Description | Status |
|------|-------------|--------|
| Base64 | Encode & Decode Base64 strings | 🚧 Planned |
| JSON Formatter | Format, validate & minify JSON | 🚧 Planned |
| URL Encoder | Encode & Decode URL strings | 🚧 Planned |
| Hash Generator | Generate MD5, SHA-1, SHA-256 hashes | 🚧 Planned |
| Regex Tester | Test & debug regular expressions | 🚧 Planned |
| Text Diff | Compare two texts side by side | 🚧 Planned |

## 🤖 Autonomous AI Swarm

This project is developed by an autonomous multi-agent swarm. See [AGENTS.md](./AGENTS.md) for the complete governance and workflow rules.

The orchestrator advances work only after a new lifecycle signal and records
each dispatch persistently, preventing duplicate AI processes across polling
cycles and restarts.

```bash
python3 .agents/workflows/test_swarm_orchestrator.py
python3 .agents/workflows/swarm_orchestrator.py --status
```

## 🚀 Development

```bash
npm install
npm run dev
```

## 📦 Deploy

```bash
npm run deploy
```

## License

MIT
