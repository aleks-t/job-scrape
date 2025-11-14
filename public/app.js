let allJobs = [];
let filteredJobs = [];
let groupedByCompany = {};
const pageSize = 20;

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
  filteredJobs = allJobs;

  jobCount.textContent = `${allJobs.length} jobs`;
  lastUpdated.textContent = `Updated: ${new Date().toLocaleString()}`;

  loading.style.display = "none";
  renderJobs();
}

function renderJobs() {
  jobsContainer.innerHTML = "";

  if (filteredJobs.length === 0) {
    noResults.style.display = "block";
    return;
  }

  noResults.style.display = "none";

  // Group jobs by company
  const grouped = {};
  filteredJobs.forEach(j => {
    if (!grouped[j.organization]) {
      grouped[j.organization] = [];
    }
    grouped[j.organization].push(j);
  });

  // Sort companies by number of jobs (descending)
  const companies = Object.keys(grouped).sort((a, b) => 
    grouped[b].length - grouped[a].length
  );

  // Render each company group
  companies.forEach(company => {
    const jobs = grouped[company];
    const companyDiv = document.createElement("div");
    companyDiv.className = "company-group";

    const companyHeader = document.createElement("div");
    companyHeader.className = "company-header";
    
    // Get company initial for icon
    const initial = company.charAt(0).toUpperCase();
    
    companyHeader.innerHTML = `
      <div class="company-name">
        <div class="company-icon">${initial}</div>
        <span class="name">${escapeHtml(company)}</span>
        <span class="job-count-badge">${jobs.length} job${jobs.length > 1 ? 's' : ''}</span>
      </div>
      <button class="toggle-btn">▼</button>
    `;

    const jobsList = document.createElement("div");
    jobsList.className = "jobs-list expanded";

    jobs.forEach(j => {
      const jobCard = document.createElement("div");
      jobCard.className = "job-card";
      
      const compensation = j.compensation ? `
        <div class="job-compensation">
          💰 ${escapeHtml(j.compensation)}
        </div>
      ` : '';

      const description = j.description ? 
        j.description.substring(0, 200) + (j.description.length > 200 ? '...' : '') : 
        '';

      jobCard.innerHTML = `
        <div class="job-header">
          <h3 class="job-title">
            <a href="${escapeHtml(j.url)}" target="_blank">${escapeHtml(j.title)}</a>
          </h3>
          <span class="job-source ${j.source}">${j.source}</span>
        </div>
        
        <div class="job-meta">
          ${j.locationName ? `<span>📍 ${escapeHtml(j.locationName)}</span>` : ''}
          ${j.workplaceType ? `<span>💼 ${escapeHtml(j.workplaceType)}</span>` : ''}
          ${j.employmentType ? `<span>⏰ ${escapeHtml(j.employmentType)}</span>` : ''}
        </div>
        
        ${compensation}
        
        ${description ? `
          <div class="job-description-preview">
            <p>${escapeHtml(description)}</p>
            ${j.description.length > 200 ? `<button class="read-more-btn">Read more...</button>` : ''}
          </div>
        ` : ''}
        
        ${j.description && j.description.length > 200 ? `
          <div class="job-description-full" style="display: none;">
            <p>${escapeHtml(j.description)}</p>
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

      jobsList.appendChild(jobCard);
    });

    companyDiv.appendChild(companyHeader);
    companyDiv.appendChild(jobsList);

    // Toggle company group
    companyHeader.onclick = () => {
      const isExpanded = jobsList.classList.contains('expanded');
      const toggleBtn = companyHeader.querySelector('.toggle-btn');
      
      if (isExpanded) {
        jobsList.classList.remove('expanded');
        toggleBtn.textContent = '▶';
      } else {
        jobsList.classList.add('expanded');
        toggleBtn.textContent = '▼';
      }
    };

    jobsContainer.appendChild(companyDiv);
  });
}

function escapeHtml(text) {
  if (!text) return '';
  const div = document.createElement('div');
  div.textContent = text;
  return div.innerHTML;
}

function applyFilters() {
  const q = document.getElementById("search").value.toLowerCase();
  const src = document.getElementById("source-filter").value;
  const sort = document.getElementById("sort-by").value;

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
  }
  if (sort === "oldest") {
    filteredJobs.sort((a, b) => new Date(a.timestamp) - new Date(b.timestamp));
  }
  if (sort === "title") {
    filteredJobs.sort((a, b) => a.title.localeCompare(b.title));
  }
  if (sort === "company") {
    filteredJobs.sort((a, b) => a.organization.localeCompare(b.organization));
  }

  renderJobs();
}

// Filters
document.getElementById("search").oninput = applyFilters;
document.getElementById("source-filter").onchange = applyFilters;
document.getElementById("sort-by").onchange = applyFilters;

// Initial sync
loadJobs();
setInterval(loadJobs, 30_000);
