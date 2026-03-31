// dashboard.js - Safe updated version
// Preserves current IDs, API calls, and overall structure

const state = {
  submissions: [],
  filteredSubmissions: [],
  selectedId: null,
  activeFilter: 'all',
  searchTerm: '',
  sortMode: 'newest'
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

function showMessage(message, type = 'success') {
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
  if (sub.manual_review_reason || marketValue > 100) return 'HIGH';
  if (marketValue >= 30) return 'MEDIUM';
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

function renderQueue() {
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
    const riskLabel = getRiskLabel(item);
    const riskClass = getRiskClass(item);
    const manualBadge = item.manual_review_reason
      ? '<span class="status-chip status-review">MANUAL REVIEW</span>'
      : '';

    return `
      <div
        class="queue-row p-5 hover:bg-zinc-900 cursor-pointer flex gap-4 border-l-4 ${isActive ? 'queue-item-active' : 'border-transparent'}"
        data-id="${item.id}"
      >
        <div class="flex-1 min-w-0">
          <div class="text-sm text-zinc-400">#${item.id}</div>
          <div class="font-medium text-base mt-1 line-clamp-1">${getPrimaryTitle(item)}</div>
          <div class="text-sm text-gray-400 mt-1 line-clamp-1">${getSubtitle(item)}</div>
          <div class="text-xs text-zinc-500 mt-2 truncate">${safeText(item.customer_email)}</div>
        </div>

        <div class="text-right shrink-0 min-w-[110px]">
          <div class="text-lg font-bold text-[var(--teal)]">
            MV: ${formatCurrency(item.market_value)}
          </div>
          <div class="text-xs mt-1 text-[var(--yellow)]">
            Buy: ${formatCurrency(getCommittedBuyValue(item))}
          </div>
          ${manualBadge}
          <div class="text-[10px] mt-1 ${riskClass}">${riskLabel}</div>
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

function renderSelectedPanel() {
  const item = state.submissions.find(s => s.id === state.selectedId);

  if (!item) {
    selectedIdEl.textContent = '—';
    selectedEmailEl.textContent = 'Select a submission';
    selectedTitleEl.textContent = '—';
    selectedSubtitleEl.textContent = '—';
    selectedNotesEl.textContent = '—';
    selectedMarketValueEl.textContent = '—';
    selectedOfferAmountEl.textContent = '—';
    if (selectedCreditAmountEl) selectedCreditAmountEl.textContent = '—';
    selectedOfferTypeEl.textContent = '—';
    selectedRiskEl.textContent = '—';
    selectedInternalNotesEl.value = '';
    if (finalCashInput) finalCashInput.value = '';
    if (finalCreditInput) finalCreditInput.value = '';
    return;
  }

  selectedIdEl.textContent = `#${item.id}`;
  selectedEmailEl.textContent = safeText(item.customer_email);
  selectedTitleEl.textContent = getPrimaryTitle(item);
  selectedSubtitleEl.textContent = getSubtitle(item);
  selectedNotesEl.textContent = safeText(item.notes, 'No customer notes submitted.');
  selectedMarketValueEl.textContent = formatCurrency(item.market_value);

  // Keep offer summary showing original engine values
  selectedOfferAmountEl.textContent = formatCurrency(item.cash_amount);
  if (selectedCreditAmountEl) {
    selectedCreditAmountEl.textContent = formatCurrency(item.credit_amount);
  }

  selectedOfferTypeEl.textContent = safeText(item.offer_type);
  selectedRiskEl.textContent = getRiskLabel(item);
  selectedRiskEl.className = `mt-1 font-semibold ${getRiskClass(item)}`;

  selectedInternalNotesEl.value =
    item.internal_notes == null ? '' : String(item.internal_notes);

  if (finalCashInput) finalCashInput.value = item.final_cash_offer ?? '';
  if (finalCreditInput) finalCreditInput.value = item.final_credit_offer ?? '';
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
  queueLoading.classList.remove('hidden');
  queueList.classList.add('hidden');
  queueEmpty.classList.add('hidden');

  try {
    const res = await fetch('/.netlify/functions/get-submissions');
    const data = await res.json();

    state.submissions = Array.isArray(data.submissions) ? data.submissions : [];

    updateStats();
    applyFiltersAndSort();
  } catch (e) {
    console.error(e);
    queueEmpty.classList.remove('hidden');
    queueEmpty.textContent = 'Failed to load submissions';
    showMessage('Failed to load submissions', 'error');
  } finally {
    queueLoading.classList.add('hidden');
  }
}

function updateStats() {
  const today = new Date().toDateString();

  const newTodayCount = state.submissions.filter(s => {
    if (!s.submitted_at) return false;
    const d = new Date(s.submitted_at);
    return d.toDateString() === today;
  }).length;

  const manualReviewCount = state.submissions.filter(s => !!s.manual_review_reason).length;
  const acceptedCount = state.submissions.filter(s => (s.status || '').toLowerCase() === 'accepted').length;

  const potentialBuyCost = state.submissions.reduce((sum, s) => {
    return sum + getCommittedBuyValue(s);
  }, 0);

  const incomingRetailValue = state.submissions
    .filter(s => (s.status || '').toLowerCase() === 'accepted')
    .reduce((sum, s) => sum + (Number(s.market_value) || 0), 0);

  statNewToday.textContent = newTodayCount;
  statManualReview.textContent = manualReviewCount;
  statAccepted.textContent = acceptedCount;
  statPotentialBuyCost.textContent = formatCurrency(potentialBuyCost);

  if (statIncomingRetailValue) {
    statIncomingRetailValue.textContent = formatCurrency(incomingRetailValue);
  }
}

async function saveSelectedSubmission(customStatus = null, customNoteAppend = '') {
  const selected = state.submissions.find(s => s.id === state.selectedId);
  if (!selected) return;

  let notesValue = selectedInternalNotesEl.value || '';

  if (customNoteAppend) {
    notesValue = notesValue
      ? `${notesValue}\n\n${customNoteAppend}`
      : customNoteAppend;
    selectedInternalNotesEl.value = notesValue;
  }

  const payload = {
    id: selected.id,
    status: customStatus || selected.status || 'pending',
    internal_notes: notesValue,
    final_cash_offer: finalCashInput && finalCashInput.value !== ''
      ? Number(finalCashInput.value)
      : null,
    final_credit_offer: finalCreditInput && finalCreditInput.value !== ''
      ? Number(finalCreditInput.value)
      : null
  };

  const originalText = saveSelectedBtn ? saveSelectedBtn.textContent : '';

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

    if (!res.ok) {
      throw new Error('Save failed');
    }

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
      saveSelectedBtn.textContent = originalText;
    }
  }
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

function bindEvents() {
  searchInput.addEventListener('input', (e) => {
    state.searchTerm = e.target.value;
    applyFiltersAndSort();
  });

  sortSelect.addEventListener('change', (e) => {
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

  saveSelectedBtn.addEventListener('click', () => saveSelectedSubmission());
  markReviewedBtn.addEventListener('click', () => saveSelectedSubmission('review'));
  requestPhotosBtn.addEventListener('click', () => saveSelectedSubmission(null, 'More photos requested'));
  sendCounterofferBtn.addEventListener('click', () => saveSelectedSubmission(null, 'Counteroffer discussion started.'));
  refreshDashboardBtn.addEventListener('click', loadSubmissions);

  if (resetWeeklyBtn) {
    resetWeeklyBtn.addEventListener('click', () => {
      if (confirm('Reset weekly totals?')) {
        showMessage('Weekly totals reset (placeholder)');
      }
    });
  }

  emailCustomerBtn.addEventListener('click', () => {
    const selected = state.submissions.find(s => s.id === state.selectedId);
    if (selected && selected.customer_email) {
      window.location.href = `mailto:${selected.customer_email}`;
    } else {
      showMessage('No customer email found', 'error');
    }
  });
}

document.addEventListener('DOMContentLoaded', async () => {
  bindEvents();
  setupActionButtons();
  await loadSubmissions();
});