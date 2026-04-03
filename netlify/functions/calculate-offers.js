// netlify/functions/calculate-offers.js
// Preview pricing only — no database writes.
// Mirrors submit-offer.js pricing logic and keeps response JSON-safe.

const { createClient } = require('@supabase/supabase-js');

const JSON_HEADERS = {
  'Content-Type': 'application/json',
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'Content-Type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};

function jsonResponse(statusCode, payload) {
  return {
    statusCode,
    headers: JSON_HEADERS,
    body: JSON.stringify(payload),
  };
}

function roundMoney(value) {
  const num = Number(value);
  if (!Number.isFinite(num)) return 0;
  return Math.round(num * 100) / 100;
}

function firstDefined(obj, keys) {
  for (const key of keys) {
    if (obj && obj[key] !== undefined && obj[key] !== null && obj[key] !== '') {
      return obj[key];
    }
  }
  return null;
}

function toNumber(value, fallback = null) {
  if (value === null || value === undefined || value === '') return fallback;
  const cleaned =
    typeof value === 'string'
      ? value.replace(/\$/g, '').replace(/,/g, '').trim()
      : value;
  const num = Number(cleaned);
  return Number.isFinite(num) ? num : fallback;
}

function normalizePriceValue(value) {
  const num = toNumber(value, null);
  if (num === null) return null;

  // PriceCharting sometimes returns cents, sometimes dollars.
  // If it's clearly cents, convert to dollars.
  if (num > 1000) return roundMoney(num / 100);

  return roundMoney(num);
}

function normalizeCondition(condition) {
  const raw = String(condition || '').trim().toLowerCase();

  if (['cib', 'complete', 'complete in box', 'complete-in-box'].includes(raw)) {
    return 'cib';
  }

  if (['new', 'sealed', 'brand new'].includes(raw)) {
    return 'new';
  }

  if (['graded'].includes(raw)) {
    return 'graded';
  }

  return 'loose';
}

function getConditionPrice(product, condition) {
  const normalized = normalizeCondition(condition);

  const keyMap = {
    loose: ['loose-price', 'loosePrice', 'loose_price'],
    cib: ['cib-price', 'cibPrice', 'cib_price'],
    new: ['new-price', 'newPrice', 'new_price'],
    graded: ['graded-price', 'gradedPrice', 'graded_price'],
  };

  const preferredValue = firstDefined(product, keyMap[normalized] || []);
  const preferredPrice = normalizePriceValue(preferredValue);
  if (preferredPrice !== null && preferredPrice > 0) return preferredPrice;

  // Fallback order if selected condition price is unavailable
  const fallbackKeys = [
    'cib-price',
    'cibPrice',
    'cib_price',
    'loose-price',
    'loosePrice',
    'loose_price',
    'new-price',
    'newPrice',
    'new_price',
    'graded-price',
    'gradedPrice',
    'graded_price',
    'manual-only-price',
    'manualOnlyPrice',
    'manual_only_price',
  ];

  const fallbackValue = firstDefined(product, fallbackKeys);
  const fallbackPrice = normalizePriceValue(fallbackValue);

  return fallbackPrice !== null ? fallbackPrice : 0;
}

function getPercent(config, keys, fallback) {
  const value = toNumber(firstDefined(config, keys), null);
  return value === null ? fallback : value;
}

function buildPreviewResult(unitValue, config) {
  const roundedUnitValue = roundMoney(unitValue);

  if (roundedUnitValue < 30) {
    const cashPercent = getPercent(
      config,
      ['cash_percent_under_30', 'cash_under_30_percent'],
      30
    );
    const creditPercent = getPercent(
      config,
      ['credit_percent_under_30', 'credit_under_30_percent'],
      40
    );

    const cashAmount = roundMoney((roundedUnitValue * cashPercent) / 100);
    const creditAmount = roundMoney((roundedUnitValue * creditPercent) / 100);

    return {
      success: true,
      offer_type: 'instant_offer',
      inventory_class: 'evergreen',
      market_value: roundedUnitValue,
      unit_value: roundedUnitValue,
      cash_amount: cashAmount,
      credit_amount: creditAmount,
      cash_low: cashAmount,
      cash_high: cashAmount,
      credit_low: creditAmount,
      credit_high: creditAmount,
      pricing_source: 'pricecharting_product',
      manual_review_reason: null,
    };
  }

  if (roundedUnitValue <= 100) {
    const cashLowPercent = getPercent(
      config,
      [
        'cash_percent_30_to_100_low',
        'cash_low_percent_30_to_100',
        'cash_percent_mid_low',
      ],
      35
    );
    const cashHighPercent = getPercent(
      config,
      [
        'cash_percent_30_to_100_high',
        'cash_high_percent_30_to_100',
        'cash_percent_mid_high',
      ],
      40
    );
    const creditLowPercent = getPercent(
      config,
      [
        'credit_percent_30_to_100_low',
        'credit_low_percent_30_to_100',
        'credit_percent_mid_low',
      ],
      45
    );
    const creditHighPercent = getPercent(
      config,
      [
        'credit_percent_30_to_100_high',
        'credit_high_percent_30_to_100',
        'credit_percent_mid_high',
      ],
      50
    );

    const cashLow = roundMoney((roundedUnitValue * cashLowPercent) / 100);
    const cashHigh = roundMoney((roundedUnitValue * cashHighPercent) / 100);
    const creditLow = roundMoney((roundedUnitValue * creditLowPercent) / 100);
    const creditHigh = roundMoney((roundedUnitValue * creditHighPercent) / 100);

    return {
      success: true,
      offer_type: 'instant_range',
      inventory_class: 'evergreen',
      market_value: roundedUnitValue,
      unit_value: roundedUnitValue,
      cash_amount: cashLow,
      credit_amount: creditLow,
      cash_low: cashLow,
      cash_high: cashHigh,
      credit_low: creditLow,
      credit_high: creditHigh,
      pricing_source: 'pricecharting_product',
      manual_review_reason: null,
    };
  }

  return {
    success: true,
    offer_type: 'manual_review',
    inventory_class: 'strategic',
    market_value: roundedUnitValue,
    unit_value: roundedUnitValue,
    cash_amount: null,
    credit_amount: null,
    cash_low: null,
    cash_high: null,
    credit_low: null,
    credit_high: null,
    pricing_source: 'pricecharting_product',
    manual_review_reason: 'value_above_100_threshold',
  };
}

async function fetchProductByExternalId(externalId, apiKey) {
  const url = `https://www.pricecharting.com/api/product?t=${encodeURIComponent(
    apiKey
  )}&id=${encodeURIComponent(String(externalId).trim())}`;

  const response = await fetch(url);

  if (!response.ok) {
    const text = await response.text();
    throw new Error(`PriceCharting request failed (${response.status}): ${text}`);
  }

  return response.json();
}

exports.handler = async (event) => {
  if (event.httpMethod === 'OPTIONS') {
    return {
      statusCode: 200,
      headers: JSON_HEADERS,
      body: '',
    };
  }

  if (event.httpMethod !== 'POST') {
    return jsonResponse(405, { success: false, error: 'Method not allowed' });
  }

  try {
    const supabaseUrl = process.env.SUPABASE_URL;
    const supabaseServiceKey = process.env.SUPABASE_SERVICE_KEY;
    const priceChartingApiKey =
      process.env.PRICECHARTING_API_KEY || process.env.PRICECHARTING_TOKEN;

    if (!supabaseUrl || !supabaseServiceKey) {
      return jsonResponse(500, {
        success: false,
        error: 'Missing Supabase environment variables',
      });
    }

    if (!priceChartingApiKey) {
      return jsonResponse(500, {
        success: false,
        error: 'Missing PriceCharting API key',
      });
    }

    let body;
    try {
      body = JSON.parse(event.body || '{}');
    } catch (err) {
      return jsonResponse(400, {
        success: false,
        error: 'Invalid JSON body',
      });
    }

    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    const { data: pricingConfig, error: configError } = await supabase
      .from('pricing_config')
      .select('*')
      .eq('id', 1)
      .single();

    if (configError) {
      console.error('Failed to load pricing_config:', configError);
      return jsonResponse(500, {
        success: false,
        error: 'Failed to load pricing configuration',
      });
    }

    const rawItems = Array.isArray(body.items)
      ? body.items
      : Array.isArray(body.tradeItems)
      ? body.tradeItems
      : [body];

    const results = [];

    for (let index = 0; index < rawItems.length; index += 1) {
      const item = rawItems[index] || {};
      const externalId = item.externalId || item.external_id || item.productId || item.product_id;
      const condition = item.condition || 'loose';

      if (!externalId) {
        results.push({
          success: false,
          index,
          externalId: null,
          condition,
          error: 'Missing externalId',
        });
        continue;
      }

      try {
        const product = await fetchProductByExternalId(externalId, priceChartingApiKey);
        const unitValue = getConditionPrice(product, condition);

        const preview = buildPreviewResult(unitValue, pricingConfig);

        results.push({
          index,
          externalId: String(externalId),
          title: product['product-name'] || product.productName || item.title || null,
          console_name: product.consoleName || product['console-name'] || item.platform || null,
          condition: normalizeCondition(condition),
          ...preview,
        });
      } catch (itemError) {
        console.error(`calculate-offers item error (${externalId}):`, itemError);
        results.push({
          success: false,
          index,
          externalId: String(externalId),
          condition: normalizeCondition(condition),
          error: itemError.message || 'Failed to calculate preview pricing',
        });
      }
    }

    const isBatchRequest = Array.isArray(body.items) || Array.isArray(body.tradeItems);

    if (!isBatchRequest && results.length === 1) {
  const result = results[0];

  if (!result.success) {
    // SAFE fallback instead of crashing
    return jsonResponse(200, {
      success: true,
      offer_type: 'manual_review',
      inventory_class: 'unclassified',
      market_value: 0,
      unit_value: 0,
      cash_amount: null,
      credit_amount: null,
      pricing_source: 'pricecharting_product',
      manual_review_reason: result.error || 'Preview failed'
    });
  }

  return jsonResponse(200, result);
}
    const successful = results.filter((r) => r.success);
    const totals = successful.reduce(
      (acc, item) => {
        acc.market_value = roundMoney(acc.market_value + (item.market_value || 0));
        acc.cash_low = roundMoney(acc.cash_low + (item.cash_low || 0));
        acc.cash_high = roundMoney(acc.cash_high + (item.cash_high || 0));
        acc.credit_low = roundMoney(acc.credit_low + (item.credit_low || 0));
        acc.credit_high = roundMoney(acc.credit_high + (item.credit_high || 0));
        if (item.offer_type === 'manual_review') acc.manual_review_count += 1;
        return acc;
      },
      {
        market_value: 0,
        cash_low: 0,
        cash_high: 0,
        credit_low: 0,
        credit_high: 0,
        manual_review_count: 0,
      }
    );

    return jsonResponse(200, {
      success: true,
      count: results.length,
      results,
      totals,
    });
  } catch (error) {
    console.error('calculate-offers function failed:', error);
    return jsonResponse(500, {
      success: false,
      error: error.message || 'Internal server error',
    });
  }
};