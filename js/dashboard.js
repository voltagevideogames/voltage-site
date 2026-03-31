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
const selectedOfferTypeEl = document.getElementById('selected-offer-type');
const selectedRiskEl = document.getElementById('selected-risk');
const selectedStatusEl = document.getElementById('selected-status');
const selectedInternalNotesEl = document.getElementById('selected-internal-notes');

const saveSelectedBtn = document.getElementById('save-selected-btn');
const emailCustomerBtn = document.getElementById('email-customer-btn');
const markReviewedBtn = document.getElementById('mark-reviewed-btn');
const requestPhotosBtn = document.getElementById('request-photos-btn');
const sendCounterofferBtn = document.getElementById('send-counteroffer-btn');
const refreshDashboardBtn = document.getElementById('refresh-dashboard-btn');

function showMessage(message, type = 'success') {
  globalMessage.classList.remove('hidden');

  if (type === 'error') {
    globalMessage.className = 'rounded-2xl border border-red-500/30 bg-red-500/10 text-red-200 px-4 py-3 text-sm';
  } else {
    globalMessage.className = 'rounded-2xl border border-[var(--teal)]/25 bg-[var(--teal)]/10 text-[var(--teal)] px-4 py-3 text-sm';
  }

  globalMessage.textContent = message;

  setTimeout(() => {
    globalMessage.classList.add('hidden');
  }, 3200);
}

function safeText(value, fallback = '—') {
  if (value === null || value === undefined || value === '') return fallback;
  return String(value);
}

function escapeHtml(str = '') {
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}

function formatCurrency(value) {
  const number = Number(value);
  if (Number.isNaN(number)) return '—';
  return `$${Math.round(number).toLocaleString()}`;
}

function formatDate(dateString) {
  if (!dateString) return '—';
  const date = new Date(dateString);
  if (Number.isNaN(date.getTime())) return '—';
  return date.toLocaleString();
}

function getPrimaryTitle(submission) {
  return safeText(submission.game_title_or_description, 'Submission');
}

function getSubtitle(submission) {
  const parts = [
    submission.platform,
    submission.condition,
    submission.completeness
  ].filter(Boolean);

  if (!parts.length) return 'No condition details';
  return parts.join(' • ');
}

function getStatusClass(status) {
  switch ((status || '').toLowerCase()) {
    case 'pending':
      return 'status-pending';
    case 'review':
      return 'status-review';
    case 'accepted':
      return 'status-accepted';
    case 'completed':
      return 'status-completed';
    case 'rejected':
      return 'status-rejected';
    default:
      return 'status-pending';
  }
}

function getRiskLevel(submission) {
  const hasManualReason = !!submission.manual_review_reason;
  const marketValue = Number(submission.market_value) || 0;

  if (hasManualReason || marketValue > 100) {
    return { label: 'High', className: 'risk-high' };
  }

  if (marketValue >= 30) {
    return { label: 'Medium', className: 'risk-medium' };
  }

  return { label: 'Low', className: 'risk-low' };
}

function getOfferFilterType(submission) {
  const offerType = (submission.offer_type || '').toLowerCase();

  if (submission.manual_review_reason || offerType.includes('manual')) return 'manual';
  if (offerType.includes('range')) return 'range';
  if (offerType.includes('instant')) return 'instant';

  const marketValue = Number(submission.market_value) || 0;
  if (marketValue > 100) return 'manual';
  if (marketValue >= 30) return 'range';
  return 'instant';
}

function getOfferDisplay(submission) {
  const offerType = (submission.offer_type || '').toLowerCase();

  if (offerType.includes('range')) {
    const cashLow = formatCurrency(submission.cash_low);
    const cashHigh = formatCurrency(submission.cash_high);
    const creditLow = formatCurrency(submission.credit_low);
    const creditHigh = formatCurrency(submission.credit_high);

    return {
      queueLine1: `Cash: ${cashLow} - ${cashHigh}`,
      queueLine2: `Credit: ${creditLow} - ${creditHigh}`,
      panelValue: `${cashLow} - ${cashHigh}`
    };
  }

  if (submission.manual_review_reason || offerType.includes('manual')) {
    return {
      queueLine1: 'Cash: —',
      queueLine2: 'Credit: —',
      panelValue: 'Manual Review'
    };
  }

  return {
    queueLine1: `Cash: ${formatCurrency(submission.cash_amount)}`,
    queueLine2: `Credit: ${formatCurrency(submission.credit_amount)}`,
    panelValue: formatCurrency(submission.cash_amount)
  };
}

function updateStats(submissions) {
  const today = new Date();
  const todayString = today.toDateString();

  const newTodayCount = submissions.filter(item => {
    if (!item.submitted_at) return false;
    const d = new Date(item.submitted_at);
    return d.toDateString() === todayString;
  }).length;

  const manualReviewCount = submissions.filter(item => !!item.manual_review_reason).length;
  const acceptedCount = submissions.filter(item => (item.status || '').toLowerCase() === 'accepted').length;

  const potentialBuyCost = submissions.reduce((sum, item) => {
    const cashAmount = Number(item.cash_amount) || 0;
    const cashHigh = Number(item.cash_high) || 0;

    if (['pending', 'review', 'accepted'].includes((item.status || 'pending').toLowerCase())) {
      return sum + (cashHigh || cashAmount);
    }
    return sum;
  }, 0);

  statNewToday.textContent = newTodayCount;
  statManualReview.textContent = manualReviewCount;
  statAccepted.textContent = acceptedCount;
  statPotentialBuyCost.textContent = formatCurrency(potentialBuyCost);
}

function applyFiltersAndSort() {
  let items = [...state.submissions];

  if (state.activeFilter !== 'all') {
    items = items.filter(item => {
      const status = (item.status || 'pending').toLowerCase();
      const offerBucket = getOfferFilterType(item);

      if (state.activeFilter === 'accepted') return status === 'accepted';
      if (state.activeFilter === 'completed') return status === 'completed';
      if (state.activeFilter === 'manual') return offerBucket === 'manual';
      if (state.activeFilter === 'range') return offerBucket === 'range';
      if (state.activeFilter === 'instant') return offerBucket === 'instant';
      return true;
    });
  }

  if (state.searchTerm.trim()) {
    const term = state.searchTerm.trim().toLowerCase();
    items = items.filter(item => {
      const haystack = [
        item.id,
        item.submission_id,
        item.customer_email,
        item.game_title_or_description,
        item.platform,
        item.condition,
        item.completeness,
        item.offer_type,
        item.status
      ]
        .map(value => safeText(value, ''))
        .join(' ')
        .toLowerCase();

      return haystack.includes(term);
    });
  }

  if (state.sortMode === 'highest_value') {
    items.sort((a, b) => (Number(b.market_value) || 0) - (Number(a.market_value) || 0));
  } else if (state.sortMode === 'needs_review') {
    items.sort((a, b) => {
      const aReview = a.manual_review_reason || (a.status || '').toLowerCase() === 'review' ? 1 : 0;
      const bReview = b.manual_review_reason || (b.status || '').toLowerCase() === 'review' ? 1 : 0;
      return bReview - aReview;
    });
  } else {
    items.sort((a, b) => new Date(b.submitted_at) - new Date(a.submitted_at));
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

function renderQueue() {
  if (!state.filteredSubmissions.length) {
    queueList.classList.add('hidden');
    queueEmpty.classList.remove('hidden');
    queueEmpty.textContent = 'No submissions match your current filter.';
    return;
  }

  queueEmpty.classList.add('hidden');
  queueList.classList.remove('hidden');

  queueList.innerHTML = state.filteredSubmissions.map(item => {
    const title = escapeHtml(getPrimaryTitle(item));
    const subtitle = escapeHtml(getSubtitle(item));
    const email = escapeHtml(safeText(item.customer_email));
    const offerType = escapeHtml(safeText(item.offer_type, 'Unknown'));
    const marketValue = escapeHtml(formatCurrency(item.market_value));
    const offerDisplay = getOfferDisplay(item);
    const status = (item.status || 'pending').toLowerCase();
    const risk = getRiskLevel(item);
    const isActive = item.id === state.selectedId;

    return `
      <article
        class="queue-row p-5 hover:bg-zinc-900/50 transition cursor-pointer ${isActive ? 'queue-item-active' : ''}"
        data-id="${escapeHtml(item.id)}"
      >
        <div class="grid grid-cols-1 md:grid-cols-[110px_minmax(0,1.9fr)_minmax(0,1fr)_minmax(0,1fr)_120px] gap-6 items-start">
          
          <div class="flex flex-col justify-start self-start min-w-0">
            <div class="text-xs text-zinc-500">Submission</div>
            <div class="font-mono text-[var(--teal)] leading-tight">#${escapeHtml(item.id)}</div>
          </div>

          <div class="flex flex-col justify-start self-start min-w-0">
            <div class="font-semibold leading-snug break-words">${title}</div>
            <div class="text-sm text-gray-400 leading-snug break-words">${subtitle}</div>
            <div class="text-xs text-zinc-500 mt-1 break-all">${email}</div>
          </div>

          <div class="flex flex-col justify-start self-start min-w-0">
            <div class="text-xs text-zinc-500">Offer Type</div>
            <div class="leading-tight break-words">${offerType}</div>
            <div class="text-sm text-gray-400 mt-1 leading-tight">MV ${marketValue}</div>
          </div>

          <div class="flex flex-col justify-start self-start min-w-0">
            <div class="text-xs text-zinc-500">Offer</div>
            <div class="text-sm leading-snug text-[var(--teal)]">${escapeHtml(offerDisplay.queueLine1)}</div>
            <div class="text-sm leading-snug text-[var(--yellow)]">${escapeHtml(offerDisplay.queueLine2)}</div>
          </div>

          <div class="flex flex-col justify-start self-start items-start min-w-0">
            <div class="inline-flex status-chip ${getStatusClass(status)} capitalize">${escapeHtml(status)}</div>
            <div class="text-xs mt-2 ${risk.className}">Risk: ${risk.label}</div>
          </div>

        </div>
      </article>
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
  const item = state.filteredSubmissions.find(sub => sub.id === state.selectedId)
    || state.submissions.find(sub => sub.id === state.selectedId);

  if (!item) {
    selectedIdEl.textContent = '—';
    selectedEmailEl.textContent = 'Select a submission';
    selectedTitleEl.textContent = '—';
    selectedSubtitleEl.textContent = '—';
    selectedNotesEl.textContent = '—';
    selectedMarketValueEl.textContent = '—';
    selectedOfferAmountEl.textContent = '—';
    selectedOfferTypeEl.textContent = '—';
    selectedRiskEl.textContent = '—';
    selectedStatusEl.value = 'pending';
    selectedInternalNotesEl.value = '';
    return;
  }

  const risk = getRiskLevel(item);
  const offerDisplay = getOfferDisplay(item);

  selectedIdEl.textContent = `#${item.id}`;
  selectedEmailEl.textContent = safeText(item.customer_email);
  selectedTitleEl.textContent = getPrimaryTitle(item);
  selectedSubtitleEl.textContent = getSubtitle(item);
  selectedNotesEl.textContent = item.notes || 'No customer notes submitted.';
  selectedMarketValueEl.textContent = formatCurrency(item.market_value);
  selectedOfferAmountEl.textContent = offerDisplay.panelValue;
  selectedOfferTypeEl.textContent = safeText(item.offer_type);
  selectedRiskEl.textContent = risk.label;
  selectedRiskEl.className = `mt-1 font-semibold ${risk.className}`;
  if (selectedStatusEl) {
  selectedStatusEl.value = (item.status || 'pending').toLowerCase();
}
  selectedInternalNotesEl.value = item.internal_notes || '';
}

async function loadSubmissions() {
  queueLoading.classList.remove('hidden');
  queueList.classList.add('hidden');
  queueEmpty.classList.add('hidden');

  try {
    const response = await fetch('/.netlify/functions/get-submissions');
    const data = await response.json();

    if (!response.ok) {
      throw new Error(data.error || 'Failed to load submissions.');
    }

    state.submissions = Array.isArray(data.submissions) ? data.submissions : [];
    updateStats(state.submissions);
    applyFiltersAndSort();
  } catch (error) {
    console.error(error);
    queueEmpty.classList.remove('hidden');
    queueEmpty.textContent = error.message || 'Failed to load submissions.';
    showMessage(error.message || 'Failed to load submissions.', 'error');
  } finally {
    queueLoading.classList.add('hidden');
  }
}

async function saveSelectedSubmission(customStatus = null, customNoteAppend = '') {
  const selected = state.submissions.find(item => item.id === state.selectedId);

  if (!selected) {
    showMessage('Select a submission first.', 'error');
    return;
  }

 const finalStatus = customStatus || (selectedStatusEl ? selectedStatusEl.value : 'pending');
  let notesValue = selectedInternalNotesEl.value || '';

  if (customNoteAppend) {
    notesValue = notesValue
      ? `${notesValue}\n\n${customNoteAppend}`
      : customNoteAppend;
    selectedInternalNotesEl.value = notesValue;
  }

  const originalText = saveSelectedBtn.textContent;
  saveSelectedBtn.disabled = true;
  saveSelectedBtn.textContent = 'Saving...';

  try {
    const response = await fetch('/.netlify/functions/update-submission', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        id: selected.id,
        status: finalStatus,
        internal_notes: notesValue
      })
    });

    const data = await response.json();

    if (!response.ok) {
      throw new Error(data.error || 'Failed to update submission.');
    }

    showMessage('Submission updated successfully.');
    await loadSubmissions();
    state.selectedId = selected.id;
    applyFiltersAndSort();
  } catch (error) {
    console.error(error);
    showMessage(error.message || 'Failed to update submission.', 'error');
  } finally {
    saveSelectedBtn.disabled = false;
    saveSelectedBtn.textContent = originalText;
  }
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

  filterButtons.forEach(button => {
    button.addEventListener('click', () => {
      filterButtons.forEach(btn => btn.classList.remove('active-filter'));
      button.classList.add('active-filter');
      state.activeFilter = button.dataset.filter;
      applyFiltersAndSort();
    });
  });

  saveSelectedBtn.addEventListener('click', () => {
    saveSelectedSubmission();
  });

  markReviewedBtn.addEventListener('click', () => {
    saveSelectedSubmission('review');
  });

  requestPhotosBtn.addEventListener('click', () => {
    saveSelectedSubmission(null, 'Requested more photos from customer.');
  });

  sendCounterofferBtn.addEventListener('click', () => {
    saveSelectedSubmission(null, 'Counteroffer discussion started.');
  });

  refreshDashboardBtn.addEventListener('click', loadSubmissions);

  emailCustomerBtn.addEventListener('click', () => {
    const selected = state.submissions.find(item => item.id === state.selectedId);
    if (!selected || !selected.customer_email) {
      showMessage('No customer email found for this submission.', 'error');
      return;
    }

    window.location.href = `mailto:${encodeURIComponent(selected.customer_email)}`;
  });
}

document.addEventListener('DOMContentLoaded', async () => {
  bindEvents();
  await loadSubmissions();
}); 


// ==================== SAFE ACTION BUTTON ENHANCEMENTS ====================

function getCurrentSelectedSubmission() {
  return state?.submissions?.find(s => s.id === state.selectedId);
}

function selectNextSubmissionSafe() {
  const list = state.filteredSubmissions || [];
  const currentIndex = list.findIndex(s => s.id === state.selectedId);

  if (currentIndex >= 0 && currentIndex < list.length - 1) {
    state.selectedId = list[currentIndex + 1].id;
    renderQueue();
    renderSelectedPanel();
  }
}

// Accept Offer
document.getElementById('accept-offer-btn')?.addEventListener('click', async () => {
  const selected = getCurrentSelectedSubmission();
  if (!selected) return;

  try {
    await saveSelectedSubmission('accepted');
    selectNextSubmissionSafe();
  } catch (err) {
    console.error('Accept failed', err);
  }
});

// Reject Submission
document.getElementById('reject-btn')?.addEventListener('click', async () => {
  const selected = getCurrentSelectedSubmission();
  if (!selected) return;

  try {
    await saveSelectedSubmission('rejected');
    selectNextSubmissionSafe();
  } catch (err) {
    console.error('Reject failed', err);
  }
});

// Send Counteroffer
document.getElementById('counteroffer-btn')?.addEventListener('click', async () => {
  const selected = getCurrentSelectedSubmission();
  if (!selected) return;

  const notesEl = document.getElementById('selected-internal-notes');
  if (notesEl) {
    const timestamp = new Date().toLocaleString();
    notesEl.value = notesEl.value
      ? notesEl.value + `\n\nCounteroffer initiated (${timestamp})`
      : `Counteroffer initiated (${timestamp})`;
  }

  try {
    await saveSelectedSubmission();
  } catch (err) {
    console.error('Counteroffer failed', err);
  }
});

