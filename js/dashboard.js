// dashboard.js - Safe photo support added
// All existing functionality preserved

const state = {
  submissions: [],
  filteredSubmissions: [],
  selectedId: null,
  activeFilter: 'all',
  searchTerm: '',
  sortMode: 'newest',
  // NEW: batch items state (safe addition)
  currentBatchItems: []
};

const queueList = document.getElementById('queue-list');
const queueLoading = document.getElementById('queue-loading');
const queueEmpty = document.getElementById('queue-empty');
const globalMessage = document.getElementById('global-message');

const statNewToday = document.getElementById('stat-new-today');
const statManualReview = document.getElementById('stat-manual-review');
const statAccepted = document.getElementById('stat-accepted');
const statPotentialBuyCost = document.getElementById('stat-potential-buy-cost');
const statIncomingRetailValue = document.getElementById('stat-incoming-retail-value');

const searchInput = document.getElementById('search-input');
const sortSelect = document.getElementById('sort-select');
const filterButtons = document.querySelectorAll('.filter-btn');

const selectedIdEl = document.getElementById('selected-id');
const selectedEmailEl = document.getElementById('selected-email');
const selectedTitleEl = document.getElementById('selected-title');
const selectedSubtitleEl = document.getElementById('selected-subtitle');
const selectedNotesEl = document.getElementById('selected-notes');
const selectedMarketValueEl = document.getElementById('selected-market-value');
const selectedOfferAmountEl = document.getElementById('selected-offer-amount');
const selectedCreditAmountEl = document.getElementById('selected-credit-amount');
const selectedOfferTypeEl = document.getElementById('selected-offer-type');
const selectedRiskEl = document.getElementById('selected-risk');
const selectedInternalNotesEl = document.getElementById('selected-internal-notes');

const finalCashInput = document.getElementById('final-cash-input');
const finalCreditInput = document.getElementById('final-credit-input');

const saveSelectedBtn = document.getElementById('save-selected-btn');
const emailCustomerBtn = document.getElementById('email-customer-btn');
const markReviewedBtn = document.getElementById('mark-reviewed-btn');
const requestPhotosBtn = document.getElementById('request-photos-btn');
const sendCounterofferBtn = document.getElementById('send-counteroffer-btn');
const refreshDashboardBtn = document.getElementById('refresh-dashboard-btn');
const resetWeeklyBtn = document.getElementById('reset-weekly-btn');

// Photo modal
const photoModal = document.getElementById('photo-modal');
const modalImage = document.getElementById('modal-image');

// === NEW: Pricing Controls Elements ===
const pricingControlsToggle = document.getElementById('pricing-controls-toggle');
const pricingControlsPanel = document.getElementById('pricing-controls-panel');
const pricingControlsChevron = document.getElementById('pricing-controls-chevron');
const pricingControlsStatus = document.getElementById('pricing-controls-status');

const pricingUnder30 = document.getElementById('pricing-under-30');
const pricing30To100 = document.getElementById('pricing-30-100');
const pricingCreditMultiplier = document.getElementById('pricing-credit-multiplier');
const pricingMaxAuto = document.getElementById('pricing-max-auto');

const savePricingConfigBtn = document.getElementById('save-pricing-config-btn');

// NEW: Batch items container (safe reference)
const batchItemsContainer = document.getElementById('batch-items');

// Safe photo parser
function parsePhotoUrls(value) {
  if (!value) return [];
  if (typeof value === 'string') {
    try {
      const parsed = JSON.parse(value);
      if (Array.isArray(parsed)) {
        return parsed.filter(url => typeof url === 'string' && url.trim().length > 0);
      }
    } catch (e) {}
    return [];
  }
  if (Array.isArray(value)) {
    return value.filter(url => typeof url === 'string' && url.trim().length > 0);
  }
  return [];
}

function normalizeString(value) {
  return String(value || '').trim().toLowerCase();
}

function showMessage(message, type = 'success') {
  if (!globalMessage) return;
  globalMessage.classList.remove('hidden');
  globalMessage.textContent = message;
  if (type === 'error') {
    globalMessage.className = 'rounded-2xl border border-red-500/30 bg-red-500/10 text-red-200 px-4 py-3 text-sm';
  } else {
    globalMessage.className = 'rounded-2xl border border-[var(--teal)]/25 bg-[var(--teal)]/10 text-[var(--teal)] px-4 py-3 text-sm';
  }
  setTimeout(() => globalMessage.classList.add('hidden'), 3200);
}

function safeText(value, fallback = '—') {
  if (value == null || value === '') return fallback;
  return String(value);
}

function formatCurrency(value) {
  const num = Number(value);
  if (Number.isNaN(num)) return '—';
  return `$${Math.round(num).toLocaleString()}`;
}

function getPrimaryTitle(sub) {
  return safeText(sub.game_title_or_description, 'Submission');
}

function getSubtitle(sub) {
  const parts = [sub.platform, sub.condition, sub.completeness].filter(Boolean);
  return parts.length ? parts.join(' • ') : 'No details';
}

function getRiskLabel(sub) {
  const marketValue = Number(sub.market_value) || 0;

  // HIGH = real chance we get burned
  if (!marketValue || marketValue <= 0) {
    return 'HIGH';
  }

  if (sub.condition && normalizeString(sub.condition).includes('graded')) {
    return 'HIGH';
  }

  if (
    (sub.condition && normalizeString(sub.condition).includes('sealed')) ||
    (sub.completeness && normalizeString(sub.completeness).includes('sealed'))
  ) {
    return 'HIGH';
  }

  if (normalizeString(sub.platform) === 'other') {
    return 'HIGH';
  }

  if ((Number(sub.quantity) || 0) >= 5) {
    return 'HIGH';
  }

  if (marketValue >= 250) {
    return 'HIGH';
  }

  // Suspicious notes
  const lowerNotes = normalizeString(sub.notes);
  const suspiciousKeywords = [
    'not working',
    'broken',
    'cracked',
    'water damage',
    'missing pieces',
    'missing manual',
    'missing inserts',
    'heavy scratches',
    'wont read',
    "won't read",
    'untested',
    'repro',
    'reproduction',
    'fake',
    'counterfeit',
    'disc rot'
  ];

  if (suspiciousKeywords.some(k => lowerNotes.includes(k))) {
    return 'HIGH';
  }

  // MEDIUM = some uncertainty but not dangerous
  if (marketValue >= 100) {
    return 'MEDIUM';
  }

  if (
    (sub.condition && normalizeString(sub.condition).includes('mixed')) ||
    (sub.completeness && normalizeString(sub.completeness).includes('mixed'))
  ) {
    return 'MEDIUM';
  }

  const photos = parsePhotoUrls(sub.photo_urls);
  if (photos.length === 0) {
    return 'MEDIUM';
  }

  if (sub.manual_review_reason) {
    return 'MEDIUM';
  }

  // LOW = routine / normal submissions
  return 'LOW';
}

function getRiskClass(sub) {
  const risk = getRiskLabel(sub);
  if (risk === 'HIGH') return 'text-red-400';
  if (risk === 'MEDIUM') return 'text-yellow-400';
  return 'text-emerald-400';
}

function getCommittedBuyValue(sub) {
  return Number(sub.final_cash_offer) || Number(sub.cash_amount) || 0;
}

// NEW: Helper to detect batch submissions
function isBatchSubmission(item) {
  if (!item) return false;
  return item.submission_type === 'batch' || (Number(item.item_count) || 0) > 1;
}

function renderQueue() {
  if (!queueLoading || !queueList || !queueEmpty) return;

  queueLoading.classList.add('hidden');
  queueList.classList.remove('hidden');
  queueEmpty.classList.add('hidden');

  const filtered = state.filteredSubmissions || [];

  if (!filtered.length) {
    queueList.classList.add('hidden');
    queueEmpty.classList.remove('hidden');
    queueEmpty.textContent = 'No submissions match your current filter.';
    return;
  }

  queueList.innerHTML = filtered.map(item => {
    const isActive = item.id === state.selectedId;
    const photos = parsePhotoUrls(item.photo_urls);
    const photoBadge = photos.length > 0
      ? `<span class="inline-flex items-center gap-1 text-xs bg-zinc-800 px-2 py-0.5 rounded-full"><span>📷</span>${photos.length}</span>`
      : '';

    return `
      <div class="queue-row p-5 hover:bg-zinc-900 cursor-pointer flex gap-4 border-l-4 ${isActive ? 'queue-item-active' : 'border-transparent'}" data-id="${item.id}">
        <div class="flex-1 min-w-0">
          <div class="text-sm text-zinc-400">#${item.id}</div>
          <div class="font-medium text-base mt-1 line-clamp-1">${getPrimaryTitle(item)}</div>
          <div class="text-sm text-gray-400 mt-1 line-clamp-1">${getSubtitle(item)}</div>
          <div class="text-xs text-zinc-500 mt-2">${safeText(item.customer_email)}</div>
        </div>
        <div class="text-right shrink-0">
          <div class="text-lg font-bold text-[var(--teal)]">${formatCurrency(item.market_value)}</div>
          <div class="text-xs mt-1 text-[var(--yellow)]">Buy: ${formatCurrency(getCommittedBuyValue(item))}</div>
          ${photoBadge}
        </div>
      </div>
    `;
  }).join('');

  document.querySelectorAll('.queue-row').forEach(row => {
    row.addEventListener('click', () => {
      state.selectedId = Number(row.dataset.id);
      renderQueue();
      renderSelectedPanel();
    });
  });
}

// NEW: Load batch items from backend
async function loadSubmissionItems(submissionId) {
  if (!submissionId) return;

  try {
    const res = await fetch(`/.netlify/functions/get-submission-items?id=${submissionId}`);
    if (!res.ok) throw new Error('Failed to fetch items');

    const data = await res.json();
    state.currentBatchItems = Array.isArray(data.items) ? data.items : [];
    renderBatchItems();
  } catch (e) {
    console.error('Failed to load submission items:', e);
    if (batchItemsContainer) {
      batchItemsContainer.innerHTML = `<div class="text-red-400 text-sm">Error loading batch items</div>`;
    }
  }
}

// NEW: Render batch items in the dedicated panel
function renderBatchItems() {
  if (!batchItemsContainer) return;

  const selected = state.submissions.find(s => s.id === state.selectedId);

  if (!selected) {
    batchItemsContainer.innerHTML = `<div class="text-gray-500 text-sm">Select a submission</div>`;
    return;
  }

  if (!isBatchSubmission(selected)) {
    batchItemsContainer.innerHTML = `<div class="text-gray-500 text-sm">Single-item submission</div>`;
    return;
  }

  if (!state.currentBatchItems || state.currentBatchItems.length === 0) {
    batchItemsContainer.innerHTML = `<div class="text-gray-500 text-sm">No batch items found</div>`;
    return;
  }

  let html = '';

  state.currentBatchItems.forEach(item => {
    const cash = formatCurrency(item.cash_amount);
    const credit = formatCurrency(item.credit_amount);
    const market = formatCurrency(item.market_value);
    const reviewReason = item.manual_review_reason 
      ? `<div class="text-xs text-amber-400 mt-1">Review: ${safeText(item.manual_review_reason)}</div>` 
      : '';

    html += `
      <div class="bg-zinc-900 border border-zinc-800 rounded-xl p-4 text-sm">
        <div class="font-medium">${safeText(item.title)}</div>
        <div class="text-xs text-zinc-400 mt-1">${safeText(item.platform)} • ${safeText(item.condition)} • Qty: ${safeText(item.quantity)}</div>
        <div class="mt-3 grid grid-cols-3 gap-2 text-xs">
          <div>
            <div class="text-zinc-500">Market</div>
            <div class="font-mono">${market}</div>
          </div>
          <div>
            <div class="text-zinc-500">Cash</div>
            <div class="font-mono text-[var(--yellow)]">${cash}</div>
          </div>
          <div>
            <div class="text-zinc-500">Credit</div>
            <div class="font-mono text-[var(--teal)]">${credit}</div>
          </div>
        </div>
        ${reviewReason}
      </div>
    `;
  });

  batchItemsContainer.innerHTML = html;
}

function renderSelectedPanel() {
  const item = state.submissions.find(s => s.id === state.selectedId);

  if (!item) {
    if (selectedIdEl) selectedIdEl.textContent = '—';
    if (selectedEmailEl) selectedEmailEl.textContent = 'Select a submission';
    if (selectedTitleEl) selectedTitleEl.textContent = '—';
    if (selectedSubtitleEl) selectedSubtitleEl.textContent = '—';
    if (selectedNotesEl) selectedNotesEl.textContent = '—';
    if (selectedMarketValueEl) selectedMarketValueEl.textContent = '—';
    if (selectedOfferAmountEl) selectedOfferAmountEl.textContent = '—';
    if (selectedCreditAmountEl) selectedCreditAmountEl.textContent = '—';
    if (selectedOfferTypeEl) selectedOfferTypeEl.textContent = '—';
    if (selectedRiskEl) selectedRiskEl.textContent = '—';
    if (selectedInternalNotesEl) selectedInternalNotesEl.value = '';
    if (finalCashInput) finalCashInput.value = '';
    if (finalCreditInput) finalCreditInput.value = '';
    renderPhotoGallery([]);
    // NEW: reset batch panel
    if (batchItemsContainer) batchItemsContainer.innerHTML = `<div class="text-gray-500 text-sm">Select a submission</div>`;
    return;
  }

  if (selectedIdEl) selectedIdEl.textContent = `#${item.id}`;
  if (selectedEmailEl) selectedEmailEl.textContent = safeText(item.customer_email);
  if (selectedTitleEl) selectedTitleEl.textContent = getPrimaryTitle(item);
  if (selectedSubtitleEl) selectedSubtitleEl.textContent = getSubtitle(item);
  if (selectedNotesEl) selectedNotesEl.textContent = safeText(item.notes, 'No customer notes submitted.');
  if (selectedMarketValueEl) selectedMarketValueEl.textContent = formatCurrency(item.market_value);
  if (selectedOfferAmountEl) selectedOfferAmountEl.textContent = formatCurrency(item.cash_amount);
  if (selectedCreditAmountEl) selectedCreditAmountEl.textContent = formatCurrency(item.credit_amount);
  if (selectedOfferTypeEl) selectedOfferTypeEl.textContent = safeText(item.offer_type);

  if (selectedRiskEl) {
    selectedRiskEl.textContent = getRiskLabel(item);
    selectedRiskEl.className = `mt-1 font-semibold ${getRiskClass(item)}`;
  }

  if (selectedInternalNotesEl) selectedInternalNotesEl.value = item.internal_notes || '';

  if (finalCashInput) finalCashInput.value = item.final_cash_offer ?? '';
  if (finalCreditInput) finalCreditInput.value = item.final_credit_offer ?? '';

  const photos = parsePhotoUrls(item.photo_urls);
  renderPhotoGallery(photos);

  // NEW: Handle batch items display
  if (isBatchSubmission(item)) {
    loadSubmissionItems(item.id);
  } else {
    state.currentBatchItems = [];
    if (batchItemsContainer) {
      batchItemsContainer.innerHTML = `<div class="text-gray-500 text-sm">Single-item submission</div>`;
    }
  }
}

function renderPhotoGallery(photos) {
  const gallery = document.getElementById('photo-gallery');
  if (!gallery) return;

  gallery.innerHTML = '';

  if (photos.length === 0) {
    gallery.innerHTML = '<p class="text-gray-500 text-sm col-span-3">No photos uploaded</p>';
    return;
  }

  photos.forEach(url => {
    const thumb = document.createElement('img');
    thumb.src = url;
    thumb.alt = 'Submission photo';
    thumb.className = 'w-full aspect-square object-cover rounded-xl border border-zinc-700 hover:border-[var(--teal)] hover:scale-105 cursor-pointer transition duration-200';
    thumb.onclick = () => openPhotoModal(url);
    gallery.appendChild(thumb);
  });
}

// Lightbox
function openPhotoModal(url) {
  if (!photoModal || !modalImage) return;
  modalImage.src = url;
  photoModal.classList.remove('hidden');
  document.addEventListener('keydown', handleEscKey);
}

function closePhotoModal() {
  if (!photoModal || !modalImage) return;
  photoModal.classList.add('hidden');
  modalImage.src = '';
  document.removeEventListener('keydown', handleEscKey);
}

function handleEscKey(e) {
  if (e.key === 'Escape') closePhotoModal();
}

if (photoModal) {
  photoModal.addEventListener('click', (e) => {
    if (e.target === photoModal) closePhotoModal();
  });
}

function applyFiltersAndSort() {
  let items = [...state.submissions];

  if (state.activeFilter !== 'all') {
    items = items.filter(item => {
      const status = (item.status || '').toLowerCase();
      const offerType = (item.offer_type || '').toLowerCase();
      if (state.activeFilter === 'accepted') return status === 'accepted';
      if (state.activeFilter === 'completed') return status === 'completed';
      if (state.activeFilter === 'manual') return !!item.manual_review_reason || offerType.includes('manual');
      if (state.activeFilter === 'range') return offerType.includes('range');
      if (state.activeFilter === 'instant') return offerType.includes('instant');
      return true;
    });
  }

  if (state.searchTerm) {
    const term = state.searchTerm.toLowerCase();
    items = items.filter(item =>
      (item.game_title_or_description || '').toLowerCase().includes(term) ||
      (item.customer_email || '').toLowerCase().includes(term) ||
      String(item.id).includes(term)
    );
  }

  if (state.sortMode === 'highest_value') {
    items.sort((a, b) => (Number(b.market_value) || 0) - (Number(a.market_value) || 0));
  } else if (state.sortMode === 'needs_review') {
    items.sort((a, b) => (b.manual_review_reason ? 1 : 0) - (a.manual_review_reason ? 1 : 0));
  } else {
    items.sort((a, b) => new Date(b.submitted_at || 0) - new Date(a.submitted_at || 0));
  }

  state.filteredSubmissions = items;

  if (!state.selectedId && items.length) {
    state.selectedId = items[0].id;
  }

  const selectedStillExists = items.some(item => item.id === state.selectedId);
  if (!selectedStillExists) {
    state.selectedId = items.length ? items[0].id : null;
  }

  renderQueue();
  renderSelectedPanel();
}

async function loadSubmissions() {
  if (queueLoading) queueLoading.classList.remove('hidden');
  if (queueList) queueList.classList.add('hidden');
  if (queueEmpty) queueEmpty.classList.add('hidden');

  try {
    const res = await fetch('/.netlify/functions/get-submissions');
    const data = await res.json();
    state.submissions = Array.isArray(data.submissions) ? data.submissions : [];
    updateStats();
    applyFiltersAndSort();
  } catch (e) {
    console.error(e);
    if (queueEmpty) {
      queueEmpty.classList.remove('hidden');
      queueEmpty.textContent = 'Failed to load submissions';
    }
    showMessage('Failed to load submissions', 'error');
  } finally {
    if (queueLoading) queueLoading.classList.add('hidden');
  }
}

function updateStats() {
  const today = new Date().toDateString();
  const newTodayCount = state.submissions.filter(s => {
    if (!s.submitted_at) return false;
    return new Date(s.submitted_at).toDateString() === today;
  }).length;

  const manualReviewCount = state.submissions.filter(s => !!s.manual_review_reason).length;
  const acceptedCount = state.submissions.filter(s => (s.status || '').toLowerCase() === 'accepted').length;

  const potentialBuyCost = state.submissions.reduce((sum, s) => sum + getCommittedBuyValue(s), 0);
  const incomingRetailValue = state.submissions.reduce((sum, s) => sum + (Number(s.market_value) || 0), 0);

  if (statNewToday) statNewToday.textContent = newTodayCount;
  if (statManualReview) statManualReview.textContent = manualReviewCount;
  if (statAccepted) statAccepted.textContent = acceptedCount;
  if (statPotentialBuyCost) statPotentialBuyCost.textContent = formatCurrency(potentialBuyCost);
  if (statIncomingRetailValue) statIncomingRetailValue.textContent = formatCurrency(incomingRetailValue);
}

async function saveSelectedSubmission(customStatus = null, customNoteAppend = '') {
  const selected = state.submissions.find(s => s.id === state.selectedId);
  if (!selected) return;

  let notesValue = selectedInternalNotesEl ? (selectedInternalNotesEl.value || '') : '';

  if (customNoteAppend) {
    notesValue = notesValue ? `${notesValue}\n\n${customNoteAppend}` : customNoteAppend;
    if (selectedInternalNotesEl) selectedInternalNotesEl.value = notesValue;
  }

  const payload = {
    id: selected.id,
    status: customStatus || selected.status || 'pending',
    internal_notes: notesValue,
    final_cash_offer: finalCashInput && finalCashInput.value !== '' ? Number(finalCashInput.value) : null,
    final_credit_offer: finalCreditInput && finalCreditInput.value !== '' ? Number(finalCreditInput.value) : null
  };

  try {
    if (saveSelectedBtn) {
      saveSelectedBtn.disabled = true;
      saveSelectedBtn.textContent = 'Saving...';
    }

    const res = await fetch('/.netlify/functions/update-submission', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload)
    });

    if (!res.ok) throw new Error('Save failed');

    showMessage('Saved successfully');
    await loadSubmissions();
    state.selectedId = selected.id;
    applyFiltersAndSort();
  } catch (e) {
    console.error(e);
    showMessage('Save failed', 'error');
  } finally {
    if (saveSelectedBtn) {
      saveSelectedBtn.disabled = false;
      saveSelectedBtn.textContent = 'Save Notes';
    }
  }
}

function setupActionButtons() {
  document.getElementById('accept-offer-btn')?.addEventListener('click', async () => {
    await saveSelectedSubmission('accepted');
    selectNextSubmission();
  });

  document.getElementById('reject-btn')?.addEventListener('click', async () => {
    await saveSelectedSubmission('rejected');
    selectNextSubmission();
  });

  document.getElementById('counteroffer-btn')?.addEventListener('click', async () => {
    const ts = new Date().toLocaleString();
    await saveSelectedSubmission(null, `Counteroffer initiated (${ts})`);
  });
}

function selectNextSubmission() {
  const filtered = state.filteredSubmissions || [];
  const currentIndex = filtered.findIndex(s => s.id === state.selectedId);
  if (currentIndex >= 0 && currentIndex < filtered.length - 1) {
    state.selectedId = filtered[currentIndex + 1].id;
    renderQueue();
    renderSelectedPanel();
  }
}

function bindEvents() {
  if (searchInput) searchInput.addEventListener('input', (e) => {
    state.searchTerm = e.target.value;
    applyFiltersAndSort();
  });

  if (sortSelect) sortSelect.addEventListener('change', (e) => {
    state.sortMode = e.target.value;
    applyFiltersAndSort();
  });

  filterButtons.forEach(btn => {
    btn.addEventListener('click', () => {
      filterButtons.forEach(b => b.classList.remove('active-filter'));
      btn.classList.add('active-filter');
      state.activeFilter = btn.dataset.filter;
      applyFiltersAndSort();
    });
  });

  if (saveSelectedBtn) saveSelectedBtn.addEventListener('click', () => saveSelectedSubmission());
  if (markReviewedBtn) markReviewedBtn.addEventListener('click', () => saveSelectedSubmission('review'));
  if (requestPhotosBtn) requestPhotosBtn.addEventListener('click', () => saveSelectedSubmission(null, 'More photos requested'));
  if (sendCounterofferBtn) sendCounterofferBtn.addEventListener('click', () => saveSelectedSubmission(null, 'Counteroffer discussion started.'));
  if (refreshDashboardBtn) refreshDashboardBtn.addEventListener('click', loadSubmissions);

  if (resetWeeklyBtn) {
    resetWeeklyBtn.addEventListener('click', () => {
      if (confirm('Reset weekly totals?')) showMessage('Weekly totals reset');
    });
  }

  if (emailCustomerBtn) {
    emailCustomerBtn.addEventListener('click', () => {
      const selected = state.submissions.find(s => s.id === state.selectedId);
      if (selected && selected.customer_email) {
        window.location.href = `mailto:${selected.customer_email}`;
      }
    });
  }
}

// ====================== NEW: PRICING CONTROLS ======================

function setPricingStatus(message, isError = false) {
  if (!pricingControlsStatus) return;
  pricingControlsStatus.textContent = message;
  if (isError) {
    pricingControlsStatus.className = 'text-sm text-red-400';
  } else {
    pricingControlsStatus.className = 'text-sm text-gray-400';
  }
}

async function loadPricingConfig() {
  if (!pricingUnder30 || !pricing30To100 || !pricingCreditMultiplier || !pricingMaxAuto) return;

  try {
    const res = await fetch('/.netlify/functions/get-pricing-config');
    const data = await res.json();

    if (data.success && data.config) {
      pricingUnder30.value = data.config.cash_percent_under_30 || '';
      pricing30To100.value = data.config.cash_percent_30_to_100 || '';
      pricingCreditMultiplier.value = data.config.credit_multiplier || '';
      pricingMaxAuto.value = data.config.max_auto_offer_value || '';

      const lastUpdated = data.config.updated_at 
        ? new Date(data.config.updated_at).toLocaleString() 
        : 'Never';
      
      setPricingStatus(`Last updated: ${lastUpdated}`);
    } else {
      setPricingStatus('Failed to load pricing config', true);
    }
  } catch (e) {
    console.error('Failed to load pricing config:', e);
    setPricingStatus('Failed to load pricing config', true);
  }
}

async function savePricingConfig() {
  if (!savePricingConfigBtn) return;

  const payload = {
    cash_percent_under_30: parseFloat(pricingUnder30.value),
    cash_percent_30_to_100: parseFloat(pricing30To100.value),
    credit_multiplier: parseFloat(pricingCreditMultiplier.value),
    max_auto_offer_value: parseFloat(pricingMaxAuto.value)
  };

  // Basic client-side validation
  if (
    isNaN(payload.cash_percent_under_30) ||
    isNaN(payload.cash_percent_30_to_100) ||
    isNaN(payload.credit_multiplier) ||
    isNaN(payload.max_auto_offer_value)
  ) {
    setPricingStatus('All fields must be valid numbers', true);
    return;
  }

  savePricingConfigBtn.disabled = true;
  savePricingConfigBtn.textContent = 'Saving...';

  try {
    const res = await fetch('/.netlify/functions/update-pricing-config', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload)
    });

    const data = await res.json();

    if (data.success) {
      const lastUpdated = data.config.updated_at 
        ? new Date(data.config.updated_at).toLocaleString() 
        : 'Just now';
      
      setPricingStatus(`Saved • Last updated: ${lastUpdated}`);
      showMessage('Pricing configuration saved successfully');
    } else {
      setPricingStatus(data.error || 'Save failed', true);
      showMessage(data.error || 'Save failed', 'error');
    }
  } catch (e) {
    console.error('Save pricing config failed:', e);
    setPricingStatus('Save failed – check console', true);
    showMessage('Failed to save pricing config', 'error');
  } finally {
    savePricingConfigBtn.disabled = false;
    savePricingConfigBtn.textContent = 'Save Pricing Config';
  }
}

function setupPricingControls() {
  // Toggle panel
  if (pricingControlsToggle && pricingControlsPanel && pricingControlsChevron) {
    pricingControlsToggle.addEventListener('click', () => {
      const isHidden = pricingControlsPanel.classList.contains('hidden');
      pricingControlsPanel.classList.toggle('hidden');
      
      if (pricingControlsChevron) {
        pricingControlsChevron.style.transform = isHidden ? 'rotate(180deg)' : 'rotate(0deg)';
      }
    });
  }

  // Save button
  if (savePricingConfigBtn) {
    savePricingConfigBtn.addEventListener('click', savePricingConfig);
  }
}

// ====================== EXISTING CODE CONTINUES ======================

function bindEvents() {
  if (searchInput) searchInput.addEventListener('input', (e) => {
    state.searchTerm = e.target.value;
    applyFiltersAndSort();
  });

  if (sortSelect) sortSelect.addEventListener('change', (e) => {
    state.sortMode = e.target.value;
    applyFiltersAndSort();
  });

  filterButtons.forEach(btn => {
    btn.addEventListener('click', () => {
      filterButtons.forEach(b => b.classList.remove('active-filter'));
      btn.classList.add('active-filter');
      state.activeFilter = btn.dataset.filter;
      applyFiltersAndSort();
    });
  });

  if (saveSelectedBtn) saveSelectedBtn.addEventListener('click', () => saveSelectedSubmission());
  if (markReviewedBtn) markReviewedBtn.addEventListener('click', () => saveSelectedSubmission('review'));
  if (requestPhotosBtn) requestPhotosBtn.addEventListener('click', () => saveSelectedSubmission(null, 'More photos requested'));
  if (sendCounterofferBtn) sendCounterofferBtn.addEventListener('click', () => saveSelectedSubmission(null, 'Counteroffer discussion started.'));
  if (refreshDashboardBtn) refreshDashboardBtn.addEventListener('click', loadSubmissions);

  if (resetWeeklyBtn) {
    resetWeeklyBtn.addEventListener('click', () => {
      if (confirm('Reset weekly totals?')) showMessage('Weekly totals reset');
    });
  }

  if (emailCustomerBtn) {
    emailCustomerBtn.addEventListener('click', () => {
      const selected = state.submissions.find(s => s.id === state.selectedId);
      if (selected && selected.customer_email) {
        window.location.href = `mailto:${selected.customer_email}`;
      }
    });
  }
}

document.addEventListener('DOMContentLoaded', async () => {
  bindEvents();
  setupActionButtons();
  setupPricingControls();        // ← NEW: only added line
  await loadSubmissions();
  await loadPricingConfig();     // ← NEW: load pricing on startup
});