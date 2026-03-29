import { NextResponse } from 'next/server';

function paypalBase() {
  return process.env.PAYPAL_ENV === 'live'
    ? 'https://api-m.paypal.com'
    : 'https://api-m.sandbox.paypal.com';
}

async function getAccessToken() {
  const credentials = Buffer.from(
    `${process.env.PAYPAL_CLIENT_ID}:${process.env.PAYPAL_CLIENT_SECRET}`
  ).toString('base64');

  const res = await fetch(`${paypalBase()}/v1/oauth2/token`, {
    method: 'POST',
    headers: {
      Authorization: `Basic ${credentials}`,
      'Content-Type': 'application/x-www-form-urlencoded',
    },
    body: 'grant_type=client_credentials',
  });
  const data = await res.json();
  return data.access_token;
}

export async function POST() {
  // Check env vars are present
  if (!process.env.PAYPAL_CLIENT_ID || !process.env.PAYPAL_CLIENT_SECRET) {
    return NextResponse.json({ error: 'PayPal credentials not configured.' }, { status: 500 });
  }
  if (!process.env.NEXT_PUBLIC_APP_URL) {
    return NextResponse.json({ error: 'App URL not configured.' }, { status: 500 });
  }

  try {
    const accessToken = await getAccessToken();
    if (!accessToken) {
      return NextResponse.json({ error: 'PayPal auth failed — check Client ID and Secret.' }, { status: 500 });
    }

    const amount = (parseInt(process.env.PRICE_CENTS || '99') / 100).toFixed(2);
    const appUrl = process.env.NEXT_PUBLIC_APP_URL.replace(/\/$/, ''); // strip trailing slash

    const res = await fetch(`${paypalBase()}/v2/checkout/orders`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${accessToken}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        intent: 'CAPTURE',
        purchase_units: [
          {
            amount: { currency_code: 'USD', value: amount },
            description: 'Crypto Chart Analysis — AI-powered technical analysis',
          },
        ],
        application_context: {
          brand_name: 'ChartAI',
          user_action: 'PAY_NOW',
          return_url: `${appUrl}/`,
          cancel_url: `${appUrl}/`,
        },
      }),
    });

    const order = await res.json();
    const approveUrl = order.links?.find((l) => l.rel === 'approve')?.href;

    if (!approveUrl) {
      console.error('PayPal order response:', JSON.stringify(order));
      const detail = order.details?.[0]?.description || order.message || 'No approval URL returned';
      return NextResponse.json({ error: `PayPal error: ${detail}` }, { status: 500 });
    }

    return NextResponse.json({ url: approveUrl });
  } catch (err) {
    console.error('PayPal checkout error:', err);
    return NextResponse.json(
      { error: err.message || 'Could not start checkout. Please try again.' },
      { status: 500 }
    );
  }
}
