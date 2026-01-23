import { useState, useEffect } from 'react';
import { scanImports, runImport, getImportStatus, cancelImport, DetectedExport, ImportStatus } from '../api/client';

interface ImportPanelProps {
  onImportComplete: () => void;
}

function ImportPanel({ onImportComplete }: ImportPanelProps) {
  const [exports, setExports] = useState<DetectedExport[]>([]);
  const [importing, setImporting] = useState(false);
  const [results, setResults] = useState<ImportStatus[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [jobId, setJobId] = useState<string | null>(null);
  const [jobCompleted, setJobCompleted] = useState(false);
  const [jobCanceled, setJobCanceled] = useState(false);
  const [canceling, setCanceling] = useState(false);

  useEffect(() => {
    scanImports()
      .then((data) => setExports(data.detected_exports))
      .catch((err) => setError(err.message));
  }, []);

  const handleImport = async () => {
    setImporting(true);
    setError(null);
    setResults([]);
    setJobId(null);
    setJobCompleted(false);
    setJobCanceled(false);
    setCanceling(false);

    try {
      const response = await runImport();
      setResults(response.statuses);
      setJobId(response.job_id);
      setJobCompleted(response.completed);
      setJobCanceled(response.canceled);
      if (response.completed) {
        setImporting(false);
        onImportComplete();
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Import failed');
      setImporting(false);
    }
  };

  useEffect(() => {
    if (!jobId || !importing) return;

    const poll = async () => {
      try {
        const status = await getImportStatus(jobId);
        setResults(status.statuses);
        setJobCompleted(status.completed);
        setJobCanceled(status.canceled);
        if (status.completed) {
          setImporting(false);
          onImportComplete();
        }
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Failed to refresh import status');
        setImporting(false);
      }
    };

    const interval = setInterval(poll, 1000);
    poll();

    return () => clearInterval(interval);
  }, [jobId, importing, onImportComplete]);

  const handleCancel = async () => {
    if (!jobId || canceling) return;
    setCanceling(true);
    setError(null);
    try {
      const status = await cancelImport(jobId);
      setResults(status.statuses);
      setJobCompleted(status.completed);
      setJobCanceled(status.canceled);
      if (status.completed) {
        setImporting(false);
        onImportComplete();
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to cancel import');
    } finally {
      setCanceling(false);
    }
  };

  const formatSourceName = (sourcePath: string) => {
    const parts = sourcePath.split('/').filter(Boolean);
    return parts[parts.length - 1] || sourcePath;
  };

  const totalJobs = results.length;
  const completedJobs = results.filter((r) => ['completed', 'error', 'canceled'].includes(r.status)).length;
  const runningJobs = results.filter((r) => r.status === 'running').length;
  const estimatedUnits = Math.min(completedJobs + runningJobs * 0.5, totalJobs);
  const estimatedPercent = totalJobs > 0 ? Math.round((estimatedUnits / totalJobs) * 100) : 0;
  const displayPercent = jobCompleted ? 100 : estimatedPercent;
  const progressLabel = jobCanceled
    ? (jobCompleted ? 'Canceled' : 'Canceling')
    : (jobCompleted ? 'Completed' : 'Estimated progress');

  return (
    <div className="import-section">
      <h3 style={{ marginBottom: '12px' }}>Import Exports</h3>
      <p className="import-note">
        Data stays local in <code>data/central-chat.db</code>. "New" counts only previously imported conversations.
      </p>

      <div className="export-guides">
        <div className="export-guides-title">Export guides</div>
        <div className="export-guides-list">
          <div className="export-guide-card">
            <span className="platform-badge openai">ChatGPT</span>
            <span className="export-guide-file">Expected: <code>conversations.json</code></span>
            <a
              href="https://help.openai.com/en/articles/7260999-how-do-i-export-my-chatgpt-history"
              target="_blank"
              rel="noreferrer"
            >
              Learn how to export
            </a>
          </div>
          <div className="export-guide-card">
            <span className="platform-badge claude">Claude</span>
            <span className="export-guide-file">Expected: <code>conversations.json</code></span>
            <a
              href="https://support.anthropic.com/en/articles/8325615-how-do-i-export-my-data-from-claude"
              target="_blank"
              rel="noreferrer"
            >
              Learn how to export
            </a>
          </div>
          <div className="export-guide-card">
            <span className="platform-badge raycast">Raycast</span>
            <span className="export-guide-file">Expected: <code>raycast_ai_chats.json</code></span>
            <a
              href="https://www.raycast.com/manual/exporting-data"
              target="_blank"
              rel="noreferrer"
            >
              Learn how to export
            </a>
          </div>
        </div>
      </div>

      {exports.length === 0 ? (
        <p style={{ color: 'var(--text-secondary)' }}>
          No exports detected. Place export folders in the <code>imports/</code> directory.
        </p>
      ) : (
        <>
          <p style={{ color: 'var(--text-secondary)', marginBottom: '12px' }}>
            Detected {exports.length} export{exports.length !== 1 ? 's' : ''}:
          </p>
          <ul style={{ marginBottom: '16px', paddingLeft: '20px' }}>
            {exports.map((exp) => (
              <li key={exp.path} style={{ color: 'var(--text-secondary)' }}>
                <span className={`platform-badge ${exp.platform}`}>{exp.platform}</span>
                {' '}{exp.name}
              </li>
            ))}
          </ul>

          <div className="import-actions">
            <button
              className="import-btn"
              onClick={handleImport}
              disabled={importing}
            >
              {importing ? 'Importing...' : 'Run Import'}
            </button>
            {importing && jobId && (
              <button
                className="import-cancel"
                onClick={handleCancel}
                disabled={canceling}
                type="button"
              >
                {canceling ? 'Canceling...' : 'Cancel'}
              </button>
            )}
          </div>
        </>
      )}

      {error && (
        <div className="import-status error">
          Error: {error}
        </div>
      )}

      {totalJobs > 0 && (
        <div className="import-progress">
          <progress max={100} value={displayPercent} />
          <span>
            {progressLabel}: {displayPercent}%
          </span>
        </div>
      )}

      {results.length > 0 && (
        <div style={{ marginTop: '16px' }}>
          {results.map((result, idx) => (
            <div
              key={idx}
              className={`import-status ${result.status === 'completed' ? 'success' : result.status === 'error' ? 'error' : result.status === 'canceled' ? 'canceled' : ''}`}
            >
              <strong>{result.platform}</strong> ({formatSourceName(result.source_path)}): {result.status}
              {result.status !== 'error' && (
                <>
                  {' '}
                  - {result.conversations_found} found, {result.conversations_imported}{' '}
                  <span className="import-count-new" title="New conversations not previously imported">
                    new
                  </span>
                  , {result.messages_imported} messages
                </>
              )}
              {result.errors.length > 0 && (
                <ul>
                  {result.errors.map((err, i) => (
                    <li key={i}>{err}</li>
                  ))}
                </ul>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

export default ImportPanel;
