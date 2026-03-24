// netlify/functions/submit-offer.js
// Voltage 2.0 Offer Engine MVP
// Receives form submission → looks up PriceCharting → classifies offer → saves to Supabase

exports.handler = async (event) => {
  try {
    // Only allow POST
    if (event.httpMethod !== 'POST') {
      return {
        statusCode: 405,
        body: JSON.stringify({ error: 'Method not allowed' }),
      };
    }

    // Read secrets from Netlify environment variables
    const apiKey = process.env.PRICECHARTING_API_KEY;
    const supabaseUrl = process.env.SUPABASE_URL;
    const supabaseServiceKey = process.env.SUPABASE_SERVICE_KEY;

    if (!apiKey || !supabaseUrl || !supabaseServiceKey) {
      console.error('Missing required environment variables');
      return {
        statusCode: 500,
        body: JSON.stringify({ error: 'Server configuration error' }),
      };
    }

    // Parse incoming form data
    const body = JSON.parse(event.body || '{}');

    const submission = {
      customer_email: body.email || '',
      game_title_or_description: body.gameTitleOrDescription || body.title || '',
      platform: body.platform || '',
      condition: body.condition || '',
      completeness: body.completeness || '',
      quantity: parseInt(body.quantity) || 1,
      preferred_payout: body.preferredPayout || 'cash',
      notes: body.notes || '',
      photo_urls: [], // placeholder for future photo support
      status: 'pending',
    };

    // ----------------------------------------------------------------
    // PriceCharting lookup (reuses same pattern as vault-search.js)
    // ----------------------------------------------------------------
    let freshResult = null;
    let marketValue = 0;

    const externalId = (body.externalId || '').trim();

    try {
      let pcResponse;

      if (externalId) {
        // Prefer direct lookup by externalId (most accurate for refresh flow)
        const productUrl = new URL('https://www.pricecharting.com/api/product');
        productUrl.searchParams.set('t', apiKey);
        productUrl.searchParams.set('id', externalId);

        pcResponse = await fetch(productUrl.toString(), {
          method: 'GET',
          headers: { Accept: 'application/json' },
        });
      } else {
        // Fallback to search (your existing behavior)
        const fullQuery = submission.platform 
          ? `${submission.game_title_or_description} ${submission.platform}` 
          : submission.game_title_or_description;

        const searchUrl = new URL('https://www.pricecharting.com/api/products');
        searchUrl.searchParams.set('t', apiKey);
        searchUrl.searchParams.set('q', fullQuery);

        pcResponse = await fetch(searchUrl.toString(), {
          method: 'GET',
          headers: { Accept: 'application/json' },
        });
      }

      if (pcResponse.ok) {
        const pcData = await pcResponse.json();
        if (pcData.products && pcData.products.length > 0) {
          freshResult = pcData.products[0]; // best match
        } else if (pcData.id) {
          freshResult = pcData; // single product response
        }
      }
    } catch (lookupError) {
      console.warn('PriceCharting lookup failed:', lookupError.message);
      // Safe fallback: continue with manual_review
    }

    // ----------------------------------------------------------------
    // MVP Offer Engine logic (constants at top for easy future changes)
    // ----------------------------------------------------------------
    const CASH_PERCENT_UNDER_30 = 0.30;
    const CASH_PERCENT_30_TO_100 = 0.35;
    const CREDIT_MULTIPLIER = 1.2;

    let offerType = 'manual_review';
    let inventoryClass = 'unclassified';
    let cashAmount = null;
    let creditAmount = null;

    if (freshResult) {
      // Get live unit value based on condition
      let liveUnitValue = 0;
      if (submission.condition === 'Loose') liveUnitValue = freshResult['loose-price'] || 0;
      else if (submission.condition === 'Complete in Box (CIB)' || submission.condition === 'CIB') liveUnitValue = freshResult['cib-price'] || 0;
      else if (submission.condition === 'Sealed' || submission.condition === 'New') liveUnitValue = freshResult['new-price'] || 0;
      else if (submission.condition === 'Graded') liveUnitValue = freshResult['graded-price'] || freshResult['new-price'] || 0;

      // Convert from cents to dollars (PriceCharting stores prices in cents)
      liveUnitValue = liveUnitValue ? liveUnitValue / 100 : 0;
      const liveTotalValue = liveUnitValue * submission.quantity;

      const marketValueEstimate = liveTotalValue;

      // Classify and calculate offer
      if (marketValueEstimate < 30) {
        offerType = 'instant_offer';
        inventoryClass = 'common';
        cashAmount = Math.round(marketValueEstimate * CASH_PERCENT_UNDER_30);
        creditAmount = Math.round(cashAmount * CREDIT_MULTIPLIER);
      } else if (marketValueEstimate <= 100) {
        offerType = 'instant_range';
        inventoryClass = 'evergreen';
        cashAmount = Math.round(marketValueEstimate * CASH_PERCENT_30_TO_100);
        creditAmount = Math.round(cashAmount * CREDIT_MULTIPLIER);
      } else {
        offerType = 'manual_review';
        inventoryClass = 'strategic';
      }

      // Additional manual review triggers
      const lowerCondition = (submission.condition || '').toLowerCase();
      const lowerNotes = (submission.notes || '').toLowerCase();
      if (
        submission.preferred_payout === 'hybrid' ||
        lowerCondition.includes('sealed') ||
        lowerCondition.includes('graded') ||
        lowerCondition.includes('mint') ||
        submission.platform === 'Other' ||
        submission.quantity > 5 ||
        lowerNotes.length > 20
      ) {
        offerType = 'manual_review';
        inventoryClass = 'strategic';
        cashAmount = null;
        creditAmount = null;
      }
    }

    // ----------------------------------------------------------------
    // Save to Supabase (existing flow preserved + new fields added)
    // ----------------------------------------------------------------
    const supabase = require('@supabase/supabase-js').createClient(supabaseUrl, supabaseServiceKey);

    const { data, error } = await supabase
      .from('submissions')
      .insert({
        customer_email: submission.customer_email,
        game_title_or_description: submission.game_title_or_description,
        platform: submission.platform,
        condition: submission.condition,
        completeness: submission.completeness,
        quantity: submission.quantity,
        preferred_payout: submission.preferred_payout,
        notes: submission.notes,
        photo_urls: submission.photo_urls,
        status: 'pending',
        pricecharting_snapshot: freshResult || null,
        inventory_class: inventoryClass,
        offer_type: offerType,
        cash_amount: cashAmount,
        credit_amount: creditAmount,
      })
      .select('id')
      .single();

    if (error) {
      console.error('Supabase insert error:', error);
      return {
        statusCode: 500,
        body: JSON.stringify({ error: 'Failed to save submission' }),
      };
    }

    const submissionId = data.id;

    // ----------------------------------------------------------------
    // Return response to frontend (exact format you requested)
    // ----------------------------------------------------------------
    let responseBody = {
      success: true,
      submission_id: submissionId,
      offer_type: offerType,
    };

    if (offerType === 'instant_offer') {
      responseBody.market_value = cashAmount / CASH_PERCENT_UNDER_30 || 0; // approximate
      responseBody.cash_amount = cashAmount;
      responseBody.credit_amount = creditAmount;
    } else if (offerType === 'instant_range') {
      const low = Math.round(cashAmount * 0.9);
      const high = Math.round(cashAmount * 1.1);
      responseBody.market_value = cashAmount / CASH_PERCENT_30_TO_100 || 0;
      responseBody.cash_low = low;
      responseBody.cash_high = high;
      responseBody.credit_low = Math.round(low * CREDIT_MULTIPLIER);
      responseBody.credit_high = Math.round(high * CREDIT_MULTIPLIER);
    } else {
      // manual_review
      responseBody.market_value = null;
    }

    return {
      statusCode: 200,
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(responseBody),
    };

  } catch (error) {
    console.error('submit-offer function failed:', error);
    return {
      statusCode: 500,
      body: JSON.stringify({ error: 'Submission failed – try again later' }),
    };
  }
};