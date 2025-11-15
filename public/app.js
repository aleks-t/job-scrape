let allJobs = [];
let filteredJobs = [];
let page = 1;
const pageSize = 50; // Show 50 jobs per page for better performance

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

    jobsContainer.appendChild(jobCard);
  });
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
