'use client';

import { useState, useEffect, useRef, useCallback } from 'react';

const PRICE = process.env.NEXT_PUBLIC_PRICE_DISPLAY || '$0.99';
const FREE_LIMIT = 5;
const LS_KEY = 'chartai_free_uses';

function getFreeUsesLeft() {
  if (typeof window === 'undefined') return FREE_LIMIT;
  const used = parseInt(localStorage.getItem(LS_KEY) || '0', 10);
  return Math.max(0, FREE_LIMIT - used);
}

function incrementFreeUses() {
  const used = parseInt(localStorage.getItem(LS_KEY) || '0', 10);
  localStorage.setItem(LS_KEY, String(used + 1));
}

export default function Home() {
  const [imageB64, setImageB64]   = useState(null);
  const [imageUrl, setImageUrl]   = useState(null);
  const [mediaType, setMediaType] = useState(null);
  const [analysis, setAnalysis]   = useState(null);
  const [analyzing, setAnalyzing] = useState(false);
  const [paying, setPaying]       = useState(false);
  const [error, setError]         = useState(null);
  const [dragging, setDragging]   = useState(false);
  const [returnMsg, setReturnMsg] = useState(null);
  const [freeLeft, setFreeLeft]   = useState(FREE_LIMIT);
  const fileInputRef = useRef(null);

  // Read free uses from localStorage on mount
  useEffect(() => {
    setFreeLeft(getFreeUsesLeft());
  }, []);

  // Detect return from PayPal and auto-analyze
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const orderId = params.get('token'); // PayPal returns ?token=ORDER_ID
    if (!orderId) return;

    window.history.replaceState({}, '', '/');

    const b64 = sessionStorage.getItem('chartai_image');
    const mt  = sessionStorage.getItem('chartai_media_type');

    if (!b64 || !mt) {
      setError('Payment received, but the image was lost during redirect. Please upload again — contact support for a refund.');
      return;
    }

    setImageB64(b64);
    setMediaType(mt);
    setImageUrl('data:' + mt + ';base64,' + b64);
    setReturnMsg('Payment confirmed! Running analysis…');

    sessionStorage.removeItem('chartai_image');
    sessionStorage.removeItem('chartai_media_type');

    runAnalysis(orderId, b64, mt);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function runAnalysis(orderId, b64, mt) {
    setAnalyzing(true);
    setError(null);
    try {
      const res = await fetch('/api/analyze', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ orderId, image: b64, mediaType: mt }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Analysis failed');
      setAnalysis(data.analysis);
      setReturnMsg(null);

      // Deduct free use only on success
      if (orderId === 'free') {
        incrementFreeUses();
        setFreeLeft(getFreeUsesLeft());
      }
    } catch (err) {
      setError(err.message);
      setReturnMsg(null);
    } finally {
      setAnalyzing(false);
    }
  }

  const handleFile = useCallback((file) => {
    if (!file) return;
    const valid = ['image/jpeg', 'image/png', 'image/gif', 'image/webp'];
    if (!valid.includes(file.type)) { setError('Please upload a PNG, JPG, GIF, or WebP image.'); return; }
    if (file.size > 20 * 1024 * 1024) { setError('File too large. Maximum 20MB.'); return; }
    setError(null);
    const reader = new FileReader();
    reader.onload = (e) => {
      const dataUrl = e.target.result;
      setImageB64(dataUrl.split(',')[1]);
      setImageUrl(dataUrl);
      setMediaType(file.type);
      setAnalysis(null);
    };
    reader.readAsDataURL(file);
  }, []);

  function removeImage() {
    setImageB64(null); setImageUrl(null); setMediaType(null);
    setAnalysis(null); setError(null);
    if (fileInputRef.current) fileInputRef.current.value = '';
  }

  async function handleFreeAnalyze() {
    if (!imageB64 || !mediaType) return;
    await runAnalysis('free', imageB64, mediaType);
  }

  async function handlePay() {
    if (!imageB64 || !mediaType) return;
    setPaying(true);
    setError(null);
    try {
      sessionStorage.setItem('chartai_image', imageB64);
      sessionStorage.setItem('chartai_media_type', mediaType);

      const res = await fetch('/api/checkout', { method: 'POST' });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Could not start checkout');
      window.location.href = data.url;
    } catch (err) {
      sessionStorage.removeItem('chartai_image');
      sessionStorage.removeItem('chartai_media_type');
      setError(err.message);
      setPaying(false);
    }
  }

  const isUp = analysis?.direction === 'UP';
  const isBusy = paying || analyzing;

  return (
    <div style={s.app}>
      {/* Header */}
      <header style={s.header}>
        <div style={s.headerInner}>
          <div style={s.brand}>
            <span style={{ fontSize: 22 }}>📈</span>
            <span style={s.brandName}>ChartAI</span>
          </div>
          <span style={s.brandSep}>|</span>
          <span style={s.brandSub}>Crypto Chart Analyzer</span>
          <span style={{ ...s.badge, marginLeft: 'auto' }}>Powered by AI</span>
        </div>
      </header>

      {/* Main */}
      <main style={s.main}>
        <div style={s.workspace}>

          {/* Upload Panel */}
          <div style={s.panel}>
            <h2 style={s.panelTitle}>Upload Chart</h2>
            <p style={s.panelSub}>Drop a screenshot of any crypto chart</p>

            <div
              style={{
                ...s.dropZone,
                ...(dragging ? s.dropZoneDrag : {}),
                ...(imageUrl ? s.dropZoneFilled : {}),
              }}
              onDragOver={(e) => { e.preventDefault(); setDragging(true); }}
              onDragLeave={() => setDragging(false)}
              onDrop={(e) => { e.preventDefault(); setDragging(false); handleFile(e.dataTransfer.files[0]); }}
              onClick={() => !imageUrl && fileInputRef.current?.click()}
            >
              {imageUrl ? (
                <>
                  <img src={imageUrl} alt="Chart" style={s.preview} />
                  <button
                    style={s.removeBtn}
                    onClick={(e) => { e.stopPropagation(); removeImage(); }}
                  >✕ Remove</button>
                </>
              ) : (
                <div style={s.placeholder}>
                  <div style={{ color: 'var(--muted)', marginBottom: 14, opacity: .7 }}>
                    <svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
                      <rect x="2" y="3" width="20" height="14" rx="2"/>
                      <path d="m8 21 4-4 4 4"/><path d="M12 17v4"/>
                      <path d="m7 10 3 3 4-5 3 3"/>
                    </svg>
                  </div>
                  <p style={{ fontSize: 15, fontWeight: 500, marginBottom: 6 }}>Drop your chart here</p>
                  <p style={{ fontSize: 13, color: 'var(--muted)', marginBottom: 10 }}>
                    or <span style={{ color: 'var(--accent)', textDecoration: 'underline' }}>browse files</span>
                  </p>
                  <p style={{ fontSize: 12, color: 'var(--muted)', opacity: .7 }}>PNG · JPG · GIF · WebP · Max 20MB</p>
                </div>
              )}
            </div>

            <input
              ref={fileInputRef}
              type="file"
              accept="image/png,image/jpeg,image/gif,image/webp"
              onChange={(e) => handleFile(e.target.files[0])}
              style={{ display: 'none' }}
            />

            {error && (
              <div style={s.errorBox}>
                <span>⚠</span> {error}
              </div>
            )}

            {/* Free uses badge */}
            <div style={s.freeBar}>
              <span style={s.freeLabel}>
                {freeLeft > 0
                  ? `${freeLeft} free ${freeLeft === 1 ? 'analysis' : 'analyses'} remaining`
                  : 'Free uses exhausted — pay per analysis'}
              </span>
              <div style={s.freeDots}>
                {Array.from({ length: FREE_LIMIT }).map((_, i) => (
                  <div
                    key={i}
                    style={{
                      ...s.freeDot,
                      ...(i < freeLeft ? s.freeDotActive : s.freeDotUsed),
                    }}
                  />
                ))}
              </div>
            </div>

            {/* Action button */}
            {freeLeft > 0 ? (
              <button
                style={{
                  ...s.payBtn,
                  ...s.freeBtn,
                  ...(!imageB64 || isBusy ? s.payBtnDisabled : {}),
                }}
                onClick={handleFreeAnalyze}
                disabled={!imageB64 || isBusy}
              >
                {analyzing ? (
                  <><span style={s.spin} /> Analyzing…</>
                ) : (
                  <>
                    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                      <path d="M13 2L3 14h9l-1 8 10-12h-9l1-8z"/>
                    </svg>
                    Analyze Free ({freeLeft} left)
                  </>
                )}
              </button>
            ) : (
              <button
                style={{
                  ...s.payBtn,
                  ...(!imageB64 || isBusy ? s.payBtnDisabled : {}),
                }}
                onClick={handlePay}
                disabled={!imageB64 || isBusy}
              >
                {paying ? (
                  <><span style={s.spin} /> Redirecting to payment…</>
                ) : (
                  <>
                    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                      <rect x="1" y="4" width="22" height="16" rx="2" ry="2"/>
                      <line x1="1" y1="10" x2="23" y2="10"/>
                    </svg>
                    Pay {PRICE} &amp; Analyze Chart
                  </>
                )}
              </button>
            )}

            <p style={s.hint}>
              {freeLeft > 0
                ? 'No payment needed for your free analyses'
                : imageB64
                  ? `One-time payment · Secure checkout via PayPal`
                  : 'Upload a crypto chart screenshot to get started'}
            </p>
          </div>

          {/* Results Panel */}
          <div style={s.panel}>
            {analyzing || returnMsg ? (
              <div style={s.loadingState}>
                <span style={s.spin} />
                <p style={{ fontSize: 15, fontWeight: 500, marginBottom: 6 }}>
                  {returnMsg || 'Analyzing chart…'}
                </p>
                <p style={{ fontSize: 13, color: 'var(--muted)' }}>AI is reading your chart</p>
              </div>
            ) : analysis ? (
              <>
                <h2 style={s.panelTitle}>Analysis Result</h2>
                <p style={s.panelSub}>AI-powered technical analysis</p>

                {/* Signal */}
                <div style={{ ...s.signalCard, ...(isUp ? s.signalUp : s.signalDown) }}>
                  <div style={s.signalMain}>
                    <div style={{ ...s.arrow, ...(isUp ? s.arrowUp : s.arrowDown) }}>
                      {isUp ? '↑' : '↓'}
                    </div>
                    <div>
                      <div style={{ ...s.sigLbl, ...(isUp ? s.upText : s.downText) }}>
                        {isUp ? 'BULLISH' : 'BEARISH'}
                      </div>
                      <div style={{ fontSize: 13, color: 'var(--muted)', marginTop: 3 }}>
                        {isUp ? 'Price likely going UP' : 'Price likely going DOWN'}
                      </div>
                    </div>
                  </div>
                  <div>
                    <div style={s.confHeader}>
                      <span style={s.confLabel}>Confidence</span>
                      <span style={{ ...s.confVal, ...(isUp ? s.upText : s.downText) }}>
                        {analysis.confidence}%
                      </span>
                    </div>
                    <div style={s.confTrack}>
                      <div style={{
                        ...s.confFill,
                        ...(isUp ? s.fillUp : s.fillDown),
                        width: `${analysis.confidence}%`,
                        transition: 'width .8s cubic-bezier(.16,1,.3,1)',
                      }} />
                    </div>
                  </div>
                </div>

                {/* Details */}
                <div style={s.grid}>
                  {[
                    ['Trend', analysis.trend],
                    ['Timeframe', analysis.timeframe],
                    ['Support', analysis.support],
                    ['Resistance', analysis.resistance],
                  ].map(([label, val]) => (
                    <div key={label} style={s.detailItem}>
                      <span style={s.dLabel}>{label}</span>
                      <span style={s.dVal}>{val}</span>
                    </div>
                  ))}
                </div>

                {/* Patterns */}
                {analysis.patterns?.length > 0 && (
                  <div style={{ marginBottom: 14 }}>
                    <span style={s.dLabel}>Patterns Detected</span>
                    <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, marginTop: 8 }}>
                      {analysis.patterns.map((p, i) => (
                        <span key={i} style={s.pTag}>{p}</span>
                      ))}
                    </div>
                  </div>
                )}

                {/* Reasoning */}
                <div style={s.reasoningBox}>
                  <span style={s.dLabel}>AI Analysis</span>
                  <p style={{ fontSize: 13, lineHeight: 1.65, opacity: .85, marginTop: 8 }}>
                    {analysis.reasoning}
                  </p>
                </div>

                <p style={s.disclaimer}>⚠ For educational purposes only. Not financial advice.</p>
              </>
            ) : (
              <div style={s.empty}>
                <div style={{ color: 'var(--border-2)', marginBottom: 16 }}>
                  <svg width="56" height="56" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1">
                    <path d="M3 3v18h18"/><path d="m7 16 4-8 4 6 2-4"/>
                  </svg>
                </div>
                <p style={{ fontSize: 16, fontWeight: 500, color: 'var(--muted)', marginBottom: 8 }}>
                  No analysis yet
                </p>
                <p style={{ fontSize: 13, color: 'var(--muted)', opacity: .6, maxWidth: 220, lineHeight: 1.5, textAlign: 'center' }}>
                  {freeLeft > 0
                    ? `You have ${freeLeft} free ${freeLeft === 1 ? 'analysis' : 'analyses'} — upload a chart to start`
                    : `Upload a chart and pay ${PRICE} to get your AI-powered prediction`}
                </p>
              </div>
            )}
          </div>

        </div>
      </main>

      <footer style={s.footer}>
        <p style={{ fontSize: 12, color: 'var(--muted)', opacity: .45 }}>
          Powered by Claude AI · Not financial advice
        </p>
        <p style={{ fontSize: 12, color: 'var(--muted)', opacity: .35, marginTop: 6 }}>
          <a href="/terms" style={{ color: 'inherit', textDecoration: 'underline' }}>Terms of Service</a>
          {' · '}
          <a href="/privacy" style={{ color: 'inherit', textDecoration: 'underline' }}>Privacy Policy</a>
        </p>
      </footer>
    </div>
  );
}

// ── Styles ──────────────────────────────────────────────────────
const s = {
  app:       { minHeight: '100vh', display: 'flex', flexDirection: 'column' },
  header:    { background: 'var(--surface)', borderBottom: '1px solid var(--border)', padding: '0 24px' },
  headerInner: { maxWidth: 1100, margin: '0 auto', height: 60, display: 'flex', alignItems: 'center', gap: 14 },
  brand:     { display: 'flex', alignItems: 'center', gap: 9 },
  brandName: { fontSize: 20, fontWeight: 700, letterSpacing: '-.3px' },
  brandSep:  { color: 'var(--border-2)' },
  brandSub:  { fontSize: 13, color: 'var(--muted)' },
  badge:     { fontSize: 11, color: 'var(--muted)', background: 'var(--surface-2)', border: '1px solid var(--border)', padding: '3px 10px', borderRadius: 99 },
  main:      { flex: 1, padding: '28px 20px 56px' },
  workspace: { maxWidth: 1100, margin: '0 auto', display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(340px,1fr))', gap: 24, alignItems: 'start' },
  panel:     { background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 'var(--r)', padding: 28 },
  panelTitle:{ fontSize: 17, fontWeight: 600, marginBottom: 4 },
  panelSub:  { fontSize: 13, color: 'var(--muted)', marginBottom: 20 },
  dropZone:  { border: '2px dashed var(--border)', borderRadius: 'var(--r)', minHeight: 240, display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer', background: 'var(--surface-2)', position: 'relative', overflow: 'hidden', marginBottom: 16, transition: 'border-color .2s, background .2s' },
  dropZoneDrag: { borderColor: 'var(--accent)', background: 'rgba(124,108,252,.06)' },
  dropZoneFilled: { borderStyle: 'solid', borderColor: 'var(--border-2)', cursor: 'default' },
  placeholder: { textAlign: 'center', padding: '32px 20px', pointerEvents: 'none' },
  preview:   { width: '100%', maxHeight: 340, objectFit: 'contain', display: 'block' },
  removeBtn: { position: 'absolute', top: 10, right: 10, background: 'rgba(10,10,20,.85)', border: '1px solid var(--border)', color: 'var(--text)', padding: '5px 11px', borderRadius: 6, fontSize: 12, cursor: 'pointer', backdropFilter: 'blur(4px)' },
  errorBox:  { background: 'rgba(255,77,106,.08)', border: '1px solid rgba(255,77,106,.3)', color: '#ff6b84', borderRadius: 'var(--r-sm)', padding: '10px 14px', fontSize: 13, display: 'flex', alignItems: 'center', gap: 8, marginBottom: 14 },
  freeBar:   { display: 'flex', alignItems: 'center', justifyContent: 'space-between', background: 'var(--surface-2)', border: '1px solid var(--border)', borderRadius: 'var(--r-sm)', padding: '10px 14px', marginBottom: 12 },
  freeLabel: { fontSize: 12, color: 'var(--muted)', fontWeight: 500 },
  freeDots:  { display: 'flex', gap: 5 },
  freeDot:   { width: 10, height: 10, borderRadius: '50%' },
  freeDotActive: { background: 'var(--up)', boxShadow: '0 0 6px var(--up-glow)' },
  freeDotUsed:   { background: 'var(--border-2)' },
  payBtn:    { width: '100%', padding: '15px', background: 'var(--accent)', color: '#fff', border: 'none', borderRadius: 'var(--r-sm)', fontSize: 16, fontWeight: 700, cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 9, letterSpacing: '.2px' },
  freeBtn:   { background: '#10d988' },
  payBtnDisabled: { opacity: .38, cursor: 'not-allowed' },
  hint:      { textAlign: 'center', fontSize: 12, color: 'var(--muted)', marginTop: 14, opacity: .65 },
  spin:      { width: 16, height: 16, border: '2px solid rgba(255,255,255,.2)', borderTopColor: 'currentColor', borderRadius: '50%', animation: 'spin .75s linear infinite', flexShrink: 0, display: 'inline-block' },
  loadingState: { display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', padding: '60px 20px', gap: 14, textAlign: 'center' },
  empty:     { display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', padding: '52px 20px', textAlign: 'center' },
  signalCard:{ borderRadius: 'var(--r)', padding: 20, marginBottom: 18, border: '1px solid var(--border)' },
  signalUp:  { background: 'var(--up-dim)', borderColor: 'rgba(16,217,136,.25)' },
  signalDown:{ background: 'var(--down-dim)', borderColor: 'rgba(255,77,106,.25)' },
  signalMain:{ display: 'flex', alignItems: 'center', gap: 16, marginBottom: 18 },
  arrow:     { fontSize: 52, lineHeight: 1, fontWeight: 700 },
  arrowUp:   { color: 'var(--up)' },
  arrowDown: { color: 'var(--down)' },
  sigLbl:    { fontSize: 22, fontWeight: 700, letterSpacing: 1 },
  upText:    { color: 'var(--up)' },
  downText:  { color: 'var(--down)' },
  confHeader:{ display: 'flex', justifyContent: 'space-between', marginBottom: 8 },
  confLabel: { fontSize: 12, fontWeight: 500, color: 'var(--muted)', textTransform: 'uppercase', letterSpacing: '.6px' },
  confVal:   { fontSize: 16, fontWeight: 700 },
  confTrack: { height: 6, background: 'var(--border)', borderRadius: 99, overflow: 'hidden' },
  confFill:  { height: '100%', borderRadius: 99 },
  fillUp:    { background: 'var(--up)', boxShadow: '0 0 8px var(--up-glow)' },
  fillDown:  { background: 'var(--down)', boxShadow: '0 0 8px var(--down-glow)' },
  grid:      { display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10, marginBottom: 14 },
  detailItem:{ background: 'var(--surface-2)', border: '1px solid var(--border)', borderRadius: 'var(--r-sm)', padding: '12px 14px' },
  dLabel:    { display: 'block', fontSize: 11, fontWeight: 500, color: 'var(--muted)', textTransform: 'uppercase', letterSpacing: '.6px', marginBottom: 5 },
  dVal:      { fontSize: 13, fontWeight: 500, lineHeight: 1.4 },
  pTag:      { background: 'rgba(124,108,252,.12)', border: '1px solid rgba(124,108,252,.25)', color: '#a89ef9', fontSize: 12, padding: '4px 10px', borderRadius: 99, fontWeight: 500 },
  reasoningBox: { background: 'var(--surface-2)', border: '1px solid var(--border)', borderRadius: 'var(--r-sm)', padding: '14px 16px', marginBottom: 16 },
  disclaimer:{ fontSize: 11, color: 'var(--muted)', opacity: .5, textAlign: 'center' },
  footer:    { borderTop: '1px solid var(--border)', padding: '16px 24px', textAlign: 'center' },
};
