import { Conversation } from '../api/client';

interface MessageViewerProps {
  conversation: Conversation | null;
}

function formatDate(dateStr: string): string {
  try {
    const date = new Date(dateStr);
    return date.toLocaleString('en-US', {
      year: 'numeric',
      month: 'short',
      day: 'numeric',
      hour: 'numeric',
      minute: '2-digit',
    });
  } catch {
    return dateStr;
  }
}

function MessageViewer({ conversation }: MessageViewerProps) {
  if (!conversation) {
    return (
      <div className="conversation-viewer">
        <div className="empty-state">
          <h3>Select a conversation</h3>
          <p>Click on a conversation to view its messages</p>
        </div>
      </div>
    );
  }

  const messages = conversation.messages || [];

  return (
    <div className="conversation-viewer">
      <div className="conversation-header">
        <h2 className="conversation-title">
          {conversation.title || 'Untitled Conversation'}
        </h2>
        <div className="conversation-meta">
          <span className={`platform-badge ${conversation.platform}`}>
            {conversation.platform}
          </span>
          <span>{formatDate(conversation.created_at)}</span>
          {conversation.model && <span>Model: {conversation.model}</span>}
          <span>{messages.length} messages</span>
        </div>
      </div>

      <div className="messages-container">
        {messages.map((msg) => (
          <div key={msg.id} className={`message ${msg.role}`}>
            <div className="message-role">{msg.role}</div>
            <div className="message-content">{msg.content}</div>
            {msg.media && msg.media.length > 0 && (
              <div className="media-indicator">
                {msg.media.map((m, idx) => (
                  <span key={idx} title={m.original_path}>
                    [{m.media_type}: {m.filename || 'attachment'}]
                  </span>
                ))}
              </div>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}

export default MessageViewer;
