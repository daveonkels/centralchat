# Central Chat Archive

A local web application to search across your AI chat history from ChatGPT, Claude, and Raycast.

## Quick Start

### Using Docker Compose (Recommended)

```bash
# Build and start
docker compose up -d

# Open in browser
open http://localhost:3000
```

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

## Usage

### Importing Chats

1. Place your export folders in the `imports/` directory:
   - **Claude**: Export from claude.ai Settings > Export Data
   - **ChatGPT**: Export from OpenAI Settings > Data Controls > Export
   - **Raycast**: Export from Raycast AI Chat History

2. Open the web UI at http://localhost:3000

3. Click "Import" and then "Run Import"

### Searching

- Type in the search box to search across all messages and conversation titles
- Use platform filters to narrow results
- Click on a result to view the full conversation

## Project Structure

```
central-chat/
├── docker-compose.yml      # Run with: docker compose up
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
