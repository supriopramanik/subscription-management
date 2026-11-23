import React, { useEffect, useRef, useState } from 'react';
import { Upload, FileText, LoaderCircle } from 'lucide-react';
import { api } from './lib';
import { ErrorNote } from './components';
import { normalizeReceiptResult } from './receipt-result';

export function ReceiptImport({ disabled, demo, onExtract, onBusyChange }) {
  const [reading, setReading] = useState(false);
  const [error, setError] = useState('');
  const [result, setResult] = useState(null);
  const [preview, setPreview] = useState('');
  const [filename, setFilename] = useState('');
  const active = useRef(false);
  const mounted = useRef(true);
  const controller = useRef(null);
  const latestRead = useRef(null);

  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
      controller.current?.abort();
    };
  }, []);
  useEffect(() => {
    return () => {
      if (preview) URL.revokeObjectURL(preview);
    };
  }, [preview]);
  async function read(file) {
    if (active.current || disabled || !file) return;
    setError('');
    if (demo) {
      setError('Receipt autofill is available after signing in to your workspace.');
      return;
    }
    if (
      !['application/pdf', 'image/png', 'image/jpeg', 'image/webp'].includes(file.type) ||
      file.size > 10 * 1024 * 1024 ||
      !file.size
    ) {
      setError('Choose a PDF, PNG, JPEG or WebP up to 10 MB.');
      return;
    }
    active.current = true;
    setReading(true);
    onBusyChange(true);
    setResult(null);
    setFilename(file.name || 'Pasted receipt');
    const apply = onExtract;
    controller.current = new AbortController();
    try {
      // Preview is optional; failure must not prevent reading the receipt.
      let previewUrl = '';
      if (file.type.startsWith('image/')) {
        try {
          previewUrl = URL.createObjectURL(file);
        } catch {
          /* Read without preview. */
        }
      }
      setPreview(previewUrl);
      const body = new FormData();
      body.append('file', file, file.name || 'clipboard.png');
      const response = await api('/subscriptions/extract-receipt', {
        method: 'POST',
        body,
        signal: controller.current.signal,
      });
      if (!mounted.current) return;
      const result = normalizeReceiptResult(response);
      apply(result.fields);
      setResult(result);
    } catch (err) {
      if (mounted.current && err.name !== 'AbortError') setError(err.message);
    } finally {
      active.current = false;
      if (mounted.current) {
        setReading(false);
        onBusyChange(false);
      }
    }
  }
  latestRead.current = read;
  useEffect(() => {
    const paste = (event) => {
      const item = [...(event.clipboardData?.items || [])].find(
        (item) => item.kind === 'file' && item.type.startsWith('image/')
      );
      const file = item?.getAsFile();
      if (file) {
        event.preventDefault();
        void latestRead.current(file);
      }
    };
    document.addEventListener('paste', paste);
    return () => document.removeEventListener('paste', paste);
  }, []);

  return (
    <section className="receipt-import" aria-label="Autofill from receipt" aria-busy={reading}>
      <div className="receipt-import-heading">
        <FileText size={20} />
        <div>
          <strong>Autofill from a receipt</strong>
          <p>Upload a slip, receipt, invoice or PDF, or paste a screenshot with Ctrl+V.</p>
        </div>
      </div>
      <label className={`receipt-upload ${reading ? 'is-reading' : ''}`}>
        {reading ? <LoaderCircle size={18} className="spin" /> : <Upload size={18} />}
        <span>
          {reading ? 'Reading receipt… this may take a minute' : 'Choose receipt or PDF'}
          <small>PNG, JPG, WebP or PDF · up to 10 MB · PDF up to 10 pages</small>
        </span>
        <input
          type="file"
          accept="application/pdf,image/png,image/jpeg,image/webp"
          disabled={disabled || reading}
          onChange={(e) => {
            const file = e.target.files?.[0];
            e.target.value = '';
            void read(file);
          }}
        />
      </label>
      {filename && (
        <div className="receipt-source">
          {preview && <img src={preview} alt="Uploaded receipt preview" />}
          <span>{filename}</span>
        </div>
      )}
      <div role="status" aria-live="polite">
        {result && (
          <>
            <p className="receipt-result">
              {Object.keys(result.fields).length
                ? 'Receipt details filled in. Review the fields before saving.'
                : 'No fields were filled in. Enter the details below.'}
            </p>
            {result.warnings.map((warning, i) => (
              <p className="receipt-warning" key={i}>
                {warning}
              </p>
            ))}
          </>
        )}
      </div>
      <ErrorNote error={error} />
      {result?.text && (
        <details>
          <summary>View extracted text</summary>
          <pre>{result.text}</pre>
        </details>
      )}
      <small>
        English and Bengali text supported. Your document is processed on this server for autofill
        and is not saved as an attachment.
      </small>
    </section>
  );
}
