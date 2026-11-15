"use client";

import { useEffect, useRef, useState } from "react";
import FileUpload, { validateFile } from "../components/file-upload";
import ResultPanel from "../components/result-panel";
import useChatSession from "../components/use-chat-session";

const EXAMPLES = ["Show me the first 5 rows", "Count rows by category", "What are the column names?"];
const PLATFORM_URL = process.env.NEXT_PUBLIC_PLATFORM_URL || "https://idle-sisyphus.web.app";

export default function Home() {
  const session = useChatSession();
  const [file, setFile] = useState(null);
  const [question, setQuestion] = useState("");
  const [validationError, setValidationError] = useState("");
  const previousUid = useRef(null);

  useEffect(() => {
    const uid = session.user?.uid || null;
    if (previousUid.current && previousUid.current !== uid) {
      setFile(null);
      setQuestion("");
      setValidationError("");
    }
    previousUid.current = uid;
  }, [session.user?.uid]);

  function submit(event) {
    event.preventDefault();
    const fileError = validateFile(file);
    const questionError = !question.trim() ? "Enter a question about your data." :
      question.length > 2000 ? "Questions must be 2,000 characters or fewer." : "";
    setValidationError(fileError || questionError);
    if (!fileError && !questionError) void session.ask(file, question);
  }

  const exhausted = session.usage?.remaining === 0;
  return (
    <div className="app-shell">
      <a href="#main-content" className="skip-link">Skip to content</a>
      <header className="site-header">
        <div className="header-inner">
          <a href={PLATFORM_URL} className="brand" aria-label="Sisyphus platform home">
            <span className="brand-mark" aria-hidden="true">S<span>↗</span></span>
            <span>Sisyphus<span className="brand-subtitle">Small tools. Less uphill.</span></span>
          </a>
          <div className="auth-controls">
            {!session.authReady ? <span className="muted small" role="status">Checking sign-in…</span> :
              session.user ? (
                <>
                  <span className="signed-in-name" title={session.user.email || undefined}>{session.user.displayName || session.user.email || "Google account"}</span>
                  <button type="button" className="secondary-button" disabled={session.authBusy} onClick={session.logout}>{session.authBusy ? "Please wait…" : "Sign out"}</button>
                </>
              ) : <button type="button" className="secondary-button google-button"
                disabled={session.authBusy || Boolean(session.setupError)} onClick={session.login}>
                <span aria-hidden="true" className="google-g">G</span>{session.authBusy ? "Signing in…" : "Sign in with Google"}
              </button>}
          </div>
        </div>
      </header>
      <main id="main-content" className="main-container">
        <section className="hero" aria-labelledby="page-title">
          <span className="eyebrow hero-badge">SISYPHUS / CHAT CSV</span>
          <h1 id="page-title">Your spreadsheet.<br /><span>A simpler conversation.</span></h1>
          <p className="hero-description">Ask questions in plain language. Turn rows and columns into insights with AI-powered analysis.</p>
          <div className="feature-pills"><span>CSV + XLSX</span><span>No spreadsheet formulas needed</span><span>Free · 5 questions/day by default</span></div>
        </section>
        {session.setupError && <div className="notice warning" role="alert"><strong>Sign-in is not configured.</strong><p>{session.setupError}</p><p>No AI queries are available until setup is complete.</p></div>}
        {session.authError && <div className="notice error-notice" role="alert">{session.authError}</div>}
        <div className="usage-bar">
          <div><strong>{session.user ? "Your daily usage" : "Google sign-in required for every AI question"}</strong>
            <p className="small muted">The server enforces your daily limit. No payment or subscription required.</p>
          </div>
          {session.user && <div className="usage-status" aria-live="polite">
            {session.usageLoading ? "Checking usage…" : session.usage ? `${session.usage.used} / ${session.usage.limit} used · ${session.usage.remaining} remaining` : "Usage unavailable"}
            {session.usage && <span className="small muted">Server date: {session.usage.date}</span>}
          </div>}
        </div>
        {session.user && session.usageError && <div className="notice warning" role="alert">Unable to check usage: {session.usageError} <button type="button" className="text-button" disabled={session.usageLoading || session.loading} onClick={session.refreshUsage}>Retry usage check</button></div>}
        {exhausted && <div className="notice warning" role="status">You have reached today&apos;s free limit. Come back after the server&apos;s daily reset.</div>}
        <form onSubmit={submit} className="analysis-form">
          <FileUpload file={file} onChange={(selected) => {
            setFile(selected);
            setValidationError("");
          }} disabled={session.loading} />
          <section className="panel question-panel" aria-labelledby="question-title">
            <div className="section-heading"><span className="step-number" aria-hidden="true">2</span><h2 id="question-title">Ask something useful</h2></div>
            <label htmlFor="question" className="sr-only">Your question about the spreadsheet</label>
            <textarea id="question" name="question" value={question} maxLength={2000}
              disabled={session.loading} aria-describedby="question-help question-count"
              placeholder="e.g. What is the average revenue by category?"
              onChange={(event) => { setQuestion(event.target.value); setValidationError(""); }} />
            <div className="question-footer"><span id="question-help" className="small muted">One question at a time. Be specific.</span><span id="question-count" className="small muted">{question.length} / 2,000</span></div>
            <div className="example-questions"><span className="small muted">Try a question</span>{EXAMPLES.map((example) => (
              <button key={example} type="button" disabled={session.loading} onClick={() => { setQuestion(example); setValidationError(""); }}>{example}</button>
            ))}</div>
            <div className="privacy-note"><span aria-hidden="true">◈</span><p>Sample rows and your question are sent to Gemini for analysis. Uploaded data isn&apos;t stored by this app; only usage metadata is retained. Avoid uploading sensitive information.</p></div>
            <button type="submit" className="primary-button ask-button"
              disabled={!session.authReady || !session.user || session.authBusy || session.loading || exhausted || !file || !question.trim()}>
              {session.loading ? "Analyzing your spreadsheet…" : "Ask your data"}<span aria-hidden="true">{session.loading ? "◌" : "↗"}</span>
            </button>
            {!session.user && <p className="small muted center">Sign in above to ask. You can choose a file first.</p>}
          </section>
        </form>
        {(validationError || session.error) && <div className="notice error-notice" role="alert">{validationError || session.error}</div>}
        {session.loading && <div className="loading-panel" role="status"><span className="spinner" aria-hidden="true" /><div><strong>Turning data into an answer…</strong><p className="small muted">Larger spreadsheets may take a moment. Keep this tab open.</p></div></div>}
        {session.answer && <ResultPanel key={session.user.uid}
          answer={session.answer} baseFileName={session.answerFileName} />}
        <footer className="site-footer"><p>AI can make mistakes. Verify important results against your source data.</p><a href={PLATFORM_URL}>← Back to Sisyphus</a></footer>
      </main>
    </div>
  );
}
