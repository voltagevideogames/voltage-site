// netlify/functions/vault-search.js
// Netlify serverless proxy for PriceCharting search + single product lookup
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
    const externalId = (body.externalId || '').trim();

    // NEW: Support direct externalId lookup (preferred for refresh)
    if (externalId) {
      console.log('Vault refresh using externalId:', externalId);

      const productUrl = new URL('https://www.pricecharting.com/api/product');
      productUrl.searchParams.set('t', apiKey);
      productUrl.searchParams.set('id', externalId);

      console.log('Request URL:', productUrl.toString().replace(apiKey, '[HIDDEN_API_KEY]'));

      const pcResponse = await fetch(productUrl.toString(), {
        method: 'GET',
        headers: { Accept: 'application/json' },
      });

      const rawText = await pcResponse.text();
      console.log('PriceCharting status:', pcResponse.status);

      let pcData;
      try {
        pcData = JSON.parse(rawText);
      } catch (parseError) {
        console.error('Failed to parse PriceCharting JSON:', parseError);
        return {
          statusCode: 500,
          body: JSON.stringify({ error: 'PriceCharting returned invalid JSON' }),
        };
      }

      if (!pcResponse.ok || pcData.status === 'error') {
        return {
          statusCode: pcResponse.status || 404,
          body: JSON.stringify({
            error: pcData['error-message'] || 'Product not found',
            details: pcData,
          }),
        };
      }

      // Normalize single product into the same format the frontend expects
      const item = pcData;
      const normalized = {
        source: 'pricecharting',
        externalId: item.id || null,
        title: item['product-name'] || '',
        console: item['console-name'] || '',
        loosePrice: item['loose-price'] != null ? item['loose-price'] / 100 : null,
        cibPrice: item['cib-price'] != null ? item['cib-price'] / 100 : null,
        newPrice: item['new-price'] != null ? item['new-price'] / 100 : null,
        gradedPrice: item['graded-price'] != null ? item['graded-price'] / 100 : null,
        releaseDate: item['release-date'] || '',
        imageUrl: item.image || item['image-url'] || '',
        raw: item,
      };

      return {
        statusCode: 200,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          success: true,
          query: `id:${externalId}`,
          count: 1,
          results: [normalized],
        }),
      };
    }

    // FALLBACK: Original search behavior (unchanged)
    if (!query) {
      return {
        statusCode: 400,
        body: JSON.stringify({ error: 'Search query is required' }),
      };
    }

    const fullQuery = platform ? `${query} ${platform}` : query;

    const searchUrl = new URL('https://www.pricecharting.com/api/products');
    searchUrl.searchParams.set('t', apiKey);
    searchUrl.searchParams.set('q', fullQuery);

    console.log('Vault search query:', fullQuery);
    console.log('Request URL:', searchUrl.toString().replace(apiKey, '[HIDDEN_API_KEY]'));

    const pcResponse = await fetch(searchUrl.toString(), {
      method: 'GET',
      headers: { Accept: 'application/json' },
    });

    const rawText = await pcResponse.text();
    console.log('PriceCharting status:', pcResponse.status);

    let pcData;
    try {
      pcData = JSON.parse(rawText);
    } catch (parseError) {
      console.error('Failed to parse PriceCharting JSON:', parseError);
      return {
        statusCode: 500,
        body: JSON.stringify({ error: 'PriceCharting returned invalid JSON' }),
      };
    }

    if (!pcResponse.ok || pcData.status === 'error') {
      return {
        statusCode: pcResponse.status || 500,
        body: JSON.stringify({
          error: pcData['error-message'] || 'PriceCharting search failed',
          details: pcData,
        }),
      };
    }

    // Normalize results (unchanged from your original code)
    const results = (pcData.products || []).map((item) => ({
      source: 'pricecharting',
      externalId: item.id || null,
      title: item['product-name'] || '',
      console: item['console-name'] || '',
      loosePrice: item['loose-price'] != null ? item['loose-price'] / 100 : null,
      cibPrice: item['cib-price'] != null ? item['cib-price'] / 100 : null,
      newPrice: item['new-price'] != null ? item['new-price'] / 100 : null,
      boxOnlyPrice: item['box-only-price'] != null ? item['box-only-price'] / 100 : null,
      manualOnlyPrice: item['manual-only-price'] != null ? item['manual-only-price'] / 100 : null,
      gradedPrice: item['graded-price'] != null ? item['graded-price'] / 100 : null,
      releaseDate: item['release-date'] || '',
      imageUrl: item.image || item['image-url'] || item['photo'] || '',
      raw: item,
    }));

    return {
      statusCode: 200,
      headers: { 'Content-Type': 'application/json' },
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