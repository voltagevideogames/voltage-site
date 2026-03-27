<!-- ====================== SELL / TRADE FORM SECTION ====================== -->
<div class="bg-black border border-[var(--teal)]/30 rounded-2xl p-8">
  <h2 class="heading-font text-4xl neon-text mb-8 text-center">Sell Your Games to Voltage</h2>
  
  <form id="sell-form" class="space-y-6">
    <!-- Your existing form fields go here - unchanged -->
    <!-- Example structure - replace with your actual fields -->
    <div class="grid grid-cols-1 md:grid-cols-2 gap-6">
      <div>
        <label class="block text-sm text-gray-400 mb-2">Game Title(s) or Collection Description</label>
        <input type="text" name="game_title_or_description" id="game_title_or_description" 
               class="w-full bg-zinc-900 border border-[var(--teal)]/50 rounded-lg px-4 py-3 text-white" required>
      </div>
      <div>
        <label class="block text-sm text-gray-400 mb-2">Platform / System</label>
        <input type="text" name="platform" id="platform" 
               class="w-full bg-zinc-900 border border-[var(--teal)]/50 rounded-lg px-4 py-3 text-white" required>
      </div>
    </div>

    <div class="grid grid-cols-1 md:grid-cols-3 gap-6">
      <div>
        <label class="block text-sm text-gray-400 mb-2">Condition</label>
        <select name="condition" id="condition" 
                class="w-full bg-zinc-900 border border-[var(--teal)]/50 rounded-lg px-4 py-3 text-white">
          <option value="Loose">Loose</option>
          <option value="Complete in Box (CIB)">Complete in Box (CIB)</option>
          <option value="Sealed">Sealed</option>
          <option value="Graded">Graded</option>
        </select>
      </div>
      <div>
        <label class="block text-sm text-gray-400 mb-2">Completeness</label>
        <input type="text" name="completeness" id="completeness" 
               class="w-full bg-zinc-900 border border-[var(--teal)]/50 rounded-lg px-4 py-3 text-white">
      </div>
      <div>
        <label class="block text-sm text-gray-400 mb-2">Quantity</label>
        <input type="number" name="quantity" id="quantity" value="1" min="1"
               class="w-full bg-zinc-900 border border-[var(--teal)]/50 rounded-lg px-4 py-3 text-white">
      </div>
    </div>

    <div>
      <label class="block text-sm text-gray-400 mb-2">Your Email Address</label>
      <input type="email" name="customer_email" id="customer_email" 
             class="w-full bg-zinc-900 border border-[var(--teal)]/50 rounded-lg px-4 py-3 text-white" required>
    </div>

    <div>
      <label class="block text-sm text-gray-400 mb-2">Preferred Payout</label>
      <select name="preferred_payout" id="preferred_payout" 
              class="w-full bg-zinc-900 border border-[var(--teal)]/50 rounded-lg px-4 py-3 text-white">
        <option value="cash">Cash</option>
        <option value="credit">Store Credit (higher value)</option>
      </select>
    </div>

    <div>
      <label class="block text-sm text-gray-400 mb-2">Notes / Additional Details (optional)</label>
      <textarea name="notes" id="notes" rows="3"
                class="w-full bg-zinc-900 border border-[var(--teal)]/50 rounded-lg px-4 py-3 text-white"></textarea>
    </div>

    <button type="submit"
            class="w-full bg-[var(--yellow)] hover:bg-yellow-400 text-black font-bold py-5 rounded-xl text-lg transition">
      REQUEST MY OFFER
    </button>
  </form>

  <!-- ====================== OFFER RESULTS PANEL ====================== -->
  <div id="offer-results" class="hidden mt-12 bg-zinc-950 border-4 border-[var(--teal)] rounded-2xl p-8">
    <div class="flex justify-between items-center mb-6">
      <h3 id="result-title" class="heading-font text-3xl neon-text">Your Offer</h3>
      <button onclick="hideOfferResults()" 
              class="px-5 py-2 bg-zinc-800 hover:bg-zinc-700 rounded-lg text-sm transition">
        Close
      </button>
    </div>

    <div id="result-content" class="space-y-8"></div>

    <div class="mt-10 text-center">
      <p class="text-sm text-gray-400">Thank you for trusting Voltage Video Games.<br>
      We’ll follow up by email if needed. Most responses go out within 24 hours.</p>
    </div>
  </div>
</div>

<script>
// Form submission handler - replaces your old alert logic
document.getElementById('sell-form').addEventListener('submit', async function(e) {
  e.preventDefault();

  const form = e.target;
  const formData = new FormData(form);
  const data = Object.fromEntries(formData.entries());

  try {
    const response = await fetch('/.netlify/functions/submit-offer', {
      method: 'POST',
      body: JSON.stringify(data),
      headers: { 'Content-Type': 'application/json' }
    });

    const result = await response.json();

    if (result.success) {
      showOfferResults(result);
      form.reset();                    // Clear form after success
    } else {
      showErrorResult(result.error || 'Something went wrong. Please try again.');
    }
  } catch (err) {
    showErrorResult('Connection error. Please check your internet and try again.');
  }
});

function showOfferResults(result) {
  const panel = document.getElementById('offer-results');
  const content = document.getElementById('result-content');
  const titleEl = document.getElementById('result-title');

  content.innerHTML = '';

  let html = `
    <div class="bg-black border border-[var(--teal)]/40 rounded-xl p-6">
      <div class="flex justify-between text-sm mb-4">
        <span class="text-gray-400">Submission ID</span>
        <span class="font-mono text-[var(--yellow)]">${result.submission_id}</span>
      </div>
  `;

  if (result.offer_type === 'instant_offer') {
    titleEl.textContent = "🎮 Instant Offer Ready!";
    html += `
      <div class="text-center py-8 border-y border-[var(--teal)]/30 my-6">
        <div class="text-6xl font-bold text-[var(--teal)]">$${result.cash_amount}</div>
        <div class="text-gray-400 mt-2">Cash Offer</div>
        <div class="text-2xl text-[var(--yellow)] mt-6">or $${result.credit_amount} in Store Credit</div>
      </div>
      <p class="text-center text-gray-300">Current estimated market value: <span class="text-[var(--teal)]">$${result.market_value}</span></p>
      <p class="text-xs text-gray-500 mt-8 text-center">This offer is good for 72 hours. Drop off in-store or ship to us!</p>
    `;
  } 
  else if (result.offer_type === 'instant_range') {
    titleEl.textContent = "🎮 Instant Offer Range";
    html += `
      <div class="grid grid-cols-1 md:grid-cols-2 gap-8 my-8">
        <div class="text-center">
          <div class="text-5xl font-bold text-[var(--teal)]">$${result.cash_low} – $${result.cash_high}</div>
          <div class="text-gray-400">Cash Range</div>
        </div>
        <div class="text-center">
          <div class="text-5xl font-bold text-[var(--yellow)]">$${result.credit_low} – $${result.credit_high}</div>
          <div class="text-gray-400">Store Credit Range</div>
        </div>
      </div>
      <p class="text-center text-gray-300">Estimated market value ≈ $${result.market_value}</p>
    `;
  } 
  else {
    // manual_review
    titleEl.textContent = "📋 Manual Review in Progress";
    html += `
      <div class="text-center py-10">
        <div class="text-6xl mb-6">🔍</div>
        <p class="text-xl text-gray-300">Thank you for your submission.</p>
        <p class="mt-4 max-w-md mx-auto text-gray-400">Your items require a quick manual review by our team.</p>
        ${result.manual_review_reason ? `<p class="mt-6 text-amber-400 text-sm">"${result.manual_review_reason}"</p>` : ''}
      </div>
      <p class="text-center text-sm text-gray-500">We’ll email you within 24–48 hours with a personalized offer.</p>
    `;
  }

  html += `</div>`;
  content.innerHTML = html;
  panel.classList.remove('hidden');
  panel.scrollIntoView({ behavior: 'smooth' });
}

function showErrorResult(message) {
  const panel = document.getElementById('offer-results');
  const content = document.getElementById('result-content');
  const titleEl = document.getElementById('result-title');

  content.innerHTML = `
    <div class="bg-red-950/50 border border-red-500/50 rounded-xl p-8 text-center">
      <div class="text-5xl mb-4">⚠️</div>
      <p class="text-xl text-red-400">${message}</p>
      <button onclick="hideOfferResults()" 
              class="mt-8 px-8 py-3 bg-zinc-800 hover:bg-zinc-700 rounded-lg">
        Try Again
      </button>
    </div>
  `;
  titleEl.textContent = "Submission Issue";
  panel.classList.remove('hidden');
  panel.scrollIntoView({ behavior: 'smooth' });
}

function hideOfferResults() {
  document.getElementById('offer-results').classList.add('hidden');
}
</script>