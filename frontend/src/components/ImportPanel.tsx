import { useState, useEffect } from 'react';
import { scanImports, runImport, DetectedExport, ImportStatus } from '../api/client';

interface ImportPanelProps {
  onImportComplete: () => void;
}

function ImportPanel({ onImportComplete }: ImportPanelProps) {
  const [exports, setExports] = useState<DetectedExport[]>([]);
  const [importing, setImporting] = useState(false);
  const [results, setResults] = useState<ImportStatus[]>([]);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    scanImports()
      .then((data) => setExports(data.detected_exports))
      .catch((err) => setError(err.message));
  }, []);

  const handleImport = async () => {
    setImporting(true);
    setError(null);
    setResults([]);

    try {
      const importResults = await runImport();
      setResults(importResults);
      onImportComplete();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Import failed');
    } finally {
      setImporting(false);
    }
  };

  return (
    <div className="import-section">
      <h3 style={{ marginBottom: '12px' }}>Import Exports</h3>

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

          <button
            className="import-btn"
            onClick={handleImport}
            disabled={importing}
          >
            {importing ? 'Importing...' : 'Run Import'}
          </button>
        </>
      )}

      {error && (
        <div className="import-status error">
          Error: {error}
        </div>
      )}

      {results.length > 0 && (
        <div style={{ marginTop: '16px' }}>
          {results.map((result, idx) => (
            <div
              key={idx}
              className={`import-status ${result.status === 'completed' ? 'success' : 'error'}`}
            >
              <strong>{result.platform}</strong>: {result.status}
              {result.status === 'completed' && (
                <> - {result.conversations_imported} conversations, {result.messages_imported} messages imported</>
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
