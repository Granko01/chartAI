import { NextResponse } from 'next/server';
import Anthropic from '@anthropic-ai/sdk';

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

export async function POST(request) {
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

  // 1. Validate the image is actually a chart
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

  // 2. Verify / capture payment (skip if free use)
  if (orderId !== 'free') {
    let captureData;
    try {
      const accessToken = await getAccessToken();
      const res = await fetch(`${paypalBase()}/v2/checkout/orders/${orderId}/capture`, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${accessToken}`,
          'Content-Type': 'application/json',
        },
      });
      captureData = await res.json();
    } catch (err) {
      console.error('PayPal capture error:', err);
      return NextResponse.json({ error: 'Payment verification failed. Please try again.' }, { status: 500 });
    }

    if (captureData.details?.[0]?.issue === 'ORDER_ALREADY_CAPTURED') {
      return NextResponse.json(
        { error: 'This payment has already been used for an analysis.' },
        { status: 409 }
      );
    }

    if (captureData.status !== 'COMPLETED') {
      console.error('PayPal capture status:', captureData);
      return NextResponse.json(
        { error: 'Payment not confirmed. Please try again.' },
        { status: 402 }
      );
    }
  }

  // 3. Analyze with Claude (or return mock data if no API key set)
  if (!process.env.ANTHROPIC_API_KEY) {
    return NextResponse.json({
      analysis: {
        direction: 'UP',
        confidence: 72,
        trend: 'Bullish uptrend with increasing momentum',
        patterns: ['Ascending Triangle', 'Golden Cross'],
        support: '$42,000',
        resistance: '$48,500',
        reasoning: 'TEST MODE — Anthropic API key not set. The chart shows a clear ascending triangle pattern with higher lows forming over the past week. Volume is increasing on up-moves suggesting accumulation. A breakout above resistance could trigger a significant rally.',
        timeframe: 'Next 24-48 hours',
      },
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
      // Payment was captured but Claude failed — log the capture ID for manual refund
      console.error('Claude parse failed. PayPal capture ID:', captureData.purchase_units?.[0]?.payments?.captures?.[0]?.id);
      return NextResponse.json(
        { error: 'Analysis failed after payment. Contact support with this ID: ' + (captureData.id || orderId) },
        { status: 500 }
      );
    }

    return NextResponse.json({ analysis: JSON.parse(match[0]) });
  } catch (err) {
    console.error('Claude error. PayPal order:', orderId, err);
    return NextResponse.json(
      { error: 'Analysis failed after payment. Contact support with this ID: ' + orderId },
      { status: 500 }
    );
  }
}
