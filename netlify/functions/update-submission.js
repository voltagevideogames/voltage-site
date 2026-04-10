const { createClient } = require('@supabase/supabase-js');

const ALLOWED_STATUSES = ['pending', 'review', 'counter_sent', 'accepted', 'received', 'completed', 'rejected'];

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_KEY
);

exports.handler = async function (event) {
  if (event.httpMethod !== 'POST') {
    return {
      statusCode: 405,
      body: JSON.stringify({ error: 'Method not allowed.' })
    };
  }

  try {
    const body = JSON.parse(event.body || '{}');
    const id = body.id;
    const status = body.status;
    const internalNotes = body.internal_notes || '';
    const finalCashOffer = body.final_cash_offer;
    const finalCreditOffer = body.final_credit_offer;
    const photosRequested = body.photos_requested;

    if (!id) {
      return {
        statusCode: 400,
        body: JSON.stringify({ error: 'Submission ID is required.' })
      };
    }

    if (!ALLOWED_STATUSES.includes(status)) {
      return {
        statusCode: 400,
        body: JSON.stringify({ error: 'Invalid status value.' })
      };
    }

    const { data, error } = await supabase
      .from('submissions')
      .update({
        status,
        internal_notes: internalNotes,
        final_cash_offer: finalCashOffer,
        final_credit_offer: finalCreditOffer,
        photos_requested: photosRequested
      })
      .eq('id', id)
      .select()
      .single();

    if (error) {
      console.error('Supabase update error:', error);
      return {
        statusCode: 500,
        body: JSON.stringify({ error: 'Failed to update submission.' })
      };
    }

    return {
      statusCode: 200,
      body: JSON.stringify({
        success: true,
        submission: data
      })
    };
  } catch (error) {
    console.error('Function error:', error);
    return {
      statusCode: 500,
      body: JSON.stringify({ error: 'Server error updating submission.' })
    };
  }
};