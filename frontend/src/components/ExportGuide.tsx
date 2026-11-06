import { PlatformIcon } from './PlatformIcons';

const GUIDE = 'https://github.com/daveonkels/centralchat/blob/main/docs/exporting-your-chats.md';

export function ExportGuide() {
  return (
    <section className="export-guide" aria-labelledby="export-guide-title">
      <div className="export-guide-heading">
        <h3 id="export-guide-title">Need your export files?</h3>
        <a href={GUIDE} target="_blank" rel="noreferrer">Full export guide ↗</a>
      </div>
      <p>Choose a source for instructions, then use either import method below.</p>
      <details>
        <summary><PlatformIcon platform="openai" size={16} /> ChatGPT <span>Account export · ZIP</span></summary>
        <div className="export-guide-body">
          <ol>
            <li>In ChatGPT, open your profile menu → <strong>Settings → Data controls → Export data</strong>.</li>
            <li>Confirm the export. Watch for an email or SMS; it can take up to seven days. Download within 24 hours of receiving the link.</li>
            <li>Upload the complete ZIP, or extract it into its own server import folder. Keep all <code>conversations-*.json</code> parts together.</li>
          </ol>
          <p>Managed workspaces may restrict exports. <a href="https://help.openai.com/en/articles/7260999-exporting-your-chatgpt-history-and-data" target="_blank" rel="noreferrer">Official ChatGPT instructions ↗</a></p>
        </div>
      </details>
      <details>
        <summary><PlatformIcon platform="claude" size={16} /> Claude <span>Account export · ZIP / JSON</span></summary>
        <div className="export-guide-body">
          <ol>
            <li>In Claude on the web or desktop, open <strong>Settings → Privacy → Export data</strong>.</li>
            <li>Wait for the email, then download while signed in. The link lasts 24 hours. Export is not available in the mobile apps.</li>
            <li>Upload the ZIP containing <code>conversations.json</code>, or extract it into its own server import folder.</li>
          </ol>
          <p>Managed accounts may need owner approval. <a href="https://support.claude.com/en/articles/9450526-export-your-claude-data" target="_blank" rel="noreferrer">Official Claude instructions ↗</a></p>
        </div>
      </details>
      <details>
        <summary><PlatformIcon platform="raycast" size={16} /> Raycast <span>macOS exporter · JSON</span></summary>
        <div className="export-guide-body">
          <ol>
            <li>Set up the <a href="https://github.com/daveonkels/raycast-ai-exporter#quick-start" target="_blank" rel="noreferrer">Raycast AI Chat Exporter ↗</a> on your Mac. It needs uv and Accessibility permission for your terminal.</li>
            <li>Keep AI Chat visible. Test five chats first, then use <code>--all</code>. Avoid keyboard or mouse input while it runs.</li>
            <li>Upload <code>~/Desktop/raycast_ai_chats.json</code>, or copy it into its own server import folder.</li>
          </ol>
          <p>Raycast’s built-in <code>.rayconfig</code> backup is not supported. Check the test output before a full export; compatibility depends on the Raycast UI.</p>
          <p>Fresh Raycast exports can create duplicates. <a href={`${GUIDE}#if-the-import-does-not-work`} target="_blank" rel="noreferrer">Limitations and troubleshooting ↗</a></p>
        </div>
      </details>
    </section>
  );
}
