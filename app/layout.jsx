import './globals.css';

export const metadata = {
  title: 'ChartAI — Crypto Chart Analyzer',
  description: 'AI-powered crypto chart analysis. Upload a chart, get instant bullish/bearish predictions.',
};

export default function RootLayout({ children }) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
