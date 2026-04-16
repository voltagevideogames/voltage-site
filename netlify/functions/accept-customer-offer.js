const { createClient } = require('@supabase/supabase-js');
const fetch = require('node-fetch');

exports.handler = async (event) => {
  if (event.httpMethod !== 'POST') {
    return jsonResponse(405, { error: 'Method not allowed' });
  }

  try {
    const supabaseUrl = process.env.SUPABASE_URL;
    const supabaseServiceKey = process.env.SUPABASE_SERVICE_KEY;

    if (!supabaseUrl || !supabaseServiceKey) {
      return jsonResponse(500, { error: 'Server configuration error' });
    }

    const authHeader = event.headers.authorization || event.headers.Authorization || '';
    if (!authHeader.startsWith('Bearer ')) {
      return jsonResponse(401, { error: 'Unauthorized - missing token' });
    }

    const token = authHeader.replace('Bearer ', '').trim();

    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    const {
      data: { user },
      error: authError,
    } = await supabase.auth.getUser(token);

    if (authError || !user?.email) {
      return jsonResponse(401, { error: 'Invalid or expired token' });
    }

    let body;
    try {
      body = JSON.parse(event.body || '{}');
    } catch {
      return jsonResponse(400, { error: 'Invalid JSON body' });
    }

    const submissionId = body.submissionId;
    if (!submissionId) {
      return jsonResponse(400, { error: 'Missing submissionId' });
    }

    const { data: submission, error: fetchError } = await supabase
      .from('submissions')
      .select(`
        id,
        customer_email,
        status,
        game_title_or_description,
        item_count,
        final_cash_offer,
        final_credit_offer,
        preferred_payout
      `)
      .eq('id', submissionId)
      .single();

    if (fetchError || !submission) {
      return jsonResponse(404, { error: 'Submission not found' });
    }

    if (String(submission.customer_email || '').trim().toLowerCase() !== String(user.email || '').trim().toLowerCase()) {
      return jsonResponse(403, { error: 'You do not own this submission' });
    }

    if (submission.status !== 'counter_sent') {
      return jsonResponse(400, { error: 'This submission cannot be accepted right now' });
    }

    const { error: updateError } = await supabase
      .from('submissions')
      .update({ status: 'accepted' })
      .eq('id', submissionId);

    if (updateError) {
      console.error('accept-customer-offer update error:', updateError);
      return jsonResponse(500, { error: 'Failed to accept offer' });
    }

    // Fire stub email event
    try {
      const siteUrl =
        process.env.URL ||
        process.env.DEPLOY_PRIME_URL ||
        'http://localhost:8888';

      await fetch(`${siteUrl}/.netlify/functions/send-email`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          type: 'offer_accepted_confirmation',
          to: submission.customer_email,
          customer_email: submission.customer_email,
          submission_id: submission.id,
          subject: 'Voltage: Offer Accepted',
          template_data: {
            submission_id: submission.id,
            title: submission.game_title_or_description,
            item_count: submission.item_count || 1,
            final_cash_offer: submission.final_cash_offer,
            final_credit_offer: submission.final_credit_offer,
            preferred_payout: submission.preferred_payout || null
          }
        })
      });
    } catch (emailError) {
      console.error('Acceptance email trigger failed:', emailError);
      // Do not fail the acceptance flow
    }

    return jsonResponse(200, {
      success: true,
      message: 'Offer accepted',
      status: 'accepted',
      email_event_triggered: 'offer_accepted_confirmation'
    });
  } catch (error) {
    console.error('accept-customer-offer unexpected error:', error);
    return jsonResponse(500, { error: 'Server error' });
  }
};

function jsonResponse(statusCode, body) {
  return {
    statusCode,
    headers: {
      'Content-Type': 'application/json',
      'Cache-Control': 'no-store',
    },
    body: JSON.stringify(body),
  };
}