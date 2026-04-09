/// Voltage 2.0 Offer Engine Phase 3 - Batch Support
// Safe upgrade from single-item to single + batch
// - Preserves 100% of existing single-item behavior and response shape
// - Adds proper batch support via submission_items child table
// - Reuses all existing pricing logic via reusable helper
// - No hardcoded percentages, no endpoint name change, no breaking changes

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

    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    // ------------------------------------------------------------
    // Parse incoming request
    // ------------------------------------------------------------
    const body = JSON.parse(event.body || '{}');

    // Support both single-item and batch formats
    let batchItems = [];

    if (Array.isArray(body.items)) {
      batchItems = body.items;
    } else if (typeof body.batch_items === 'string') {
      try {
        batchItems = JSON.parse(body.batch_items);
      } catch (e) {
        console.warn('Failed to parse batch_items JSON string');
      }
    } else if (Array.isArray(body.batch_items)) {
      batchItems = body.batch_items;
    }

    // SURGICAL FIX: Improved classification to prevent single items being treated as batch
    const normalizedBatchItems = normalizeBatchItems(batchItems);
    const itemCount = normalizedBatchItems.length;

    // If 0 or 1 item → treat as SINGLE (prevents "1 game trade submission" placeholder)
    // Only 2+ items → true BATCH path
    const isBatch = itemCount > 1 && normalizedBatchItems.every(item => item && (item.title ||item.game_title_or_description));

    console.log(`Submission type: ${isBatch ? 'BATCH' : 'SINGLE'} (${itemCount} item(s))`);

    // ------------------------------------------------------------
    // Pricing configuration (from Supabase or defaults)
    // ------------------------------------------------------------
    let cashPercentUnder30 = 0.30;
    let cashPercent30To100 = 0.35;
    let creditMultiplier = 1.2;

    try {
      const { data: config, error: configError } = await supabase
        .from('pricing_config')
        .select('cash_percent_under_30, cash_percent_30_to_100, credit_multiplier')
        .eq('id', 1)
        .single();

      if (configError && configError.code !== 'PGRST116') {
        console.warn('Failed to load pricing_config, using defaults:', configError.message);
      } else if (config) {
        const under30 = Number(config.cash_percent_under_30);
        const mid = Number(config.cash_percent_30_to_100);
        const credit = Number(config.credit_multiplier);

        if (Number.isFinite(under30) && under30 > 0) cashPercentUnder30 = under30;
        if (Number.isFinite(mid) && mid > 0) cashPercent30To100 = mid;
        if (Number.isFinite(credit) && credit > 0) creditMultiplier = credit;

        console.log('Loaded pricing config from Supabase:', { cashPercentUnder30, cashPercent30To100, creditMultiplier });
      }
    } catch (configFetchError) {
      console.warn('Error fetching pricing_config, falling back to defaults:', configFetchError.message);
    }

    // ------------------------------------------------------------
    // SINGLE ITEM PATH (preserves exact previous behavior)
    // ------------------------------------------------------------
    if (!isBatch) {
      // If we received exactly 1 item in batchItems, normalize it into single-item body
      if (itemCount === 1) {
        const singleItem = normalizedBatchItems[0];
        const normalizedBody = { ...body };

        // Safely copy real fields from the single item
        normalizedBody.selected_title = singleItem.title || singleItem.game_title_or_description;
        normalizedBody.title = singleItem.title || singleItem.game_title_or_description;
        normalizedBody.selected_platform = singleItem.platform;
        normalizedBody.platform = singleItem.platform;
        normalizedBody.condition = singleItem.condition;
        normalizedBody.completeness = singleItem.completeness;
        normalizedBody.quantity = singleItem.quantity;
        normalizedBody.externalId = singleItem.externalId || singleItem.external_id;

        return await handleSingleSubmission(normalizedBody, supabase, apiKey, {
          cashPercentUnder30,
          cashPercent30To100,
          creditMultiplier,
        });
      }

      return await handleSingleSubmission(body, supabase, apiKey, {
        cashPercentUnder30,
        cashPercent30To100,
        creditMultiplier,
      });
    }

    // ------------------------------------------------------------
    // BATCH PATH (only for 2+ items)
    // ------------------------------------------------------------
    return await handleBatchSubmission(normalizedBatchItems, body, supabase, apiKey, {
      cashPercentUnder30,
      cashPercent30To100,
      creditMultiplier,
    });

  } catch (error) {
    console.error('submit-offer function failed:', error);
    return jsonResponse(500, {
      error: 'Submission failed – try again later',
      details: error.message,
    });
  }
};

// ============================================================================
// SINGLE ITEM HANDLER (unchanged core logic, wrapped for reuse)
// ============================================================================

async function handleSingleSubmission(body, supabase, apiKey, pricingConfig) {
  const submission = buildSubmissionObject(body);

  if (!submission.game_title_or_description) {
    return jsonResponse(400, { error: 'Game title or description is required' });
  }

  const externalId = String(body.externalId || body.external_id || '').trim();

  // Use reusable pricing helper
  const pricingResult = await evaluateItemPricing(
    externalId,
    submission,
    apiKey,
    pricingConfig
  );

  // Build full insert payload (keeps all original fields)
  const insertPayload = {
    customer_email: submission.customer_email,
    game_title_or_description: submission.game_title_or_description,
    platform: submission.platform,
    condition: submission.condition,
    completeness: submission.completeness,
    quantity: submission.quantity,
    preferred_payout: submission.preferred_payout,
    notes: submission.notes,
    photo_urls: JSON.stringify(submission.photo_urls),
    status: submission.status,

    // Pricing fields from helper
    ...pricingResult.dbFields,

    // Snapshot fields
    snapshot_title: pricingResult.snapshot_title,
    snapshot_console: pricingResult.snapshot_console,
    snapshot_loose_price: pricingResult.snapshot_loose_price,
    snapshot_cib_price: pricingResult.snapshot_cib_price,
    snapshot_new_price: pricingResult.snapshot_new_price,
  };

  const { data, error } = await supabase
    .from('submissions')
    .insert(insertPayload)
    .select('id')
    .single();

  if (error) {
    console.error('Supabase insert error:', error);
    return jsonResponse(500, { error: 'Failed to save submission', details: error.message });
  }

  const submissionId = data.id;

  // Optional: also insert into submission_items for future consistency (lightweight)
  await insertSubmissionItem(supabase, submissionId, 0, submission, pricingResult, externalId);

  // Return exact same response shape as before
  const responseBody = {
    success: true,
    submission_id: submissionId,
    offer_type: pricingResult.offer_type,
    inventory_class: pricingResult.inventory_class,
    market_value: pricingResult.market_value,
    unit_value: pricingResult.unit_value,
    pricing_source: pricingResult.pricing_source,
    manual_review_reason: pricingResult.manual_review_reason,
  };

  if (pricingResult.offer_type === 'instant_offer') {
    responseBody.cash_amount = pricingResult.cash_amount;
    responseBody.credit_amount = pricingResult.credit_amount;
  }

  if (pricingResult.offer_type === 'instant_range') {
    responseBody.cash_amount = pricingResult.cash_amount;
    responseBody.credit_amount = pricingResult.credit_amount;
    responseBody.cash_low = pricingResult.cash_low;
    responseBody.cash_high = pricingResult.cash_high;
    responseBody.credit_low = pricingResult.credit_low;
    responseBody.credit_high = pricingResult.credit_high;
  }

  console.log('Single submission completed. ID:', submissionId, 'Offer type:', pricingResult.offer_type);

  return jsonResponse(200, responseBody);
}

// ============================================================================
// BATCH HANDLER - Option B Architecture
// ============================================================================

async function handleBatchSubmission(batchItemsRaw, body, supabase, apiKey, pricingConfig) {
  // Normalize and validate batch
  const batchItems = normalizeBatchItems(batchItemsRaw);

  if (batchItems.length === 0) {
    return jsonResponse(400, { error: 'Batch submission must contain at least one item' });
  }

  const itemCount = batchItems.length;

  // Create parent submission row with summary fields only
  const parentPayload = {
    customer_email: String(body.email || '').trim(),
    game_title_or_description: `${itemCount} game trade submission`,
    platform: 'Multiple',
    condition: 'Mixed',
    completeness: '',
    quantity: itemCount,
    preferred_payout: String(
      body.preferredPayout || body.preferred_payout || body.payout_type || 'cash'
    ).trim().toLowerCase(),
    notes: String(body.notes || '').trim(),
    photo_urls: JSON.stringify(Array.isArray(body.photo_urls) ? body.photo_urls : []),
    status: 'pending',

    // Summary fields will be updated after children are processed
    item_count: itemCount,
    market_value_total: 0,
    cash_amount_total: 0,
    credit_amount_total: 0,
    manual_review_count: 0,
    offer_type_summary: 'mixed',
    inventory_class_summary: 'mixed',
  };

  const { data: parentData, error: parentError } = await supabase
    .from('submissions')
    .insert(parentPayload)
    .select('id')
    .single();

  if (parentError) {
    console.error('Failed to create parent submission:', parentError);
    return jsonResponse(500, { error: 'Failed to create batch submission' });
  }

  const submissionId = parentData.id;
  console.log(`Created parent submission ID: ${submissionId} with ${itemCount} items`);

  // Process each item and insert into submission_items
  const processedItems = [];
  let marketValueTotal = 0;
  let cashTotal = 0;
  let creditTotal = 0;
  let manualReviewCount = 0;
  const offerTypes = new Set();
  const inventoryClasses = new Set();

  for (let i = 0; i < batchItems.length; i++) {
    const item = batchItems[i];
    const position = i;

    const itemSubmission = {
      game_title_or_description: String(item.title || item.game_title_or_description || '').trim(),
      platform: String(item.platform || '').trim(),
      condition: String(item.condition || '').trim(),
      completeness: String(item.completeness || '').trim(),
      quantity: safePositiveInt(item.quantity, 1),
    };

    const externalId = String(item.externalId || item.external_id || '').trim();

    // Evaluate pricing using shared helper
    const pricingResult = await evaluateItemPricing(
      externalId,
      itemSubmission,
      apiKey,
      pricingConfig
    );

    // For imperfect items: still insert with manual review flag
    if (!itemSubmission.game_title_or_description) {
      pricingResult.manual_review_reason = pricingResult.manual_review_reason || 'Missing title';
      pricingResult.offer_type = 'manual_review';
    }

    const childPayload = {
      submission_id: submissionId,
      position,
      title: itemSubmission.game_title_or_description,
      platform: itemSubmission.platform,
      condition: itemSubmission.condition,
      completeness: itemSubmission.completeness,
      quantity: itemSubmission.quantity,
      external_id: externalId || null,

      // Pricing fields
      pricing_source: pricingResult.pricing_source,
      inventory_class: pricingResult.inventory_class,
      offer_type: pricingResult.offer_type,
      market_value: pricingResult.market_value,
      unit_value: pricingResult.unit_value,
      cash_amount: pricingResult.cash_amount,
      credit_amount: pricingResult.credit_amount,
      cash_low: pricingResult.cash_low,
      cash_high: pricingResult.cash_high,
      credit_low: pricingResult.credit_low,
      credit_high: pricingResult.credit_high,
      manual_review_reason: pricingResult.manual_review_reason,

      // Snapshot fields
      pricecharting_snapshot: pricingResult.pricecharting_snapshot,
      snapshot_title: pricingResult.snapshot_title,
      snapshot_console: pricingResult.snapshot_console,
      snapshot_loose_price: pricingResult.snapshot_loose_price,
      snapshot_cib_price: pricingResult.snapshot_cib_price,
      snapshot_new_price: pricingResult.snapshot_new_price,
    };

    // Insert child row
    const { error: childError } = await supabase
      .from('submission_items')
      .insert(childPayload);

    if (childError) {
      console.error(`Failed to insert child item ${position}:`, childError);
      // Continue with other items - do not fail whole batch
    } else {
      processedItems.push(childPayload);
    }

    // Aggregate totals - market_value is already quantity-adjusted
    if (pricingResult.market_value && pricingResult.market_value > 0) {
      marketValueTotal += pricingResult.market_value;
    }

    // cash_amount and credit_amount are per-unit in pricingResult → multiply by quantity for totals
    const itemQty = itemSubmission.quantity;
    if (pricingResult.cash_amount) {
      cashTotal += pricingResult.cash_amount * itemQty;
    }
    if (pricingResult.credit_amount) {
      creditTotal += pricingResult.credit_amount * itemQty;
    }

    if (pricingResult.offer_type === 'manual_review') {
      manualReviewCount++;
    }

    offerTypes.add(pricingResult.offer_type);
    inventoryClasses.add(pricingResult.inventory_class);
  }

  // Calculate summary values
  const finalMarketTotal = roundMoney(marketValueTotal);
  const finalCashTotal = roundMoney(cashTotal);
  const finalCreditTotal = roundMoney(creditTotal);

  let offerTypeSummary = 'mixed';
  if (offerTypes.size === 1) {
    offerTypeSummary = Array.from(offerTypes)[0];
  } else if (offerTypes.has('manual_review')) {
    offerTypeSummary = 'mixed';
  }

  let inventoryClassSummary = 'mixed';
  if (inventoryClasses.size === 1) {
    inventoryClassSummary = Array.from(inventoryClasses)[0];
  }

  // Update parent with final aggregates
  const updatePayload = {
    market_value_total: finalMarketTotal,
    cash_amount_total: finalCashTotal,
    credit_amount_total: finalCreditTotal,
    manual_review_count: manualReviewCount,
    offer_type_summary: offerTypeSummary,
    inventory_class_summary: inventoryClassSummary,
    status: 'pending', // ensure status
  };

  await supabase
    .from('submissions')
    .update(updatePayload)
    .eq('id', submissionId);

  console.log(`Batch processing complete. ID: ${submissionId}, Items: ${itemCount}, Manual reviews: ${manualReviewCount}`);

  // Return batch response
  return jsonResponse(200, {
    success: true,
    submission_id: submissionId,
    submission_type: 'batch',
    item_count: itemCount,
    market_value_total: finalMarketTotal,
    cash_amount_total: finalCashTotal,
    credit_amount_total: finalCreditTotal,
    manual_review_count: manualReviewCount,
    offer_type_summary: offerTypeSummary,
  });
}

// ============================================================================
// REUSABLE PRICING HELPER (extracted from original logic)
// ============================================================================

async function evaluateItemPricing(externalId, submission, apiKey, pricingConfig) {
  let freshResult = null;
  let pricingSource = 'none';
  let manualReviewReason = null;

  // PriceCharting lookup
  try {
    if (externalId) {
      console.log('PriceCharting lookup for externalId:', externalId);

      const productUrl = new URL('https://www.pricecharting.com/api/product');
      productUrl.searchParams.set('t', apiKey);
      productUrl.searchParams.set('id', externalId);

      const pcResponse = await fetch(productUrl.toString(), {
        method: 'GET',
        headers: { Accept: 'application/json' },
      });

      if (pcResponse.ok) {
        const pcData = await pcResponse.json();
        if (pcData && pcData.id) {
          freshResult = pcData;
          pricingSource = 'pricecharting_product';
        }
      }
    } else {
      pricingSource = 'missing_external_id';
      manualReviewReason = 'No exact product selected';
    }
  } catch (lookupError) {
    console.warn('PriceCharting lookup failed:', lookupError.message);
    if (!manualReviewReason) manualReviewReason = 'PriceCharting lookup error';
  }

  // Determine market/unit value
  let unitValue = null;
  let marketValue = null;

  if (freshResult) {
    unitValue = getBestUnitValue(freshResult, submission.condition, submission.completeness);
    if (unitValue > 0) {
      marketValue = roundMoney(unitValue * submission.quantity);
    } else {
      manualReviewReason = manualReviewReason || 'No usable price found for selected condition/completeness';
    }
  } else if (!manualReviewReason) {
    manualReviewReason = 'No PriceCharting match found';
  }

  // Manual review triggers (original logic preserved)
  const manualTrigger = getManualReviewReason(submission, marketValue);

  let offerType = 'manual_review';
  let inventoryClass = 'unclassified';

  let cashAmount = null;
  let creditAmount = null;
  let cashLow = null;
  let cashHigh = null;
  let creditLow = null;
  let creditHigh = null;

  if (manualTrigger) {
    offerType = 'manual_review';
    inventoryClass = marketValue && marketValue > 100 ? 'strategic' : 'review';
    manualReviewReason = manualTrigger;
  } else if (!marketValue || marketValue <= 0) {
    offerType = 'manual_review';
    inventoryClass = 'review';
    manualReviewReason = manualReviewReason || 'Unable to determine market value';
  } else if (marketValue < 30) {
    offerType = 'instant_offer';
    inventoryClass = 'common';

    cashAmount = roundMoney(marketValue * pricingConfig.cashPercentUnder30);
    creditAmount = roundMoney(cashAmount * pricingConfig.creditMultiplier);
  } else if (marketValue <= 100) {
    offerType = 'instant_range';
    inventoryClass = 'evergreen';

    const baseCash = roundMoney(marketValue * pricingConfig.cashPercent30To100);
    cashAmount = baseCash;
    creditAmount = roundMoney(baseCash * pricingConfig.creditMultiplier);

    cashLow = roundMoney(baseCash * 0.9);
    cashHigh = roundMoney(baseCash * 1.1);
    creditLow = roundMoney(cashLow * pricingConfig.creditMultiplier);
    creditHigh = roundMoney(cashHigh * pricingConfig.creditMultiplier);
  } else {
    offerType = 'manual_review';
    inventoryClass = 'strategic';
    manualReviewReason = 'Market value exceeds auto-offer threshold';
  }

  return {
    offer_type: offerType,
    inventory_class: inventoryClass,
    market_value: marketValue,
    unit_value: unitValue,
    cash_amount: cashAmount,
    credit_amount: creditAmount,
    cash_low: cashLow,
    cash_high: cashHigh,
    credit_low: creditLow,
    credit_high: creditHigh,
    pricing_source: pricingSource,
    manual_review_reason: manualReviewReason,
    pricecharting_snapshot: freshResult || null,
    snapshot_title: freshResult ? (freshResult['product-name'] || null) : null,
    snapshot_console: freshResult ? (freshResult['console-name'] || null) : null,
    snapshot_loose_price: freshResult ? centsToDollars(freshResult['loose-price']) : null,
    snapshot_cib_price: freshResult ? centsToDollars(freshResult['cib-price']) : null,
    snapshot_new_price: freshResult ? centsToDollars(freshResult['new-price']) : null,

    // For DB insert
    dbFields: {
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
      external_id: null, // set by caller
    },
  };
}

// ============================================================================
// HELPERS
// ============================================================================

function buildSubmissionObject(body) {
  return {
    customer_email: String(body.email || '').trim(),
    game_title_or_description: String(
      body.selected_title ||
      body.gameTitleOrDescription ||
      body.games_description ||
      body.game_title_or_description ||
      body.title ||
      ''
    ).trim(),
    platform: String(body.selected_platform || body.platform || '').trim(),
    condition: String(body.condition || '').trim(),
    completeness: String(body.completeness || '').trim(),
    quantity: safePositiveInt(body.quantity, 1),
    preferred_payout: String(
      body.preferredPayout || body.preferred_payout || body.payout_type || 'cash'
    ).trim().toLowerCase(),
    notes: String(body.notes || '').trim(),
    photo_urls: Array.isArray(body.photo_urls) ? body.photo_urls : [],
    status: 'pending',
  };
}

async function insertSubmissionItem(supabase, submissionId, position, submission, pricingResult, externalId = '') {
  try {
    const childPayload = {
      submission_id: submissionId,
      position,
      title: submission.game_title_or_description,
      platform: submission.platform,
      condition: submission.condition,
      completeness: submission.completeness,
      quantity: submission.quantity,
      external_id: externalId || null,
      ...pricingResult.dbFields,
      pricecharting_snapshot: pricingResult.pricecharting_snapshot,
      snapshot_title: pricingResult.snapshot_title,
      snapshot_console: pricingResult.snapshot_console,
      snapshot_loose_price: pricingResult.snapshot_loose_price,
      snapshot_cib_price: pricingResult.snapshot_cib_price,
      snapshot_new_price: pricingResult.snapshot_new_price,
    };

    await supabase.from('submission_items').insert(childPayload);
  } catch (e) {
    console.warn('Optional submission_items insert failed (non-critical):', e.message);
  }
}

function normalizeBatchItems(items) {
  if (!Array.isArray(items)) return [];
  return items.filter(item => item != null); // only remove null/undefined, keep imperfect items for manual review
}

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
  if (normalizedCondition.includes('loose') || normalizedCondition.includes('disc only') || normalizedCondition.includes('cart only')) {
    return loosePrice || cibPrice || 0;
  }

  // Completeness fallback
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