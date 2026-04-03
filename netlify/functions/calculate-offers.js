// netlify/functions/calculate-offers.js
// Preview-only pricing calculation for Voltage 2.0 multi-game trade list
// Mirrors the exact pricing logic from submit-offer.js but performs NO database writes or submission creation

const { createClient } = require('@supabase/supabase-js');

// Helper functions - mirrored exactly from submit-offer.js for consistency
function jsonResponse(statusCode, body) {
  return {
    statusCode,
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body)
  };
}

function safePositiveInt(value, fallback = 0) {
  const num = parseInt(value, 10);
  return isNaN(num) || num < 0 ? fallback : num;
}

function roundMoney(amount) {
  return Math.round((amount || 0) * 100) / 100;
}

function normalizeString(str) {
  if (!str) return '';
  return String(str).trim().toLowerCase();
}

function centsToDollars(cents) {
  return roundMoney((cents || 0) / 100);
}

function getBestUnitValue(product, condition) {
  const norm = normalizeString(condition);
  
  if (norm.includes('sealed') || norm.includes('new')) {
    return product['new-price'] || product.newPrice || 0;
  }
  if (norm.includes('cib') || norm.includes('complete')) {
    return product['cib-price'] || product.cibPrice || 0;
  }
  // default to loose
  return product['loose-price'] || product.loosePrice || 0;
}


exports.handler = async (event) => {
  // Only allow POST
  if (event.httpMethod !== 'POST') {
    return jsonResponse(405, { success: false, error: 'Method not allowed' });
  }

  let body;
  try {
    body = JSON.parse(event.body || '{}');
  } catch (e) {
    return jsonResponse(400, { success: false, error: 'Invalid JSON body' });
  }

  const { externalId, condition, quantity = 1 } = body;

  if (!externalId || !String(externalId).trim()) {
    return jsonResponse(400, { 
      success: false, 
      error: 'externalId is required',
      offer_type: 'manual_review',
      manual_review_reason: 'Missing game identifier'
    });
  }

  if (!condition || !String(condition).trim()) {
    return jsonResponse(400, { 
      success: false, 
      error: 'condition is required',
      offer_type: 'manual_review',
      manual_review_reason: 'Condition not specified'
    });
  }

  const qty = safePositiveInt(quantity, 1);

  try {
    // Load environment variables
    const pricechartingApiKey = process.env.PRICECHARTING_API_KEY;
    const supabaseUrl = process.env.SUPABASE_URL;
    const supabaseServiceKey = process.env.SUPABASE_SERVICE_KEY;

    if (!pricechartingApiKey || !supabaseUrl || !supabaseServiceKey) {
      console.error('Missing required environment variables');
      return jsonResponse(500, { 
        success: false, 
        error: 'Server configuration error',
        offer_type: 'manual_review',
        manual_review_reason: 'System unavailable'
      });
    }

    // Initialize Supabase client with SERVICE KEY (read-only for pricing_config)
    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    // 1. Fetch pricing config (same as submit-offer.js)
    const { data: configData, error: configError } = await supabase
      .from('pricing_config')
      .select('*')
      .eq('id', 1)
      .single();

    if (configError || !configData) {
      console.error('Pricing config error:', configError);
      return jsonResponse(500, { 
        success: false, 
        error: 'Pricing configuration unavailable',
        offer_type: 'manual_review',
        manual_review_reason: 'System pricing unavailable'
      });
    }

    // 2. Exact PriceCharting product lookup by externalId (same logic as submit-offer)
    const pcResponse = await fetch(`https://www.pricecharting.com/api/product?t=${pricechartingApiKey}&id=${encodeURIComponent(externalId)}`);
    
    if (!pcResponse.ok) {
      console.error('PriceCharting lookup failed:', pcResponse.status);
      return jsonResponse(200, {
        success: true,
        offer_type: 'manual_review',
        inventory_class: 'unclassified',
        market_value: 0,
        unit_value: 0,
        pricing_source: 'pricecharting_product',
        manual_review_reason: 'Product lookup failed'
      });
    }

    const product = await pcResponse.json();

    if (!product || !product.id) {
      return jsonResponse(200, {
        success: true,
        offer_type: 'manual_review',
        inventory_class: 'unclassified',
        market_value: 0,
        unit_value: 0,
        pricing_source: 'pricecharting_product',
        manual_review_reason: 'Product not found'
      });
    }

    // 3. Calculate unit value based on condition (same helper)
    const unitCents = getBestUnitValue(product, condition);
    const marketValue = centsToDollars(unitCents);
    const unitValue = roundMoney(marketValue * qty);

   

    // 4. Apply pricing rules from config (exact same percentages and multiplier)
    let cashPercent = configData.cash_percent_under_30 || 30;
    if (unitValue >= 30) {
      cashPercent = configData.cash_percent_30_to_100 || 35;
    }

    const creditMultiplier = configData.credit_multiplier || 1.2;

    const cashAmount = roundMoney(unitValue * (cashPercent / 100));
    const creditAmount = roundMoney(cashAmount * creditMultiplier);

    // 5. Determine offer type and inventory class
    
    // For higher value items, use range (same threshold behavior)
   if (unitValue < 30) {
  return jsonResponse(200, {
    success: true,
    offer_type: 'instant_offer',
    inventory_class: 'common',
    market_value: roundMoney(unitValue),
    unit_value: roundMoney(unitValue),
    cash_amount: cashAmount,
    credit_amount: creditAmount,
    cash_low: null,
    cash_high: null,
    credit_low: null,
    credit_high: null,
    pricing_source: 'pricecharting_product',
    manual_review_reason: null
  });
} else if (unitValue <= 100) {
  const cashLow = roundMoney(cashAmount * 0.9);
  const cashHigh = roundMoney(cashAmount * 1.1);
  const creditLow = roundMoney(cashLow * creditMultiplier);
  const creditHigh = roundMoney(cashHigh * creditMultiplier);
  return jsonResponse(200, {
    success: true,
    offer_type: 'manual_review',
    inventory_class: 'strategic',
    market_value: roundMoney(unitValue),
    unit_value: roundMoney(unitValue),
    cash_amount: null,
    credit_amount: null,
    cash_low: null,
    cash_high: null,
    credit_low: null,
    credit_high: null,
    pricing_source: 'pricecharting_product',
    manual_review_reason: 'Market value exceeds auto-offer threshold'
  });
}
  } catch (err) {
    console.error('calculate-offers error:', err);
    return jsonResponse(500, {
      success: false,
      error: 'Internal pricing error',
      offer_type: 'manual_review',
      manual_review_reason: 'Calculation failed'
    });
  }
};