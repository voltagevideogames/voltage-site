const { createClient } = require('@supabase/supabase-js');

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
      .select('id, customer_email, status')
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

    return jsonResponse(200, {
      success: true,
      message: 'Offer accepted',
      status: 'accepted',
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