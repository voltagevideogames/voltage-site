// netlify/functions/update-pricing-config.js
// Safe admin endpoint to update pricing margins in Supabase
// Only updates the row with id = 1

const { createClient } = require('@supabase/supabase-js');

exports.handler = async (event) => {
  try {
    // Only allow POST
    if (event.httpMethod !== 'POST') {
      return {
        statusCode: 405,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ error: 'Method not allowed' }),
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

    // Parse JSON body
    let body;
    try {
      body = JSON.parse(event.body || '{}');
    } catch (parseErr) {
      console.error('Failed to parse JSON body');
      return {
        statusCode: 400,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ error: 'Invalid JSON body' }),
      };
    }

    // Extract fields
const cashPercentUnder30 = Number(body.cash_percent_under_30);
const cashPercent30To100 = Number(body.cash_percent_30_to_100);
const creditMultiplier = Number(body.credit_multiplier);
const maxAutoOfferValue = Number(body.max_auto_offer_value);

// Validation
if (
  !Number.isFinite(cashPercentUnder30) ||
  !Number.isFinite(cashPercent30To100) ||
  !Number.isFinite(creditMultiplier) ||
  !Number.isFinite(maxAutoOfferValue)
) {
  console.error('Missing or invalid pricing fields');
  return {
    statusCode: 400,
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      success: false,
      error: 'All fields are required and must be valid numbers'
    }),
  };
}

if (
  cashPercentUnder30 <= 0 ||
  cashPercent30To100 <= 0 ||
  creditMultiplier <= 0 ||
  maxAutoOfferValue <= 0
) {
      console.error('Pricing values must be positive numbers');
      return {
        statusCode: 400,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ 
          error: 'All percentage and value fields must be positive numbers' 
        }),
      };
    }

    console.log('Updating pricing config with values:', {
      cash_percent_under_30,
      cash_percent_30_to_100,
      credit_multiplier,
      max_auto_offer_value
    });

    // Create Supabase client
    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    const updateData = {
      cash_percent_under_30,
      cash_percent_30_to_100,
      credit_multiplier,
      max_auto_offer_value,
      updated_at: new Date().toISOString()
    };

    const { data, error } = await supabase
      .from('pricing_config')
      .update(updateData)
      .eq('id', 1)
      .select()
      .single();

    if (error) {
      if (error.code === 'PGRST116') { // No rows returned
        console.error('Pricing config row with id=1 not found');
        return {
          statusCode: 404,
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ 
            success: false, 
            error: 'Pricing config not found' 
          }),
        };
      }

      console.error('Supabase update error:', error);
      return {
        statusCode: 500,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ 
          success: false, 
          error: 'Failed to update pricing config' 
        }),
      };
    }

    console.log('Pricing config updated successfully');

    return {
      statusCode: 200,
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        success: true,
        config: data
      }),
    };

  } catch (err) {
    console.error('update-pricing-config function failed:', err);
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