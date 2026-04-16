// netlify/functions/send-email.js
exports.handler = async (event) => {
  if (event.httpMethod !== 'POST') {
    return {
      statusCode: 405,
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ error: 'Method not allowed' }),
    };
  }

  try {
    const body = JSON.parse(event.body || '{}');

    const {
      type,
      to,
      submission_id,
      customer_email,
      subject,
      template_data
    } = body;

    if (!type || !to) {
      return {
        statusCode: 400,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ error: 'Missing required email payload fields' }),
      };
    }

    console.log('EMAIL EVENT READY:', {
      type,
      to,
      submission_id: submission_id || null,
      customer_email: customer_email || null,
      subject: subject || null,
      template_data: template_data || {},
      created_at: new Date().toISOString(),
    });

    return {
      statusCode: 200,
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        success: true,
        queued: true,
        mode: 'stub',
        type,
      }),
    };
  } catch (error) {
    console.error('send-email stub failed:', error);
    return {
      statusCode: 500,
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ error: 'Failed to prepare email event' }),
    };
  }
};