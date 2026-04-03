import { NextResponse } from 'next/server';

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

export async function POST(request) {
  let body;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: 'Invalid request body.' }, { status: 400 });
  }

  const { orderId } = body;
  if (!orderId) {
    return NextResponse.json({ error: 'Missing orderId.' }, { status: 400 });
  }

  try {
    const token = await getPayPalToken();

    const res = await fetch(`${PP_BASE}/v2/checkout/orders/${orderId}/capture`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${token}`,
        'Content-Type': 'application/json',
      },
    });

    const data = await res.json();

    if (!res.ok || data.status !== 'COMPLETED') {
      console.error('PayPal capture failed:', JSON.stringify(data));
      return NextResponse.json(
        { error: 'Payment capture failed. Please contact support.' },
        { status: 402 }
      );
    }

    return NextResponse.json({ ok: true, status: data.status });
  } catch (err) {
    console.error('PayPal capture error:', err);
    return NextResponse.json(
      { error: 'Payment capture error. Please try again.' },
      { status: 500 }
    );
  }
}
