# WebRTC 1:1 Real-time Communication

A Next.js 16 application for 1:1 video chat with real-time whiteboard collaboration using WebRTC.

## Features

- 🎥 1:1 Video and Audio Communication
- 🖥️ Screen Sharing
- 🎨 Real-time Collaborative Whiteboard
- 🔒 No Registration Required
- ⚡ P2P Connection for Low Latency

## Tech Stack

- **Frontend**: Next.js 16 (App Router), React 19
- **UI**: Tailwind CSS, shadcn/ui
- **WebRTC**: SimplePeer
- **Signaling**: Socket.io-client
- **Canvas**: Fabric.js

## Project Structure

```
├── app/                    # Next.js App Router pages
├── components/
│   ├── room/              # Video chat components
│   ├── whiteboard/        # Whiteboard components
│   └── ui/                # shadcn/ui components
├── contexts/              # React Context providers
├── hooks/                 # Custom React hooks
├── services/              # Service layer (Socket, WebRTC, Whiteboard)
└── lib/                   # Utility functions
```

## Getting Started

### Prerequisites

- Node.js 20+
- npm or yarn

### Installation

```bash
# Install dependencies
npm install

# Copy environment variables
cp .env.local.example .env.local

# Run development server
npm run dev
```

Open [http://localhost:3000](http://localhost:3000) to view the application.

### Environment Variables

Create a `.env.local` file with the following variables:

```env
NEXT_PUBLIC_SOCKET_URL=http://localhost:3001
NEXT_PUBLIC_STUN_SERVER=stun:stun.l.google.com:19302
```

## Development

```bash
# Run development server
npm run dev

# Build for production
npm run build

# Start production server
npm start

# Run linter
npm run lint

# Format code with Biome
npm run format

# Check code formatting
npm run format:check

# Run Biome linter and formatter
npm run biome:check

# Auto-fix with Biome
npm run biome:fix
```

### Code Quality Tools

This project uses **Biome** for fast and consistent code formatting and linting:

- **Formatter**: Automatically formats JavaScript/TypeScript code
- **Linter**: Catches common errors and enforces best practices
- **Line Ending**: LF (Unix-style) for cross-platform compatibility
- **Quote Style**: Double quotes
- **Indent**: 2 spaces

Configuration is in `biome.json` and `.editorconfig`.

## Implementation Status

This project follows a spec-driven development approach. See `.kiro/specs/webrtc-1-to-1-communication/` for:

- `requirements.md` - Feature requirements
- `design.md` - System design
- `tasks.md` - Implementation tasks

## License

See LICENSE file for details.
webrtc를 활용한 실시간 화이트보드, 웹캠, 음성 공유 서비스
