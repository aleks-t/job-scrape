let allJobs = [];
let filteredJobs = [];
let currentPage = 1;
const jobsPerPage = 20;

// =============== LOAD JOBS ===============
async function loadJobs() {
  try {
    const response = await fetch("/api/jobs");
    const data = await response.json();

    allJobs = data.jobs || [];

    // sort newest first by default
    allJobs.sort((a, b) => {
      const at = a.timestamp ? Date.parse(a.timestamp) : 0;
      const bt = b.timestamp ? Date.parse(b.timestamp) : 0;
      return bt - at;
    });

    document.getElementById("job-count").textContent =
      `${data.count || allJobs.length} jobs`;

    if (data.lastUpdated) {
      const date = new Date(data.lastUpdated);
      document.getElementById("last-updated").textContent =
        `Updated ${formatTimeAgo(date)}`;
    }

    document.getElementById("loading").style.display = "none";

    applyFilters();
  } catch (err) {
    console.error("Error loading jobs:", err);
    document.getElementById("loading").innerHTML =
      "<p>Error loading jobs. Please refresh the page.</p>";
  }
}

// =============== HELPERS ===============
function formatTimeAgo(date) {
  const seconds = Math.floor((new Date() - date) / 1000);

  if (seconds < 60) return "just now";
  if (seconds < 3600) return `${Math.floor(seconds / 60)} minutes ago`;
  if (seconds < 86400) return `${Math.floor(seconds / 3600)} hours ago`;
  if (seconds < 604800) return `${Math.floor(seconds / 86400)} days ago`;

  return date.toLocaleDateString();
}

function formatPostedFromTimestamp(ts) {
  if (!ts) return "";
  const date = new Date(ts);
  if (Number.isNaN(date.getTime())) return "";
  const seconds = Math.floor((new Date() - date) / 1000);

  if (seconds < 60) return "Posted just now";
  if (seconds < 3600) return `Posted ${Math.floor(seconds / 60)} minutes ago`;
  if (seconds < 86400) return `Posted ${Math.floor(seconds / 3600)} hours ago`;
  const days = Math.floor(seconds / 86400);
  if (days === 1) return "Posted 1 day ago";
  return `Posted ${days} days ago`;
}

function escapeHtml(text) {
  if (!text && text !== 0) return "";
  const div = document.createElement("div");
  div.textContent = String(text);
  return div.innerHTML;
}

// =============== FILTERING AND SORTING ===============
function applyFilters() {
  const searchTerm = document
    .getElementById("search")
    .value.toLowerCase()
    .trim();
  const sourceFilter = document.getElementById("source-filter").value;
  const sortBy = document.getElementById("sort-by").value;

  filteredJobs = allJobs.filter(job => {
    const title = (job.title || "").toLowerCase();
    const org = (job.organization || "").toLowerCase();
    const location = (job.locationName || "").toLowerCase();

    const matchesSearch =
      !searchTerm ||
      title.includes(searchTerm) ||
      org.includes(searchTerm) ||
      location.includes(searchTerm);

    const matchesSource =
      sourceFilter === "all" || job.source === sourceFilter;

    return matchesSearch && matchesSource;
  });

  filteredJobs.sort((a, b) => {
    const at = a.timestamp ? Date.parse(a.timestamp) : 0;
    const bt = b.timestamp ? Date.parse(b.timestamp) : 0;

    switch (sortBy) {
      case "title":
        return (a.title || "").localeCompare(b.title || "");
      case "company":
        return (a.organization || "").localeCompare(b.organization || "");
      case "oldest":
        return at - bt;
      case "recent":
      default:
        return bt - at;
    }
  });

  currentPage = 1;
  renderJobs();
}

// =============== RENDER ===============
function renderJobs() {
  const container = document.getElementById("jobs-container");
  const noResults = document.getElementById("no-results");

  if (filteredJobs.length === 0) {
    container.innerHTML = "";
    noResults.style.display = "block";
    updatePagination();
    return;
  }

  noResults.style.display = "none";

  const startIdx = (currentPage - 1) * jobsPerPage;
  const endIdx = startIdx + jobsPerPage;
  const pageJobs = filteredJobs.slice(startIdx, endIdx);

  container.innerHTML = pageJobs.map(createJobCard).join("");

  document.querySelectorAll(".job-card").forEach((card, idx) => {
    const job = pageJobs[idx];
    const expandBtn = card.querySelector(".btn-expand");
    if (!expandBtn) return;

    expandBtn.addEventListener("click", e => {
      e.stopPropagation();
      toggleJobDescription(card, expandBtn);
    });
  });

  updatePagination();
}

function createJobCard(job) {
  const hasDescription = job.description && job.description.trim().length > 0;
  const compensation = job.compensation || "";
  const postedLabel = formatPostedFromTimestamp(job.timestamp);

  return `
    <div class="job-card">
      <div class="job-header">
        <div class="job-title-section">
          <h2 class="job-title">${escapeHtml(job.title)}</h2>
          <div class="job-company">${escapeHtml(job.organization)}</div>
          ${
            postedLabel
              ? `<div class="job-posted">${escapeHtml(postedLabel)}</div>`
              : ""
          }
        </div>
        <span class="job-source">${escapeHtml(job.source)}</span>
      </div>

      <div class="job-meta">
        ${
          job.locationName
            ? `<span>📍 ${escapeHtml(job.locationName)}</span>`
            : ""
        }
        ${
          job.workplaceType
            ? `<span>💼 ${escapeHtml(job.workplaceType)}</span>`
            : ""
        }
        ${
          job.employmentType
            ? `<span>⏰ ${escapeHtml(job.employmentType)}</span>`
            : ""
        }
      </div>

      ${
        compensation
          ? `<div class="job-compensation">💰 ${escapeHtml(compensation)}</div>`
          : ""
      }

      <div class="job-actions">
        ${
          hasDescription
            ? '<button class="btn-expand">📖 View Description</button>'
            : ""
        }
        <a href="${escapeHtml(job.url)}" target="_blank" class="btn-apply">
          Apply Now →
        </a>
      </div>

      ${
        hasDescription
          ? `
        <div class="job-description">
          <p>${escapeHtml(job.description)}</p>
        </div>
      `
          : ""
      }
    </div>
  `;
}

function toggleJobDescription(card, btn) {
  const description = card.querySelector(".job-description");
  if (!description) return;

  const isExpanded = description.classList.contains("expanded");

  if (isExpanded) {
    description.classList.remove("expanded");
    btn.textContent = "📖 View Description";
    card.classList.remove("expanded");
  } else {
    description.classList.add("expanded");
    btn.textContent = "📕 Hide Description";
    card.classList.add("expanded");
  }
}

function updatePagination() {
  const totalPages = Math.ceil(filteredJobs.length / jobsPerPage) || 1;

  document.getElementById("page-info").textContent =
    filteredJobs.length > 0
      ? `Page ${currentPage} of ${totalPages}`
      : "No results";

  document.getElementById("prev-page").disabled = currentPage <= 1;
  document.getElementById("next-page").disabled = currentPage >= totalPages;
}

// =============== EVENTS ===============
document.getElementById("search").addEventListener("input", applyFilters);
document
  .getElementById("source-filter")
  .addEventListener("change", applyFilters);
document.getElementById("sort-by").addEventListener("change", applyFilters);

document.getElementById("prev-page").addEventListener("click", () => {
  if (currentPage > 1) {
    currentPage -= 1;
    renderJobs();
    window.scrollTo({ top: 0, behavior: "smooth" });
  }
});

document.getElementById("next-page").addEventListener("click", () => {
  const totalPages = Math.ceil(filteredJobs.length / jobsPerPage) || 1;
  if (currentPage < totalPages) {
    currentPage += 1;
    renderJobs();
    window.scrollTo({ top: 0, behavior: "smooth" });
  }
});

document.getElementById("refresh-btn").addEventListener("click", async () => {
  const btn = document.getElementById("refresh-btn");
  btn.disabled = true;
  btn.textContent = "⏳ Scraping...";

  try {
    await fetch("/api/scrape", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ days: 1 })
    });

    const checkInterval = setInterval(async () => {
      const status = await fetch("/api/status").then(r => r.json());

      if (!status.isRunning) {
        clearInterval(checkInterval);
        btn.disabled = false;
        btn.textContent = "🔄 Refresh Data";
        await loadJobs();
      }
    }, 3000);
  } catch (err) {
    console.error("Error triggering scraper:", err);
    btn.disabled = false;
    btn.textContent = "🔄 Refresh Data";
  }
});

// =============== INIT ===============
loadJobs();
