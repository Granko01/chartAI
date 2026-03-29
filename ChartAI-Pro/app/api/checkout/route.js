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
  try {
    const accessToken = await getAccessToken();
    const amount = (parseInt(process.env.PRICE_CENTS || '99') / 100).toFixed(2);

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
          return_url: `${process.env.NEXT_PUBLIC_APP_URL}/`,
          cancel_url: `${process.env.NEXT_PUBLIC_APP_URL}/`,
        },
      }),
    });

    const order = await res.json();
    const approveUrl = order.links?.find((l) => l.rel === 'approve')?.href;

    if (!approveUrl) {
      console.error('PayPal order response:', order);
      throw new Error('No approval URL in PayPal response');
    }

    return NextResponse.json({ url: approveUrl });
  } catch (err) {
    console.error('PayPal checkout error:', err);
    return NextResponse.json(
      { error: 'Could not start checkout. Please try again.' },
      { status: 500 }
    );
  }
}
