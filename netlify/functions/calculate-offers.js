// netlify/functions/calculate-offers.js
// Preview-only pricing endpoint for multi-game trade flow
// Mirrors submit-offer.js offer logic as closely as possible
// - exact PriceCharting product lookup by externalId
// - same pricing_config fields from Supabase
// - same condition/completeness price selection
// - same manual review rules
// - NO database writes

const { createClient } = require('@supabase/supabase-js');

exports.handler = async (event) => {
  try {
    // ------------------------------------------------------------
    // Only allow POST
    // ------------------------------------------------------------
    if (event.httpMethod !== 'POST') {
      return jsonResponse(405, { error: 'Method not allowed' });
    }

    // ------------------------------------------------------------
    // Environment variables
    // ------------------------------------------------------------
    const apiKey = process.env.PRICECHARTING_API_KEY;
    const supabaseUrl = process.env.SUPABASE_URL;
    const supabaseServiceKey = process.env.SUPABASE_SERVICE_KEY;

    if (!apiKey || !supabaseUrl || !supabaseServiceKey) {
      console.error('Missing required environment variables');
      return jsonResponse(500, { error: 'Server configuration error' });
    }

    // ------------------------------------------------------------
    // Parse request
    // ------------------------------------------------------------
    const body = JSON.parse(event.body || '{}');

    const rawItems = Array.isArray(body.items)
      ? body.items
      : Array.isArray(body.games)
      ? body.games
      : Array.isArray(body.trade_items)
      ? body.trade_items
      : body.externalId || body.external_id
      ? [body]
      : [];

    if (!rawItems.length) {
      return jsonResponse(400, { error: 'No items provided' });
    }

    // ------------------------------------------------------------
    // Pricing configuration (same parameters as submit-offer.js)
    // ------------------------------------------------------------
    let cashPercentUnder30 = 0.30;
    let cashPercent30To100 = 0.35;
    let creditMultiplier = 1.2;
    let maxAutoOfferValue = 100;

    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    try {
      const { data: config, error: configError } = await supabase
        .from('pricing_config')
        .select(
          'cash_percent_under_30, cash_percent_30_to_100, credit_multiplier, max_auto_offer_value'
        )
        .eq('id', 1)
        .single();

      if (configError && configError.code !== 'PGRST116') {
        console.warn('Failed to load pricing_config, using defaults:', configError.message);
      } else if (config) {
        const under30 = Number(config.cash_percent_under_30);
        const mid = Number(config.cash_percent_30_to_100);
        const credit = Number(config.credit_multiplier);
        const maxAuto = Number(config.max_auto_offer_value);

        if (Number.isFinite(under30) && under30 > 0) {
          cashPercentUnder30 = under30;
        }

        if (Number.isFinite(mid) && mid > 0) {
          cashPercent30To100 = mid;
        }

        if (Number.isFinite(credit) && credit > 0) {
          creditMultiplier = credit;
        }

        if (Number.isFinite(maxAuto) && maxAuto > 0) {
          maxAutoOfferValue = maxAuto;
        }

        console.log('Loaded pricing config from Supabase:', {
          cashPercentUnder30,
          cashPercent30To100,
          creditMultiplier,
          maxAutoOfferValue
        });
      } else {
        console.log('No pricing_config row found (id=1), using hardcoded defaults');
      }
    } catch (configFetchError) {
      console.warn(
        'Error fetching pricing_config, falling back to defaults:',
        configFetchError.message
      );
    }

    // ------------------------------------------------------------
    // Process each item
    // ------------------------------------------------------------
    const results = [];

    for (const rawItem of rawItems) {
      const item = {
        game_title_or_description: String(
          rawItem.selected_title ||
            rawItem.gameTitleOrDescription ||
            rawItem.games_description ||
            rawItem.game_title_or_description ||
            rawItem.title ||
            ''
        ).trim(),
        platform: String(rawItem.selected_platform || rawItem.platform || '').trim(),
        condition: String(rawItem.condition || '').trim(),
        completeness: String(rawItem.completeness || '').trim(),
        quantity: safePositiveInt(rawItem.quantity, 1),
        notes: String(rawItem.notes || '').trim(),
        external_id: String(rawItem.externalId || rawItem.external_id || '').trim()
      };

      let freshResult = null;
      let offerType = 'manual_review';
      let inventoryClass = 'unclassified';

      let marketValue = null;
      let unitValue = null;

      let cashAmount = null;
      let creditAmount = null;

      let cashLow = null;
      let cashHigh = null;
      let creditLow = null;
      let creditHigh = null;

      let pricingSource = 'none';
      let manualReviewReason = null;

      // ----------------------------------------------------------
      // PriceCharting exact lookup
      // ----------------------------------------------------------
      try {
        if (item.external_id) {
          const productUrl = new URL('https://www.pricecharting.com/api/product');
          productUrl.searchParams.set('t', apiKey);
          productUrl.searchParams.set('id', item.external_id);

          const pcResponse = await fetch(productUrl.toString(), {
            method: 'GET',
            headers: { Accept: 'application/json' }
          });

          if (pcResponse.ok) {
            const pcData = await pcResponse.json();
            if (pcData && pcData.id) {
              freshResult = pcData;
              pricingSource = 'pricecharting_product';
            } else {
              pricingSource = 'missing_product_match';
              manualReviewReason = 'No PriceCharting match found';
            }
          } else {
            pricingSource = 'pricecharting_lookup_failed';
            manualReviewReason = `PriceCharting lookup failed (${pcResponse.status})`;
          }
        } else {
          pricingSource = 'missing_external_id';
          manualReviewReason = 'No exact product selected';
        }
      } catch (lookupError) {
        console.warn('PriceCharting lookup failed:', lookupError.message);
        pricingSource = 'pricecharting_lookup_error';
        manualReviewReason = manualReviewReason || 'PriceCharting lookup error';
      }

      // ----------------------------------------------------------
      // Determine market value (same helper logic as submit-offer)
      // ----------------------------------------------------------
      if (freshResult) {
        unitValue = getBestUnitValue(
          freshResult,
          item.condition,
          item.completeness
        );

        if (unitValue > 0) {
          marketValue = roundMoney(unitValue * item.quantity);
        } else {
          manualReviewReason = 'No usable price found for selected condition/completeness';
        }
      } else if (!manualReviewReason) {
        manualReviewReason = 'No PriceCharting match found';
      }

      // ----------------------------------------------------------
      // Same manual review logic as submit-offer
      // ----------------------------------------------------------
      const manualTrigger = getManualReviewReason(item, marketValue, maxAutoOfferValue);

      if (manualTrigger) {
        offerType = 'manual_review';
        inventoryClass = marketValue > 100 ? 'strategic' : 'review';
        manualReviewReason = manualTrigger;
      } else if (marketValue === null || marketValue <= 0) {
        offerType = 'manual_review';
        inventoryClass = 'review';
        manualReviewReason = manualReviewReason || 'Unable to determine market value';
      } else if (marketValue < 30) {
        offerType = 'instant_offer';
        inventoryClass = 'common';

        cashAmount = roundMoney(marketValue * cashPercentUnder30);
        creditAmount = roundMoney(cashAmount * creditMultiplier);
      } else if (marketValue <= 100) {
        offerType = 'instant_range';
        inventoryClass = 'evergreen';

        const baseCash = roundMoney(marketValue * cashPercent30To100);
        cashAmount = baseCash;
        creditAmount = roundMoney(baseCash * creditMultiplier);

        cashLow = roundMoney(baseCash * 0.9);
        cashHigh = roundMoney(baseCash * 1.1);
        creditLow = roundMoney(cashLow * creditMultiplier);
        creditHigh = roundMoney(cashHigh * creditMultiplier);
      } else {
        offerType = 'manual_review';
        inventoryClass = 'strategic';
        manualReviewReason = `Market value exceeds auto-offer threshold`;
      }

      results.push({
        success: true,
        external_id: item.external_id || null,
        selected_title: item.game_title_or_description || null,
        selected_platform: item.platform || null,
        condition: item.condition || null,
        completeness: item.completeness || null,
        quantity: item.quantity,

        snapshot_title: freshResult ? freshResult['product-name'] || null : null,
        snapshot_console: freshResult ? freshResult['console-name'] || null : null,
        snapshot_loose_price: freshResult ? centsToDollars(freshResult['loose-price']) : null,
        snapshot_cib_price: freshResult ? centsToDollars(freshResult['cib-price']) : null,
        snapshot_new_price: freshResult ? centsToDollars(freshResult['new-price']) : null,

        offer_type: offerType,
        inventory_class: inventoryClass,
        market_value: marketValue,
        unit_value: unitValue,
        pricing_source: pricingSource,
        manual_review_reason: manualReviewReason,
        cash_amount: cashAmount,
        credit_amount: creditAmount,
        cash_low: cashLow,
        cash_high: cashHigh,
        credit_low: creditLow,
        credit_high: creditHigh
      });
    }

    // ------------------------------------------------------------
    // Totals for frontend
    // ------------------------------------------------------------
    const totals = results.reduce(
      (acc, item) => {
        acc.market_value += Number(item.market_value || 0);
        acc.cash_amount += Number(item.cash_amount || 0);
        acc.credit_amount += Number(item.credit_amount || 0);
        acc.cash_low += Number(item.cash_low || 0);
        acc.cash_high += Number(item.cash_high || 0);
        acc.credit_low += Number(item.credit_low || 0);
        acc.credit_high += Number(item.credit_high || 0);

        if (item.offer_type === 'manual_review') {
          acc.manual_review_count += 1;
        }

        if (item.offer_type === 'instant_offer') {
          acc.instant_offer_count += 1;
        }

        if (item.offer_type === 'instant_range') {
          acc.instant_range_count += 1;
        }

        return acc;
      },
      {
        market_value: 0,
        cash_amount: 0,
        credit_amount: 0,
        cash_low: 0,
        cash_high: 0,
        credit_low: 0,
        credit_high: 0,
        manual_review_count: 0,
        instant_offer_count: 0,
        instant_range_count: 0
      }
    );

    totals.market_value = roundMoney(totals.market_value);
    totals.cash_amount = roundMoney(totals.cash_amount);
    totals.credit_amount = roundMoney(totals.credit_amount);
    totals.cash_low = roundMoney(totals.cash_low);
    totals.cash_high = roundMoney(totals.cash_high);
    totals.credit_low = roundMoney(totals.credit_low);
    totals.credit_high = roundMoney(totals.credit_high);

    return jsonResponse(200, {
      success: true,
      items: results,
      totals
    });
  } catch (error) {
    console.error('calculate-offers function failed:', error);
    return jsonResponse(500, {
      error: 'Calculate offers failed – try again later',
      details: error.message
    });
  }
};

// ============================================================================
// Helpers
// ============================================================================

function jsonResponse(statusCode, payload) {
  return {
    statusCode,
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload)
  };
}

function safePositiveInt(value, fallback = 1) {
  const parsed = parseInt(value, 10);
  if (Number.isNaN(parsed) || parsed < 1) return fallback;
  return parsed;
}

function roundMoney(value) {
  if (typeof value !== 'number' || !Number.isFinite(value)) return null;
  return Math.round(value * 100) / 100;
}

function normalizeString(value) {
  return String(value || '').trim().toLowerCase();
}

function centsToDollars(value) {
  const num = Number(value || 0);
  if (!Number.isFinite(num) || num <= 0) return 0;
  return num / 100;
}

function getBestUnitValue(freshResult, condition, completeness) {
  const normalizedCondition = normalizeString(condition);
  const normalizedCompleteness = normalizeString(completeness);

  const loosePrice = centsToDollars(freshResult['loose-price']);
  const cibPrice = centsToDollars(freshResult['cib-price']);
  const newPrice = centsToDollars(freshResult['new-price']);
  const gradedPrice = centsToDollars(freshResult['graded-price']);

  if (normalizedCondition.includes('graded')) {
    return gradedPrice || newPrice || 0;
  }

  if (normalizedCondition.includes('sealed') || normalizedCondition.includes('new')) {
    return newPrice || gradedPrice || 0;
  }

  if (normalizedCondition.includes('cib') || normalizedCondition.includes('complete')) {
    return cibPrice || loosePrice || 0;
  }

  if (
    normalizedCondition.includes('loose') ||
    normalizedCondition.includes('disc only') ||
    normalizedCondition.includes('cart only')
  ) {
    return loosePrice || cibPrice || 0;
  }

  if (normalizedCompleteness.includes('complete') || normalizedCompleteness.includes('cib')) {
    return cibPrice || loosePrice || 0;
  }

  if (normalizedCompleteness.includes('loose')) {
    return loosePrice || cibPrice || 0;
  }

  if (normalizedCompleteness.includes('sealed') || normalizedCompleteness.includes('new')) {
    return newPrice || gradedPrice || 0;
  }

  return loosePrice || cibPrice || newPrice || gradedPrice || 0;
}

function getManualReviewReason(item, marketValue, maxAutoOfferValue = 100) {
  const lowerCondition = normalizeString(item.condition);
  const lowerCompleteness = normalizeString(item.completeness);
  const lowerNotes = normalizeString(item.notes);
  const lowerPlatform = normalizeString(item.platform);

  if (!item.game_title_or_description || item.game_title_or_description.trim() === '') {
    return 'Missing title or description';
  }

  if (!marketValue || marketValue <= 0) {
    return 'No usable market value';
  }

  if (lowerCondition.includes('graded') || lowerCompleteness.includes('graded')) {
    return 'Graded item requires manual review';
  }

  if (lowerCondition.includes('sealed') || lowerCompleteness.includes('sealed')) {
    return 'Sealed item requires manual review';
  }

  if (lowerPlatform === 'other') {
    return 'Platform is "Other"';
  }

  if (item.quantity >= 5) {
    return 'Quantity >= 5';
  }

  if (marketValue >= 250) {
    return 'Market value >= $250';
  }

  const seriousKeywords = [
    'not working',
    'broken',
    'cracked',
    'water damage',
    'missing pieces',
    'missing manual',
    'missing inserts',
    'heavy scratches',
    'wont read',
    "won't read",
    'untested',
    'repro',
    'reproduction',
    'fake',
    'counterfeit',
    'disc rot'
  ];

  for (const keyword of seriousKeywords) {
    if (lowerNotes.includes(keyword)) {
      return `Suspicious notes: ${keyword}`;
    }
  }

  if (marketValue > maxAutoOfferValue) {
    return 'Market value exceeds auto-offer threshold';
  }

  return null;
}