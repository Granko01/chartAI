import { NextResponse } from 'next/server';
import Anthropic from '@anthropic-ai/sdk';
import { Redis } from '@upstash/redis';

// Redis is optional — if not configured, rate limiting and IP-based free-tier
// tracking are skipped; the cookie gate still applies.
// Vercel's Upstash KV integration injects KV_REST_API_URL / KV_REST_API_TOKEN;
// fall back to the legacy UPSTASH_REDIS_REST_* names for manual setups.
const REDIS_URL =
  process.env.KV_REST_API_URL || process.env.UPSTASH_REDIS_REST_URL;
const REDIS_TOKEN =
  process.env.KV_REST_API_TOKEN || process.env.UPSTASH_REDIS_REST_TOKEN;
const REDIS_ENABLED = !!REDIS_URL && !!REDIS_TOKEN;

const kv = REDIS_ENABLED
  ? new Redis({ url: REDIS_URL, token: REDIS_TOKEN })
  : null;

// ── Constants ────────────────────────────────────────────────────
const ALLOWED_MEDIA_TYPES = new Set(['image/jpeg', 'image/png', 'image/gif', 'image/webp']);
const MAX_IMAGE_BYTES = 20 * 1024 * 1024; // 20 MB
const FREE_LIMIT = 2;
const RATE_LIMIT = 20;           // requests per IP per hour
const RATE_WINDOW = 3600;        // seconds
const COOKIE_NAME = 'chartai_fu'; // HttpOnly free-use counter — not forgeable by JS

function getIP(request) {
  return (
    request.headers.get('x-forwarded-for')?.split(',')[0]?.trim() ||
    request.headers.get('x-real-ip') ||
    'unknown'
  );
}

// Returns false (block) only when Redis is available AND limit is exceeded
async function checkRateLimit(ip) {
  if (!kv) return true; // no Redis → skip rate limiting
  try {
    const key = `rate:${ip}`;
    const count = await kv.incr(key);
    if (count === 1) await kv.expire(key, RATE_WINDOW);
    return count <= RATE_LIMIT;
  } catch (err) {
    console.error('Rate limit Redis error:', err);
    return true; // Redis error → let request through
  }
}

// Returns how many free uses remain according to Redis (IP-based)
async function freeUsesLeft(ip) {
  if (!kv) return FREE_LIMIT; // no Redis → rely on cookie gate only
  try {
    const used = (await kv.get(`free:${ip}`)) ?? 0;
    return Math.max(0, FREE_LIMIT - Number(used));
  } catch (err) {
    console.error('Free-tier Redis error:', err);
    return FREE_LIMIT; // Redis error → rely on cookie gate only
  }
}

async function incrementFreeUses(ip) {
  if (!kv) return;
  try {
    await kv.incr(`free:${ip}`);
  } catch (err) {
    console.error('incrementFreeUses Redis error:', err);
  }
}

// How many free uses the browser cookie says have been consumed
function cookieFreeUsed(request) {
  const val = request.cookies.get(COOKIE_NAME)?.value;
  const n = parseInt(val || '0', 10);
  return isNaN(n) ? 0 : Math.min(n, FREE_LIMIT);
}

// Attach updated free-use cookie to any NextResponse
function setFreeUseCookie(response, newCount) {
  response.cookies.set(COOKIE_NAME, String(newCount), {
    httpOnly: true,
    sameSite: 'lax',
    path: '/',
    maxAge: 60 * 60 * 24 * 365, // 1 year
  });
  return response;
}

// ── PayPal helpers ───────────────────────────────────────────────
const PP_BASE = process.env.PAYPAL_MODE === 'live'
  ? 'https://api-m.paypal.com'
  : 'https://api-m.sandbox.paypal.com';

async function verifyPayPalOrder(orderId) {
  const creds = Buffer.from(
    `${process.env.PAYPAL_CLIENT_ID}:${process.env.PAYPAL_CLIENT_SECRET}`
  ).toString('base64');
  const tokenRes = await fetch(`${PP_BASE}/v1/oauth2/token`, {
    method: 'POST',
    headers: {
      Authorization: `Basic ${creds}`,
      'Content-Type': 'application/x-www-form-urlencoded',
    },
    body: 'grant_type=client_credentials',
  });
  const { access_token } = await tokenRes.json();

  const orderRes = await fetch(`${PP_BASE}/v2/checkout/orders/${orderId}`, {
    headers: { Authorization: `Bearer ${access_token}` },
  });
  return orderRes.json();
}

async function markPaymentUsed(orderId) {
  if (!kv) return;
  try {
    await kv.set(`payment:${orderId}:used`, 1, { ex: 86400 * 30 });
  } catch (err) {
    console.error('markPaymentUsed Redis error:', err);
  }
}

async function isPaymentAlreadyUsed(orderId) {
  if (!kv) return false; // no Redis → can't check, allow through
  try {
    return !!(await kv.get(`payment:${orderId}:used`));
  } catch (err) {
    console.error('isPaymentAlreadyUsed Redis error:', err);
    return false;
  }
}

// ── Route handler ────────────────────────────────────────────────
export async function POST(request) {
  const ip = getIP(request);

  // 1. Rate limit
  if (!(await checkRateLimit(ip))) {
    return NextResponse.json(
      { error: 'Too many requests. Please try again later.' },
      { status: 429 }
    );
  }

  const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

  let body;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: 'Invalid request body.' }, { status: 400 });
  }

  const { orderId, image, mediaType } = body;

  if (!orderId || !image || !mediaType) {
    return NextResponse.json({ error: 'Missing required fields.' }, { status: 400 });
  }

  // 2. Validate mediaType
  if (!ALLOWED_MEDIA_TYPES.has(mediaType)) {
    return NextResponse.json(
      { error: 'Invalid image type. Only JPEG, PNG, GIF, and WebP are allowed.' },
      { status: 400 }
    );
  }

  // 3. Validate image size (base64 → ~75% of actual bytes)
  const estimatedBytes = Math.ceil((image.length * 3) / 4);
  if (estimatedBytes > MAX_IMAGE_BYTES) {
    return NextResponse.json(
      { error: 'Image too large. Maximum size is 20MB.' },
      { status: 400 }
    );
  }

  // 4. Server-side free tier check.
  //    Cookie gate  → blocks same-browser localStorage-reset abuse.
  //    IP gate      → blocks browser-switching abuse (when Redis is available).
  //    Both must pass.
  if (orderId === 'free') {
    const cookieUsed = cookieFreeUsed(request);
    const ipLeft = await freeUsesLeft(ip);

    if (cookieUsed >= FREE_LIMIT || ipLeft <= 0) {
      return NextResponse.json(
        { error: 'Free analyses exhausted. Please pay to continue.' },
        { status: 403 }
      );
    }
  }

  // 5. Validate the image is actually a chart
  if (process.env.ANTHROPIC_API_KEY) {
    try {
      const check = await anthropic.messages.create({
        model: 'claude-haiku-4-5-20251001',
        max_tokens: 16,
        messages: [
          {
            role: 'user',
            content: [
              { type: 'image', source: { type: 'base64', media_type: mediaType, data: image } },
              { type: 'text', text: 'Is this image a financial/trading chart (candlestick, line, bar, etc.)? Reply with only YES or NO.' },
            ],
          },
        ],
      });
      const answer = check.content.find((b) => b.type === 'text')?.text?.trim().toUpperCase() || '';
      if (!answer.startsWith('YES')) {
        return NextResponse.json(
          { error: 'The uploaded image does not appear to be a chart. Please upload a screenshot of a trading chart.' },
          { status: 422 }
        );
      }
    } catch (err) {
      console.error('Chart validation error:', err);
      // Non-blocking: if validation fails, proceed anyway
    }
  }

  // 6. Verify payment (skip if free use)
  if (orderId !== 'free') {
    if (await isPaymentAlreadyUsed(orderId)) {
      return NextResponse.json(
        { error: 'This payment has already been used for an analysis.' },
        { status: 409 }
      );
    }

    let orderData;
    try {
      orderData = await verifyPayPalOrder(orderId);
    } catch (err) {
      console.error('PayPal verification error:', err);
      return NextResponse.json({ error: 'Payment verification failed. Please try again.' }, { status: 500 });
    }

    if (orderData.status !== 'COMPLETED') {
      console.error('PayPal order not COMPLETED:', orderData.status, orderId);
      return NextResponse.json(
        { error: 'Payment not confirmed. Please try again or contact support.' },
        { status: 402 }
      );
    }
  }

  // Helper: build final response and increment free-use counters if needed
  async function buildResponse(analysisObj) {
    if (orderId === 'free') {
      await incrementFreeUses(ip);
      const newCookieCount = cookieFreeUsed(request) + 1;
      const res = NextResponse.json({ analysis: analysisObj });
      return setFreeUseCookie(res, newCookieCount);
    } else {
      await markPaymentUsed(orderId);
      return NextResponse.json({ analysis: analysisObj });
    }
  }

  // 7. Analyze with Claude (or return mock data if no API key set)
  if (!process.env.ANTHROPIC_API_KEY) {
    return buildResponse({
      direction: 'UP',
      confidence: 72,
      trend: 'Bullish uptrend with increasing momentum',
      patterns: ['Ascending Triangle', 'Golden Cross'],
      support: '$42,000',
      resistance: '$48,500',
      reasoning: 'TEST MODE — Anthropic API key not set. The chart shows a clear ascending triangle pattern with higher lows forming over the past week. Volume is increasing on up-moves suggesting accumulation. A breakout above resistance could trigger a significant rally.',
      timeframe: 'Next 24-48 hours',
    });
  }

  try {
    const response = await anthropic.messages.create({
      model: 'claude-opus-4-6',
      max_tokens: 1024,
      messages: [
        {
          role: 'user',
          content: [
            {
              type: 'image',
              source: { type: 'base64', media_type: mediaType, data: image },
            },
            {
              type: 'text',
              text: `You are an expert cryptocurrency technical analyst. Carefully examine this crypto chart and provide a detailed prediction.

Analyze for: price trend, momentum, technical patterns (head & shoulders, triangles, flags, wedges, double tops/bottoms, etc.), support/resistance levels, volume, candlestick patterns, moving averages.

Return ONLY a valid JSON object — no markdown, no extra text:
{
  "direction": "UP" or "DOWN",
  "confidence": <integer 0-100>,
  "trend": "<current trend description>",
  "patterns": ["<pattern1>", "<pattern2>"],
  "support": "<support level or N/A>",
  "resistance": "<resistance level or N/A>",
  "reasoning": "<2-3 sentence technical analysis>",
  "timeframe": "<prediction timeframe, e.g. Next 4-24 hours>"
}`,
            },
          ],
        },
      ],
    });

    const text = response.content.find((b) => b.type === 'text')?.text || '';
    const match = text.match(/\{[\s\S]*\}/);

    if (!match) {
      console.error('Claude parse failed for order:', orderId);
      return NextResponse.json(
        { error: 'Analysis failed. Contact support with this ID: ' + orderId },
        { status: 500 }
      );
    }

    return buildResponse(JSON.parse(match[0]));
  } catch (err) {
    console.error('Claude error. Order:', orderId, err);
    return NextResponse.json(
      { error: 'Analysis failed after payment. Contact support with this ID: ' + orderId },
      { status: 500 }
    );
  }
}
