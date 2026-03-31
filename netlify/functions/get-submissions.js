const { createClient } = require('@supabase/supabase-js');

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

exports.handler = async function () {
  try {
    const { data, error } = await supabase
      .from('submissions')
      .select(`
        id,
        submitted_at,
        customer_email,
        game_title_or_description,
        platform,
        condition,
        completeness,
        quantity,
        preferred_payout,
        notes,
        photo_urls,
        inventory_class,
        offer_type,
        cash_amount,
        credit_amount,
        status,
        assigned_staff,
        internal_notes,
        submission_id,
        manual_review_reason,
        external_id,
        market_value,
        unit_value,
        pricing_source,
        cash_low,
        cash_high,
        credit_low,
        credit_high
      `)
      .order('submitted_at', { ascending: false });

    if (error) {
      console.error('Supabase fetch error:', error);
      return {
        statusCode: 500,
        body: JSON.stringify({ error: 'Failed to fetch submissions.' })
      };
    }

    return {
      statusCode: 200,
      body: JSON.stringify({ submissions: data || [] })
    };
  } catch (error) {
    console.error('Function error:', error);
    return {
      statusCode: 500,
      body: JSON.stringify({ error: 'Server error loading submissions.' })
    };
  }
};