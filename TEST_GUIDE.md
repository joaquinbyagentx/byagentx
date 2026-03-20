# Stripe Checkout Testing Guide

## Quick Start Testing

### 1. Setup Environment

```bash
cd /Users/josecortes/.openclaw/workspace/byagentx

# Copy example env
cp .env.example .env

# Install dependencies
npm install
```

### 2. Start Server

```bash
npm start
```

Output should show:
```
🚀 AgentX Payment Server running on http://localhost:3000
📋 Stripe Secret Key: ✓ Loaded
```

### 3. Test Checkout Page

Open browser and visit:
- **Main page:** http://localhost:3000/index.html
- **WhatsApp Bot checkout:** http://localhost:3000/payment.html?plan=whatsapp-bot
- **Social Media checkout:** http://localhost:3000/payment.html?plan=social-media
- **Full Package checkout:** http://localhost:3000/payment.html?plan=full-package

### 4. Test with Stripe Test Cards

Use these card numbers in the "Card Information" field:

#### Success (Charge succeeds)
- **Number:** 4242 4242 4242 4242
- **Expiry:** Any future date (e.g., 12/25)
- **CVC:** Any 3 digits (e.g., 123)
- **Expected:** Payment processes, shows success message

#### Decline (Charge fails)
- **Number:** 4000 0000 0000 0002
- **Expiry:** Any future date
- **CVC:** Any 3 digits
- **Expected:** Shows error "Your card was declined"

#### 3D Secure (Requires confirmation)
- **Number:** 4000 0000 0000 3220
- **Expiry:** Any future date
- **CVC:** Any 3 digits
- **Expected:** May require additional verification

### 5. Fill Customer Form

- **Full Name:** Test User
- **Email:** test@example.com
- **Country:** Mexico (or your choice)
- **Postal Code:** 12345
- **Company:** Optional

### 6. Verify Payment

After clicking "Pay", you should see:
- ✅ Green success message
- ✅ Redirect to index.html after 2 seconds
- ✅ Check Stripe Test Dashboard for transaction

## Verifying in Stripe Dashboard

1. Go to https://dashboard.stripe.com
2. Make sure you're in **Test Mode** (toggle at top right)
3. Go to **Payments** → **Charges**
4. Should see your test charge listed
5. Click to see full details (amount, customer, etc.)

## Testing All Plans

Run through checkout for each plan to verify pricing:

```
Plan: whatsapp-bot
URL: http://localhost:3000/payment.html?plan=whatsapp-bot
Expected Total: $2,498.00 (setup $1,999 + monthly $499)

Plan: business-website
URL: http://localhost:3000/payment.html?plan=business-website
Expected Total: $1,798.00 (setup $1,499 + monthly $299)

Plan: social-media
URL: http://localhost:3000/payment.html?plan=social-media
Expected Total: $799.00 (monthly only, no setup)

Plan: seo-content
URL: http://localhost:3000/payment.html?plan=seo-content
Expected Total: $999.00 (monthly only, no setup)

Plan: business-automation
URL: http://localhost:3000/payment.html?plan=business-automation
Expected Total: $3,198.00 (setup $2,499 + monthly $699)

Plan: full-package
URL: http://localhost:3000/payment.html?plan=full-package
Expected Total: $6,298.00 (setup $4,999 + monthly $1,299)
```

## Testing Error Scenarios

### Missing Plan Parameter
- URL: http://localhost:3000/payment.html
- Expected: "Invalid plan selected" error

### Invalid Plan ID
- URL: http://localhost:3000/payment.html?plan=fake-plan
- Expected: "Invalid plan selected" error

### Missing Card Details
- Fill form but leave card empty
- Click Pay
- Expected: Error message from Stripe Elements

### Invalid Card
- Use test decline card: 4000 0000 0000 0002
- Expected: "Your card was declined" error

## API Testing

Test backend endpoints directly:

### Get All Plans
```bash
curl http://localhost:3000/api/plans
```

Response:
```json
{
  "success": true,
  "plans": [
    {
      "id": "whatsapp-bot",
      "name": "WhatsApp Order Bot",
      "setupFee": 1999,
      "monthlyFee": 499
    },
    ...
  ]
}
```

### Health Check
```bash
curl http://localhost:3000/health
```

Response:
```json
{
  "status": "ok",
  "timestamp": "2026-03-20T13:47:00.000Z"
}
```

## Debugging

### Check Server Logs
```bash
# Terminal where npm start is running
# Should show:
# ✓ Payment processed for test@example.com
# Plan: WhatsApp Order Bot
# Amount: $2498.00
```

### Check Browser Console
- Open DevTools (F12)
- Go to **Console** tab
- Should show no errors
- Stripe library should load without issues

### Check Network Tab
- Open DevTools (F12)
- Go to **Network** tab
- Click "Pay" button
- Should see POST to `/api/create-payment`
- Response should be `{"success": true, ...}`

## Common Issues

### "Stripe is not defined"
- ❌ Stripe.js library not loaded
- ✅ Check payment.html has `<script src="https://js.stripe.com/v3/"></script>`

### "Cannot POST /api/create-payment"
- ❌ Backend server not running
- ✅ Run `npm start` in separate terminal

### Payment succeeds but no redirect
- ❌ setTimeout in payment.html might not work
- ✅ Manually navigate to index.html to verify payment

### "Invalid publishable key"
- ❌ Wrong Stripe key in payment.html
- ✅ Use actual pk_live_... key from Stripe dashboard

## After Testing

### Clean Up
```bash
# Stop server
Ctrl+C

# Remove test data (optional)
# Your test transactions stay in Stripe for reference
```

### Deploy to Production

Once testing is complete:
1. Get live Stripe keys (not test keys)
2. Update payment.html with live publishable key
3. Create `.env` with live secret key
4. Deploy server to production (Heroku, etc.)
5. Test again with small real charge (then refund)

## Performance Testing

### Load Testing
```bash
# Simulating 10 concurrent users
ab -n 100 -c 10 http://localhost:3000/payment.html
```

### Real-world Scenario
- Multiple users checking out simultaneously
- Network latency/slowness
- Different browser/device combinations

## Next Testing Steps

1. ✅ Local testing with test cards
2. 🔄 Staging deployment testing
3. 🔄 Real charge (small amount, then refund)
4. 🔄 Production go-live with monitoring

---

**Status:** Ready for Testing
**Last Updated:** 2026-03-20
