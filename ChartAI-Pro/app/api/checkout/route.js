import Stripe from 'stripe';
import { NextResponse } from 'next/server';

export async function POST() {
  const stripe = new Stripe(process.env.STRIPE_SECRET_KEY);
  try {
    const session = await stripe.checkout.sessions.create({
      payment_method_types: ['card'],
      line_items: [
        {
          price_data: {
            currency: 'usd',
            product_data: {
              name: 'Crypto Chart Analysis',
              description: 'AI-powered technical analysis · One-time use',
            },
            unit_amount: parseInt(process.env.PRICE_CENTS || '99'),
          },
          quantity: 1,
        },
      ],
      mode: 'payment',
      success_url: `${process.env.NEXT_PUBLIC_APP_URL}/?session_id={CHECKOUT_SESSION_ID}`,
      cancel_url:  `${process.env.NEXT_PUBLIC_APP_URL}/`,
    });

    return NextResponse.json({ url: session.url });
  } catch (err) {
    console.error('Stripe checkout error:', err);
    return NextResponse.json(
      { error: 'Could not create checkout session. Please try again.' },
      { status: 500 }
    );
  }
}
