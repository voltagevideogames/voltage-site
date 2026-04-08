// netlify/functions/get-submission-items.js
// Returns child items for a batch submission

const { createClient } = require('@supabase/supabase-js');

exports.handler = async (event) => {
  // Only allow GET
  if (event.httpMethod !== 'GET') {
    return jsonResponse(405, { error: 'Method not allowed' });
  }

  // Environment variables
  const supabaseUrl = process.env.SUPABASE_URL;
  const supabaseServiceKey = process.env.SUPABASE_SERVICE_KEY;

  if (!supabaseUrl || !supabaseServiceKey) {
    console.error('Missing Supabase environment variables');
    return jsonResponse(500, { error: 'Server configuration error' });
  }

  const supabase = createClient(supabaseUrl, supabaseServiceKey);

  // Get and validate submission id
  const idParam = event.queryStringParameters?.id || '';
  const submissionId = safePositiveInt(idParam, null);
if (!submissionId) {
    return jsonResponse(400, { error: 'Valid submission id is required' });
  }

  try {
    const { data, error } = await supabase
      .from('submission_items')
      .select(`
        id,
        submission_id,
        position,
        title,
        platform,
        condition,
        completeness,
        quantity,
        external_id,
        pricing_source,
        inventory_class,
        offer_type,
        market_value,
        unit_value,
        cash_amount,
        credit_amount,
        cash_low,
        cash_high,
        credit_low,
        credit_high,
        manual_review_reason,
        pricecharting_snapshot,
        snapshot_title,
        snapshot_console,
        snapshot_loose_price,
        snapshot_cib_price,
        snapshot_new_price,
        created_at
      `)
      .eq('submission_id', submissionId)
      .order('position', { ascending: true });

    if (error) {
      console.error('Supabase query error:', error);
      return jsonResponse(500, { error: 'Failed to fetch submission items' });
    }

    return jsonResponse(200, {
      success: true,
      submission_id: submissionId,
      items: data || []
    });

  } catch (err) {
    console.error('get-submission-items failed:', err);
    return jsonResponse(500, { error: 'Internal server error' });
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

function safePositiveInt(value, fallback = 0) {
  const parsed = parseInt(value, 10);
  if (Number.isNaN(parsed) || parsed < 1) return fallback;
  return parsed;
}