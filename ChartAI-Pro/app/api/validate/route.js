import { NextResponse } from 'next/server';
import Anthropic from '@anthropic-ai/sdk';

const ALLOWED_MEDIA_TYPES = new Set(['image/jpeg', 'image/png', 'image/gif', 'image/webp']);

export async function POST(request) {
  let body;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: 'Invalid request body.' }, { status: 400 });
  }

  const { image, mediaType } = body;

  if (!image || !mediaType) {
    return NextResponse.json({ error: 'Missing image or mediaType.' }, { status: 400 });
  }

  if (!ALLOWED_MEDIA_TYPES.has(mediaType)) {
    return NextResponse.json({ error: 'Invalid image type.' }, { status: 400 });
  }

  if (!process.env.ANTHROPIC_API_KEY) {
    return NextResponse.json({ ok: true }); // skip validation if no key
  }

  try {
    const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });
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
    return NextResponse.json({ ok: true });
  } catch (err) {
    console.error('Validate error:', err);
    return NextResponse.json({ ok: true }); // non-blocking on error
  }
}
