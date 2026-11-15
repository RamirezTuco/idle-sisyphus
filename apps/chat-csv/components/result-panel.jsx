"use client";

import { useEffect, useRef, useState } from "react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import { buildResultDownload, getTableHeaders, resultToClipboard, valueToText } from "../lib/client/result-export";

const PREVIEW_ROWS = 200;
const PREVIEW_CHARACTERS = 20000;
const PREVIEW_LINES = 300;

function textPreview(text) {
  return text.split("\n").slice(0, PREVIEW_LINES).join("\n").slice(0, PREVIEW_CHARACTERS);
}

function CellDialog({ cell, onClose }) {
  const ref = useRef(null);
  useEffect(() => {
    ref.current?.showModal();
    return () => ref.current?.close();
  }, []);
  return (
    <dialog ref={ref} className="cell-dialog" aria-labelledby="cell-title" onCancel={onClose} onClick={(event) => {
      if (event.target === event.currentTarget) {
        const bounds = event.currentTarget.getBoundingClientRect();
        if (event.clientX < bounds.left || event.clientX > bounds.right || event.clientY < bounds.top || event.clientY > bounds.bottom) onClose();
      }
    }}>
      <div className="section-heading spread">
        <h3 id="cell-title">{cell.title}</h3>
        <button className="secondary-button" type="button" onClick={onClose} autoFocus>Close</button>
      </div>
      <pre className="cell-content">{cell.text || "(empty cell)"}</pre>
    </dialog>
  );
}

function ResultContent({ answer, onExpand }) {
  const data = answer.queryResult.result;
  const type = answer.resultType;
  const table = Array.isArray(data) && (type === "table" ||
    (!["json", "primitive", "list", "markdown", "text"].includes(type) && data[0] !== null && typeof data[0] === "object"));
  if (table) {
    const allHeaders = getTableHeaders(data);
    const headers = allHeaders.slice(0, 60);
    if (!data.length) return <p>No matching rows.</p>;
    return (
      <>
        <p className="muted small">Select a cell to view its full value. Scroll horizontally for more columns.</p>
        <div className="table-scroll" role="region" aria-label="Analysis result table" tabIndex={0}>
          <table>
            <caption className="sr-only">Analysis result preview</caption>
            <thead><tr>{headers.map((header) => <th key={header} scope="col">{header}</th>)}</tr></thead>
            <tbody>{data.slice(0, PREVIEW_ROWS).map((row, index) => (
              <tr key={index}>{headers.map((header) => {
                const text = valueToText(row?.[header]);
                return <td key={header}><button type="button" className="cell-button" aria-label={`Expand row ${index + 1}, ${header}`}
                  onClick={() => onExpand({ title: `Row ${index + 1} · ${header}`, text })}>{text.length > 160 ? `${text.slice(0, 160)}…` : text || "—"}</button></td>;
              })}</tr>
            ))}</tbody>
          </table>
        </div>
        {(data.length > PREVIEW_ROWS || allHeaders.length > headers.length) && <p className="preview-note">Preview shows up to {PREVIEW_ROWS} of {data.length} rows and {headers.length} of {allHeaders.length} columns. Download or copy includes the entire returned result.</p>}
      </>
    );
  }
  if (type === "list" && Array.isArray(data)) {
    return (
      <>
        {data.length ? <ol className="result-list">{data.slice(0, PREVIEW_ROWS).map((item, index) => {
          const text = valueToText(item);
          return <li key={index}><button className="list-item-button" type="button" onClick={() => onExpand({ title: `Item ${index + 1}`, text })}>{text.slice(0, 1000) || "(empty item)"}{text.length > 1000 ? "…" : ""}</button></li>;
        })}</ol> : <p>No matching items.</p>}
        {data.length > PREVIEW_ROWS && <p className="preview-note">Showing {PREVIEW_ROWS} of {data.length} items. Download or copy includes all returned items.</p>}
      </>
    );
  }
  const text = type === "json" || (data !== null && typeof data === "object")
    ? JSON.stringify(data, null, 2) : data === null ? "null" : String(data);
  const preview = textPreview(text);
  return (
    <>
      {type === "markdown" ? (
        <div className="markdown-result">
          <ReactMarkdown remarkPlugins={[remarkGfm]} components={{
            a: ({ children, href }) => <a href={href} target="_blank" rel="noopener noreferrer">{children}</a>,
            img: ({ alt }) => <span className="muted">[Image omitted{alt ? `: ${alt}` : ""}]</span>,
            table: ({ children }) => <div className="table-scroll" role="region" aria-label="Markdown result table" tabIndex={0}><table>{children}</table></div>,
          }}>{preview}</ReactMarkdown>
        </div>
      ) : <pre className="plain-result">{preview}</pre>}
      {preview.length < text.length && <p className="preview-note">This is a shortened preview. Download or copy includes the complete returned result.</p>}
    </>
  );
}

export default function ResultPanel({ answer, baseFileName }) {
  const [cell, setCell] = useState(null);
  const [status, setStatus] = useState("");
  const mounted = useRef(true);
  useEffect(() => {
    mounted.current = true;
    return () => { mounted.current = false; };
  }, []);

  function download() {
    let url;
    let link;
    try {
      const exported = buildResultDownload(answer, baseFileName);
      url = URL.createObjectURL(new Blob([exported.content], { type: exported.mimeType }));
      link = document.createElement("a");
      link.href = url;
      link.download = exported.filename;
      document.body.appendChild(link);
      link.click();
      setStatus("Download started.");
    } catch {
      setStatus("Unable to download this result. Please try copying it.");
    } finally {
      link?.remove();
      if (url) setTimeout(() => URL.revokeObjectURL(url), 1000);
    }
  }

  async function copy() {
    try {
      await navigator.clipboard.writeText(resultToClipboard(answer));
      if (mounted.current) setStatus("Result copied.");
    } catch {
      if (mounted.current) setStatus("Clipboard access failed. Use Download instead.");
    }
  }

  return (
    <section className="panel result-panel" aria-labelledby="result-title">
      <div className="section-heading spread result-heading">
        <div><span className="eyebrow">YOUR ANALYSIS</span><h2 id="result-title">A little clarity, delivered.</h2></div>
        <div className="button-group">
          <button type="button" className="secondary-button" onClick={copy}>Copy result</button>
          <button type="button" className="primary-button compact" onClick={download}>Download result ↓</button>
        </div>
      </div>
      <p role="status" className="small action-status">{status}</p>
      <div className="result-metadata">
        {Number.isFinite(answer.totalRows) && <span>{answer.totalRows.toLocaleString()} source rows</span>}
        {answer.worksheet && <span>Worksheet: {answer.worksheet}</span>}
        {answer.resultType && <span>Format: {answer.resultType}</span>}
      </div>
      {answer.queryResult.description && <p className="result-description">{valueToText(answer.queryResult.description)}</p>}
      <ResultContent answer={answer} onExpand={setCell} />
      {answer.code && (
        <details className="code-details">
          <summary>How this answer was calculated · View generated code</summary>
          <p className="muted small">Review the generated analysis and verify important findings. Code is displayed as text, not executed by your browser.</p>
          <pre><code>{valueToText(answer.code)}</code></pre>
        </details>
      )}
      {answer.tokenUsage && <p className="muted small token-usage">
        Tokens: input {answer.tokenUsage.inputTokens ?? "—"} · output {answer.tokenUsage.outputTokens ?? "—"} · total {answer.tokenUsage.totalTokens ?? "—"} · cached {answer.tokenUsage.cachedTokens ?? "—"}
      </p>}
      {cell && <CellDialog cell={cell} onClose={() => setCell(null)} />}
    </section>
  );
}
