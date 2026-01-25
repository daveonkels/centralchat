import { useState, useEffect, useRef, ChangeEvent } from 'react';
import { MdUpload, MdFolder, MdWarning, MdFileUpload } from 'react-icons/md';
import {
  scanImports,
  runImport,
  getImportStatus,
  cancelImport,
  uploadImport,
  purgePlatforms,
  getStats,
  DetectedExport,
  ImportStatus,
  PurgeResult,
  Stats,
} from '../api/client';
import { PlatformIcon } from './PlatformIcons';

interface ImportPanelProps {
  onImportComplete: () => void;
}

const PLATFORM_OPTIONS = [
  { id: 'openai', label: 'ChatGPT' },
  { id: 'claude', label: 'Claude' },
  { id: 'raycast', label: 'Raycast' },
];

function ImportPanel({ onImportComplete }: ImportPanelProps) {
  const [exports, setExports] = useState<DetectedExport[]>([]);
  const [importing, setImporting] = useState(false);
  const [results, setResults] = useState<ImportStatus[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [stats, setStats] = useState<Stats | null>(null);
  const [purgeSelection, setPurgeSelection] = useState<Record<string, boolean>>({});
  const [purgeResults, setPurgeResults] = useState<PurgeResult[]>([]);
  const [purgeError, setPurgeError] = useState<string | null>(null);
  const [purging, setPurging] = useState(false);
  const [uploadFile, setUploadFile] = useState<File | null>(null);
  const [uploading, setUploading] = useState(false);
  const [uploadResult, setUploadResult] = useState<ImportStatus | null>(null);
  const [uploadError, setUploadError] = useState<string | null>(null);
  const [uploadInputKey, setUploadInputKey] = useState(0);
  const [jobId, setJobId] = useState<string | null>(null);
  const [jobCompleted, setJobCompleted] = useState(false);
  const [jobCanceled, setJobCanceled] = useState(false);
  const [canceling, setCanceling] = useState(false);
  const [dangerZoneOpen, setDangerZoneOpen] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    scanImports()
      .then((data) => setExports(data.detected_exports))
      .catch((err) => setError(err.message));
    getStats()
      .then(setStats)
      .catch(console.error);
  }, []);

  const refreshStats = () => {
    getStats()
      .then(setStats)
      .catch(console.error);
  };

  const handleImport = async () => {
    setImporting(true);
    setError(null);
    setResults([]);
    setJobId(null);
    setJobCompleted(false);
    setJobCanceled(false);
    setCanceling(false);
    setPurgeError(null);
    setUploadError(null);
    setUploadResult(null);

    try {
      const response = await runImport();
      setResults(response.statuses);
      setJobId(response.job_id);
      setJobCompleted(response.completed);
      setJobCanceled(response.canceled);
      if (response.completed) {
        setImporting(false);
        onImportComplete();
        refreshStats();
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
          refreshStats();
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
        refreshStats();
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to cancel import');
    } finally {
      setCanceling(false);
    }
  };

  const handleUpload = async () => {
    if (!uploadFile || uploading) return;
    setUploading(true);
    setUploadError(null);
    setUploadResult(null);
    try {
      const response = await uploadImport(uploadFile);
      setUploadResult(response);
      setUploadFile(null);
      setUploadInputKey((prev) => prev + 1);
      onImportComplete();
      refreshStats();
    } catch (err) {
      setUploadError(err instanceof Error ? err.message : 'Upload failed');
    } finally {
      setUploading(false);
    }
  };

  const handleUploadChange = (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0] || null;
    setUploadFile(file);
    setUploadResult(null);
    setUploadError(null);
  };

  const selectedPlatforms = PLATFORM_OPTIONS
    .filter((platform) => purgeSelection[platform.id])
    .map((platform) => platform.id);

  const handlePurge = async () => {
    if (purging || selectedPlatforms.length === 0) return;
    const label = selectedPlatforms.join(', ');
    const confirmed = window.confirm(
      `This will permanently delete all ${label} data from the database. This cannot be undone. Continue?`
    );
    if (!confirmed) return;

    setPurging(true);
    setPurgeError(null);
    setPurgeResults([]);
    try {
      const response = await purgePlatforms(selectedPlatforms);
      setPurgeResults(response.results);
      setPurgeSelection({});
      onImportComplete();
      refreshStats();
    } catch (err) {
      setPurgeError(err instanceof Error ? err.message : 'Failed to purge data');
    } finally {
      setPurging(false);
    }
  };

  const formatSourceName = (sourcePath: string) => {
    const parts = sourcePath.split('/').filter(Boolean);
    return parts[parts.length - 1] || sourcePath;
  };

  // Progress calculations
  const totalJobs = results.length;
  const completedJobs = results.filter((r) => ['completed', 'error', 'canceled'].includes(r.status)).length;
  const runningJobs = results.filter((r) => r.status === 'running').length;
  const estimatedUnits = Math.min(completedJobs + runningJobs * 0.5, totalJobs);
  const estimatedPercent = totalJobs > 0 ? Math.round((estimatedUnits / totalJobs) * 100) : 0;
  const displayPercent = jobCompleted ? 100 : estimatedPercent;

  const progressLabel = jobCanceled
    ? (jobCompleted ? 'Canceled' : 'Canceling...')
    : (jobCompleted ? 'Complete' : 'Importing...');

  // Find currently running job for status display
  const runningJob = results.find((r) => r.status === 'running');
  const lastCompletedJob = results.filter((r) => r.status === 'completed').slice(-1)[0];
  const statusJob = runningJob || lastCompletedJob;

  // Check if any operation is in progress
  const isOperating = importing || uploading || purging;

  return (
    <div className="import-section">
      <h2>Import Data</h2>

      {/* Reassurance callout */}
      <div className="import-reassurance">
        <div className="import-reassurance-item">
          <span className="check">✓</span>
          <span>Data stays local in <code>data/central-chat.db</code></span>
        </div>
        <div className="import-reassurance-item">
          <span className="check">✓</span>
          <span>Safe to re-import — duplicates are automatically skipped</span>
        </div>
        <div className="import-reassurance-item">
          <span className="check">✓</span>
          <span>Only new conversations are added to your archive</span>
        </div>
      </div>

      {/* Global progress banner */}
      {(importing || uploading || (results.length > 0 && !jobCompleted)) && (
        <div className="import-progress-banner">
          <div className="import-progress-header">
            <span className="import-progress-title">{progressLabel}</span>
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
          <div className="import-progress-bar">
            <div
              className="import-progress-fill"
              style={{ width: `${displayPercent}%` }}
            />
          </div>
          {statusJob && (
            <div className="import-progress-status">
              {statusJob.platform}: {statusJob.conversations_imported} new conversations
            </div>
          )}
          {uploading && (
            <div className="import-progress-status">
              Uploading {uploadFile?.name}...
            </div>
          )}
        </div>
      )}

      {/* Two import method cards */}
      <div className="import-methods">
        {/* Upload File Card */}
        <div className="import-method-card">
          <div className="import-method-title"><MdUpload /> Upload File</div>
          <div className="import-method-content">
            <input
              ref={fileInputRef}
              key={uploadInputKey}
              className="upload-input-hidden"
              type="file"
              accept=".zip,.json,application/zip,application/json"
              onChange={handleUploadChange}
              disabled={isOperating}
            />
            <div className="upload-controls">
              <button
                className="browse-btn"
                onClick={() => fileInputRef.current?.click()}
                disabled={isOperating}
                type="button"
              >
                <MdFileUpload /> Choose File
              </button>
              <span className="upload-filename">
                {uploadFile ? uploadFile.name : 'No file selected'}
              </span>
            </div>
            <button
              className="upload-btn"
              onClick={handleUpload}
              disabled={!uploadFile || isOperating}
              type="button"
            >
              {uploading ? 'Uploading...' : 'Upload & Import'}
            </button>

            <p className="import-note">
              Accepts <code>.zip</code> or <code>.json</code> files. Filename must include:
              openai, chatgpt, claude, anthropic, or raycast.
            </p>

            {uploadError && (
              <div className="import-status error">
                Error: {uploadError}
              </div>
            )}
            {uploadResult && (
              <div className={`import-status ${uploadResult.status === 'completed' ? 'success' : uploadResult.status === 'error' ? 'error' : ''}`}>
                <strong>{uploadResult.platform}</strong>: {uploadResult.status}
                {uploadResult.status !== 'error' && (
                  <> — {uploadResult.conversations_imported} conversations, {uploadResult.messages_imported} messages</>
                )}
                {uploadResult.errors.length > 0 && (
                  <ul>
                    {uploadResult.errors.map((err, i) => (
                      <li key={i}>{err}</li>
                    ))}
                  </ul>
                )}
              </div>
            )}

            {/* Export links */}
            <div className="export-links">
              <div className="export-links-title">Get Your Data</div>
              <div className="export-link">
                <PlatformIcon platform="openai" size={14} className="platform-icon openai" />
                <a href="https://help.openai.com/en/articles/7260999-how-do-i-export-my-chatgpt-history" target="_blank" rel="noreferrer">
                  Request ChatGPT export
                </a>
              </div>
              <div className="export-link">
                <PlatformIcon platform="claude" size={14} className="platform-icon claude" />
                <a href="https://support.claude.com/en/articles/9450526-how-can-i-export-my-claude-data" target="_blank" rel="noreferrer">
                  Request Claude export
                </a>
              </div>
              <div className="export-link">
                <PlatformIcon platform="raycast" size={14} className="platform-icon raycast" />
                <a href="https://www.raycast.com/manual/exporting-data" target="_blank" rel="noreferrer">
                  Export Raycast chats
                </a>
              </div>
            </div>
          </div>
        </div>

        {/* Folder Import Card */}
        <div className="import-method-card">
          <div className="import-method-title"><MdFolder /> Import from Folder</div>
          <div className="import-method-content">
            <p className="import-note">Place export files in the imports folder:</p>
            <div className="folder-path">./imports/</div>

            {exports.length === 0 ? (
              <p className="no-files">No export files detected</p>
            ) : (
              <div className="detected-files">
                <div className="detected-files-title">
                  Detected {exports.length} file{exports.length !== 1 ? 's' : ''}
                </div>
                {exports.map((exp) => (
                  <div key={exp.path} className="detected-file">
                    <span className={`platform-badge ${exp.platform}`}>
                      <PlatformIcon platform={exp.platform} size={12} />
                      {exp.platform}
                    </span>
                    <span className="file-name">{exp.name}</span>
                  </div>
                ))}
              </div>
            )}

            <button
              className="import-btn"
              onClick={handleImport}
              disabled={isOperating || exports.length === 0}
            >
              {importing ? 'Importing...' : 'Import All'}
            </button>

            {error && (
              <div className="import-status error">
                Error: {error}
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Import results */}
      {results.length > 0 && jobCompleted && (
        <div className="import-results">
          {results.map((result, idx) => (
            <div
              key={idx}
              className={`import-status ${result.status === 'completed' ? 'success' : result.status === 'error' ? 'error' : result.status === 'canceled' ? 'canceled' : ''}`}
            >
              <strong>{result.platform}</strong> ({formatSourceName(result.source_path)}): {result.status}
              {result.status !== 'error' && (
                <>
                  {' '} — {result.conversations_found} found, {result.conversations_imported}{' '}
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

      {/* Danger Zone (collapsed) */}
      <div className="danger-zone">
        <button
          className="danger-zone-toggle"
          onClick={() => setDangerZoneOpen(!dangerZoneOpen)}
          type="button"
        >
          <span className={`chevron ${dangerZoneOpen ? 'open' : ''}`}>▶</span>
          <MdWarning className="danger-icon" />
          Danger Zone
        </button>

        {dangerZoneOpen && (
          <div className="danger-zone-content">
            <p className="danger-zone-note">
              Permanently delete all conversations, messages, and media refs for selected platforms.
              This cannot be undone.
            </p>

            <div className="purge-options">
              {PLATFORM_OPTIONS.map((platform) => {
                const count = stats ? (stats.by_platform?.[platform.id] ?? 0) : null;
                const countLabel = typeof count === 'number'
                  ? `${count.toLocaleString()} conversations`
                  : 'Loading...';

                return (
                  <label key={platform.id} className="purge-option">
                    <input
                      type="checkbox"
                      checked={!!purgeSelection[platform.id]}
                      onChange={() => setPurgeSelection((prev) => ({
                        ...prev,
                        [platform.id]: !prev[platform.id],
                      }))}
                      disabled={purging || importing}
                    />
                    <span className={`platform-badge ${platform.id}`}>
                      <PlatformIcon platform={platform.id} size={12} />
                      {platform.label}
                    </span>
                    <span className="purge-count">{countLabel}</span>
                  </label>
                );
              })}
            </div>

            <button
              className="purge-btn"
              onClick={handlePurge}
              disabled={purging || importing || selectedPlatforms.length === 0}
              type="button"
            >
              {purging ? 'Purging...' : 'Purge Selected'}
            </button>

            {purgeError && (
              <div className="import-status error">
                Error: {purgeError}
              </div>
            )}

            {purgeResults.length > 0 && (
              <div className="purge-results">
                {purgeResults.map((result) => (
                  <div key={result.platform} className="import-status success">
                    <strong>{result.platform}</strong>: deleted {result.conversations_deleted} conversations,{' '}
                    {result.messages_deleted} messages, {result.media_deleted} media refs
                  </div>
                ))}
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}

export default ImportPanel;
