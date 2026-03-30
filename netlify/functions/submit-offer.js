}

function roundMoney(value) {
  if (typeof value !== 'number' || !Number.isFinite(value)) return null;
  return Math.round(value * 100) / 100;
}

function normalizeString(value) {
  return String(value || '').trim().toLowerCase();
}

function centsToDollars(value) {
  const num = Number(value || 0);
  if (!Number.isFinite(num) || num <= 0) return 0;
  return num / 100;
}

function chooseBestProductMatch(products, title, platform) {
  if (!Array.isArray(products) || products.length === 0) return null;

  const normalizedTitle = normalizeString(title);
  const normalizedPlatform = normalizeString(platform);

  const scored = products.map((product) => {
    const productName = normalizeString(
      product['product-name'] || product.product_name || ''
    );
    const consoleName = normalizeString(
      product.console_name || product.console || ''
    );

    let score = 0;

    if (normalizedTitle && productName.includes(normalizedTitle)) score += 10;

    if (normalizedTitle) {
      const titleWords = normalizedTitle.split(/\s+/).filter(Boolean);
      for (const word of titleWords) {
        if (word.length >= 3 && productName.includes(word)) score += 2;
      }
    }

    if (normalizedPlatform && consoleName.includes(normalizedPlatform)) score += 8;

    return { product, score };
  });

  scored.sort((a, b) => b.score - a.score);
  return scored[0].product;
}

function getBestUnitValue(freshResult, condition, completeness) {
  const normalizedCondition = normalizeString(condition);
  const normalizedCompleteness = normalizeString(completeness);

  const loosePrice = centsToDollars(freshResult['loose-price']);
  const cibPrice = centsToDollars(freshResult['cib-price']);
  const newPrice = centsToDollars(freshResult['new-price']);
  const gradedPrice = centsToDollars(freshResult['graded-price']);

  // Strong condition matching
  if (normalizedCondition.includes('graded')) {
    return gradedPrice || newPrice || 0;
  }

  if (
    normalizedCondition.includes('sealed') ||
    normalizedCondition.includes('new')
  ) {
    return newPrice || gradedPrice || 0;
  }

  if (
    normalizedCondition.includes('cib') ||
    normalizedCondition.includes('complete')
  ) {
    return cibPrice || loosePrice || 0;
  }

  if (
    normalizedCondition.includes('loose') ||
    normalizedCondition.includes('disc only') ||
    normalizedCondition.includes('cart only')
  ) {
    return loosePrice || cibPrice || 0;
  }

  // Fallback to completeness
  if (
    normalizedCompleteness.includes('complete') ||
    normalizedCompleteness.includes('cib')
  ) {
    return cibPrice || loosePrice || 0;
  }

  if (normalizedCompleteness.includes('loose')) {
    return loosePrice || cibPrice || 0;
  }

  if (
    normalizedCompleteness.includes('sealed') ||
    normalizedCompleteness.includes('new')
  ) {
    return newPrice || gradedPrice || 0;
  }

  // Final fallback order
  return loosePrice || cibPrice || newPrice || gradedPrice || 0;
}

function getManualReviewReason(submission, marketValue) {
  const lowerCondition = normalizeString(submission.condition);
  const lowerCompleteness = normalizeString(submission.completeness);
  const lowerNotes = normalizeString(submission.notes);
  const lowerPlatform = normalizeString(submission.platform);
  const lowerPayout = normalizeString(submission.preferred_payout);

  if (lowerPayout === 'hybrid') {
    return 'Hybrid payout requires manual review';
  }

  if (
    lowerCondition.includes('sealed') ||
    lowerCondition.includes('graded') ||
    lowerCondition.includes('mint') ||
    lowerCompleteness.includes('sealed') ||
    lowerCompleteness.includes('graded')
  ) {
    return 'High-sensitivity item condition requires manual review';
  }

  if (lowerPlatform === 'other') {
    return 'Platform marked as Other';
  }

  if (submission.quantity > 5) {
    return 'High quantity requires manual review';
  }

  if (lowerNotes.length > 20) {
    return 'Submission notes require manual review';
  }

  if (marketValue !== null && marketValue > 100) {
    return 'Market value exceeds auto-offer threshold';
  }

  return null;
}