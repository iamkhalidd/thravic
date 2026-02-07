# Traffic Intelligence & Behavior Analytics SaaS

A comprehensive analytics platform for tracking traffic sources, user behavior, funnels, heatmaps, and session recordings with AI-powered insights.

## Project Structure

```
tracking/
├── apps/
│   ├── web/          # Next.js frontend (app.yoursite.com)
│   └── server/       # Express API backend (api.yoursite.com)
└── packages/
    └── tracking-script/  # Embeddable tracking script (cdn.yoursite.com)
```

## Getting Started

### Prerequisites
- Node.js 18+
- PostgreSQL 14+
- Redis (optional, for caching)

### Installation

```bash
# Install all dependencies
npm install

# Start development servers
npm run dev

# Or start individually
npm run dev:web      # Frontend on http://localhost:3000
npm run dev:server   # API on http://localhost:3001
```

## Features

- 📊 Traffic source analytics with full UTM support
- 🔄 Conversion funnel builder
- 🔥 Click and scroll heatmaps
- 🎬 Privacy-safe session recordings
- 🤖 AI-powered insights and predictions
- 🌐 Multi-domain support
- 📋 Easy one-line script integration

## License

MIT
