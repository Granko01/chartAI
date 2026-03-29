import { NextResponse } from 'next/server';
import Stripe from 'stripe';
import Anthropic from '@anthropic-ai/sdk';

export async function POST(request) {
  const stripe    = new Stripe(process.env.STRIPE_SECRET_KEY);
  const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });
  let body;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: 'Invalid request body.' }, { status: 400 });
  }

  const { sessionId, image, mediaType } = body;

  if (!sessionId || !image || !mediaType) {
    return NextResponse.json({ error: 'Missing required fields.' }, { status: 400 });
  }

  // 1. Verify Stripe payment
  let session;
  try {
    session = await stripe.checkout.sessions.retrieve(sessionId);
  } catch {
    return NextResponse.json({ error: 'Invalid payment session.' }, { status: 400 });
  }

  if (session.payment_status !== 'paid') {
    return NextResponse.json({ error: 'Payment not completed.' }, { status: 402 });
  }

  // 2. Check if already used — stored in the PaymentIntent's metadata (no DB needed)
  const piId = typeof session.payment_intent === 'string'
    ? session.payment_intent
    : session.payment_intent?.id;

  if (!piId) {
    return NextResponse.json({ error: 'Could not locate payment record.' }, { status: 400 });
  }

  const pi = await stripe.paymentIntents.retrieve(piId);

  if (pi.metadata?.chartai_used === 'true') {
    return NextResponse.json(
      { error: 'This payment has already been used for an analysis.' },
      { status: 409 }
    );
  }

  // 3. Mark as used on Stripe before calling Claude
  await stripe.paymentIntents.update(piId, {
    metadata: { chartai_used: 'true' },
  });

  // 4. Analyze with Claude
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
      // Undo the used flag so the user can retry
      await stripe.paymentIntents.update(piId, { metadata: { chartai_used: 'false' } });
      return NextResponse.json(
        { error: 'Analysis failed to parse. Please try again — your payment is still valid.' },
        { status: 500 }
      );
    }

    return NextResponse.json({ analysis: JSON.parse(match[0]) });
  } catch (err) {
    // Undo the used flag so the user can retry
    await stripe.paymentIntents.update(piId, { metadata: { chartai_used: 'false' } });
    console.error('Claude error:', err);
    return NextResponse.json(
      { error: 'Analysis failed. Please try again — your payment is still valid.' },
      { status: 500 }
    );
  }
}
