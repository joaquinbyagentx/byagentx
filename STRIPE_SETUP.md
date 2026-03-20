# Stripe Checkout Integration Guide

## Overview

This repository now includes full Stripe payment integration for AgentX pricing plans. Customers can purchase subscriptions directly from the website.

## Features

✅ **6 pricing plans** with setup fees and monthly subscriptions
✅ **Stripe Checkout** integration using Stripe.js
✅ **Secure card payments** with customer validation
✅ **Automatic subscriptions** with recurring charges
✅ **Production-ready** backend server (Node.js + Express)
✅ **GitHub Pages compatible** frontend

## Pricing Plans

| Plan | Setup Fee | Monthly | Link |
|------|-----------|---------|------|
| WhatsApp Bot | $1,999 | $499/mo | `payment.html?plan=whatsapp-bot` |
| Business Website | $1,499 | $299/mo | `payment.html?plan=business-website` |
| Social Media | $0 | $799/mo | `payment.html?plan=social-media` |
| SEO + Content | $0 | $999/mo | `payment.html?plan=seo-content` |
| Business Automation | $2,499 | $699/mo | `payment.html?plan=business-automation` |
| Full Package | $4,999 | $1,299/mo | `payment.html?plan=full-package` |

## Files Added

### Frontend
- **`payment.html`** - Checkout page with Stripe Elements integration
  - Plan summary display
  - Customer information form
  - Card payment form
  - Error handling and success messages

### Backend
- **`server.js`** - Node.js/Express payment processing server
  - `/api/create-payment` - Process one-time charges and subscriptions
  - `/api/create-payment-intent` - Create payment intents for advanced flows
  - `/api/plans` - List available plans
  - `/health` - Health check endpoint

### Configuration
- **`package.json`** - Node dependencies
- **`.env.example`** - Environment variable template
- **`STRIPE_SETUP.md`** - This file

## Installation & Setup

### 1. Get Stripe API Keys

1. Sign up at [stripe.com](https://stripe.com)
2. Go to [Dashboard → API Keys](https://dashboard.stripe.com/apikeys)
3. Copy your **Publishable Key** (pk_live_...) and **Secret Key** (sk_live_...)

### 2. Configure Environment Variables

Create a `.env` file in the project root:

```bash
cp .env.example .env
```

Edit `.env` and add your Stripe keys:

```env
STRIPE_PUBLISHABLE_KEY=pk_live_YOUR_KEY_HERE
STRIPE_SECRET_KEY=sk_live_YOUR_KEY_HERE
PORT=3000
NODE_ENV=production
```

### 3. Install Dependencies

```bash
npm install
```

This installs:
- `express` - Web server
- `stripe` - Stripe SDK
- `dotenv` - Environment variable loading
- `cors` - Cross-origin requests

### 4. Run the Server

**Development:**
```bash
npm run dev
# or
node server.js
```

**Production:**
```bash
npm start
```

Server runs on `http://localhost:3000` by default.

## How It Works

### Customer Flow

1. Customer visits `index.html#pricing`
2. Clicks "Buy Now" button on desired plan
3. Redirected to `payment.html?plan=PLAN_ID`
4. Fills in name, email, country, postal code
5. Enters card details in Stripe Elements field
6. Clicks "Pay $X.XX"
7. Server processes payment via Stripe API
8. Success → Redirects to `index.html?success=true`

### Payment Processing

For **plans with setup fee**:
- Immediate charge for setup + first month
- Monthly subscription starts automatically

For **plans without setup fee**:
- Monthly subscription starts immediately

Example (WhatsApp Bot plan):
- Setup: $1,999 (charged now)
- Monthly: $499 (starts tomorrow, recurring)
- **Total first month: $2,498**

## Frontend Integration

The Stripe public key is embedded in `payment.html`:

```javascript
const stripe = Stripe('pk_live_YOUR_PUBLISHABLE_KEY');
const elements = stripe.elements();
const cardElement = elements.create('card');
cardElement.mount('#card-element');
```

This is secure because **publishable keys** are meant to be public.

## Backend Integration

The backend handles:

1. **Token validation** - Verifies Stripe token
2. **Customer creation** - Creates Stripe customer record
3. **Charges** - Processes one-time setup fees
4. **Subscriptions** - Creates recurring monthly payments
5. **Error handling** - Returns friendly error messages

Example request:

```bash
curl -X POST http://localhost:3000/api/create-payment \
  -H "Content-Type: application/json" \
  -d '{
    "token": "tok_visa",
    "email": "customer@example.com",
    "fullName": "John Doe",
    "plan": "whatsapp-bot",
    "amount": 249900
  }'
```

## Security Best Practices

✅ **Never expose secret key** in frontend code (only in backend)
✅ **Use HTTPS** in production (Stripe requires it)
✅ **Validate server-side** - Always verify amounts and plans on backend
✅ **Store tokens securely** - Use Stripe's token system, never store raw card data
✅ **Environment variables** - Keep API keys in `.env`, never commit to Git

## Testing

### Test Cards

Use these Stripe test cards in development:

| Card | Number | Expiry | CVC |
|------|--------|--------|-----|
| Success | 4242 4242 4242 4242 | Any future | Any 3 digits |
| Decline | 4000 0000 0000 0002 | Any future | Any 3 digits |
| 3D Secure | 4000 0000 0000 3220 | Any future | Any 3 digits |

### Local Testing

1. Run server: `npm start`
2. Open browser: `http://localhost:3000/payment.html?plan=social-media`
3. Use test card 4242 4242 4242 4242
4. Check Stripe dashboard for test charges

## Deployment

### Option A: Heroku (Recommended)

```bash
# Create Heroku app
heroku create your-app-name

# Set environment variables
heroku config:set STRIPE_SECRET_KEY=sk_live_...
heroku config:set STRIPE_PUBLISHABLE_KEY=pk_live_...

# Deploy
git push heroku main
```

### Option B: Railway, Render, etc.

Similar process - set environment variables in dashboard, then deploy.

### Option C: Self-hosted (VPS)

1. Install Node.js
2. Clone repo
3. Run `npm install`
4. Create `.env` file
5. Start with PM2 or systemd: `pm2 start server.js --name agentx`

## Webhook Handling (Advanced)

For production, listen to Stripe webhooks:

```javascript
app.post('/webhooks/stripe', express.raw({type: 'application/json'}), async (req, res) => {
  const sig = req.headers['stripe-signature'];
  const event = stripe.webhooks.constructEvent(req.body, sig, process.env.STRIPE_WEBHOOK_SECRET);
  
  if (event.type === 'charge.succeeded') {
    // Handle successful charge
  } else if (event.type === 'invoice.payment_failed') {
    // Handle failed payment
  }
  
  res.json({received: true});
});
```

Get webhook secret from Stripe dashboard → Webhooks → Add endpoint.

## Troubleshooting

### "Stripe is not defined"
- Ensure `<script src="https://js.stripe.com/v3/"></script>` is in `payment.html`

### "Cannot find module 'stripe'"
- Run `npm install stripe`

### "Invalid API Key"
- Check `.env` file has correct `STRIPE_SECRET_KEY`
- Verify key starts with `sk_live_` or `sk_test_`

### Payment fails with "Connection refused"
- Ensure backend server is running: `npm start`
- Check server is on correct port (default 3000)

### Test payments don't create subscription
- Ensure plan has `monthlyFee > 0`
- Check Stripe dashboard → Products & Prices are created

## Next Steps

1. ✅ Integrate payment buttons (done!)
2. 🔄 Add email confirmations (send receipt)
3. 🔄 Create admin dashboard to see payments
4. 🔄 Add customer portal for managing subscriptions
5. 🔄 Implement refund handling

## Support

For issues:
- Check Stripe error messages in browser console
- Review Stripe dashboard → Events for API activity
- Contact Stripe support: support@stripe.com

## Files Structure

```
byagentx/
├── index.html           (main landing page)
├── payment.html         (checkout page) ✨ NEW
├── case-study.html      (existing)
├── server.js            (backend) ✨ NEW
├── package.json         (dependencies) ✨ NEW
├── .env.example         (config template) ✨ NEW
├── STRIPE_SETUP.md      (this file) ✨ NEW
└── README.md            (original)
```

---

**Status:** ✅ Production Ready
**Last Updated:** 2026-03-20
