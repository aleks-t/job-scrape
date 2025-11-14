// ================================
// IMPORTS
// ================================
import fetch from "node-fetch";
import fs from "fs";

// ================================
// CONFIG
// ================================
const SERP_API_KEY = process.env.SERP_API_KEY || ""; // Set in Railway
const GOOGLE_SEARCH_URL = "https://serpapi.com/search.json";

// ================================
// CLI ARGS
// ================================
const ARG_SEARCH =
  process.argv[2] && isNaN(process.argv[2]) ? process.argv[2] : null;

const ARG_DAYS =
  Number(isNaN(process.argv[2]) ? process.argv[3] : process.argv[2]) || 3;

console.log("Search term:", ARG_SEARCH || "none");
console.log("Days back:", ARG_DAYS);

// ================================
// HELPERS
// ================================
function extractAshbySlug(url) {
  try {
    const u = new URL(url);
    if (!u.hostname.includes("jobs.ashbyhq.com")) return null;
    const parts = u.pathname.split("/").filter(Boolean);
    return parts[0] || null;
  } catch {
    return null;
  }
}

function extractGreenhouseSlug(url) {
  try {
    const u = new URL(url);
    if (!u.hostname.includes("greenhouse.io")) return null;
    const parts = u.pathname.split("/").filter(Boolean);
    return parts[0] || null;
  } catch {
    return null;
  }
}

function filterJobs(jobs, keyword) {
  if (!keyword) return jobs;
  const k = keyword.toLowerCase();
  return jobs.filter(j => (j.title || "").toLowerCase().includes(k));
}

// ================================
// SERP API SEARCH
// ================================
async function serpSearch(site, keyword, daysBack, maxPages = 3) {
  const urls = new Set();

  let query = `site:${site}`;
  if (keyword) query += ` ${keyword}`;

  for (let page = 0; page < maxPages; page++) {
    const params = new URLSearchParams({
      api_key: SERP_API_KEY,
      q: query,
      num: "10",
      start: (page * 10).toString(),
    });

    if (daysBack) params.set("tbs", `qdr:d${daysBack}`);

    const url = `${GOOGLE_SEARCH_URL}?${params}`;

    try {
      const res = await fetch(url);
      const json = await res.json();
      const organic = json.organic_results || [];
      organic.forEach(r => r.link && urls.add(r.link));

      if (organic.length === 0) break;
    } catch (err) {
      console.error("SERP error:", err.message);
    }
  }

  return [...urls];
}

// ================================
// ASHBY
// ================================
function buildAshbyQuery(slug) {
  return {
    operationName: "ApiJobBoardWithTeams",
    variables: { organizationHostedJobsPageName: slug },
    query: `
      query ApiJobBoardWithTeams($organizationHostedJobsPageName: String!) {
        jobBoard: jobBoardWithTeams(
          organizationHostedJobsPageName: $organizationHostedJobsPageName
        ) {
          jobPostings {
            id
            title
            locationName
            employmentType
            workplaceType
          }
        }
      }
    `,
  };
}

async function fetchAshbyJobs(slug) {
  const res = await fetch(
    "https://jobs.ashbyhq.com/api/non-user-graphql?op=ApiJobBoardWithTeams",
    {
      method: "POST",
      headers: {
        "content-type": "application/json",
        accept: "*/*",
        "apollographql-client-name": "frontend_non_user",
        "apollographql-client-version": "0.1.0",
      },
      body: JSON.stringify(buildAshbyQuery(slug)),
    }
  );

  if (!res.ok) {
    console.error("Ashby API error:", res.status);
    return [];
  }

  const json = await res.json();
  const postings = json.data?.jobBoard?.jobPostings || [];

  return postings.map(j => ({
    source: "ashby",
    org: slug,
    ...j,
    url: `https://jobs.ashbyhq.com/${slug}/${j.id}`
  }));
}

// ================================
// GREENHOUSE
// ================================
async function fetchGreenhouseJobs(slug) {
  const api = `https://boards-api.greenhouse.io/v1/boards/${slug}/jobs?content=true`;

  const res = await fetch(api);
  if (!res.ok) {
    console.error("Greenhouse API error:", res.status);
    return [];
  }

  const json = await res.json();
  const jobs = json.jobs || [];

  return jobs.map(j => ({
    source: "greenhouse",
    org: slug,
    id: j.id,
    title: j.title,
    locationName: j.location?.name || "",
    employmentType: "",
    workplaceType: "",
    description: j.content || "",
    url: j.absolute_url
  }));
}

// ================================
// MAIN
// ================================
(async () => {
  console.log("\n=== SERP: DISCOVERING ASHBY ORGS ===");
  const ashbyLinks = await serpSearch("jobs.ashbyhq.com", ARG_SEARCH, ARG_DAYS);
  const ashbySlugs = [...new Set(ashbyLinks.map(extractAshbySlug).filter(Boolean))];

  console.log("Found Ashby orgs:", ashbySlugs);

  const ashbyJobs = [];
  for (const slug of ashbySlugs) {
    console.log("Fetching Ashby jobs:", slug);
    const jobs = await fetchAshbyJobs(slug);
    ashbyJobs.push(...jobs);
  }

  console.log("\n=== SERP: DISCOVERING GREENHOUSE ORGS ===");
  const ghLinks = await serpSearch("boards.greenhouse.io", ARG_SEARCH, ARG_DAYS);
  const ghSlugs = [...new Set(ghLinks.map(extractGreenhouseSlug).filter(Boolean))];

  console.log("Found Greenhouse orgs:", ghSlugs);

  const ghJobs = [];
  for (const slug of ghSlugs) {
    console.log("Fetching Greenhouse jobs:", slug);
    const jobs = await fetchGreenhouseJobs(slug);
    ghJobs.push(...jobs);
  }

  const all = [...ashbyJobs, ...ghJobs];
  console.log("\nTotal jobs found:", all.length);

  const filtered = filterJobs(all, ARG_SEARCH);

  console.log("Filtered jobs:", filtered.length);

  fs.writeFileSync("jobs.json", JSON.stringify(filtered, null, 2));
  console.log("Saved jobs.json");
})();
