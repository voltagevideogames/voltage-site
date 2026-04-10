// dashboard.js - Safe photo support added
// All existing functionality preserved - V2 batch & weekly reset enhancements
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
const statCommittedBuyCost = document.getElementById('stat-committed-buy-cost');
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
const showAllDataBtn = document.getElementById('show-all-data-btn');
const kpiScopeLabel = document.getElementById('kpi-scope-label');

// Photo modal
const photoModal = document.getElementById('photo-modal');
const modalImage = document.getElementById('modal-image');

// === Pricing Controls Elements ===
const pricingControlsToggle = document.getElementById('pricing-controls-toggle');
const pricingControlsPanel = document.getElementById('pricing-controls-panel');
const pricingControlsChevron = document.getElementById('pricing-controls-chevron');
const pricingControlsStatus = document.getElementById('pricing-controls-status');
const pricingUnder30 = document.getElementById('pricing-under-30');
const pricing30To100 = document.getElementById('pricing-30-100');
const pricingCreditMultiplier = document.getElementById('pricing-credit-multiplier');
const pricingMaxAuto = document.getElementById('pricing-max-auto');
const savePricingConfigBtn = document.getElementById('save-pricing-config-btn');

// Batch items container
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

// === PAYOUT BADGE HELPER ===
function getPayoutBadge(item) {
  const pref = (item.preferred_payout || item.preferredPayout || '').toLowerCase().trim();
  if (!pref) return '';
 
  let label = '';
  let classes = '';
 
  switch (pref) {
    case 'cash':
      label = 'Cash';
      classes = 'inline-flex items-center gap-1 text-xs bg-emerald-500/20 text-emerald-400 px-2 py-0.5 rounded-full';
      break;
    case 'credit':
      label = 'Credit';
      classes = 'inline-flex items-center gap-1 text-xs bg-violet-500/20 text-violet-400 px-2 py-0.5 rounded-full';
      break;
    case 'hybrid':
      label = 'Hybrid';
      classes = 'inline-flex items-center gap-1 text-xs bg-amber-500/20 text-amber-400 px-2 py-0.5 rounded-full';
      break;
    default:
      return '';
  }
 
  return `<span class="${classes}">${label}</span>`;
}

// === STATUS HELPERS - using existing HTML classes for consistency ===
function getStatusBadge(item) {
  const status = (item.status || 'pending').toLowerCase();
  let label = status.charAt(0).toUpperCase() + status.slice(1);
  let extraClasses = '';
  switch (status) {
    case 'pending':
      extraClasses = 'status-chip status-pending';
      label = 'Pending';
      break;
    case 'review':
      extraClasses = 'status-chip status-review';
      label = 'Under Review';
      break;
    case 'accepted':
      extraClasses = 'status-chip status-accepted';
      break;
    case 'rejected':
      extraClasses = 'status-chip status-rejected';
      break;
    case 'completed':
      extraClasses = 'status-chip status-completed';
      break;
    case 'counter_sent':
      extraClasses = 'status-chip status-review'; // safe reuse of review styling
      label = 'Counter Sent';
      break;
    default:
      extraClasses = 'status-chip status-pending';
  }
  return `<span class="${extraClasses}">${label}</span>`;
}

// === CUSTOMER FACING STATUS HELPER (for future customer comms / collector sync) ===
function getCustomerFacingStatus(item) {
  if (!item) return 'Submitted';
  
  if (item.photos_requested) {
    return "Action Needed: Upload Photos";
  }
  
  const status = (item.status || 'pending').toLowerCase();
  
  switch (status) {
    case 'pending':
      return "Submitted";
    case 'review':
      return "In Review";
    case 'counter_sent':
      return "Offer Updated";
    case 'accepted':
      return "Accepted";
    case 'rejected':
      return "Unable to Make Offer";
    case 'completed':
      return "Completed";
    default:
      return "Submitted";
  }
}

// === WEEKLY RESET HELPERS ===
function getWeeklyResetBaseline() {
  const ts = localStorage.getItem('voltageDashboardWeeklyResetAt');
  return ts ? new Date(ts) : null;
}

function setWeeklyResetBaseline() {
  localStorage.setItem('voltageDashboardWeeklyResetAt', new Date().toISOString());
}

function clearWeeklyResetBaseline() {
  localStorage.removeItem('voltageDashboardWeeklyResetAt');
}

function formatBaselineDate() {
  const baseline = getWeeklyResetBaseline();
  if (!baseline) return null;
  return baseline.toLocaleString('en-US', {
    month: '2-digit',
    day: '2-digit',
    year: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
    hour12: true
  });
}

function updateKPIScopeLabel() {
  if (!kpiScopeLabel) return;
  const baseline = getWeeklyResetBaseline();
  if (!baseline) {
    kpiScopeLabel.textContent = 'Showing all data';
    kpiScopeLabel.className = 'text-xs text-zinc-400';
  } else {
    const formatted = formatBaselineDate();
    kpiScopeLabel.textContent = `Showing submissions since ${formatted}`;
    kpiScopeLabel.className = 'text-xs text-[var(--teal)]';
  }
}

function getSubmissionsSinceBaseline(submissions) {
  const baseline = getWeeklyResetBaseline();
  if (!baseline) return submissions;
  return submissions.filter(s => {
    if (!s.submitted_at) return false;
    return new Date(s.submitted_at) >= baseline;
  });
}

// === BATCH HELPERS ===
function isBatchSubmission(item) {
  if (!item) return false;
  return normalizeString(item.submission_type) === 'batch' || (Number(item.item_count) || 0) > 1;
}

function getDisplayMarketValue(sub) {
  if (!sub) return 0;
  return isBatchSubmission(sub)
    ? (Number(sub.market_value_total) || 0)
    : (Number(sub.market_value) || 0);
}

function getDisplayCashAmount(sub) {
  if (!sub) return 0;
  return Number(sub.final_cash_offer) || (
    isBatchSubmission(sub)
      ? (Number(sub.cash_amount_total) || 0)
      : (Number(sub.cash_amount) || 0)
  );
}

function getDisplayCreditAmount(sub) {
  if (!sub) return 0;
  return Number(sub.final_credit_offer) || (
    isBatchSubmission(sub)
      ? (Number(sub.credit_amount_total) || 0)
      : (Number(sub.credit_amount) || 0)
  );
}

function getDisplayOfferType(sub) {
  if (!sub) return '—';
  return isBatchSubmission(sub)
    ? safeText(sub.offer_type_summary || sub.offer_type, '—')
    : safeText(sub.offer_type, '—');
}

// === RISK & DISPLAY ===
function getRiskLabel(sub) {
  const marketValue = getDisplayMarketValue(sub);
  const manualCount = Number(sub.manual_review_count) || 0;
  const photos = parsePhotoUrls(sub.photo_urls);
  if (manualCount > 0) return 'MEDIUM';
  if (!marketValue || marketValue <= 0) return 'HIGH';
  if (sub.condition && normalizeString(sub.condition).includes('graded')) return 'HIGH';
  if ((sub.condition && normalizeString(sub.condition).includes('sealed')) ||
      (sub.completeness && normalizeString(sub.completeness).includes('sealed'))) return 'HIGH';
  if (normalizeString(sub.platform) === 'other') return 'HIGH';
  if ((Number(sub.quantity) || 0) >= 5) return 'HIGH';
  if (marketValue >= 250) return 'HIGH';
  const lowerNotes = normalizeString(sub.notes);
  const suspiciousKeywords = ['not working','broken','cracked','water damage','missing','heavy scratches','wont read',"won't read",'untested','repro','fake','disc rot'];
  if (suspiciousKeywords.some(k => lowerNotes.includes(k))) return 'HIGH';
  if (marketValue >= 100) return 'MEDIUM';
  if (photos.length === 0) return 'MEDIUM';
  return 'LOW';
}

function getRiskClass(sub) {
  const risk = getRiskLabel(sub);
  if (risk === 'HIGH') return 'text-red-400';
  if (risk === 'MEDIUM') return 'text-yellow-400';
  return 'text-emerald-400';
}

function getCommittedBuyValue(sub) {
  return getDisplayCashAmount(sub);
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
    const isBatch = isBatchSubmission(item);
    const itemCount = isBatch ? (Number(item.item_count) || 1) : 1;
    const manualCount = Number(item.manual_review_count) || 0;
    const isAccepted = (item.status || '').toLowerCase() === 'accepted';
    const batchBadge = isBatch
      ? `<span class="inline-flex items-center gap-1 text-xs bg-amber-500/20 text-amber-400 px-2 py-0.5 rounded-full">BATCH ×${itemCount}</span>`
      : '';
    const manualBadge = manualCount > 0
      ? `<span class="inline-flex items-center gap-1 text-xs bg-red-500/20 text-red-400 px-2 py-0.5 rounded-full">⚠️ ${manualCount}</span>`
      : '';
    const photoBadge = photos.length > 0
      ? `<span class="inline-flex items-center gap-1 text-xs bg-zinc-800 px-2 py-0.5 rounded-full"><span>📷</span>${photos.length}</span>`
      : '';
    const statusBadge = getStatusBadge(item);
    const payoutBadge = getPayoutBadge(item);
    return `
      <div class="queue-row p-5 hover:bg-zinc-900 cursor-pointer flex gap-4 border-l-4 ${isActive ? 'queue-item-active' : 'border-transparent'} ${isAccepted ? 'queue-row-accepted' : ''}" data-id="${item.id}">
        <div class="flex-1 min-w-0">
          <div class="flex items-center gap-3">
            <div class="text-sm text-zinc-400">#${item.id}</div>
            ${statusBadge}
            ${payoutBadge}
          </div>
          <div class="font-medium text-base mt-1 line-clamp-1">${getPrimaryTitle(item)}</div>
          <div class="text-sm text-gray-400 mt-1 line-clamp-1">${getSubtitle(item)}</div>
          <div class="flex gap-2 mt-2">${batchBadge}${manualBadge}</div>
          <div class="text-xs text-zinc-500 mt-2">${safeText(item.customer_email)}</div>
        </div>
        <div class="text-right shrink-0">
          <div class="text-lg font-bold text-[var(--teal)]">${formatCurrency(getDisplayMarketValue(item))}</div>
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

// Load batch items
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
    const isRisky = item.manual_review_reason || (Number(item.quantity) || 0) >= 3;
    const urgencyClass = isRisky ? 'border-amber-400/50 bg-amber-900/20' : 'border-zinc-800';
    const reviewReason = item.manual_review_reason
      ? `<div class="text-xs text-amber-400 mt-2 p-2 bg-amber-900/30 rounded-lg">Review: ${safeText(item.manual_review_reason)}</div>`
      : '';
    html += `
      <div class="bg-zinc-900 ${urgencyClass} rounded-xl p-4 text-sm">
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
    if (selectedIdEl) selectedIdEl.innerHTML = '—';
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
    if (batchItemsContainer) batchItemsContainer.innerHTML = `<div class="text-gray-500 text-sm">Select a submission</div>`;
    return;
  }
  // Status in selected panel header using existing classes
  const statusHTML = getStatusBadge(item);
  if (selectedIdEl) {
    selectedIdEl.innerHTML = `#${item.id} ${statusHTML}`;
  }
  if (selectedEmailEl) selectedEmailEl.textContent = safeText(item.customer_email);
  if (selectedTitleEl) selectedTitleEl.textContent = getPrimaryTitle(item);
  if (selectedSubtitleEl) selectedSubtitleEl.textContent = getSubtitle(item);
  if (selectedNotesEl) selectedNotesEl.textContent = safeText(item.notes, 'No customer notes submitted.');
  if (selectedMarketValueEl) selectedMarketValueEl.textContent = formatCurrency(getDisplayMarketValue(item));
  if (selectedOfferAmountEl) selectedOfferAmountEl.textContent = formatCurrency(getDisplayCashAmount(item));
  if (selectedCreditAmountEl) selectedCreditAmountEl.textContent = formatCurrency(getDisplayCreditAmount(item));
  if (selectedOfferTypeEl) selectedOfferTypeEl.textContent = getDisplayOfferType(item);
  if (selectedRiskEl) {
    selectedRiskEl.textContent = getRiskLabel(item);
    selectedRiskEl.className = `mt-1 font-semibold ${getRiskClass(item)}`;
  }
   // Customer Preferred Payout
   const payoutEl = document.getElementById('selected-payout-preference');
   if (payoutEl) {
   const pref = (item.preferred_payout || item.preferredPayout || '').toLowerCase();
  if (pref === 'cash') {
    payoutEl.textContent = 'Cash';
  } else if (pref === 'credit') {
    payoutEl.textContent = 'Store Credit';
  } else if (pref === 'hybrid') {
    payoutEl.textContent = 'Hybrid';
  } else {
    payoutEl.textContent = 'Not specified';
  }
}
  if (selectedInternalNotesEl) selectedInternalNotesEl.value = item.internal_notes || '';
  if (finalCashInput) finalCashInput.value = item.final_cash_offer ?? '';
  if (finalCreditInput) finalCreditInput.value = item.final_credit_offer ?? '';
  const photos = parsePhotoUrls(item.photo_urls);
  renderPhotoGallery(photos);
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

// Lightbox functions
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
      const offerType = getDisplayOfferType(item).toLowerCase();
      if (state.activeFilter === 'accepted') return status === 'accepted';
      if (state.activeFilter === 'completed') return status === 'completed';
      if (state.activeFilter === 'manual') return !!item.manual_review_reason || (Number(item.manual_review_count) || 0) > 0 || offerType.includes('manual');
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
    items.sort((a, b) => getDisplayMarketValue(b) - getDisplayMarketValue(a));
  } else if (state.sortMode === 'needs_review') {
    items.sort((a, b) => {
      const aNeeds = !!a.manual_review_reason || (Number(a.manual_review_count) || 0) > 0;
      const bNeeds = !!b.manual_review_reason || (Number(b.manual_review_count) || 0) > 0;
      return (bNeeds ? 1 : 0) - (aNeeds ? 1 : 0);
    });
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
  const submissionsToCount = getSubmissionsSinceBaseline(state.submissions);
  const today = new Date().toDateString();
  const newTodayCount = submissionsToCount.filter(s => {
    if (!s.submitted_at) return false;
    return new Date(s.submitted_at).toDateString() === today;
  }).length;
  const manualReviewCount = submissionsToCount.filter(s =>
    !!s.manual_review_reason || (Number(s.manual_review_count) || 0) > 0
  ).length;
  const acceptedCount = submissionsToCount.filter(s => (s.status || '').toLowerCase() === 'accepted').length;
  const potentialBuyCost = submissionsToCount.reduce((sum, s) => sum + getCommittedBuyValue(s), 0);
  const incomingRetailValue = submissionsToCount.reduce((sum, s) => sum + getDisplayMarketValue(s), 0);
  // NEW: Committed Buy Cost (only accepted + completed)
  const committedBuyCost = submissionsToCount.reduce((sum, s) => {
    const status = (s.status || '').toLowerCase();
    if (status === 'accepted' || status === 'completed') {
      return sum + getCommittedBuyValue(s);
    }
    return sum;
  }, 0);
  if (statNewToday) statNewToday.textContent = newTodayCount;
  if (statManualReview) statManualReview.textContent = manualReviewCount;
  if (statAccepted) statAccepted.textContent = acceptedCount;
  if (statPotentialBuyCost) statPotentialBuyCost.textContent = formatCurrency(potentialBuyCost);
  if (statIncomingRetailValue) statIncomingRetailValue.textContent = formatCurrency(incomingRetailValue);
  if (statCommittedBuyCost) statCommittedBuyCost.textContent = formatCurrency(committedBuyCost);
  updateKPIScopeLabel();
}

// === SAFE PAYLOAD SUPPORT (with optional extraUpdates) ===
async function saveSelectedSubmission(customStatus = null, customNoteAppend = '', extraUpdates = {}) {
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
    final_credit_offer: finalCreditInput && finalCreditInput.value !== '' ? Number(finalCreditInput.value) : null,
    ...extraUpdates  // safely merge any additional fields (photos_requested, etc.)
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
    await loadSubmissions();
    state.selectedId = selected.id;
    applyFiltersAndSort();
    // Plain Save Notes confirmation only when no custom status/note is passed
    if (!customStatus && !customNoteAppend && Object.keys(extraUpdates).length === 0) {
      showMessage('Notes saved', 'success');
    }
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
    const hadNext = selectNextSubmission();
    showMessage(hadNext ? 'Submission Accepted • Next item loaded' : 'Submission Accepted', 'success');
  });
  document.getElementById('reject-btn')?.addEventListener('click', async () => {
    await saveSelectedSubmission('rejected');
    const hadNext = selectNextSubmission();
    showMessage(hadNext ? 'Submission Rejected • Next item loaded' : 'Submission Rejected', 'success');
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
    // Safe scroll into view for next item
    const nextRow = document.querySelector(`.queue-row[data-id="${state.selectedId}"]`);
    if (nextRow) {
      nextRow.scrollIntoView({ behavior: 'smooth', block: 'center' });
    }
    return true;
  }
  return false;
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
  if (markReviewedBtn) markReviewedBtn.addEventListener('click', async () => {
    await saveSelectedSubmission('review');
    showMessage('Submission moved to Review', 'success');
  });
  // Request More Photos - now also sets photos_requested flag
  if (requestPhotosBtn) {
    requestPhotosBtn.addEventListener('click', async () => {
      const now = new Date();
      const timestamp = now.toLocaleString('en-US', {
        month: '2-digit', day: '2-digit', year: 'numeric',
        hour: 'numeric', minute: '2-digit', hour12: true
      });
      const note = `More photos requested (${timestamp})`;
     
      await saveSelectedSubmission('review', note, { photos_requested: true });
      showMessage('More photos requested • Status set to Review', 'success');
    });
  }
  // Prepare/Send Counteroffer - now uses counter_sent status
  if (sendCounterofferBtn) {
    sendCounterofferBtn.addEventListener('click', async () => {
      const cashVal = finalCashInput ? finalCashInput.value.trim() : '';
      const creditVal = finalCreditInput ? finalCreditInput.value.trim() : '';
      if (!cashVal && !creditVal) {
        showMessage('Enter at least one final offer amount (cash or credit)', 'error');
        return;
      }
      const now = new Date();
      const timestamp = now.toLocaleString('en-US', {
        month: '2-digit', day: '2-digit', year: 'numeric',
        hour: 'numeric', minute: '2-digit', hour12: true
      });
      const note = `Counteroffer prepared (${timestamp})`;
      await saveSelectedSubmission('counter_sent', note);
      showMessage('Counteroffer prepared • Status set to Counter Sent • Cash/Credit values saved', 'success');
    });
  }
  if (refreshDashboardBtn) refreshDashboardBtn.addEventListener('click', loadSubmissions);
  // Weekly Reset UX
  if (resetWeeklyBtn) {
    resetWeeklyBtn.addEventListener('click', () => {
      if (confirm('Reset weekly totals baseline? This will only affect the KPI display (safe & reversible).')) {
        setWeeklyResetBaseline();
        updateStats();
        showMessage('Weekly baseline reset • KPIs now show data from now onward', 'success');
      }
    });
  }
  if (showAllDataBtn) {
    showAllDataBtn.addEventListener('click', () => {
      if (confirm('Show all historical data? This will remove the weekly baseline.')) {
        clearWeeklyResetBaseline();
        updateStats();
        showMessage('Showing all data • Weekly baseline cleared', 'success');
      }
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

// ====================== PRICING CONTROLS ======================
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
    savePricingConfigBtn.textContent = 'Save Pricing';
  }
}

function setupPricingControls() {
  if (pricingControlsToggle && pricingControlsPanel && pricingControlsChevron) {
    pricingControlsToggle.addEventListener('click', () => {
      const isHidden = pricingControlsPanel.classList.contains('hidden');
      pricingControlsPanel.classList.toggle('hidden');
      if (pricingControlsChevron) {
        pricingControlsChevron.style.transform = isHidden ? 'rotate(180deg)' : 'rotate(0deg)';
      }
    });
  }
  if (savePricingConfigBtn) {
    savePricingConfigBtn.addEventListener('click', savePricingConfig);
  }
}

// ====================== INIT ======================
document.addEventListener('DOMContentLoaded', async () => {
  bindEvents();
  setupActionButtons();
  setupPricingControls();
  await loadSubmissions();
  await loadPricingConfig();
  updateKPIScopeLabel(); // initial scope label
});