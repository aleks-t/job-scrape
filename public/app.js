let allJobs = [];
let filteredJobs = [];
let page = 1;
const pageSize = 50; // Show 50 jobs per page for better performance
let hiddenCompanies = JSON.parse(localStorage.getItem('hiddenCompanies') || '[]');

const jobsContainer = document.getElementById("jobs-container");
const loading = document.getElementById("loading");
const jobCount = document.getElementById("job-count");
const lastUpdated = document.getElementById("last-updated");
const noResults = document.getElementById("no-results");

async function loadJobs() {
  loading.style.display = "flex";

  const res = await fetch("/jobs");
  const data = await res.json();

  allJobs = data.jobs || [];

  jobCount.textContent = `${allJobs.length} jobs`;
  lastUpdated.textContent = `Updated: ${new Date().toLocaleString()}`;

  loading.style.display = "none";
  
  // Apply current filters instead of showing all jobs
  applyFilters();
}

function renderJobs() {
  jobsContainer.innerHTML = "";

  if (filteredJobs.length === 0) {
    noResults.style.display = "block";
    document.getElementById("pagination").style.display = "none";
    return;
  }

  noResults.style.display = "none";

  // Pagination - only render current page
  const startIdx = (page - 1) * pageSize;
  const endIdx = startIdx + pageSize;
  const pageJobs = filteredJobs.slice(startIdx, endIdx);

  // Update pagination display
  updatePagination();

  // Only render jobs for current page
  pageJobs.forEach(j => {
    const jobCard = document.createElement("div");
    jobCard.className = "job-card";
    
    const compensation = j.compensation ? `
      <div class="job-compensation">
        💰 ${escapeHtml(j.compensation)}
      </div>
    ` : '';

    // Format the description into organized sections
    const fullDescription = j.description ? formatDescription(j.description) : '';
    const shortPreview = j.description ? 
      escapeHtml(j.description.substring(0, 200)) + (j.description.length > 200 ? '...' : '') : 
      '';

    jobCard.innerHTML = `
      <div class="job-header">
        <div class="job-title-section">
          <h3 class="job-title">
            <a href="${escapeHtml(j.url)}" target="_blank">${escapeHtml(j.title)}</a>
          </h3>
          <div class="job-company">${escapeHtml(j.organization)}</div>
        </div>
        <span class="job-source ${j.source}">${j.source}</span>
      </div>
      
      <div class="job-meta">
        ${j.locationName ? `<span>📍 ${escapeHtml(j.locationName)}</span>` : ''}
        ${j.workplaceType ? `<span>💼 ${escapeHtml(j.workplaceType)}</span>` : ''}
        ${j.employmentType ? `<span>⏰ ${escapeHtml(j.employmentType)}</span>` : ''}
      </div>
      
      ${compensation}
      
      ${shortPreview ? `
        <div class="job-description-preview">
          <p>${shortPreview}</p>
          ${j.description.length > 200 ? `<button class="read-more-btn">Read more...</button>` : ''}
        </div>
      ` : ''}
      
      ${j.description && j.description.length > 200 ? `
        <div class="job-description-full" style="display: none;">
          ${fullDescription}
          <button class="read-less-btn">Read less</button>
        </div>
      ` : ''}
      
      <div class="job-actions">
        <button class="btn-hide" data-company="${escapeHtml(j.organization)}">Hide ${escapeHtml(j.organization)}</button>
        <a href="${escapeHtml(j.url)}" target="_blank" class="btn-apply">Apply Now →</a>
      </div>
    `;

    // Add read more/less functionality
    const readMoreBtn = jobCard.querySelector('.read-more-btn');
    const readLessBtn = jobCard.querySelector('.read-less-btn');
    const preview = jobCard.querySelector('.job-description-preview');
    const full = jobCard.querySelector('.job-description-full');

    if (readMoreBtn) {
      readMoreBtn.onclick = () => {
        preview.style.display = 'none';
        full.style.display = 'block';
      };
    }

    if (readLessBtn) {
      readLessBtn.onclick = () => {
        preview.style.display = 'block';
        full.style.display = 'none';
      };
    }

    // Add hide company functionality
    const hideBtn = jobCard.querySelector('.btn-hide');
    hideBtn.onclick = () => {
      hideCompany(j.organization);
    };

    jobsContainer.appendChild(jobCard);
  });
  
  // Update hidden companies badge
  updateHiddenBadge();
}

function escapeHtml(text) {
  if (!text) return '';
  const div = document.createElement('div');
  div.textContent = text;
  return div.innerHTML;
}

function formatDescription(text) {
  if (!text) return '';
  
  // Split into paragraphs
  let paragraphs = text.split(/\n\n+/);
  let formatted = '';
  
  paragraphs.forEach(para => {
    para = para.trim();
    if (!para) return;
    
    // Check if it's a section header (common patterns)
    const headerPatterns = [
      /^(Responsibilities|Requirements|Qualifications|About|What you'll do|Your responsibilities|Your expertise|Skills|Benefits|What we offer|Key responsibilities|About the role|About you|Nice to have|Bonus points|Location|Salary|Compensation|The role|Your impact|What you bring|Who you are|Your mission|The team|About us|Company|Why join|Perks|Our culture)[:\s]/i,
      /^(As a |In this role|The ideal candidate)/i
    ];
    
    const isHeader = headerPatterns.some(pattern => pattern.test(para));
    
    if (isHeader) {
      // Extract header text
      let headerText = para.split(/[:]/)[0].trim();
      let content = para.substring(headerText.length + 1).trim();
      formatted += `<h4>${escapeHtml(headerText)}</h4>`;
      if (content) {
        formatted += formatBulletPoints(content);
      }
    } else {
      // Regular paragraph - check if it contains bullet-like content
      formatted += formatBulletPoints(para);
    }
  });
  
  return formatted || escapeHtml(text);
}

function formatBulletPoints(text) {
  // Check for bullet point patterns
  const bulletPatterns = [
    /^[•\-\*]\s/gm,
    /^[\d]+\.\s/gm,
    /^\s*[•\-\*]\s/gm
  ];
  
  const hasBullets = bulletPatterns.some(pattern => pattern.test(text));
  
  if (hasBullets) {
    // Split by bullet points and create a list
    const items = text.split(/(?:^|\n)\s*(?:[•\-\*]|\d+\.)\s+/).filter(item => item.trim());
    if (items.length > 1) {
      return '<ul>' + items.map(item => `<li>${escapeHtml(item.trim())}</li>`).join('') + '</ul>';
    }
  }
  
  // Check if text has sentence-ending patterns that suggest it should be a list
  if (text.includes(';') || (text.match(/\.\s+[A-Z]/g) || []).length > 2) {
    // Split by periods or semicolons and create bullet points
    const sentences = text.split(/[.;]\s+/).filter(s => s.trim() && s.length > 20);
    if (sentences.length > 2) {
      return '<ul>' + sentences.map(sent => `<li>${escapeHtml(sent.trim())}</li>`).join('') + '</ul>';
    }
  }
  
  return `<p>${escapeHtml(text)}</p>`;
}

function applyFilters() {
  const q = document.getElementById("search").value.toLowerCase();
  const src = document.getElementById("source-filter").value;
  const sort = document.getElementById("sort-by").value;

  console.log("Filtering - Source:", src, "Sort:", sort); // Debug log

  filteredJobs = allJobs.filter(j => {
    // Filter out hidden companies
    if (hiddenCompanies.includes(j.organization)) {
      return false;
    }
    
    const matchText =
      j.title.toLowerCase().includes(q) ||
      j.organization.toLowerCase().includes(q) ||
      (j.locationName || "").toLowerCase().includes(q) ||
      (j.description || "").toLowerCase().includes(q);

    const matchSource = src === "all" || j.source === src;

    return matchText && matchSource;
  });

  // Sort
  if (sort === "recent") {
    filteredJobs.sort((a, b) => new Date(b.timestamp) - new Date(a.timestamp));
  } else if (sort === "oldest") {
    filteredJobs.sort((a, b) => new Date(a.timestamp) - new Date(b.timestamp));
  } else if (sort === "title") {
    filteredJobs.sort((a, b) => a.title.localeCompare(b.title));
  } else if (sort === "company") {
    filteredJobs.sort((a, b) => a.organization.localeCompare(b.organization));
  }

  page = 1; // Reset to first page when filtering
  renderJobs();
}

function updatePagination() {
  const totalPages = Math.ceil(filteredJobs.length / pageSize);
  const pagination = document.getElementById("pagination");
  
  if (totalPages <= 1) {
    pagination.style.display = "none";
    return;
  }
  
  pagination.style.display = "flex";
  
  document.getElementById("page-info").textContent = 
    `Page ${page} of ${totalPages} (${filteredJobs.length} jobs)`;
  
  document.getElementById("prev-page").disabled = page === 1;
  document.getElementById("next-page").disabled = page >= totalPages;
}

// Pagination controls
document.getElementById("prev-page").onclick = () => {
  if (page > 1) {
    page--;
    renderJobs();
    window.scrollTo({ top: 0, behavior: 'smooth' });
  }
};

document.getElementById("next-page").onclick = () => {
  const totalPages = Math.ceil(filteredJobs.length / pageSize);
  if (page < totalPages) {
    page++;
    renderJobs();
    window.scrollTo({ top: 0, behavior: 'smooth' });
  }
};

// Filters - prevent auto-reload from resetting filters
document.getElementById("search").oninput = applyFilters;
document.getElementById("source-filter").onchange = function(e) {
  console.log("Source filter changed to:", e.target.value);
  applyFilters();
};
document.getElementById("sort-by").onchange = function(e) {
  console.log("Sort changed to:", e.target.value);
  applyFilters();
};

// Hide/unhide company functions
function hideCompany(company) {
  if (!hiddenCompanies.includes(company)) {
    hiddenCompanies.push(company);
    localStorage.setItem('hiddenCompanies', JSON.stringify(hiddenCompanies));
    
    // Show undo toast
    showToast(`Hidden all jobs from ${company}`, () => {
      unhideCompany(company);
    });
    
    applyFilters();
  }
}

function unhideCompany(company) {
  hiddenCompanies = hiddenCompanies.filter(c => c !== company);
  localStorage.setItem('hiddenCompanies', JSON.stringify(hiddenCompanies));
  applyFilters();
}

function showToast(message, undoCallback) {
  const toast = document.createElement('div');
  toast.className = 'toast';
  toast.innerHTML = `
    <span>${escapeHtml(message)}</span>
    <button class="toast-undo">Undo</button>
    <button class="toast-close">×</button>
  `;
  
  document.body.appendChild(toast);
  
  // Fade in
  setTimeout(() => toast.classList.add('show'), 10);
  
  // Undo button
  toast.querySelector('.toast-undo').onclick = () => {
    undoCallback();
    toast.remove();
  };
  
  // Close button
  toast.querySelector('.toast-close').onclick = () => {
    toast.classList.remove('show');
    setTimeout(() => toast.remove(), 300);
  };
  
  // Auto-dismiss after 5 seconds
  setTimeout(() => {
    if (document.body.contains(toast)) {
      toast.classList.remove('show');
      setTimeout(() => toast.remove(), 300);
    }
  }, 5000);
}

function updateHiddenBadge() {
  let badge = document.getElementById('hidden-badge');
  
  if (hiddenCompanies.length > 0) {
    if (!badge) {
      badge = document.createElement('button');
      badge.id = 'hidden-badge';
      badge.className = 'hidden-badge';
      badge.onclick = showHiddenCompanies;
      document.querySelector('.stats').appendChild(badge);
    }
    badge.textContent = `${hiddenCompanies.length} hidden`;
    badge.style.display = 'inline-block';
  } else if (badge) {
    badge.style.display = 'none';
  }
}

function showHiddenCompanies() {
  if (hiddenCompanies.length === 0) return;
  
  const modal = document.createElement('div');
  modal.className = 'modal';
  modal.innerHTML = `
    <div class="modal-content">
      <div class="modal-header">
        <h2>Hidden Companies (${hiddenCompanies.length})</h2>
        <button class="modal-close">×</button>
      </div>
      <div class="modal-body">
        ${hiddenCompanies.map(company => `
          <div class="hidden-company-item">
            <span>${escapeHtml(company)}</span>
            <button class="btn-unhide" data-company="${escapeHtml(company)}">Unhide</button>
          </div>
        `).join('')}
      </div>
      <div class="modal-footer">
        <button class="btn-clear-all">Clear All</button>
      </div>
    </div>
  `;
  
  document.body.appendChild(modal);
  setTimeout(() => modal.classList.add('show'), 10);
  
  // Close button
  modal.querySelector('.modal-close').onclick = () => {
    modal.classList.remove('show');
    setTimeout(() => modal.remove(), 300);
  };
  
  // Click outside to close
  modal.onclick = (e) => {
    if (e.target === modal) {
      modal.classList.remove('show');
      setTimeout(() => modal.remove(), 300);
    }
  };
  
  // Unhide buttons
  modal.querySelectorAll('.btn-unhide').forEach(btn => {
    btn.onclick = () => {
      const company = btn.dataset.company;
      unhideCompany(company);
      btn.closest('.hidden-company-item').remove();
      
      if (hiddenCompanies.length === 0) {
        modal.classList.remove('show');
        setTimeout(() => modal.remove(), 300);
      } else {
        modal.querySelector('.modal-header h2').textContent = 
          `Hidden Companies (${hiddenCompanies.length})`;
      }
    };
  });
  
  // Clear all button
  modal.querySelector('.btn-clear-all').onclick = () => {
    hiddenCompanies = [];
    localStorage.removeItem('hiddenCompanies');
    applyFilters();
    modal.classList.remove('show');
    setTimeout(() => modal.remove(), 300);
  };
}

// Initial sync
loadJobs();

// Auto-reload every 2 minutes instead of 30 seconds to reduce lag
setInterval(() => {
  const currentSearch = document.getElementById("search").value;
  const currentSource = document.getElementById("source-filter").value;
  const currentSort = document.getElementById("sort-by").value;
  const currentPage = page;
  
  loadJobs().then(() => {
    // Restore filter states after reload
    document.getElementById("search").value = currentSearch;
    document.getElementById("source-filter").value = currentSource;
    document.getElementById("sort-by").value = currentSort;
    page = currentPage;
    applyFilters();
  });
}, 120_000); // 2 minutes
