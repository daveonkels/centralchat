import { Children, cloneElement, isValidElement, ReactNode, useEffect, useRef, useState } from 'react';
import ReactMarkdown from 'react-markdown';
import { FiArrowLeft as MdArrowBack, FiChevronUp as MdArrowUpward, FiChevronDown as MdArrowDownward, FiCopy as MdContentCopy, FiLink as MdLink, FiMessageSquare as MdOutlineForum, FiPaperclip as MdAttachFile } from 'react-icons/fi';
import { PlatformIcon } from './PlatformIcons';
import { Conversation, ContentAttribute } from '../api/client';
import { platformName, formatDate, snippetParts } from '../utils/presentation';
import { markdownBlocks } from '../utils/markdownTables';
import ContentBadges from './ContentBadges';
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

interface Props {
  conversation: Conversation | null; messageId: string | null; loading: boolean; error: string | null;
  onRetry: () => void; onBack: () => void; onImport: () => void;
  resultIndex: number | null; resultTotal: number; onStep: (delta: number) => void;
  hasPrevious: boolean; hasNext: boolean; hasMoreResults: boolean; onLoadMore: () => void;
  loadingMore: boolean; highlightSnippet?: string;
  threadNavigation: ReactNode;
  searching: boolean;
  onFilterAttribute: (value: ContentAttribute) => void;
}
function CopyButton({ value, label = 'Copy', icon = false }: { value: string; label?: string; icon?: boolean }) {
  const [status, setStatus] = useState('');
  useEffect(() => { if (!status) return; const timer = setTimeout(() => setStatus(''), 2400); return () => clearTimeout(timer); }, [status]);
  return <button className="copy-button" data-status={status || undefined} aria-label={status || label} title={label} onClick={async () => {
    try { await navigator.clipboard.writeText(value); setStatus('Copied'); } catch { setStatus('Copy unavailable'); }
  }}>{label.includes('link') ? <MdLink aria-hidden="true" /> : <MdContentCopy aria-hidden="true" />}<span aria-live="polite" className={icon && !status ? 'sr-only' : ''}>{status || label}</span></button>;
}
function CodeBlock({ code, language }: { code: string; language?: string }) {
  const ref = useRef<HTMLElement>(null);
  useEffect(() => {
    if (!ref.current) return;
    if (language && hljs.getLanguage(language)) ref.current.innerHTML = hljs.highlight(code, { language, ignoreIllegals: true }).value;
    else ref.current.textContent = code;
  }, [code, language]);
  return <div className="code-block-wrapper"><div className="code-header"><span>{language || 'Plain text'}</span><CopyButton value={code} label="Copy code" /></div><pre tabIndex={0} aria-label={`${language || 'Plain text'} code`}><code ref={ref}>{code}</code></pre></div>;
}
function highlighted(children: ReactNode, terms: string[]): ReactNode {
  if (!terms.length) return children;
  const pattern = new RegExp(`(${terms.map(term => term.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')).join('|')})`, 'gi');
  return Children.map(children, child => {
    if (typeof child === 'string') return child.split(pattern).map((part, index) => index % 2 ? <mark key={index}>{part}</mark> : part);
    if (isValidElement<{children?: ReactNode}>(child) && child.type !== 'code' && child.type !== 'pre') return cloneElement(child, {}, highlighted(child.props.children, terms));
    return child;
  });
}
function MessageContent({ content, terms }: { content: string; terms: string[] }) {
  const cleaned = content.replace(/\ue200[^\ue201]*\ue201/g, '');
  const render = (text: string) => <ReactMarkdown components={{
    code({ className, children, node }) {
      const language = /language-([\w+-]+)/.exec(className || '')?.[1];
      return language || node?.position?.start.line !== node?.position?.end.line || String(children).includes('\n')
        ? <CodeBlock code={String(children).replace(/\n$/, '')} language={language} /> : <code>{children}</code>;
    },
    pre({ children }) { return <>{children}</>; },
    p({ children }) { return <p>{highlighted(children, terms)}</p>; },
    li({ children }) { return <li>{highlighted(children, terms)}</li>; },
    h1({ children }) { return <h3>{highlighted(children, terms)}</h3>; },
    h2({ children }) { return <h3>{highlighted(children, terms)}</h3>; },
    h3({ children }) { return <h4>{highlighted(children, terms)}</h4>; },
    img({ src, alt }) { return <a className="attachment-inline" href={src}>{alt || 'Referenced image'} · open source</a>; },
  }}>{text}</ReactMarkdown>;
  return <div className="message-content">{markdownBlocks(cleaned).map((block, index) => block.kind === 'markdown'
    ? <div key={index}>{render(block.content)}</div>
    : <div key={index} className="table-scroll" tabIndex={0} role="region" aria-label="Message table, scroll horizontally if needed"><table><thead><tr>{block.header.map((cell, n) => <th scope="col" key={n} style={{ textAlign: block.align[n] }}>{render(cell)}</th>)}</tr></thead><tbody>{block.rows.map((row, r) => <tr key={r}>{row.map((cell, n) => <td key={n} style={{ textAlign: block.align[n] }}>{render(cell)}</td>)}</tr>)}</tbody></table></div>)}</div>;
}
export default function MessageViewer(props: Props) {
  const { conversation, messageId, loading, error, resultIndex, resultTotal } = props;
  const scroll = useRef<HTMLDivElement>(null);
  const heading = useRef<HTMLHeadingElement>(null);
  useEffect(() => {
    if (loading || error || !conversation) return;
    const container = scroll.current;
    if (!container) return;
    const target = messageId ? Array.from(container.querySelectorAll<HTMLElement>('[data-message-id]')).find(node => node.dataset.messageId === messageId) : null;
    container.scrollTop = target ? container.scrollTop + target.getBoundingClientRect().top - container.getBoundingClientRect().top - 20 : 0;
    (target || heading.current)?.focus({ preventScroll: true });
  }, [conversation, messageId, loading, error]);

  const back = <button className="back-button" onClick={props.onBack}><MdArrowBack aria-hidden="true" />Back to {props.searching ? 'results' : 'archive'}</button>;
  if (loading || error) return <section className="conversation-viewer" aria-label="Conversation"><div className="reader-toolbar">{back}</div><div className="empty-state" role={error ? 'alert' : 'status'}>{error ? <><h2>Couldn’t open this conversation</h2><p>{error}</p><button onClick={props.onRetry}>Try again</button></> : <><span className="loading-spinner" /><p>Opening conversation…</p></>}</div></section>;
  if (!conversation) return <section className="conversation-viewer empty-reader"><div className="empty-state"><MdOutlineForum className="empty-icon" /><span className="eyebrow">YOUR CONVERSATIONS, TOGETHER</span><h2>A good answer is worth finding again.</h2><p>Search your archive or choose a conversation to pick up where you left off.</p><button onClick={props.onImport}>Import conversations</button><span className="empty-tip">Press <kbd>/</kbd> to start searching</span></div></section>;
  const messages = conversation.messages || [];
  const terms = [...new Set(snippetParts(props.highlightSnippet || '').filter(part => part.highlight && part.text).map(part => part.text))];
  const baseLink = `${window.location.origin}/c/${encodeURIComponent(conversation.id)}`;
  return <section className="conversation-viewer" aria-label="Conversation">
    <div className="conversation-header">
      <div className="thread-toolbar">{back}{props.threadNavigation}</div>
      <div className="conversation-heading"><h2 ref={heading} tabIndex={-1}>{conversation.title || 'Untitled conversation'}</h2><CopyButton value={baseLink} label="Copy link" /></div>
      <div className="conversation-meta"><span className={`source-badge ${conversation.platform}`}><PlatformIcon platform={conversation.platform} size={13} />{platformName(conversation.platform)}</span>{conversation.model && <span>{conversation.model}</span>}<span>{formatDate(conversation.created_at)}</span><span>{messages.length} messages</span></div>
      <ContentBadges values={conversation.attributes} onFilter={props.onFilterAttribute} />
      {resultIndex !== null && <div className="reader-toolbar match-toolbar"><span className="match-position" role="status">Match <strong>{resultIndex + 1} of {resultTotal.toLocaleString()}</strong></span><div className="match-actions"><button className="icon-button" aria-label="Previous matching result" disabled={!props.hasPrevious} onClick={() => props.onStep(-1)}><MdArrowUpward /></button><button className="icon-button" aria-label="Next matching result" disabled={!props.hasNext} onClick={() => props.onStep(1)}><MdArrowDownward /></button>{!props.hasNext && props.hasMoreResults && <button disabled={props.loadingMore} onClick={props.onLoadMore}>{props.loadingMore ? 'Loading…' : 'Load more matches'}</button>}</div></div>}
    </div>
    <div className="messages-container" ref={scroll}>
      {messageId && !messages.some(message => message.id === messageId) && <p className="notice" role="status">This message is no longer available. Showing the conversation instead.</p>}
      {messages.map((message, index) => <article tabIndex={-1} key={message.id} data-message-id={message.id} className={`message ${message.role} ${message.id === messageId ? 'matched-message' : ''}`} aria-label={`Message ${index + 1}, ${message.role === 'user' ? 'You' : message.role === 'assistant' ? platformName(conversation.platform) : message.role}`}>
        <div className="message-heading"><div className="message-author"><span className={`message-avatar ${message.role === 'user' ? 'you' : conversation.platform}`}>{message.role === 'user' ? 'Y' : <PlatformIcon platform={conversation.platform} size={16} />}</span>{message.role === 'user' ? 'You' : message.role === 'assistant' ? <>{platformName(conversation.platform)}</> : message.role}<span className="message-number">{message.created_at ? formatDate(message.created_at) : `Message ${index + 1}`}</span></div><div className="message-actions"><CopyButton value={message.content} label="Copy message" /><CopyButton value={`${baseLink}?message=${encodeURIComponent(message.id)}`} label="Copy message link" icon /></div></div>
        <MessageContent content={message.content} terms={terms} />
        {message.media?.map(media => <div className="attachment" key={media.id}><MdAttachFile aria-hidden="true" /><div><strong>{media.filename || media.original_path.split('/').pop() || 'Attachment'}</strong><small>{media.media_type} · Reference only; file contents aren’t available in this archive.</small></div></div>)}
      </article>)}
      <div className="conversation-end">{messages.length ? 'End of conversation' : 'This conversation has no messages.'}</div>
    </div>
  </section>;
}
