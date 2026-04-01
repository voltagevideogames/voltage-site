// netlify/functions/submit-offer.js
// Voltage 2.0 Offer Engine Phase 2
// Safe full replacement:
// - preserves working submission flow
// - adds PriceCharting lookup
// - calculates market value
// - classifies offer
// - saves pricing fields to Supabase
// - returns structured frontend response

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
    // Parse incoming request
    // ------------------------------------------------------------
    const body = JSON.parse(event.body || '{}');

    const submission = {
      customer_email: String(body.email || '').trim(),
      game_title_or_description: String(
        body.selected_title ||
        body.gameTitleOrDescription ||
        body.games_description ||
        body.game_title_or_description ||
        body.title ||
        ''
      ).trim(),
      platform: String(
        body.selected_platform ||
        body.platform ||
        ''
      ).trim(),
      condition: String(body.condition || '').trim(),
      completeness: String(body.completeness || '').trim(),
      quantity: safePositiveInt(body.quantity, 1),
      preferred_payout: String(
        body.preferredPayout ||
        body.preferred_payout ||
        body.payout_type ||
        'cash'
      ).trim().toLowerCase(),
      notes: String(body.notes || '').trim(),
      photo_urls: Array.isArray(body.photo_urls) ? body.photo_urls : [],
      status: 'pending',
    };

    const externalId = String(body.externalId || body.external_id || '').trim();

    console.log('External ID received:', externalId);
    console.log('Selected title received:', submission.game_title_or_description);
    console.log('Selected platform received:', submission.platform);

    if (!submission.game_title_or_description) {
      return jsonResponse(400, { error: 'Game title or description is required' });
    }

    // ------------------------------------------------------------
    // Business constants
    // ------------------------------------------------------------
    const CASH_PERCENT_UNDER_30 = 0.30;
    const CASH_PERCENT_30_TO_100 = 0.35;
    const CREDIT_MULTIPLIER = 1.2;

    // ------------------------------------------------------------
    // Offer state defaults
    // ------------------------------------------------------------
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

    // ------------------------------------------------------------
    // PriceCharting lookup
    // ------------------------------------------------------------
    try {
      let pcResponse;
      let pcData = null;

      if (externalId) {
        console.log('Using exact externalId lookup:', externalId);

        const productUrl = new URL('https://www.pricecharting.com/api/product');
        productUrl.searchParams.set('t', apiKey);
        productUrl.searchParams.set('id', externalId);

        pcResponse = await fetch(productUrl.toString(), {
          method: 'GET',
          headers: { Accept: 'application/json' },
        });

        if (pcResponse.ok) {
          pcData = await pcResponse.json();
          if (pcData && pcData.id) {
            freshResult = pcData;
            pricingSource = 'pricecharting_product';
          }
        }
      } else {
        // No externalId → force manual review (no fuzzy search fallback)
        console.log('No externalId provided → forcing manual review');
        pricingSource = 'missing_external_id';
        manualReviewReason = 'No exact product selected';
      }
    } catch (lookupError) {
      console.warn('PriceCharting lookup failed:', lookupError.message);
      if (!manualReviewReason) {
        manualReviewReason = 'PriceCharting lookup error';
      }
    }

    // ------------------------------------------------------------
    // Determine market value
    // ------------------------------------------------------------
    if (freshResult) {
      unitValue = getBestUnitValue(
        freshResult,
        submission.condition,
        submission.completeness
      );

      if (unitValue > 0) {
        marketValue = roundMoney(unitValue * submission.quantity);
      } else {
        manualReviewReason = 'No usable price found for selected condition/completeness';
      }
    } else if (!manualReviewReason) {
      manualReviewReason = 'No PriceCharting match found';
    }

    // ------------------------------------------------------------
    // Manual review ALWAYS wins
    // ------------------------------------------------------------
    const manualTrigger = getManualReviewReason(submission, marketValue);

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

      cashAmount = roundMoney(marketValue * CASH_PERCENT_UNDER_30);
      creditAmount = roundMoney(cashAmount * CREDIT_MULTIPLIER);
    } else if (marketValue <= 100) {
      offerType = 'instant_range';
      inventoryClass = 'evergreen';

      const baseCash = roundMoney(marketValue * CASH_PERCENT_30_TO_100);
      cashAmount = baseCash;
      creditAmount = roundMoney(baseCash * CREDIT_MULTIPLIER);

      cashLow = roundMoney(baseCash * 0.9);
      cashHigh = roundMoney(baseCash * 1.1);
      creditLow = roundMoney(cashLow * CREDIT_MULTIPLIER);
      creditHigh = roundMoney(cashHigh * CREDIT_MULTIPLIER);
    } else {
      offerType = 'manual_review';
      inventoryClass = 'strategic';
      manualReviewReason = 'Market value exceeds auto-offer threshold';
    }

    // ------------------------------------------------------------
    // Save to Supabase
    // ------------------------------------------------------------
    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    const insertPayload = {
      customer_email: submission.customer_email,
      game_title_or_description: submission.game_title_or_description,
      platform: submission.platform,
      condition: submission.condition,
      completeness: submission.completeness,
      quantity: submission.quantity,
      preferred_payout: submission.preferred_payout,
      notes: submission.notes,
      photo_urls: JSON.stringify(submission.photo_urls), // your DB column is text
      status: submission.status,

      // Phase 2 fields
      pricecharting_snapshot: freshResult || null,
      pricing_source: pricingSource,
      inventory_class: inventoryClass,
      offer_type: offerType,
      market_value: marketValue,
      unit_value: unitValue,
      cash_amount: cashAmount,
      credit_amount: creditAmount,
      cash_low: cashLow,
      cash_high: cashHigh,
      credit_low: creditLow,
      credit_high: creditHigh,
      manual_review_reason: manualReviewReason,
      external_id: externalId || null,

      // New snapshot fields for exact selected game
      snapshot_title: freshResult ? (freshResult['product-name'] || null) : null,
      snapshot_console: freshResult ? (freshResult['console-name'] || null) : null,
      snapshot_loose_price: freshResult ? centsToDollars(freshResult['loose-price']) : null,
      snapshot_cib_price: freshResult ? centsToDollars(freshResult['cib-price']) : null,
      snapshot_new_price: freshResult ? centsToDollars(freshResult['new-price']) : null,
    };

    const { data, error } = await supabase
      .from('submissions')
      .insert(insertPayload)
      .select('id')
      .single();

    if (error) {
      console.error('Supabase insert error:', error);
      return jsonResponse(500, {
        error: 'Failed to save submission',
        details: error.message,
      });
    }

    const submissionId = data.id;

    // ------------------------------------------------------------
    // Return response to frontend
    // ------------------------------------------------------------
    const responseBody = {
      success: true,
      submission_id: submissionId,
      offer_type: offerType,
      inventory_class: inventoryClass,
      market_value: marketValue,
      unit_value: unitValue,
      pricing_source: pricingSource,
      manual_review_reason: manualReviewReason,
    };

    if (offerType === 'instant_offer') {
      responseBody.cash_amount = cashAmount;
      responseBody.credit_amount = creditAmount;
    }

    if (offerType === 'instant_range') {
      responseBody.cash_amount = cashAmount;
      responseBody.credit_amount = creditAmount;
      responseBody.cash_low = cashLow;
      responseBody.cash_high = cashHigh;
      responseBody.credit_low = creditLow;
      responseBody.credit_high = creditHigh;
    }

    console.log('Pricing source used:', pricingSource);

    return jsonResponse(200, responseBody);
  } catch (error) {
    console.error('submit-offer function failed:', error);
    return jsonResponse(500, {
      error: 'Submission failed – try again later',
      details: error.message,
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
    body: JSON.stringify(payload),
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

function chooseBestProductMatch(products, title, platform) {
  if (!Array.isArray(products) || products.length === 0) return null;

  const normalizedTitle = normalizeString(title);
  const normalizedPlatform = normalizeString(platform);

  const scored = products.map((product) => {
    const productName = normalizeString(
      product['product-name'] || product.product_name || ''
    );
    const consoleName = normalizeString(
      product.console_name || product.console || ''
    );

    let score = 0;

    if (normalizedTitle && productName.includes(normalizedTitle)) score += 10;

    if (normalizedTitle) {
      const titleWords = normalizedTitle.split(/\s+/).filter(Boolean);
      for (const word of titleWords) {
        if (word.length >= 3 && productName.includes(word)) score += 2;
      }
    }

    if (normalizedPlatform && consoleName.includes(normalizedPlatform)) score += 8;

    return { product, score };
  });

  scored.sort((a, b) => b.score - a.score);
  return scored[0].product;
}

function getBestUnitValue(freshResult, condition, completeness) {
  const normalizedCondition = normalizeString(condition);
  const normalizedCompleteness = normalizeString(completeness);

  const loosePrice = centsToDollars(freshResult['loose-price']);
  const cibPrice = centsToDollars(freshResult['cib-price']);
  const newPrice = centsToDollars(freshResult['new-price']);
  const gradedPrice = centsToDollars(freshResult['graded-price']);

  // Strong condition matching
  if (normalizedCondition.includes('graded')) {
    return gradedPrice || newPrice || 0;
  }

  if (
    normalizedCondition.includes('sealed') ||
    normalizedCondition.includes('new')
  ) {
    return newPrice || gradedPrice || 0;
  }

  if (
    normalizedCondition.includes('cib') ||
    normalizedCondition.includes('complete')
  ) {
    return cibPrice || loosePrice || 0;
  }

  if (
    normalizedCondition.includes('loose') ||
    normalizedCondition.includes('disc only') ||
    normalizedCondition.includes('cart only')
  ) {
    return loosePrice || cibPrice || 0;
  }

  // Fallback to completeness
  if (
    normalizedCompleteness.includes('complete') ||
    normalizedCompleteness.includes('cib')
  ) {
    return cibPrice || loosePrice || 0;
  }

  if (normalizedCompleteness.includes('loose')) {
    return loosePrice || cibPrice || 0;
  }

  if (
    normalizedCompleteness.includes('sealed') ||
    normalizedCompleteness.includes('new')
  ) {
    return newPrice || gradedPrice || 0;
  }

  // Final fallback order
  return loosePrice || cibPrice || newPrice || gradedPrice || 0;
}

function getManualReviewReason(submission, marketValue) {
  const lowerCondition = normalizeString(submission.condition);
  const lowerCompleteness = normalizeString(submission.completeness);
  const lowerNotes = normalizeString(submission.notes);
  const lowerPlatform = normalizeString(submission.platform);

  if (!submission.game_title_or_description || submission.game_title_or_description.trim() === '') {
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

  if (submission.quantity >= 5) {
    return 'Quantity >= 5';
  }

  if (marketValue >= 250) {
    return 'Market value >= $250';
  }

  const seriousKeywords = [
    'not working', 'broken', 'cracked', 'water damage',
    'missing pieces', 'missing manual', 'missing inserts',
    'heavy scratches', 'wont read', "won't read",
    'untested', 'repro', 'reproduction', 'fake', 'counterfeit', 'disc rot'
  ];

  for (const keyword of seriousKeywords) {
    if (lowerNotes.includes(keyword)) {
      return `Suspicious notes: ${keyword}`;
    }
  }

  return null;
}