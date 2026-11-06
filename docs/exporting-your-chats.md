# Get your chat exports

Start here before opening **Import** in Central Chat. You download the files from
each service yourself; Central Chat does not sign in to your accounts.

| Your source | How to get the file | What Central Chat accepts |
| --- | --- | --- |
| [ChatGPT](#chatgpt) | Request an account export; download the ZIP | Complete ZIP, or all conversation JSON parts kept together |
| [Claude](#claude) | Request an account export; download it from the email | ZIP containing `conversations.json`, or that JSON file |
| [Raycast](#raycast-macos) | Run the separate macOS chat exporter | Its `raycast_ai_chats.json`; not a `.rayconfig` backup |

## ChatGPT

1. Sign in to [ChatGPT](https://chatgpt.com) in your browser.
2. Open your profile menu, then **Settings → Data controls → Export data → Export**.
3. Select **Confirm export** and wait for the download email or SMS. It can take
   up to seven days; the link expires after 24 hours.
4. Download the ZIP while signed in to the same account. Keep the complete file.

If the option is missing, check which workspace you are using. Business,
Enterprise, and Healthcare workspaces do not offer self-service export; Edu
availability depends on workspace settings. A consumer account can also request
data through the [Privacy Portal](https://privacy.openai.com).
See [OpenAI's current instructions](https://help.openai.com/en/articles/7260999-exporting-your-chatgpt-history-and-data).

**Then import:** upload the complete ZIP, or extract it into its own import folder.
Central Chat looks for `conversations.json` or numbered `conversations-*.json`
files. Keep every numbered part together. `chat.html` is a readable copy, not a
supported import file. You do not need to export chats one at a time.

## Claude

1. Sign in to [Claude](https://claude.ai) in a browser or open Claude Desktop.
2. Open **Settings → Privacy**, then select **Export data**.
3. Wait for the email sent to your account address.
4. Open its download link while signed in and save the export. The link expires
   after 24 hours; request another export if it has expired.

Use the browser or desktop app for this step; Claude's iOS and Android apps do
not offer export. On a managed plan, an owner may need to enable individual
exports. Organization-wide exports are a separate format and are not validated
by Central Chat's personal conversation importer.
See [Claude's current instructions](https://support.claude.com/en/articles/9450526-export-your-claude-data).

**Then import:** upload the ZIP containing `conversations.json`, or extract the
export into its own import folder. A standalone `conversations.json` also works.
Account metadata such as `users.json`, a download manifest, or a shared-chat URL
is not a conversation export.

## Raycast (macOS)

Central Chat accepts JSON from the separate
[Raycast AI Chat Exporter](https://github.com/daveonkels/raycast-ai-exporter).
It automates the visible chat window; compatibility depends on Raycast's UI.

1. On the Mac with your chats, install the exporter's prerequisites: **uv** and
   Raycast AI Chat. Clone the exporter using its
   [setup instructions](https://github.com/daveonkels/raycast-ai-exporter#installation).
2. Open the **AI Chat window**, and grant your terminal **System Settings →
   Privacy & Security → Accessibility** permission.
3. Run the exporter's [quick test command](https://github.com/daveonkels/raycast-ai-exporter#quick-start).
   It exports five chats by default. Keep the window visible and avoid using the
   keyboard or mouse while it runs.
4. Inspect the result, then run the full-export command with **`--all`**. The
   default output is **`~/Desktop/raycast_ai_chats.json`**. Dates are approximate;
   check long conversations for missing messages before importing.

**Then import:** upload that JSON or place it in its own import folder.

Raycast's built-in **Export Settings & Data** produces an encrypted `.rayconfig`
backup. Central Chat cannot import it, nor Snippets or Quicklinks JSON.
See [Raycast's backup documentation](https://manual.raycast.com/import-export).

The exporter uses macOS Accessibility APIs; this workflow is not available on
Windows or iOS. Current Raycast-version compatibility has not been revalidated
here. If the five-chat test fails, use the exporter's
[troubleshooting guide](https://github.com/daveonkels/raycast-ai-exporter#troubleshooting)
before attempting a full export.

## Bring the files into Central Chat

Open **Import** and choose one of the two methods:

- **Upload & Import:** select a complete ZIP or a single supported JSON file from
  your computer. The upload limit is **512 MB**. Keep the dialog open during upload.
- **Detect & Import:** best for large or multipart exports. Extract each ZIP into
  a separate subfolder of the server's configured imports directory. Put Raycast's
  JSON in a subfolder too. Finish copying, choose **Rescan folder**, review the
  detected exports, and select **Detect & Import**.

For the repository's Docker setup, the host directory is `centralchat/imports/`:

```text
imports/
├── chatgpt-november/
│   ├── conversations-000.json
│   ├── conversations-001.json
│   └── …                          # keep all parts from this export
├── claude-november/
│   └── conversations.json
└── raycast-november/
    └── raycast_ai_chats.json
```

These are illustrative filenames; keep the names supplied by your export.
ChatGPT may use one `conversations.json` instead. Nested export folders work.
Keep Claude and ChatGPT in separate folders even when their filenames match.

The folder shown in the dialog belongs to the **server**. In Docker it may say
`/app/imports`; the included Compose file maps your host's `./imports` there.
If the server is on another computer, copy files to that computer's configured
imports folder or use Upload & Import from your browser. A file in your laptop's
Downloads folder will not appear in a remote server scan.

## If the import does not work

| What you see | What to check |
| --- | --- |
| No exports detected | Extract ZIPs before folder scanning; verify the server/host folder mapping and rescan after copying finishes. Upload accepts ZIPs directly. |
| An unsupported format | Check the expected file above. PDFs, HTML, share links, `.rayconfig`, and unrelated JSON are not supported. Renaming them to `conversations.json` will not convert them. |
| Only part of your ChatGPT history | Keep every numbered JSON part from the same export together; import the whole ZIP or folder. |
| Upload too large | Use Detect & Import for exports over 512 MB; a reverse proxy may also impose a smaller upload limit. |
| A download link has expired | Request another export from the provider and download it promptly. |
| Raycast chats are empty or incomplete | Check Accessibility permission, keep AI Chat visible, and follow the exporter's troubleshooting steps before importing. |

Review the completion summary and **History** for counts or errors. Keep exports
private and outside Git. The public demo accepts no personal imports.

To update your archive, export again and import the new files. ChatGPT and Claude
messages with stable source IDs merge into existing conversations. **Raycast
caveat:** its current importer derives IDs partly from the export timestamp, so
a fresh export can create duplicates even when re-importing the identical file
does not. Back up your database before replacing or consolidating Raycast history.

Provider instructions checked November 6, 2026; menu labels and availability can
change. This guide verifies instructions and supported file shapes, not a fresh
export from each provider account.
