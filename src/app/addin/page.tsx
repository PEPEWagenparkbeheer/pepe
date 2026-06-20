'use client';
/**
 * src/app/addin/page.tsx
 *
 * PEPE BREIN — Outlook Add-in Task Pane (fase 1)
 *
 * Flow:
 *   1. Office.js laadt via CDN <script> in useEffect
 *   2. Supabase-sessie ophalen (cookie — gedeeld met de rest van de app)
 *   3. "Genereer antwoord" → POST /api/brein/generate-reply → concept-HTML
 *   4. "Invoegen in antwoord" → displayReplyFormAsync (of createReply fallback)
 *
 * Auth: AppLayout toont LoginScreen als de gebruiker niet ingelogd is; na login
 * is de Supabase-sessie beschikbaar via supabase.auth.getSession().
 */

import { useCallback, useEffect, useRef, useState } from 'react';
import { supabase } from '@/lib/supabase';

type Status = 'init' | 'ready' | 'generating' | 'done' | 'error';

interface GenerateReplyResponse {
  category: string;
  confidence: number;
  replyHtml: string;
}

export default function AddinPage() {
  const [status, setStatus] = useState<Status>('init');
  const [replyHtml, setReplyHtml] = useState('');
  const [category, setCategory] = useState('');
  const [errorMsg, setErrorMsg] = useState('');
  const officeReady = useRef(false);

  // Office.js laden via CDN — doet niets als Office al aanwezig is
  useEffect(() => {
    if (typeof window === 'undefined') return;
    const w = window as typeof window & { Office?: { onReady?: (cb: () => void) => void } };
    if (w.Office?.onReady) {
      w.Office.onReady(() => {
        officeReady.current = true;
        setStatus('ready');
      });
      return;
    }
    const script = document.createElement('script');
    script.src = 'https://appsforoffice.microsoft.com/lib/1/hosted/office.js';
    script.async = true;
    script.onload = () => {
      const w2 = window as typeof window & { Office?: { onReady?: (cb: () => void) => void } };
      w2.Office?.onReady?.(() => {
        officeReady.current = true;
        setStatus('ready');
      });
    };
    script.onerror = () => {
      // Buiten Outlook (dev/test): toon UI toch
      officeReady.current = false;
      setStatus('ready');
    };
    document.head.appendChild(script);
  }, []);

  /** Platte tekst uit de open mail ophalen via Office.js. */
  const getBodyText = useCallback((): Promise<string> => {
    return new Promise((resolve) => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const item = (window as any)?.Office?.context?.mailbox?.item;
      if (!item) { resolve(''); return; }
      item.body.getAsync('text', (result: { value?: string }) => {
        resolve(result.value ?? '');
      });
    });
  }, []);

  const genereerAntwoord = useCallback(async () => {
    setStatus('generating');
    setErrorMsg('');
    setReplyHtml('');
    setCategory('');

    try {
      const { data: sessionData } = await supabase.auth.getSession();
      const token = sessionData.session?.access_token;
      if (!token) {
        throw new Error('Niet ingelogd — open de app en log eerst in.');
      }

      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const mailboxCtx = (window as any)?.Office?.context?.mailbox;
      const item = mailboxCtx?.item;
      const mailbox = mailboxCtx?.userProfile?.emailAddress ?? '';
      const bodyText = await getBodyText();

      const resp = await fetch('/api/brein/generate-reply', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({
          mailbox,
          subject: item?.subject ?? '',
          from: item?.from?.emailAddress ?? '',
          fromName: item?.from?.displayName ?? '',
          bodyText,
          conversationId: item?.conversationId,
        }),
      });

      if (!resp.ok) {
        const err = (await resp.json().catch(() => ({}))) as { error?: string };
        throw new Error(err.error ?? `Serverfout ${resp.status}`);
      }

      const data = (await resp.json()) as GenerateReplyResponse;
      setReplyHtml(data.replyHtml);
      setCategory(data.category);
      setStatus('done');
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      console.error('[addin] Generatie mislukt:', msg);
      setErrorMsg(msg);
      setStatus('error');
    }
  }, [getBodyText]);

  const invoegen = useCallback(() => {
    if (!replyHtml) return;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const item = (window as any)?.Office?.context?.mailbox?.item;
    if (item?.displayReplyFormAsync) {
      item.displayReplyFormAsync({ htmlBody: replyHtml });
    } else {
      void navigator.clipboard.writeText(replyHtml);
      alert('HTML gekopieerd naar klembord (test-modus).');
    }
  }, [replyHtml]);

  /* ── Render ─────────────────────────────────────────────────────────── */

  return (
    <div style={paneStyle}>
      <div style={headerStyle}>
        <span style={{ fontSize: 18 }}>🧠</span>
        <span style={titleStyle}>PEPE BREIN</span>
      </div>

      {status === 'init' && (
        <p style={mutedStyle}>Office.js laden…</p>
      )}

      {(status === 'ready' || status === 'error') && (
        <button style={btnPrimaryStyle} onClick={() => void genereerAntwoord()}>
          ✨ Genereer antwoord
        </button>
      )}

      {status === 'generating' && (
        <div style={{ textAlign: 'center', padding: '16px 0' }}>
          <p style={mutedStyle}>Claude denkt na…</p>
          <div style={spinnerStyle} />
        </div>
      )}

      {status === 'done' && (
        <>
          {category && (
            <p style={categoryStyle}>
              Categorie: <strong>{category}</strong>
            </p>
          )}

          <iframe
            style={previewStyle}
            srcDoc={`<!doctype html><html><body style="font-family:Calibri,Arial,sans-serif;font-size:11pt;margin:8px">${replyHtml}</body></html>`}
            title="Concept antwoord preview"
            sandbox="allow-same-origin"
          />

          <div style={{ display: 'flex', gap: 8, marginTop: 8 }}>
            <button style={btnPrimaryStyle} onClick={invoegen}>
              📥 Invoegen
            </button>
            <button
              style={btnSecondaryStyle}
              onClick={() => { setStatus('ready'); setReplyHtml(''); setCategory(''); }}
            >
              ↩ Opnieuw
            </button>
          </div>
        </>
      )}

      {errorMsg && (
        <p style={errorStyle}>{errorMsg}</p>
      )}
    </div>
  );
}

/* ── Styles ──────────────────────────────────────────────────────────────── */

const paneStyle: React.CSSProperties = {
  display: 'flex',
  flexDirection: 'column',
  padding: '12px 14px',
  fontFamily: 'Calibri, Arial, sans-serif',
  fontSize: 13,
  color: '#1a1a1a',
  background: '#fff',
  minHeight: '100vh',
  boxSizing: 'border-box',
};

const headerStyle: React.CSSProperties = {
  display: 'flex',
  alignItems: 'center',
  gap: 8,
  marginBottom: 14,
  borderBottom: '2px solid #401837',
  paddingBottom: 8,
};

const titleStyle: React.CSSProperties = {
  fontSize: 16,
  fontWeight: 700,
  color: '#401837',
  letterSpacing: 0.5,
};

const mutedStyle: React.CSSProperties = {
  color: '#666',
  fontSize: 12,
  margin: '4px 0',
};

const categoryStyle: React.CSSProperties = {
  fontSize: 12,
  color: '#555',
  margin: '0 0 8px',
  background: '#f5f0f3',
  padding: '4px 8px',
  borderRadius: 4,
  border: '1px solid #e8dde6',
};

const previewStyle: React.CSSProperties = {
  width: '100%',
  minHeight: 220,
  border: '1px solid #ddd',
  borderRadius: 4,
  background: '#fafafa',
};

const errorStyle: React.CSSProperties = {
  color: '#c0392b',
  fontSize: 12,
  marginTop: 8,
  background: '#fdf0ee',
  padding: '6px 8px',
  borderRadius: 4,
  border: '1px solid #f5c6c0',
};

const spinnerStyle: React.CSSProperties = {
  width: 24,
  height: 24,
  border: '3px solid #f0e8ed',
  borderTop: '3px solid #401837',
  borderRadius: '50%',
  animation: 'spin 0.8s linear infinite',
  margin: '8px auto 0',
};

const btnBase: React.CSSProperties = {
  display: 'block',
  width: '100%',
  padding: '9px 12px',
  border: 'none',
  borderRadius: 5,
  fontSize: 13,
  fontWeight: 600,
  cursor: 'pointer',
  textAlign: 'center',
};

const btnPrimaryStyle: React.CSSProperties = {
  ...btnBase,
  background: '#401837',
  color: '#fff',
};

const btnSecondaryStyle: React.CSSProperties = {
  ...btnBase,
  width: 'auto',
  flex: 1,
  background: '#f5f0f3',
  color: '#401837',
  border: '1px solid #c8b4c1',
};
