import { NextResponse } from 'next/server';
import crypto from 'crypto';
import { Redis } from '@upstash/redis';

const kv = new Redis({
  url: process.env.UPSTASH_REDIS_REST_URL,
  token: process.env.UPSTASH_REDIS_REST_TOKEN,
});

function sortObjectKeys(obj) {
  if (typeof obj !== 'object' || obj === null || Array.isArray(obj)) return obj;
  return Object.keys(obj)
    .sort()
    .reduce((acc, key) => {
      acc[key] = sortObjectKeys(obj[key]);
      return acc;
    }, {});
}

export async function POST(request) {
  const rawBody = await request.text();

  let body;
  try {
    body = JSON.parse(rawBody);
  } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 });
  }

  // Verify HMAC-SHA512 signature
  const secret = process.env.NOWPAYMENTS_IPN_SECRET;
  if (secret) {
    const sig = request.headers.get('x-nowpayments-sig');
    if (!sig) {
      return NextResponse.json({ error: 'Missing signature' }, { status: 401 });
    }
    const sorted = sortObjectKeys(body);
    const expected = crypto
      .createHmac('sha512', secret)
      .update(JSON.stringify(sorted))
      .digest('hex');
    if (expected !== sig) {
      return NextResponse.json({ error: 'Invalid signature' }, { status: 401 });
    }
  } else {
    console.warn('NOWPAYMENTS_IPN_SECRET not set — skipping IPN signature verification');
  }

  const { payment_id, payment_status } = body;
  if (payment_id && payment_status) {
    // Cache payment status so /api/analyze can read it without an extra API call
    await kv.set(`payment:${payment_id}:status`, payment_status, { ex: 86400 }); // 24h TTL
  }

  return NextResponse.json({ ok: true });
}
