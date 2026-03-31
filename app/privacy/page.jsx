export const metadata = {
  title: 'Privacy Policy — ChartAI',
};

export default function Privacy() {
  return (
    <div style={s.page}>
      <div style={s.container}>
        <a href="/" style={s.back}>← Back to ChartAI</a>
        <h1 style={s.h1}>Privacy Policy</h1>
        <p style={s.updated}>Last updated: March 2025</p>

        <Section title="1. What We Collect">
          <strong>Chart images:</strong> When you submit a chart for analysis, the image is sent to Anthropic's Claude AI API for processing. Images are transmitted over HTTPS and are not stored on our servers after the analysis is complete.
          <br /><br />
          <strong>IP address:</strong> Your IP address is used server-side to enforce rate limits and the free-tier usage cap. It is not logged or stored persistently.
          <br /><br />
          <strong>Session storage:</strong> During a PayPal payment flow, your chart image is temporarily stored in your browser's session storage to survive the redirect to PayPal and back. This data never leaves your browser and is cleared immediately after analysis completes.
        </Section>

        <Section title="2. What We Do NOT Collect">
          <ul style={s.list}>
            <li>We do not require account registration or collect personal information</li>
            <li>We do not store your chart images after analysis</li>
            <li>We do not use tracking cookies or advertising cookies</li>
            <li>We do not sell or share your data with third parties beyond what is required to provide the service</li>
          </ul>
        </Section>

        <Section title="3. Third-Party Services">
          <strong>Anthropic (Claude AI):</strong> Chart images are processed by Anthropic's API. Anthropic's privacy policy applies to data sent to their API. See anthropic.com/privacy.
          <br /><br />
          <strong>PayPal:</strong> Payments are processed by PayPal. When you pay, you interact directly with PayPal's checkout. We receive only a transaction confirmation (order ID). PayPal's privacy policy applies to your payment data. See paypal.com/privacy.
          <br /><br />
          <strong>Vercel:</strong> This app is hosted on Vercel. Vercel may log standard web server data (IP, user agent, request path) as part of hosting infrastructure. See vercel.com/legal/privacy-policy.
        </Section>

        <Section title="4. Free Tier Tracking">
          Free usage is tracked using your browser's localStorage and your IP address. This is used solely to enforce the free analysis limit and prevent abuse. No personal data is associated with this tracking.
        </Section>

        <Section title="5. Data Security">
          All data is transmitted over HTTPS. Chart images are processed in memory and not written to disk. We do not maintain a database of users or analyses.
        </Section>

        <Section title="6. Changes to This Policy">
          We may update this policy from time to time. The date at the top of this page reflects the most recent revision. Continued use of the service after changes constitutes acceptance of the updated policy.
        </Section>

        <Section title="7. Contact">
          For privacy-related questions, contact us at: <strong>support@chartai.pro</strong>
        </Section>
      </div>
    </div>
  );
}

function Section({ title, children }) {
  return (
    <div style={s.section}>
      <h2 style={s.h2}>{title}</h2>
      <p style={s.body}>{children}</p>
    </div>
  );
}

const s = {
  page:      { minHeight: '100vh', background: 'var(--bg)', color: 'var(--text)', padding: '40px 20px 80px', fontFamily: "-apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif" },
  container: { maxWidth: 700, margin: '0 auto' },
  back:      { display: 'inline-block', fontSize: 13, color: 'var(--muted)', textDecoration: 'none', marginBottom: 32 },
  h1:        { fontSize: 28, fontWeight: 700, marginBottom: 6 },
  updated:   { fontSize: 13, color: 'var(--muted)', marginBottom: 40 },
  section:   { marginBottom: 32, padding: 24, background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 14 },
  h2:        { fontSize: 16, fontWeight: 600, marginBottom: 10, color: 'var(--accent)' },
  body:      { fontSize: 14, lineHeight: 1.7, color: 'var(--text)', opacity: .85 },
  list:      { paddingLeft: 20, marginTop: 8, display: 'flex', flexDirection: 'column', gap: 4 },
};
