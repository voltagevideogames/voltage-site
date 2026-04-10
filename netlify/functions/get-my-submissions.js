const { createClient } = require('@supabase/supabase-js');

exports.handler = async (event) => {
  if (event.httpMethod !== 'GET') {
    return {
      statusCode: 405,
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ error: 'Method not allowed' }),
    };
  }

  try {
    const supabaseUrl = process.env.SUPABASE_URL;
    const supabaseServiceKey = process.env.SUPABASE_SERVICE_KEY;

    if (!supabaseUrl || !supabaseServiceKey) {
      return {
        statusCode: 500,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ error: 'Server configuration error' }),
      };
    }

    const authHeader = event.headers.authorization || event.headers.Authorization || '';
    if (!authHeader.startsWith('Bearer ')) {
      return {
        statusCode: 401,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ error: 'Unauthorized - no valid token' }),
      };
    }

    const token = authHeader.replace('Bearer ', '').trim();

    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    const {
      data: { user },
      error: authError,
    } = await supabase.auth.getUser(token);

    if (authError || !user || !user.email) {
      return {
        statusCode: 401,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ error: 'Unauthorized - invalid session' }),
      };
    }

    const { data, error: dbError } = await supabase
      .from('submissions')
      .select(`
        id,
        submitted_at,
        status,
        photos_requested,
        preferred_payout,
        notes,
        photo_urls,
        submission_type,
        item_count,
        game_title_or_description,
        platform,
        market_value,
        market_value_total,
        cash_amount,
        cash_amount_total,
        credit_amount,
        credit_amount_total,
        final_cash_offer,
        final_credit_offer,
        offer_type,
        offer_type_summary
      `)
      .eq('customer_email', user.email)
      .order('submitted_at', { ascending: false });

    if (dbError) {
      console.error('Submissions query error:', dbError);
      return {
        statusCode: 500,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ error: 'Database error' }),
      };
    }

    return {
      statusCode: 200,
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        success: true,
        submissions: data || [],
      }),
    };
  } catch (err) {
    console.error('get-my-submissions unexpected error:', err);
    return {
      statusCode: 500,
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ error: 'Server error' }),
    };
  }
};