import { NextResponse } from 'next/server';

const NP_BASE = process.env.NOWPAYMENTS_SANDBOX === 'true'
  ? 'https://sandbox.api.nowpayments.io'
  : 'https://api.nowpayments.io';

export async function POST() {
  if (!process.env.NOWPAYMENTS_API_KEY) {
    return NextResponse.json({ error: 'Payment not configured.' }, { status: 500 });
  }
  if (!process.env.NEXT_PUBLIC_APP_URL) {
    return NextResponse.json({ error: 'App URL not configured.' }, { status: 500 });
  }

  try {
    const amount = (parseInt(process.env.PRICE_CENTS || '99') / 100).toFixed(2);
    const appUrl = process.env.NEXT_PUBLIC_APP_URL.replace(/\/$/, '');

    let res;
    try {
      res = await fetch(`${NP_BASE}/v1/invoice`, {
        method: 'POST',
        headers: {
          'x-api-key': process.env.NOWPAYMENTS_API_KEY,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          price_amount: parseFloat(amount),
          price_currency: 'usd',
          order_description: 'ChartAI — Crypto Chart Analysis',
          success_url: `${appUrl}/`,
          cancel_url: `${appUrl}/`,
        }),
      });
    } catch (networkErr) {
      console.error('NOWPayments network error:', networkErr);
      return NextResponse.json(
        { error: 'Payment provider is unreachable. Please try again in a moment.' },
        { status: 502 }
      );
    }

    let invoice;
    try {
      invoice = await res.json();
    } catch {
      console.error('NOWPayments returned non-JSON, status:', res.status);
      return NextResponse.json(
        { error: 'Unexpected response from payment provider. Please try again.' },
        { status: 502 }
      );
    }

    if (!invoice.invoice_url) {
      console.error('NOWPayments invoice response:', JSON.stringify(invoice));
      // Surface the API error message if available
      const apiMsg = invoice.message || invoice.error || 'Could not create payment. Please try again.';
      return NextResponse.json({ error: apiMsg }, { status: 500 });
    }

    return NextResponse.json({ url: invoice.invoice_url });
  } catch (err) {
    console.error('NOWPayments checkout error:', err);
    return NextResponse.json(
      { error: 'Could not start checkout. Please try again.' },
      { status: 500 }
    );
  }
}
