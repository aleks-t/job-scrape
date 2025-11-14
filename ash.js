// ================================
// IMPORTS
// ================================
import fetch from "node-fetch";

// ================================
// CLI ARGS
// ================================
const ARG_SEARCH = process.argv[2] && isNaN(process.argv[2]) ? process.argv[2] : null;
const ARG_DAYS = Number(isNaN(process.argv[2]) ? process.argv[3] : process.argv[2]) || 3;

console.log("Search term:", ARG_SEARCH || "none");
console.log("Days back:", ARG_DAYS);

// ================================
// HELPERS
// ================================
function todayMinus(daysBack) {
  const d = new Date();
  d.setDate(d.getDate() - daysBack);
  return d.toISOString().slice(0, 10);
}

// Extract company slug from URL
function extractSlug(url) {
  try {
    const u = new URL(url);
    const parts = u.pathname.split("/").filter(Boolean);
    // https://jobs.ashbyhq.com/hopper → ["hopper"]
    return parts.length ? parts[0] : null;
  } catch {
    return null;
  }
}

// ================================
// GRAPHQL TEMPLATE
// ================================
function buildQuery(slug) {
  return {
    operationName: "ApiJobBoardWithTeams",
    variables: {
      organizationHostedJobsPageName: slug
    },
    query: `query ApiJobBoardWithTeams($organizationHostedJobsPageName: String!) {
      jobBoard: jobBoardWithTeams(
        organizationHostedJobsPageName: $organizationHostedJobsPageName
      ) {
        teams {
          id
          name
        }
        jobPostings {
          id
          title
          locationName
          employmentType
          workplaceType
        }
      }
    }`
  };
}

// ================================
// MAIN FETCH
// ================================
async function fetchAshby(url) {
  const slug = extractSlug(url);
  if (!slug) {
    console.error("Could not detect Ashby slug from:", url);
    process.exit(1);
  }

  const body = JSON.stringify(buildQuery(slug));

  const res = await fetch("https://jobs.ashbyhq.com/api/non-user-graphql?op=ApiJobBoardWithTeams", {
    method: "POST",
    headers: {
      "content-type": "application/json",
      "accept": "*/*",
      "apollographql-client-name": "frontend_non_user",
      "apollographql-client-version": "0.1.0",
      "sec-ch-ua": "\"Chromium\";v=\"142\", \"Google Chrome\";v=\"142\", \"Not_A Brand\";v=\"99\"",
      "sec-ch-ua-platform": "\"macOS\"",
      "Referer": url
    },
    body
  });

  if (!res.ok) {
    console.log("Ashby API error:", res.status);
    const text = await res.text();
    console.log(text);
    process.exit(1);
  }

  const json = await res.json();
  return json.data.jobBoard.jobPostings || [];
}

// ================================
// FILTER LOGIC
// ================================
function filterJobs(jobs, keyword) {
  if (!keyword) return jobs;
  const k = keyword.toLowerCase();
  return jobs.filter(j => j.title.toLowerCase().includes(k));
}

// ================================
// RUN
// ================================
(async () => {
  // You can replace this with any public Ashby page
  const TARGET_URL = "https://jobs.ashbyhq.com/hopper";

  console.log("Fetching:", TARGET_URL);

  const allJobs = await fetchAshby(TARGET_URL);

  const filtered = filterJobs(allJobs, ARG_SEARCH);

  console.log(`Found ${filtered.length} jobs`);
  filtered.forEach(j => {
    console.log(`• ${j.title} (${j.locationName})`);
  });

})();
