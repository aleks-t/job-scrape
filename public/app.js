let allJobs = [];
let filteredJobs = [];
let page = 1;
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
  const jobsContainer = document.getElementById("jobs-container");
  const noResults = document.getElementById("no-results");

  jobsContainer.innerHTML = "";

  const start = (currentPage - 1) * PAGE_SIZE;
  const end = start + PAGE_SIZE;
  const current = filteredJobs.slice(start, end);

  if (current.length === 0) {
    noResults.style.display = "block";
    return;
  }

  noResults.style.display = "none";

  // THIS IS WHERE THE ERROR COMES FROM
  current.forEach(j => {
    const div = document.createElement("div");

    const desc =
      j.description
        ? j.description.substring(0, 200)
        : "No description available";

    div.className = "job-card";
    div.innerHTML = `
      <h3><a href="${j.url}" target="_blank">${j.title}</a></h3>
      <p class="company">${j.organization}</p>
      <p class="meta">${j.locationName || ""}</p>
      <p class="desc">${desc}</p>
    `;

    jobsContainer.appendChild(div);
  });
}


function applyFilters() {
  const q = document.getElementById("search").value.toLowerCase();
  const src = document.getElementById("source-filter").value;
  const sort = document.getElementById("sort-by").value;

  filteredJobs = allJobs.filter(j => {
    const matchText =
      j.title.toLowerCase().includes(q) ||
      j.organization.toLowerCase().includes(q) ||
      (j.locationName || "").toLowerCase().includes(q);

    const matchSource = src === "all" || j.source === src;

    return matchText && matchSource;
  });

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

  page = 1;
  renderJobs();
}

// Pagination
document.getElementById("next-page").onclick = () => {
  if (page * pageSize < filteredJobs.length) {
    page++;
    renderJobs();
  }
};

document.getElementById("prev-page").onclick = () => {
  if (page > 1) {
    page--;
    renderJobs();
  }
};

// Filter listeners
document.getElementById("search").oninput = applyFilters;
document.getElementById("source-filter").onchange = applyFilters;
document.getElementById("sort-by").onchange = applyFilters;

document.getElementById("refresh-btn").onclick = loadJobs;

// Initial load
loadJobs();
setInterval(loadJobs, 30_000); // refresh every 30 seconds
