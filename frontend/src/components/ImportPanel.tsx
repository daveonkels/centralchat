import { useState, useEffect, useRef, ChangeEvent } from 'react';
import { FiUpload as MdUpload, FiFolder as MdFolder, FiFilePlus as MdFileUpload } from 'react-icons/fi';
import {
  scanImports,
  runImport,
  getImportStatus,
  getActiveImport,
  cancelImport,
  uploadImport,
  purgePlatforms,
  getStats,
  DetectedExport,
  SkippedExport,
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
  const [skippedExports, setSkippedExports] = useState<SkippedExport[]>([]);
  const [importsPath, setImportsPath] = useState('');
  const [scanning, setScanning] = useState(true);
  const [scanError, setScanError] = useState<string | null>(null);
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
  const [view, setView] = useState<'import' | 'history' | 'maintenance'>('import');
  const [confirmation, setConfirmation] = useState('');
  const fileInputRef = useRef<HTMLInputElement>(null);
  const panelRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (view === 'import' && (importing || uploading || jobCompleted)) {
      panelRef.current?.closest('.dialog-content')?.scrollTo({ top: 0 });
    }
  }, [view, importing, uploading, jobCompleted]);

  const refreshScan = async () => {
    setScanning(true);
    setScanError(null);
    try {
      const data = await scanImports();
      setExports(data.detected_exports);
      setSkippedExports(data.skipped_exports || []);
      setImportsPath(data.imports_path);
      setScanError(data.errors?.join(' ') || null);
    } catch (err) {
      setScanError(err instanceof Error ? err.message : 'Could not scan imports');
    } finally {
      setScanning(false);
    }
  };

  useEffect(() => {
    refreshScan();
    getActiveImport().then((job) => {
      if (job) {
        setJobId(job.job_id);
        setResults(job.statuses);
        setJobCompleted(job.completed);
        setJobCanceled(job.canceled);
        setImporting(!job.completed);
      }
    }).catch((err) => setError(err.message));
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
        setError(null);
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
        if (err instanceof Error && err.message.includes('not found')) setImporting(false);
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
    if (purging || importing || uploading || selectedPlatforms.length === 0 || confirmation !== 'delete selected') return;
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
      setPurgeSelection({}); setConfirmation('');
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
  const displayPercent = totalJobs > 0 ? Math.round(completedJobs / totalJobs * 100) : 0;

  const progressLabel = jobCanceled
    ? (jobCompleted ? 'Canceled' : 'Canceling...')
    : (jobCompleted ? 'Complete' : 'Importing on the server');

  // Find currently running job for status display
  const runningJob = results.find((r) => r.status === 'running');
  const lastCompletedJob = results.filter((r) => r.status === 'completed').slice(-1)[0];
  const statusJob = runningJob || lastCompletedJob;

  // Check if any operation is in progress
  const isOperating = importing || uploading || purging;

  return (
    <div className="import-section" ref={panelRef}>
      <div className="import-tabs" role="group" aria-label="Data management">
        {(['import', 'history', 'maintenance'] as const).map(tab => <button key={tab} aria-pressed={view === tab} onClick={() => setView(tab)}>{tab === 'import' ? 'Import' : tab === 'history' ? 'History' : 'Maintenance'}</button>)}
      </div>
      {view === 'history' && <div className="import-history"><p>Completed imports recorded by this server.</p>{stats?.imports.length ? stats.imports.map(record => <article key={record.id}><strong>{PLATFORM_OPTIONS.find(p => p.id === record.platform)?.label || record.platform}</strong><small>{new Date(record.import_date).toLocaleString()}</small><p>{formatSourceName(record.source_path || '')}</p><p>{record.conversation_count.toLocaleString()} new conversations · {record.message_count.toLocaleString()} new messages</p></article>) : <p>No import history available.</p>}</div>}
      {view === 'import' && <>


      {/* Reassurance callout */}
      <div className="import-reassurance">
        <div className="import-reassurance-item">
          <span className="check">✓</span>
          <span>Your archive stays on this server</span>
        </div>
        <div className="import-reassurance-item">
          <span className="check">✓</span>
          <span>Safe to re-import — duplicates are automatically skipped</span>
        </div>
        <div className="import-reassurance-item">
          <span className="check">✓</span>
          <span>New conversations and newly-added messages are merged</span>
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
          <p className="import-note">{uploading ? 'Keep this dialog open while the file uploads.' : `You can close this dialog and return to reconnect. ${completedJobs} of ${totalJobs} exports finished.`}</p>
          <div className="import-progress-bar" role="progressbar" aria-label="Exports finished" aria-valuemin={0} aria-valuemax={totalJobs || 1} aria-valuenow={completedJobs}>
            <div
              className="import-progress-fill"
              style={{ width: `${displayPercent}%` }}
            />
          </div>
          {statusJob && (
            <div className="import-progress-status">
              {formatSourceName(statusJob.source_path)}: {statusJob.conversations_found.toLocaleString()} conversations processed
            </div>
          )}
          {uploading && (
            <div className="import-progress-status">
              Uploading {uploadFile?.name}...
            </div>
          )}
        </div>
      )}

      {/* Import results */}
      {results.length > 0 && jobCompleted && (
        <div className="import-results" role="status">
          <h3>{jobCanceled ? 'Import canceled' : results.some(result => result.status === 'error') ? 'Import finished with issues' : 'Import complete'}</h3>
          <div className="import-summary"><div><strong>{results.reduce((sum, result) => sum + result.conversations_imported, 0).toLocaleString()}</strong><span>New conversations</span></div><div><strong>{results.reduce((sum, result) => sum + result.messages_imported, 0).toLocaleString()}</strong><span>New messages</span></div></div>
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

      {/* Two import method cards */}
      <div className="import-methods">
        {/* Folder Import Card */}
        <div className="import-method-card import-method-folder">
          <div className="import-method-title"><MdFolder /> Detect &amp; Import</div>
          <div className="import-method-content">
            <p className="import-note">Recommended for large exports. Extract your complete export into its own server folder:</p>
            <div className="folder-path">{importsPath || 'Loading server folder…'}</div>
            <p className="import-note">Keep every numbered JSON part together. Nested folders are detected automatically. Finish copying the export before scanning.</p>
            <button type="button" className="browse-btn" onClick={refreshScan} disabled={scanning || isOperating}>
              {scanning ? 'Scanning…' : 'Rescan folder'}
            </button>
            {scanError && <div className="import-status error" role="alert">{scanError}</div>}

            {scanning ? <p className="no-files" role="status">Checking export folders and conversation parts…</p> : exports.length === 0 ? (
              <p className="no-files">No supported exports detected. Extract your ZIP here, then rescan.</p>
            ) : (
              <div className="detected-files">
                <div className="detected-files-title">
                  Detected {exports.length} export{exports.length !== 1 ? 's' : ''}
                </div>
                {exports.map((exp) => (
                  <div key={exp.path} className="detected-file">
                    <span className={`platform-badge ${exp.platform}`}>
                      <PlatformIcon platform={exp.platform} size={12} />
                      {exp.platform}
                    </span>
                    <details><summary className="file-name">{exp.name} · {exp.file_count || 1} JSON file{exp.file_count === 1 ? '' : 's'}</summary><ul>{(exp.files || [exp.path]).map(file => <li key={file}>{file}</li>)}</ul></details>
                  </div>
                ))}
              </div>
            )}

            {skippedExports.length > 0 && (
              <div className="skipped-files">
                <div className="detected-files-title">
                  Not imported: {skippedExports.length} item{skippedExports.length !== 1 ? 's' : ''}
                </div>
                {skippedExports.map((exp) => (
                  <div key={exp.path} className="skipped-file">
                    <span className="file-name">{exp.name}</span>
                    <span className="skip-reason">{exp.reason}</span>
                  </div>
                ))}
              </div>
            )}

            <button
              className="import-btn"
              onClick={handleImport}
              disabled={isOperating || scanning || !!scanError || exports.length === 0}
            >
              {importing ? 'Importing...' : `Detect & Import (${exports.length})`}
            </button>

            {error && (
              <div className="import-status error">
                Error: {error}
              </div>
            )}
          </div>
        </div>
        {/* Upload File Card */}
        <div className="import-method-card">
          <div className="import-method-title"><MdUpload /> Upload &amp; Import</div>
          <div className="import-method-content">
            <input
              ref={fileInputRef}
              key={uploadInputKey}
              hidden
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
              Choose the complete export ZIP from ChatGPT or Claude, or a JSON export from Raycast.
              For large ChatGPT exports, use Detect &amp; Import so you don’t have to upload individual parts. Uploads are limited to 512 MB.
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
                <a href="https://github.com/daveonkels/raycast-ai-exporter" target="_blank" rel="noreferrer">
                  Export Raycast chats
                </a>
              </div>
            </div>
          </div>
        </div>

      </div>


      </>}
      {view === 'maintenance' && <div className="danger-zone">
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
                      disabled={isOperating}
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

            <label className="maintenance-confirm"><span>Type <strong>delete selected</strong> to enable deletion.</span><input value={confirmation} onChange={event => setConfirmation(event.target.value)} autoComplete="off" disabled={isOperating} /></label>
            <button
              className="purge-btn"
              onClick={handlePurge}
              disabled={isOperating || selectedPlatforms.length === 0 || confirmation !== 'delete selected'}
              type="button"
            >
              {purging ? 'Deleting...' : 'Delete selected providers'}
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
      </div>}
    </div>
  );
}

export default ImportPanel;
