// netlify/functions/get-pricing-config.js
// Simple read-only endpoint to fetch current pricing configuration
// Used by frontend or admin tools to display current margins

const { createClient } = require('@supabase/supabase-js');

exports.handler = async (event) => {
  try {
    // Only allow GET
    if (event.httpMethod !== 'GET') {
  return {
    statusCode: 405,
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      success: false,
      error: 'Method not allowed'
    }),
  };
}

    // Environment variables
    const supabaseUrl = process.env.SUPABASE_URL;
    const supabaseServiceKey = process.env.SUPABASE_SERVICE_KEY;

    if (!supabaseUrl || !supabaseServiceKey) {
      console.error('Missing Supabase environment variables');
      return {
        statusCode: 500,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ error: 'Server configuration error' }),
      };
    }

    // Create Supabase client
    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    console.log('Fetching pricing config (id=1)...');

    const { data, error } = await supabase
      .from('pricing_config')
      .select('*')
      .eq('id', 1)
      .single();

    if (error) {
      if (error.code === 'PGRST116') { // No rows returned
        console.log('Pricing config row (id=1) not found');
        return {
          statusCode: 404,
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            success: false,
            error: 'Pricing config not found'
          }),
        };
      }

      console.error('Supabase query error:', error);
      return {
        statusCode: 500,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          success: false,
          error: 'Failed to fetch pricing config'
        }),
      };
    }

    if (!data) {
      console.log('Pricing config returned null');
      return {
        statusCode: 404,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          success: false,
          error: 'Pricing config not found'
        }),
      };
    }

    console.log('Pricing config loaded successfully');

    return {
      statusCode: 200,
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        success: true,
        config: data
      }),
    };

  } catch (err) {
    console.error('get-pricing-config function failed:', err);
    return {
      statusCode: 500,
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        success: false,
        error: 'Internal server error'
      }),
    };
  }
};