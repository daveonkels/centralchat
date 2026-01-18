import { useCallback, useEffect, useRef, useState } from 'react';
import { Conversation } from '../api/client';
import hljs from 'highlight.js/lib/core';
import javascript from 'highlight.js/lib/languages/javascript';
import typescript from 'highlight.js/lib/languages/typescript';
import python from 'highlight.js/lib/languages/python';
import json from 'highlight.js/lib/languages/json';
import bash from 'highlight.js/lib/languages/bash';
import css from 'highlight.js/lib/languages/css';
import xml from 'highlight.js/lib/languages/xml';
import markdown from 'highlight.js/lib/languages/markdown';
import sql from 'highlight.js/lib/languages/sql';
import yaml from 'highlight.js/lib/languages/yaml';

// Register languages
hljs.registerLanguage('javascript', javascript);
hljs.registerLanguage('js', javascript);
hljs.registerLanguage('typescript', typescript);
hljs.registerLanguage('ts', typescript);
hljs.registerLanguage('python', python);
hljs.registerLanguage('py', python);
hljs.registerLanguage('json', json);
hljs.registerLanguage('bash', bash);
hljs.registerLanguage('sh', bash);
hljs.registerLanguage('shell', bash);
hljs.registerLanguage('css', css);
hljs.registerLanguage('html', xml);
hljs.registerLanguage('xml', xml);
hljs.registerLanguage('markdown', markdown);
hljs.registerLanguage('md', markdown);
hljs.registerLanguage('sql', sql);
hljs.registerLanguage('yaml', yaml);
hljs.registerLanguage('yml', yaml);

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

// Display names for platforms (backend uses internal names)
function getPlatformDisplayName(platform: string): string {
  const displayNames: Record<string, string> = {
    openai: 'ChatGPT',
    claude: 'Claude',
    raycast: 'Raycast',
  };
  return displayNames[platform] || platform;
}

// Copy icon
const CopyIcon = () => (
  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <rect x="9" y="9" width="13" height="13" rx="2" ry="2" />
    <path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1" />
  </svg>
);

// Check icon for copied state
const CheckIcon = () => (
  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <polyline points="20 6 9 17 4 12" />
  </svg>
);

// Empty state icon
const SelectConversationIcon = () => (
  <svg className="empty-state-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
    <path strokeLinecap="round" strokeLinejoin="round" d="M8.625 12a.375.375 0 11-.75 0 .375.375 0 01.75 0zm0 0H8.25m4.125 0a.375.375 0 11-.75 0 .375.375 0 01.75 0zm0 0H12m4.125 0a.375.375 0 11-.75 0 .375.375 0 01.75 0zm0 0h-.375M21 12c0 4.556-4.03 8.25-9 8.25a9.764 9.764 0 01-2.555-.337A5.972 5.972 0 015.41 20.97a5.969 5.969 0 01-.474-.065 4.48 4.48 0 00.978-2.025c.09-.457-.133-.901-.467-1.226C3.93 16.178 3 14.189 3 12c0-4.556 4.03-8.25 9-8.25s9 3.694 9 8.25z" />
  </svg>
);

// Code block with copy button
interface CodeBlockProps {
  code: string;
  language?: string;
}

function CodeBlock({ code, language }: CodeBlockProps) {
  const [copied, setCopied] = useState(false);
  const codeRef = useRef<HTMLElement>(null);

  useEffect(() => {
    if (codeRef.current && language) {
      try {
        const result = hljs.highlight(code, { language, ignoreIllegals: true });
        codeRef.current.innerHTML = result.value;
      } catch {
        // If highlighting fails, just use plain text
        codeRef.current.textContent = code;
      }
    }
  }, [code, language]);

  const handleCopy = useCallback(async () => {
    try {
      await navigator.clipboard.writeText(code);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch (err) {
      console.error('Failed to copy:', err);
    }
  }, [code]);

  return (
    <div className="code-block-wrapper">
      <div className="code-header">
        <span className="code-lang">{language || 'code'}</span>
        <button
          className={`code-copy ${copied ? 'copied' : ''}`}
          onClick={handleCopy}
          type="button"
        >
          {copied ? <CheckIcon /> : <CopyIcon />}
          <span>{copied ? 'Copied!' : 'Copy'}</span>
        </button>
      </div>
      <pre>
        <code ref={codeRef} className={language ? `language-${language}` : ''}>
          {code}
        </code>
      </pre>
    </div>
  );
}

// Clean up OpenAI citation markers and other artifacts
function cleanContent(text: string): string {
  // Remove OpenAI citation markers - they use Private Use Area Unicode:
  // \ue200 (opening), \ue201 (closing), \ue202 (separator like †)
  // Pattern: \ue200cite\ue202turn0search1\ue201
  return text
    .replace(/\ue200[^\ue201]*\ue201/g, '')  // Private Use Area markers
    .replace(/【[^】]*】/g, '')                // CJK bracket markers (fallback)
    .replace(/  +/g, ' ')
    .trim();
}

// Parse and render message content with code blocks
function MessageContent({ content }: { content: string }) {
  // Clean the content first
  content = cleanContent(content);
  // Split content into parts: regular text and code blocks
  const parts: Array<{ type: 'text' | 'code'; content: string; language?: string }> = [];

  // Match code blocks: ```language\ncode\n```
  const codeBlockRegex = /```(\w*)\n([\s\S]*?)```/g;
  let lastIndex = 0;
  let match;

  while ((match = codeBlockRegex.exec(content)) !== null) {
    // Add text before this code block
    if (match.index > lastIndex) {
      parts.push({
        type: 'text',
        content: content.slice(lastIndex, match.index),
      });
    }

    // Add the code block
    parts.push({
      type: 'code',
      content: match[2].trim(),
      language: match[1] || undefined,
    });

    lastIndex = match.index + match[0].length;
  }

  // Add remaining text
  if (lastIndex < content.length) {
    parts.push({
      type: 'text',
      content: content.slice(lastIndex),
    });
  }

  // If no code blocks found, just render as text
  if (parts.length === 0) {
    return <div className="message-content">{content}</div>;
  }

  return (
    <div className="message-content">
      {parts.map((part, index) => {
        if (part.type === 'code') {
          return (
            <CodeBlock
              key={index}
              code={part.content}
              language={part.language}
            />
          );
        }
        // Render text, handling inline code
        return (
          <span key={index}>
            {part.content.split(/(`[^`]+`)/).map((segment, segIndex) => {
              if (segment.startsWith('`') && segment.endsWith('`')) {
                return <code key={segIndex}>{segment.slice(1, -1)}</code>;
              }
              return segment;
            })}
          </span>
        );
      })}
    </div>
  );
}

// Copy button for entire message
function MessageCopyButton({ content }: { content: string }) {
  const [copied, setCopied] = useState(false);

  const handleCopy = useCallback(async () => {
    try {
      await navigator.clipboard.writeText(content);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch (err) {
      console.error('Failed to copy:', err);
    }
  }, [content]);

  return (
    <button
      className={`message-copy-btn ${copied ? 'copied' : ''}`}
      onClick={handleCopy}
      type="button"
      title="Copy message"
    >
      {copied ? <CheckIcon /> : <CopyIcon />}
    </button>
  );
}

function MessageViewer({ conversation }: MessageViewerProps) {
  const messagesEndRef = useRef<HTMLDivElement>(null);

  // Scroll to top when conversation changes
  useEffect(() => {
    const container = messagesEndRef.current?.parentElement;
    if (container) {
      container.scrollTop = 0;
    }
  }, [conversation?.id]);

  if (!conversation) {
    return (
      <div className="conversation-viewer">
        <div className="empty-state">
          <SelectConversationIcon />
          <h3>Select a conversation</h3>
          <p>Click on a conversation to view its messages</p>
        </div>
      </div>
    );
  }

  const messages = conversation.messages || [];
  const platform = conversation.platform;

  return (
    <div className="conversation-viewer">
      <div className="conversation-header">
        <h2 className="conversation-title">
          {conversation.title || 'Untitled Conversation'}
        </h2>
        <div className="conversation-meta">
          <span className={`platform-badge ${platform}`}>
            {getPlatformDisplayName(platform)}
          </span>
          <span>{formatDate(conversation.created_at)}</span>
          {conversation.model && <span>Model: {conversation.model}</span>}
          <span>{messages.length} messages</span>
        </div>
      </div>

      <div className="messages-container">
        {messages.map((msg, index) => (
          <div
            key={msg.id}
            className={`message ${msg.role} ${msg.role === 'assistant' ? platform : ''}`}
            style={{
              animationDelay: index < 10 ? `${index * 50}ms` : '500ms',
            }}
          >
            <MessageCopyButton content={msg.content} />
            <div className="message-role">
              {msg.role === 'user' ? 'You' : getPlatformDisplayName(platform)}
            </div>
            <MessageContent content={msg.content} />
            {msg.media && msg.media.length > 0 && (
              <div className="media-indicator">
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <rect x="3" y="3" width="18" height="18" rx="2" ry="2" />
                  <circle cx="8.5" cy="8.5" r="1.5" />
                  <polyline points="21 15 16 10 5 21" />
                </svg>
                {msg.media.map((m, idx) => (
                  <span key={idx} title={m.original_path}>
                    {m.filename || m.media_type}
                  </span>
                ))}
              </div>
            )}
          </div>
        ))}
        <div ref={messagesEndRef} />
      </div>
    </div>
  );
}

export default MessageViewer;
