"use client";

import { useRef, useState } from "react";

export const MAX_FILE_BYTES = 5 * 1024 * 1024;

export function validateFile(file) {
  if (!file) return "Choose a CSV or XLSX file.";
  if (!/\.(csv|xlsx)$/i.test(file.name)) return "Only .csv and .xlsx files are supported.";
  if (file.size > MAX_FILE_BYTES) return "Your file is too large. The maximum size is 5 MiB.";
  if (file.size === 0) return "This file is empty. Choose a file containing data.";
  return "";
}

export default function FileUpload({ file, onChange, disabled }) {
  const [dragging, setDragging] = useState(false);
  const [error, setError] = useState("");
  const input = useRef(null);

  function select(candidate) {
    const message = validateFile(candidate);
    setError(message);
    onChange(message ? null : candidate);
  }

  return (
    <section className="panel upload-panel" aria-labelledby="upload-title">
      <div className="section-heading">
        <span className="step-number" aria-hidden="true">1</span>
        <h2 id="upload-title">Bring your spreadsheet</h2>
      </div>
      <div
        className={`dropzone ${dragging ? "dragging" : ""} ${file ? "selected" : ""}`}
        onDragOver={(event) => {
          event.preventDefault();
          if (!disabled) setDragging(true);
        }}
        onDragLeave={(event) => {
          if (!event.currentTarget.contains(event.relatedTarget)) setDragging(false);
        }}
        onDrop={(event) => {
          event.preventDefault();
          setDragging(false);
          if (!disabled) {
            if (event.dataTransfer.files.length !== 1) {
              setError("Please upload one file at a time.");
              return;
            }
            select(event.dataTransfer.files[0]);
          }
        }}
      >
        <span className="file-symbol" aria-hidden="true">{file ? "✓" : "↥"}</span>
        <label htmlFor="data-file" className="file-label">
          {file ? file.name : "Drop a CSV or XLSX file here"}
        </label>
        <p className="muted">{file ? `${(file.size / 1024).toFixed(1)} KiB · Ready to analyze` : "or browse from your device · Up to 5 MiB"}</p>
        <input
          ref={input}
          id="data-file"
          type="file"
          accept=".csv,.xlsx"
          disabled={disabled}
          aria-describedby="file-note file-error"
          onChange={(event) => {
            const candidate = event.target.files?.[0];
            if (candidate) select(candidate);
            event.target.value = "";
          }}
        />
        {file && (
          <button className="text-button" type="button" disabled={disabled} onClick={() => {
            onChange(null);
            setError("");
            if (input.current) input.current.value = "";
          }}>Remove file</button>
        )}
      </div>
      <p id="file-error" className="error-text" role={error ? "alert" : undefined}>{error}</p>
      <p id="file-note" className="muted small">XLSX: only the first worksheet is analyzed. The server validates the file contents.</p>
      <a href="./sample.csv" download="sisyphus-sample.csv" className="sample-link">Download a fictional sample CSV <span aria-hidden="true">↓</span></a>
    </section>
  );
}
