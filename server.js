/**
 * AgentX Stripe Payment Server
 * 
 * This backend processes Stripe payments for AgentX plans.
 * 
 * Usage:
 *   npm install express stripe dotenv cors
 *   node server.js
 * 
 * Environment variables (.env file):
 *   STRIPE_SECRET_KEY=sk_live_...
 *   STRIPE_PUBLISHABLE_KEY=pk_live_...
 *   PORT=3000
 */

const express = require('express');
const stripe = require('stripe');
const cors = require('cors');
require('dotenv').config();

const app = express();
const port = process.env.PORT || 3000;

// Middleware
app.use(cors());
app.use(express.json());
app.use(express.static('.'));

// Initialize Stripe with API key
const stripeClient = stripe(process.env.STRIPE_SECRET_KEY);

/**
 * Plan definitions matching payment.html
 */
const PLANS = {
  'whatsapp-bot': {
    name: 'WhatsApp Order Bot',
    setupFee: 1999,     // in cents for Stripe
    monthlyFee: 49900,
    stripeProductId: 'prod_whatsapp_bot'
  },
  'business-website': {
    name: 'Business Website + AI Chat',
    setupFee: 1499,
    monthlyFee: 29900,
    stripeProductId: 'prod_business_website'
  },
  'social-media': {
    name: 'Social Media Automation',
    setupFee: 0,
    monthlyFee: 79900,
    stripeProductId: 'prod_social_media'
  },
  'seo-content': {
    name: 'SEO + AI Content',
    setupFee: 0,
    monthlyFee: 99900,
    stripeProductId: 'prod_seo_content'
  },
  'business-automation': {
    name: 'Business Automation',
    setupFee: 249900,
    monthlyFee: 69900,
    stripeProductId: 'prod_business_automation'
  },
  'full-package': {
    name: 'Full AI Package',
    setupFee: 499900,
    monthlyFee: 129900,
    stripeProductId: 'prod_full_package'
  }
};

/**
 * POST /api/create-payment
 * 
 * Create a payment intent or charge for a plan
 * 
 * Body:
 *   - token: Stripe token from Stripe.js
 *   - email: Customer email
 *   - fullName: Customer name
 *   - plan: Plan ID (e.g., 'whatsapp-bot')
 *   - amount: Total amount in cents
 */
app.post('/api/create-payment', async (req, res) => {
  try {
    const { token, email, fullName, plan } = req.body;

    // Validate plan
    if (!PLANS[plan]) {
      return res.status(400).json({
        success: false,
        message: 'Invalid plan selected'
      });
    }

    const planData = PLANS[plan];
    const totalAmount = planData.setupFee + planData.monthlyFee;

    // Create a customer
    const customer = await stripeClient.customers.create({
      email: email,
      name: fullName,
      metadata: {
        plan: plan,
        setupFee: planData.setupFee,
        monthlyFee: planData.monthlyFee
      }
    });

    let chargeId;

    // If there's a setup fee, charge it now
    if (planData.setupFee > 0) {
      const setupCharge = await stripeClient.charges.create({
        amount: planData.setupFee,
        currency: 'usd',
        customer: customer.id,
        source: token,
        description: `${planData.name} - Setup Fee`,
        metadata: {
          plan: plan,
          type: 'setup'
        }
      });
      chargeId = setupCharge.id;
    }

    // Create a subscription for the monthly fee
    let subscriptionId;
    if (planData.monthlyFee > 0) {
      // Create or get the product
      let product;
      try {
        product = await stripeClient.products.retrieve(planData.stripeProductId);
      } catch (e) {
        // Create product if it doesn't exist
        product = await stripeClient.products.create({
          id: planData.stripeProductId,
          name: planData.name,
          type: 'service'
        });
      }

      // Create a price if needed
      const prices = await stripeClient.prices.list({
        product: planData.stripeProductId,
        active: true
      });

      let priceId;
      if (prices.data.length > 0) {
        priceId = prices.data[0].id;
      } else {
        const price = await stripeClient.prices.create({
          product: planData.stripeProductId,
          unit_amount: planData.monthlyFee,
          currency: 'usd',
          recurring: {
            interval: 'month',
            interval_count: 1
          }
        });
        priceId = price.id;
      }

      // Create subscription
      const subscription = await stripeClient.subscriptions.create({
        customer: customer.id,
        items: [
          {
            price: priceId
          }
        ],
        default_payment_method: token,
        metadata: {
          plan: plan
        }
      });
      subscriptionId = subscription.id;
    }

    // Log payment for record
    console.log(`✓ Payment processed for ${email}`);
    console.log(`  Plan: ${planData.name}`);
    console.log(`  Amount: $${totalAmount / 100}`);
    console.log(`  Charge ID: ${chargeId || 'N/A'}`);
    console.log(`  Subscription ID: ${subscriptionId || 'N/A'}`);

    res.json({
      success: true,
      message: 'Payment processed successfully',
      customerId: customer.id,
      chargeId: chargeId,
      subscriptionId: subscriptionId,
      redirectUrl: `index.html?success=true&plan=${plan}`,
      customer: {
        email: customer.email,
        name: customer.name
      }
    });

  } catch (error) {
    console.error('Payment error:', error.message);
    res.status(400).json({
      success: false,
      message: error.message || 'Payment processing failed'
    });
  }
});

/**
 * POST /api/create-payment-intent
 * 
 * Alternative: Create a Stripe Payment Intent for 3D Secure and other advanced flows
 */
app.post('/api/create-payment-intent', async (req, res) => {
  try {
    const { email, fullName, plan } = req.body;

    if (!PLANS[plan]) {
      return res.status(400).json({
        success: false,
        message: 'Invalid plan selected'
      });
    }

    const planData = PLANS[plan];
    const totalAmount = planData.setupFee + planData.monthlyFee;

    // Create a payment intent
    const paymentIntent = await stripeClient.paymentIntents.create({
      amount: totalAmount,
      currency: 'usd',
      payment_method_types: ['card'],
      receipt_email: email,
      metadata: {
        email: email,
        fullName: fullName,
        plan: plan,
        setupFee: planData.setupFee,
        monthlyFee: planData.monthlyFee
      }
    });

    res.json({
      success: true,
      clientSecret: paymentIntent.client_secret,
      paymentIntentId: paymentIntent.id
    });

  } catch (error) {
    console.error('Payment intent error:', error.message);
    res.status(400).json({
      success: false,
      message: error.message || 'Failed to create payment intent'
    });
  }
});

/**
 * GET /api/plans
 * 
 * List all available plans (useful for dynamic UI)
 */
app.get('/api/plans', (req, res) => {
  const plansResponse = Object.entries(PLANS).map(([id, data]) => ({
    id,
    name: data.name,
    setupFee: data.setupFee / 100,
    monthlyFee: data.monthlyFee / 100
  }));

  res.json({
    success: true,
    plans: plansResponse
  });
});

/**
 * Health check
 */
app.get('/health', (req, res) => {
  res.json({
    status: 'ok',
    timestamp: new Date().toISOString()
  });
});

/**
 * Start server
 */
app.listen(port, () => {
  console.log(`🚀 AgentX Payment Server running on http://localhost:${port}`);
  console.log(`📋 Stripe Secret Key: ${process.env.STRIPE_SECRET_KEY ? '✓ Loaded' : '✗ Missing'}`);
  console.log(`\nEndpoints:`);
  console.log(`  POST /api/create-payment`);
  console.log(`  POST /api/create-payment-intent`);
  console.log(`  GET  /api/plans`);
  console.log(`  GET  /health`);
});
