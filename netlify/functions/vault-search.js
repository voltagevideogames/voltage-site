// netlify/functions/vault-search.js
// Netlify serverless proxy for PriceCharting search
// Keeps API token secret on the server

exports.handler = async (event) => {
  try {
    // Only allow POST
    if (event.httpMethod !== 'POST') {
      return {
        statusCode: 405,
        body: JSON.stringify({ error: 'Method not allowed' }),
      };
    }

    // Read API key from Netlify environment variable
    const apiKey = process.env.PRICECHARTING_API_KEY;

    if (!apiKey) {
      console.error('Missing PRICECHARTING_API_KEY');
      return {
        statusCode: 500,
        body: JSON.stringify({ error: 'Server configuration error' }),
      };
    }

    // Parse incoming request body
    const body = JSON.parse(event.body || '{}');
    const query = (body.query || '').trim();
    const platform = (body.platform || '').trim();

    if (!query) {
      return {
        statusCode: 400,
        body: JSON.stringify({ error: 'Search query is required' }),
      };
    }

    // Build search text
    const fullQuery = platform ? `${query} ${platform}` : query;

    // Build PriceCharting search URL
    const searchUrl = new URL('https://www.pricecharting.com/api/products');
    searchUrl.searchParams.set('t', apiKey);
    searchUrl.searchParams.set('q', fullQuery);

    console.log('Vault search query:', fullQuery);
    console.log(
      'Request URL:',
      searchUrl.toString().replace(apiKey, '[HIDDEN_API_KEY]')
    );

    // Call PriceCharting
    const pcResponse = await fetch(searchUrl.toString(), {
      method: 'GET',
      headers: {
        Accept: 'application/json',
      },
    });

    const rawText = await pcResponse.text();
    console.log('PriceCharting status:', pcResponse.status);
    console.log('PriceCharting raw response:', rawText);

    let pcData;
    try {
      pcData = JSON.parse(rawText);
    } catch (parseError) {
      console.error('Failed to parse PriceCharting JSON:', parseError);
      return {
        statusCode: 500,
        body: JSON.stringify({
          error: 'PriceCharting returned invalid JSON',
          raw: rawText,
        }),
      };
    }

    // Handle API-level errors
    if (!pcResponse.ok || pcData.status === 'error') {
      return {
        statusCode: pcResponse.status || 500,
        body: JSON.stringify({
          error: pcData['error-message'] || 'PriceCharting search failed',
          details: pcData,
        }),
      };
    }

    // Normalize results for your Vault frontend
    const results = (pcData.products || []).map((item) => ({
      source: 'pricecharting',
      externalId: item.id || null,
      title: item['product-name'] || '',
      console: item['console-name'] || '',
      loosePrice: item['loose-price'] ?? null,
      cibPrice: item['cib-price'] ?? null,
      newPrice: item['new-price'] ?? null,
      boxOnlyPrice: item['box-only-price'] ?? null,
      manualOnlyPrice: item['manual-only-price'] ?? null,
      releaseDate: item['release-date'] || '',
      imageUrl: item.image || item['image-url'] || item['photo'] || '',
      raw: item,
    }));

    return {
      statusCode: 200,
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        success: true,
        query: fullQuery,
        count: results.length,
        results,
      }),
    };
  } catch (error) {
    console.error('Vault search function failed:', error);

    return {
      statusCode: 500,
      body: JSON.stringify({
        error: 'Search failed – try again later',
        details: error.message,
      }),
    };
  }
};