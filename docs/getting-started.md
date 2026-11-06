# Getting started

Central Chat is a personal archive for ChatGPT, Claude, and Raycast exports.
The [public demo](https://centralchat.fyi) contains fictional data. Run your own
instance to import your conversations.

## Run with Docker

You need Docker Compose, Node.js 22 or later, and the exact **pnpm 11.19.0** version
declared in `frontend/package.json`. The JavaScript commands below use the `sfw`
package-security launcher required by this project's workstation policy.

Clone the public repository and build the frontend:

```sh
git clone https://github.com/daveonkels/centralchat.git
cd centralchat
mkdir -p data imports
cd frontend
sfw pnpm install --frozen-lockfile
sfw pnpm run build
cd ..
docker compose up -d --build
```

Open [localhost:3000](http://localhost:3000). The frontend Docker image serves the
already-built `frontend/dist/` with nginx; it does not install JavaScript packages
inside Docker. Rebuild that directory before rebuilding the frontend image after
source changes.

The included Compose configuration binds the app to your computer's loopback
interface. For remote use, place it behind a private network or authenticated
reverse proxy. Central Chat does not provide built-in user accounts or
authentication.

## Local development

For development without Docker, also install Python 3.10 or later. From the
repository root, start the backend in one terminal:

```sh
cd backend
python3 -m venv .venv
source .venv/bin/activate
python -m pip install -r requirements.txt
export DATABASE_PATH=../data/central-chat.db
export IMPORTS_PATH=../imports
python -m uvicorn app.main:app --host 127.0.0.1 --port 8000
```

Start the frontend in another terminal, from the repository root:

```sh
cd frontend
sfw pnpm install --frozen-lockfile
sfw pnpm run dev --host 127.0.0.1
```

Open [localhost:3000](http://localhost:3000). Vite forwards `/api` requests to the
backend on port 8000. Stop the Docker services first if they are using these ports.

## Import your conversations

**Need the files first?** Follow [Get your chat exports](exporting-your-chats.md)
for step-by-step ChatGPT and Claude download instructions, the Raycast macOS
exporter workflow, expected filenames, and troubleshooting. Raycast `.rayconfig`
backups are not supported.

Open **Import** in Central Chat. Choose either method:

### Detect & Import

This is the easiest option for large or multipart exports.

1. Extract each complete export into its own folder under `imports/`, or the
   server folder shown in the dialog.
2. Keep all `conversations-*.json` parts together. Nested folders are supported.
3. Finish copying the files, then choose **Rescan folder**.
4. Review the detected exports and skipped-file explanations, then choose
   **Detect & Import**.

Detection runs when you scan; it is not an automatic file watcher. ZIP files in
the server folder must be extracted first. Folder imports run in the background,
and reopening the dialog reconnects to an active job.

### Upload & Import

Choose a complete export ZIP or a standalone JSON file, then select **Upload &
Import**. Uploads are limited to 512 MB. For larger exports, use the server folder
method instead of uploading individual JSON parts.

Re-importing the same export skips existing messages. ChatGPT and Claude exports
with stable source IDs also merge newly added messages. Fresh Raycast exports can
produce duplicates; see the [Raycast caveat](exporting-your-chats.md#if-the-import-does-not-work).
Review the completion summary for skipped
items or errors. **History** shows past imports; **Maintenance** contains archive
removal controls.

| Source | Recognized conversation files |
| --- | --- |
| ChatGPT | `conversations.json` or numbered `conversations-*.json` parts |
| Claude | `conversations.json` |
| Raycast | `raycast_ai_chats.json` |

Attachment metadata is retained where available. The reader displays attachment
references; the archive does not provide the original attachment contents.

## Organize the archive

Use **Filters** or a colored content badge to narrow the list. **Display** controls
density, grouping, sorting, and visible metadata; narrow layouts show only what
fits. Date headings are shown for chronological sorting, while relevance keeps
the strongest search matches first.

Choose **Save view** to remember the current query, filters, sorting, and display
settings. Open saved views from the sidebar or command palette. If you change a
saved view, use **Update view** to keep the changes or **Reset to saved** to undo
them. The sidebar's saved-view menu lets you rename or remove views.

Saved views are stored in your instance's database, so they follow you across
devices connected to that instance. Theme, recent searches, and your unsaved
display preference are stored in each browser.

## Preserve your data

- `data/central-chat.db` stores conversations, messages, import history, and saved
  views. Back up the SQLite database coherently, or stop the backend before
  copying it.
- `imports/` contains your original exports. Keep these outside version control.
- Keep database backups and exports private. Removing the database also removes
  saved views; re-importing exports will not recreate those views.

## Development checks

From `frontend/`, using the existing installed dependencies:

```sh
pnpm exec vitest run
sfw pnpm run build
```

The production frontend is written to `frontend/dist/`. Backend regression tests
are in `backend/tests/`; some exercise a temporary SQLite database or an isolated
HTTP server. Follow each test's prerequisites rather than running migration
rehearsals against your live database.
