# Central Chat Archive

A local web application to search across your AI chat history from ChatGPT, Claude, and Raycast.

## Features

- **Full-text search** across all conversations and messages with SQLite FTS5
- **Platform-specific theming** - Claude (amber), ChatGPT (teal), and Raycast (rose) each have distinct color accents
- **Deep linking** - each conversation has a shareable URL (`/c/{id}`)
- **Syntax highlighting** for code blocks with one-click copy
- **Copy message button** - hover any message to copy its content
- **Virtualized lists** - smooth scrolling with thousands of conversations
- **Last imported date** - track when data was last updated
- **Keyboard shortcuts** - `Cmd+K` to focus search

## Quick Start (Local)

### Using Docker Compose

```bash
# Build and start
docker compose up -d

# Open in browser
open http://localhost:3000
```

Note: Docker Compose binds to `127.0.0.1` by default for local-only access. If you want to expose it on your network, change the port mappings in `docker-compose.yml` and add authentication at the proxy.

### Manual Setup

**Backend (requires Python 3.10-3.12):**
```bash
cd backend
python3 -m venv .venv
source .venv/bin/activate
pip install -r requirements.txt

# Set environment variables
export DATABASE_PATH=../data/central-chat.db
export IMPORTS_PATH=../imports

# Run
uvicorn app.main:app --reload --port 8000
```

**Frontend:**
```bash
cd frontend
npm install
npm run dev
```

## Server Deployment (Traefik)

For deployment to a server with an existing Traefik + Docker Compose setup:

### 1. Copy project and build images

```bash
# Copy to server
rsync -avz --exclude 'imports/*/' --exclude 'node_modules' --exclude '.venv' \
  --exclude 'data/*.db' --exclude '.git' \
  ./ yourserver:~/apps/central-chat/

# SSH to server and build images
ssh yourserver
cd ~/apps/central-chat
docker build -t central-chat-backend:latest ./backend
docker build -t central-chat-frontend:latest ./frontend
```

### 2. Create data directories

```bash
mkdir -p ~/data/central-chat/imports
```

### 3. Add to existing docker-compose.yml

Add these services to your main `docker-compose.yml`:

```yaml
## CENTRAL-CHAT (AI Chat Archive)
  central-chat-backend:
    image: central-chat-backend:latest
    container_name: central-chat-backend
    restart: unless-stopped
    volumes:
      - /home/cooper/data/central-chat:/app/data
      - /home/cooper/data/central-chat/imports:/app/imports:ro
    environment:
      - DATABASE_PATH=/app/data/central-chat.db
      - IMPORTS_PATH=/app/imports
    networks:
      - proxy

  central-chat-frontend:
    image: central-chat-frontend:latest
    container_name: central-chat-frontend
    restart: unless-stopped
    depends_on:
      - central-chat-backend
    networks:
      - proxy
    labels:
      - "traefik.enable=true"
      - "traefik.http.routers.central-chat.entrypoints=http"
      - "traefik.http.routers.central-chat.rule=Host(`central-chat.example.com`)"
      - "traefik.http.middlewares.central-chat-https-redirect.redirectscheme.scheme=https"
      - "traefik.http.routers.central-chat.middlewares=central-chat-https-redirect"
      - "traefik.http.routers.central-chat-secure.entrypoints=https"
      - "traefik.http.routers.central-chat-secure.rule=Host(`central-chat.example.com`)"
      - "traefik.http.routers.central-chat-secure.tls=true"
      - "traefik.http.routers.central-chat-secure.service=central-chat"
      - "traefik.http.services.central-chat.loadbalancer.server.port=80"
      - "traefik.docker.network=proxy"
## END
```

### 4. Start services

```bash
docker compose up -d central-chat-backend central-chat-frontend
```

### 5. Upload exports and import

```bash
# From local machine, upload exports
rsync -avz imports/claude-*/ yourserver:~/data/central-chat/imports/claude-export/
rsync -avz imports/openai-*/ yourserver:~/data/central-chat/imports/openai-export/
rsync -avz imports/raycast-*/ yourserver:~/data/central-chat/imports/raycast-export/

# Trigger import via API
curl -X POST https://central-chat.example.com/api/import/run
```

## Usage

### Importing Chats

1. Place your export folders in the `imports/` directory:
   - **Claude**: Export from claude.ai Settings > Export Data
   - **ChatGPT**: Export from OpenAI Settings > Data Controls > Export
   - **Raycast**: Export from Raycast AI Chat History

2. Open the web UI

3. Click "Import" and then "Run Import"

### Searching

- Type in the search box to search across all messages and conversation titles
- Use platform filters to narrow results
- Click on a result to view the full conversation
- Search operators:
  - `platform:openai`, `platform:claude`, `platform:raycast`
  - `role:user`, `role:assistant`, `from:assistant`
  - `before:YYYY-MM-DD`

### Data Storage

- Database is stored locally at `data/central-chat.db`

## Project Structure

```
central-chat/
├── docker-compose.yml      # Local dev: docker compose up
├── backend/
│   ├── app/
│   │   ├── main.py         # FastAPI app
│   │   ├── database.py     # SQLite + FTS5
│   │   ├── models.py       # Pydantic models
│   │   ├── routers/        # API endpoints
│   │   └── parsers/        # Platform-specific parsers
│   └── Dockerfile
├── frontend/
│   ├── src/
│   │   ├── App.tsx         # Main React component
│   │   ├── components/     # UI components
│   │   └── api/            # API client
│   ├── nginx.conf          # Proxies /api to backend
│   └── Dockerfile
├── data/                   # SQLite database (auto-created)
└── imports/                # Drop export folders here
```

## Supported Export Formats

| Platform | Files Required | Notes |
|----------|---------------|-------|
| Claude | `conversations.json` | Full message history with timestamps |
| ChatGPT | `conversations.json` | Tree-based messages, includes media refs |
| Raycast | `raycast_ai_chats.json` | Simple format, no per-message timestamps |

## API Endpoints

- `GET /api/search?q=query` - Full-text search
- `GET /api/conversations` - List all conversations
- `GET /api/conversations/{id}` - Get conversation with messages
- `GET /api/conversations/stats` - Database statistics
- `GET /api/import/scan` - Detect export folders
- `POST /api/import/run` - Run import for all detected exports
