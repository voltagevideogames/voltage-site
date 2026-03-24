export async function handler(event) {
  if (event.httpMethod !== "POST") {
    return {
      statusCode: 405,
      body: "Method Not Allowed"
    };
  }

  try {
    const data = JSON.parse(event.body);

    const {
      game_title_or_description,
      platform,
      condition,
      completeness,
      quantity,
      preferred_payout,
      customer_email,
      notes
    } = data;

    // Basic validation
    if (!game_title_or_description || !platform || !condition || !customer_email) {
      return {
        statusCode: 400,
        body: JSON.stringify({ error: "Missing required fields" })
      };
    }

    // Generate simple submission ID
    const submission_id = `VVG-${Date.now()}`;

    const supabaseUrl = process.env.SUPABASE_URL;
    const supabaseKey = process.env.SUPABASE_SERVICE_KEY;
console.log("SUPABASE URL:", supabaseUrl);
console.log("SUPABASE KEY EXISTS:", !!supabaseKey);
    
const response = await fetch(`${supabaseUrl}/rest/v1/submissions`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "apikey": supabaseKey,
        "Authorization": `Bearer ${supabaseKey}`,
        "Prefer": "return=minimal"
      },
      body: JSON.stringify([
        {
          submission_id,
          game_title_or_description,
          platform,
          condition,
          completeness,
          quantity: quantity || 1,
          preferred_payout,
          customer_email,
          notes,
          status: "pending"
        }
      ])
    });

    if (!response.ok) {
  const errorText = await response.text();
  console.error("SUPABASE ERROR:", errorText);
  return {
    statusCode: 500,
    body: JSON.stringify({ error: errorText })
  };
}
    return {
      statusCode: 200,
      body: JSON.stringify({
        success: true,
        submission_id
      })
    };

 } catch (err) {
  console.error("FUNCTION ERROR:", err);
  return {
    statusCode: 500,
    body: JSON.stringify({ error: err.message })
  };
}