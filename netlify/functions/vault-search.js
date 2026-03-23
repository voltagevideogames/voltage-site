// netlify/functions/vault-search.js
// Simple Netlify serverless proxy for PriceCharting search
// Token stays secret here — never in frontend

exports.handler = async (event) => {
  // Only allow POST
  if (event.httpMethod !== 'POST') {
    return {
      statusCode: 405,
      body: JSON.stringify({ error: 'Method not allowed' })
    };
  }

  try {
    // Parse JSON body
    const body = JSON.parse(event.body || '{}');
    const { query, platform } = body;

    if (!query || typeof query !== 'string' || query.trim() === '') {
      return {
        statusCode: 400,
        body: JSON.stringify({ error: 'Missing or invalid query' })
      };
    }

    // Get secret token from Netlify env var (set in dashboard)
    const token = process.env.PRICECHARTING_API_KEY;
    if (!token) {
      console.error('Missing PRICECHARTING_API_KEY');
      return {
        statusCode: 500,
        body: JSON.stringify({ error: 'Server configuration error' })
      };
    }

    // Build real PriceCharting search URL (GET request)
    const searchUrl = new URL('https://www.pricecharting.com/api/products');
    searchUrl.searchParams.set('t', token);           // token param = 't'
    // Simple v1 platform inclusion: append to query string
    // This helps filter results without needing exact console param mapping yet
    const fullQuery = platform && platform.trim() !== ''
      ? `${query.trim()} ${platform.trim()}`
      : query.trim();
    searchUrl.searchParams.set('q', fullQuery);

    const pcResponse = await fetch(searchUrl.toString());

    if (!pcResponse.ok) {
      throw new Error(`PriceCharting API returned ${pcResponse.status}`);
    }

    const pcData = await pcResponse.json();

    // Normalize to Vault's exact expected shape using real field names
    const results = (pcData.products || []).map(item => ({
      source: 'pricecharting',
      externalId: item.id || null,
      title: item['product-name'] || 'Unknown Title',
      platform: item['console-name'] || platform || 'Unknown',
      loosePrice: Number(item['loose-price']) || 0,
      cibPrice: Number(item['cib-price']) || 0,
      newPrice: Number(item['new-price']) || 0,
      gradedPrice: Number(item['graded-price']) || Number(item['new-price']) || 0,
      releaseDate: item['release-date'] || null,
      imageUrl: item['image-url'] || null,
      searchScore: 0  // can compute client-side or here later
    }));

    return {
      statusCode: 200,
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(results)
    };

  } catch (err) {
    console.error('Proxy error:', err.message);
    return {
      statusCode: 500,
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ error: 'Search failed – try again later' })
    };
  }
};