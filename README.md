# Central Chat

**A good answer is worth finding again.**

Search your ChatGPT, Claude, and Raycast conversations in one personal archive.
Import your exports, find the message you remember, and keep useful searches a
click away. Run Central Chat on your computer or on a server you control.

[Try the interactive demo](https://centralchat.fyi) · [Get started](docs/getting-started.md) · [MIT license](LICENSE)

![Central Chat archive in dark mode, showing fictional conversations and content badges](docs/screenshots/archive-dark.png)

## Find more than a title

- **Search titles and messages** with SQLite FTS5. Results show matching text and
  open the conversation at the relevant message.
- **Filter by content.** Click the colored Code, Images, Tables, Files, Audio, or
  Video badges, or choose a content type in Filters. Combine it with a source,
  message role, date, or search query.
- **Save a view.** Keep a search, filters, sorting, and display settings together.
  Saved views live in your database and are available from every device connected
  to your instance. Update, rename, or remove a view without changing the archive.
- **Make the list your own.** Display offers compact or comfortable rows, date or
  source grouping, sorting, and controls for visible metadata and search previews.
- **Move through conversations.** Previous/next controls follow the current view
  across pages. Use `J` and `K` while reading, or open the command palette with
  `⌘K` / `Ctrl+K`.
- **Read comfortably.** Light and dark themes, responsive layouts, formatted
  Markdown tables, syntax-highlighted code, and copy controls for messages and
  links.
- **Import complete exports.** Detect extracted folders or upload a ZIP/JSON.
  Numbered ChatGPT JSON parts stay together; re-imports merge new messages without
  duplicating existing ones.

## Quick start

The [public demo](https://centralchat.fyi) uses fictional conversations. Explore
its interface, then [run your own instance](docs/getting-started.md) to use your
real exports. Demo saved views stay in that browser; your own instance stores
views on the server. Every screenshot below uses synthetic demo data.

Central Chat stores conversations and saved views in SQLite. It does not require
AI API keys or send your archive to an AI service. A self-hosted instance sends
data between your browser and your server. Attachment badges describe references
found in an export; they do not mean the original files are available. Referenced
images appear as links, and opening an external link contacts that destination.

## Search and shortcuts

Search normally, or combine words with operators:

```text
espresso platform:claude
"design tokens" role:assistant
garden before:2026-06-01
```

The self-hosted search supports FTS expressions such as `coffee OR tea` and prefix
searches such as `garden*`. Source values are `openai`, `claude`, and `raycast`.
One content type can be selected at a time, alongside the other filters.

| Shortcut | Action |
| --- | --- |
| `⌘K` / `Ctrl+K` | Open commands, saved views, filters, and actions |
| `/` | Focus archive search |
| `↑` / `↓`, then `Enter` | Navigate focused results and open a conversation |
| `J` / `K` | Next / previous conversation while reading |
| `?` | Open help when not typing in a control |
| `Escape` | Close a dialog or clear the focused search field |

## A closer look

### Conversation reader

![Central Chat conversation reader in light mode, using fictional messages](docs/screenshots/reader-light.png)

### Commands

![Central Chat command palette with filters and saved views](docs/screenshots/commands.png)

### On your phone

<img src="docs/screenshots/mobile.png" alt="Central Chat mobile interface with fictional conversations" width="390">

## Built with

| Layer | Technology |
| --- | --- |
| Frontend | React, TypeScript, Vite |
| Backend | Python, FastAPI |
| Storage and search | SQLite with FTS5 |
| Hosting | Your computer or server; Docker and nginx support |

The interface adapts patterns from [Circle](https://github.com/ln-dev7/circle).
Its MIT notice is retained in [the frontend licenses](frontend/public/licenses/circle.txt).

## Development

See [Getting started](docs/getting-started.md) for Docker, local development,
imports, and data storage. JavaScript tooling uses **pnpm 11.19.0**, as declared
in [frontend/package.json](frontend/package.json). Use the locked dependencies;
do not substitute another package manager.

Central Chat is released under the [MIT license](LICENSE).
