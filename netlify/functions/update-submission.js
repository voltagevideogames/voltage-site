const { createClient } = require('@supabase/supabase-js');
const fetch = require('node-fetch');

const ALLOWED_STATUSES = ['pending', 'review', 'counter_sent', 'accepted', 'received', 'completed', 'rejected'];

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_KEY
);

exports.handler = async function (event) {
  if (event.httpMethod !== 'POST') {
    return {
      statusCode: 405,
      headers: { 'Content-Type': 'application/json' },
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
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ error: 'Submission ID is required.' })
      };
    }

    if (!ALLOWED_STATUSES.includes(status)) {
      return {
        statusCode: 400,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ error: 'Invalid status value.' })
      };
    }

    // 1) Fetch current submission state first
    const { data: existingSubmission, error: fetchError } = await supabase
      .from('submissions')
      .select(`
        id,
        customer_email,
        status,
        photos_requested,
        game_title_or_description,
        item_count,
        final_cash_offer,
        final_credit_offer,
        preferred_payout
      `)
      .eq('id', id)
      .single();

    if (fetchError || !existingSubmission) {
      console.error('Failed to fetch existing submission:', fetchError);
      return {
        statusCode: 404,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ error: 'Submission not found.' })
      };
    }

    // 2) Apply update
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
      .select(`
        id,
        customer_email,
        status,
        photos_requested,
        game_title_or_description,
        item_count,
        final_cash_offer,
        final_credit_offer,
        preferred_payout
      `)
      .single();

    if (error) {
      console.error('Supabase update error:', error);
      return {
        statusCode: 500,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ error: 'Failed to update submission.' })
      };
    }

    // 3) Detect trigger-worthy transitions
    const emailEvents = [];

    const photosRequestedTurnedOn =
      (existingSubmission.photos_requested === false || existingSubmission.photos_requested == null) &&
      photosRequested === true;

    if (photosRequestedTurnedOn) {
      emailEvents.push({
        type: 'photos_requested',
        subject: 'Voltage: More Photos Requested',
      });
    }

    const counterSentNow =
      existingSubmission.status !== 'counter_sent' &&
      status === 'counter_sent';

    if (counterSentNow) {
      emailEvents.push({
        type: 'counter_sent',
        subject: 'Voltage: Your Offer Is Ready',
      });
    }

    const acceptedByStaffNow =
      existingSubmission.status !== 'accepted' &&
      status === 'accepted';

    if (acceptedByStaffNow) {
      emailEvents.push({
        type: 'accepted_by_staff',
        subject: 'Voltage: Your Trade Has Been Accepted',
      });
    }

    // 4) Fire stub email events
    for (const evt of emailEvents) {
      try {
        const siteUrl =
          process.env.URL ||
          process.env.DEPLOY_PRIME_URL ||
          'http://localhost:8888';

        await fetch(`${siteUrl}/.netlify/functions/send-email`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            type: evt.type,
            to: data.customer_email,
            customer_email: data.customer_email,
            submission_id: data.id,
            subject: evt.subject,
            template_data: {
              submission_id: data.id,
              title: data.game_title_or_description,
              item_count: data.item_count || 1,
              status: data.status,
              photos_requested: data.photos_requested,
              final_cash_offer: data.final_cash_offer,
              final_credit_offer: data.final_credit_offer,
              preferred_payout: data.preferred_payout || null
            }
          })
        });
      } catch (emailError) {
        console.error(`Email trigger failed for ${evt.type}:`, emailError);
        // Do not fail the submission update
      }
    }

    return {
      statusCode: 200,
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        success: true,
        submission: data,
        email_events_triggered: emailEvents.map(e => e.type)
      })
    };
  } catch (error) {
    console.error('Function error:', error);
    return {
      statusCode: 500,
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ error: 'Server error updating submission.' })
    };
  }
};