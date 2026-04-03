import { NextResponse } from 'next/server';

// v2
const PP_BASE = process.env.PAYPAL_MODE === 'live'
  ? 'https://api-m.paypal.com'
  : 'https://api-m.sandbox.paypal.com';

async function getPayPalToken() {
  const creds = Buffer.from(
    `${process.env.PAYPAL_CLIENT_ID}:${process.env.PAYPAL_CLIENT_SECRET}`
  ).toString('base64');
  const res = await fetch(`${PP_BASE}/v1/oauth2/token`, {
    method: 'POST',
    headers: {
      Authorization: `Basic ${creds}`,
      'Content-Type': 'application/x-www-form-urlencoded',
    },
    body: 'grant_type=client_credentials',
  });
  if (!res.ok) throw new Error(`PayPal auth failed: ${await res.text()}`);
  const { access_token } = await res.json();
  return access_token;
}

export async function POST() {
  if (!process.env.PAYPAL_CLIENT_ID) {
    return NextResponse.json({ error: 'Missing PAYPAL_CLIENT_ID' }, { status: 500 });
  }
  if (!process.env.PAYPAL_CLIENT_SECRET) {
    return NextResponse.json({ error: 'Missing PAYPAL_CLIENT_SECRET' }, { status: 500 });
  }
  if (!process.env.NEXT_PUBLIC_APP_URL) {
    return NextResponse.json({ error: 'App URL not configured.' }, { status: 500 });
  }

  try {
    const token = await getPayPalToken();
    const appUrl = process.env.NEXT_PUBLIC_APP_URL.replace(/\/$/, '');
    const amount = (parseInt(process.env.PRICE_CENTS || '99') / 100).toFixed(2);

    const res = await fetch(`${PP_BASE}/v2/checkout/orders`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${token}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        intent: 'CAPTURE',
        purchase_units: [{
          amount: { currency_code: 'USD', value: amount },
          description: 'ChartAI — Crypto Chart Analysis',
        }],
        application_context: {
          return_url: `${appUrl}/?`,
          cancel_url:  `${appUrl}/`,
          brand_name:  'ChartAI Pro',
          user_action: 'PAY_NOW',
        },
      }),
    });

    if (!res.ok) {
      const err = await res.text();
      console.error('PayPal create order error:', err);
      return NextResponse.json(
        { error: 'Could not start checkout. Please try again.' },
        { status: 502 }
      );
    }

    const order = await res.json();
    const approveLink = order.links?.find((l) => l.rel === 'approve')?.href;

    if (!approveLink) {
      console.error('PayPal order missing approve link:', JSON.stringify(order));
      return NextResponse.json({ error: 'Could not create payment.' }, { status: 500 });
    }

    return NextResponse.json({ url: approveLink });
  } catch (err) {
    console.error('PayPal checkout error:', err);
    return NextResponse.json(
      { error: 'Could not start checkout. Please try again.' },
      { status: 500 }
    );
  }
}
