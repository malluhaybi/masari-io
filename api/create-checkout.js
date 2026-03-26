import Stripe from 'stripe';
const stripe = new Stripe(process.env.STRIPE_SECRET_KEY);
export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });
  try {
    const { plan } = req.body;
    var priceConfig;
    if (plan === 'monthly') {
      priceConfig = { mode: 'subscription', line_items: [{ price_data: { currency: 'usd', product_data: { name: 'Masari.io — اشتراك شهري' }, unit_amount: 2900, recurring: { interval: 'month' } }, quantity: 1 }] };
    } else {
      priceConfig = { mode: 'payment', line_items: [{ price_data: { currency: 'usd', product_data: { name: 'Masari.io — رحلة احترافية' }, unit_amount: 499 }, quantity: 1 }] };
    }
    const session = await stripe.checkout.sessions.create({ ...priceConfig, success_url: req.headers.origin + '/?paid=true&ts=' + Date.now(), cancel_url: req.headers.origin + '?paid=false' });
    return res.status(200).json({ url: session.url });
  } catch (error) { console.error('Stripe error:', error); return res.status(500).json({ error: 'Payment failed' }); }
}
