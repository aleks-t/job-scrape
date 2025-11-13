// ================================
// IMPORTS
// ================================
import fetch from "node-fetch";
import fs from "fs";
import { load } from "cheerio";
import { decode } from "html-entities";

// ================================
// CONFIG
// ================================
const SERP_API_KEY = "2401d0f097f85023f112eae4086831d56d92357a9204fabc392bbf14c74a666d";
const GOOGLE_SEARCH_URL = "https://serpapi.com/search.json";
const WEBSHARE_API_KEY = "y2hz6ftc00xdba2tjvma07cr8q59xot1g9brfu3i";
const WEBSHARE_PROXY_URL = "https://proxy.webshare.io/api/v2/proxy/list/";

// Global proxy list
let proxyList = [];
let proxyIndex = 0;
const proxyStats = new Map(); // Track proxy performance
const blacklistedProxies = new Set(); // Track bad proxies
const REQUEST_TIMEOUT = 10000; // 10 second timeout

// ================================
// HELPERS
// ================================
async function fetchProxies() {
  try {
    const allProxies = [];
    let page = 1;
    let hasMore = true;
    
    while (hasMore) {
      const response = await fetch(`${WEBSHARE_PROXY_URL}?mode=direct&page=${page}&page_size=100`, {
        headers: {
          "Authorization": `Token ${WEBSHARE_API_KEY}`
        }
      });
      
      if (!response.ok) {
        const errorText = await response.text();
        console.error(`Failed to fetch proxies (page ${page}): ${response.status}`);
        console.error(`Error details: ${errorText}`);
        break;
      }
      
      const data = await response.json();
      const proxies = data.results || [];
      
      if (proxies.length === 0) {
        break;
      }
      
      allProxies.push(...proxies);
      
      // Check if there's a next page
      hasMore = data.next !== null;
      page++;
    }
    
    return allProxies;
  } catch (err) {
    console.error(`Error fetching proxies: ${err.message}`);
    return [];
  }
}

function getNextProxy() {
  if (!proxyList.length) return null;
  
  // Filter out blacklisted proxies
  const availableProxies = proxyList.filter((_, idx) => !blacklistedProxies.has(idx));
  
  if (availableProxies.length === 0) {
    // All proxies blacklisted, clear blacklist and start over
    console.error("All proxies blacklisted, resetting...");
    blacklistedProxies.clear();
    return getNextProxy();
  }
  
  // Find the proxy with best performance (lowest avg response time)
  let bestProxyIdx = proxyIndex;
  let bestAvgTime = Infinity;
  
  // Check next 10 proxies for the fastest one
  for (let i = 0; i < Math.min(10, proxyList.length); i++) {
    const idx = (proxyIndex + i) % proxyList.length;
    
    if (blacklistedProxies.has(idx)) continue;
    
    const stats = proxyStats.get(idx);
    if (stats) {
      const avgTime = stats.totalTime / stats.requests;
      if (avgTime < bestAvgTime) {
        bestAvgTime = avgTime;
        bestProxyIdx = idx;
      }
    } else {
      // Prefer untested proxies
      bestProxyIdx = idx;
      break;
    }
  }
  
  const proxy = proxyList[bestProxyIdx];
  proxyIndex = (bestProxyIdx + 1) % proxyList.length;
  
  return {
    url: `http://${proxy.username}:${proxy.password}@${proxy.proxy_address}:${proxy.port}`,
    index: bestProxyIdx
  };
}

function recordProxyPerformance(proxyIdx, responseTime, success) {
  if (!proxyStats.has(proxyIdx)) {
    proxyStats.set(proxyIdx, { requests: 0, totalTime: 0, failures: 0 });
  }
  
  const stats = proxyStats.get(proxyIdx);
  stats.requests++;
  stats.totalTime += responseTime;
  
  if (!success) {
    stats.failures++;
    
    // Blacklist proxy if failure rate > 50% and has at least 3 requests
    if (stats.requests >= 3 && stats.failures / stats.requests > 0.5) {
      blacklistedProxies.add(proxyIdx);
      console.error(`Blacklisted proxy ${proxyIdx} (${stats.failures}/${stats.requests} failures)`);
    }
  }
}

async function fetchWithRetry(url, options, maxRetries = 3) {
  for (let attempt = 0; attempt < maxRetries; attempt++) {
    const startTime = Date.now();
    let proxyInfo = null;
    
    try {
      // Get a fresh proxy for each attempt
      proxyInfo = getNextProxy();
      if (proxyInfo) {
        const { HttpsProxyAgent } = await import('https-proxy-agent');
        options.agent = new HttpsProxyAgent(proxyInfo.url);
      }
      
      // Add timeout
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), REQUEST_TIMEOUT);
      options.signal = controller.signal;
      
      const response = await fetch(url, options);
      clearTimeout(timeoutId);
      
      const responseTime = Date.now() - startTime;
      if (proxyInfo) {
        recordProxyPerformance(proxyInfo.index, responseTime, response.ok);
      }
      
      return response;
    } catch (err) {
      const responseTime = Date.now() - startTime;
      
      if (proxyInfo) {
        recordProxyPerformance(proxyInfo.index, responseTime, false);
      }
      
      if (attempt === maxRetries - 1) {
        throw err; // Last attempt failed, throw the error
      }
      
      // Wait before retrying (exponential backoff)
      await delay(Math.pow(2, attempt) * 100);
    }
  }
}

function delay(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

function stripHtml(html) {
  if (!html) return "";
  
  try {
    // First decode ALL HTML entities using html-entities library
    const decoded = decode(html);
    
    // Then load with cheerio to strip tags
    const $ = load(decoded);
    
    // Extract text content
    let text = $.text();
    
    // Collapse multiple spaces and trim
    return text.replace(/\s+/g, " ").trim();
  } catch (err) {
    // Fallback: decode then strip with regex
    try {
      const decoded = decode(html);
      let text = decoded.replace(/<[^>]+>/g, " ");
      return text.replace(/\s+/g, " ").trim();
    } catch {
      // Last resort
      let text = html.replace(/<[^>]+>/g, " ");
      return text.replace(/\s+/g, " ").trim();
    }
  }
}

function parseArgs() {
  const args = process.argv.slice(2);
  
  if (args.length === 0) {
    return { keyword: null, daysBack: 7 };
  }
  
  if (args.length === 1) {
    const arg = args[0];
    if (/^\d+$/.test(arg)) {
      return { keyword: null, daysBack: parseInt(arg) };
    } else {
      return { keyword: arg, daysBack: null };
    }
  }
  
  if (args.length === 2) {
    return { keyword: args[0], daysBack: parseInt(args[1]) };
  }
  
  throw new Error("Usage: node ash.js [keyword] [days] | node ash.js [days] | node ash.js [keyword]");
}

function saveJSON(data) {
  const file = `jobs_${new Date().toISOString().slice(0, 10)}.json`;
  fs.writeFileSync(file, JSON.stringify(data, null, 2));
  console.error(`Saved JSON: ${file}`);
}

function saveCSV(rows) {
  if (!rows.length) {
    console.error("No rows to export in CSV.");
    return;
  }

  const headers = [
    "source",
    "organization",
    "id",
    "title",
    "locationName",
    "workplaceType",
    "employmentType",
    "compensation",
    "url",
    "description"
  ];

  const csv = [
    headers.join(","),
    ...rows.map((r) =>
      headers
        .map((h) => {
          const val = r[h] ?? "";
          return JSON.stringify(val);
        })
        .join(",")
    )
  ].join("\n");

  const file = `jobs_${new Date().toISOString().slice(0, 10)}.csv`;
  fs.writeFileSync(file, csv);
  console.error(`Saved CSV: ${file}`);
}

// ================================
// SERPAPI FETCHERS
// ================================
async function fetchGoogleResults(site, keyword, daysBack, maxPages = 5) {
  const urls = new Set();
  
  let query = `site:${site}`;
  if (keyword) query += ` ${keyword}`;
  
  console.error(`Searching: ${query}`);
  if (daysBack) console.error(`Days back: ${daysBack}`);
  
  for (let page = 0; page < maxPages; page++) {
    const params = new URLSearchParams({
      api_key: SERP_API_KEY,
      q: query,
      num: "10",
      start: String(page * 10)
    });
    
    if (daysBack) {
      params.set("tbs", `qdr:d${daysBack}`);
    }
    
    try {
      const response = await fetch(`${GOOGLE_SEARCH_URL}?${params}`);
      const data = await response.json();
      
      const organic = data.organic_results || [];
      
      if (organic.length === 0) break;
      
      organic.forEach(r => {
        if (r.link) urls.add(r.link);
      });
      
    } catch (err) {
      console.error(`Error fetching page ${page + 1}: ${err.message}`);
    }
  }
  
  return [...urls];
}

// ================================
// ASHBY EXTRACTORS
// ================================
function extractAshbyOrg(url) {
  try {
    const u = new URL(url);
    if (!u.hostname.includes("jobs.ashbyhq.com")) return null;
    
    const parts = u.pathname.split("/").filter(Boolean);
    return parts.length > 0 ? decodeURIComponent(parts[0]) : null;
  } catch {
    return null;
  }
}

async function fetchAshbyJobs(orgName) {
  const body = {
    operationName: "ApiJobBoardWithTeams",
    variables: { organizationHostedJobsPageName: orgName },
    query: `
      query ApiJobBoardWithTeams($organizationHostedJobsPageName: String!) {
        jobBoard: jobBoardWithTeams(
          organizationHostedJobsPageName: $organizationHostedJobsPageName
        ) {
          jobPostings {
            id
            title
            locationName
            workplaceType
            employmentType
            compensationTierSummary
            __typename
          }
          __typename
        }
      }
    `
  };

  try {
    const fetchOptions = {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(body)
    };
    
    const response = await fetchWithRetry(
      "https://jobs.ashbyhq.com/api/non-user-graphql?op=ApiJobBoardWithTeams",
      fetchOptions
    );

    if (!response.ok) {
      console.error(`Ashby jobBoard HTTP ${response.status} for ${orgName}`);
      return [];
    }

    const json = await response.json();
    return json.data?.jobBoard?.jobPostings || [];
  } catch (err) {
    console.error(`Error fetching Ashby jobs for ${orgName}: ${err.message}`);
    return [];
  }
}

async function fetchAshbyJobDetail(orgName, jobId) {
  const body = {
    operationName: "ApiJobPosting",
    variables: {
      organizationHostedJobsPageName: orgName,
      jobPostingId: jobId
    },
    query: `
      query ApiJobPosting($organizationHostedJobsPageName: String!, $jobPostingId: String!) {
        jobPosting(
          organizationHostedJobsPageName: $organizationHostedJobsPageName
          jobPostingId: $jobPostingId
        ) {
          id
          title
          departmentName
          locationName
          locationAddress
          workplaceType
          employmentType
          descriptionHtml
          isListed
          isConfidential
          teamNames
          secondaryLocationNames
          compensationTierSummary
          scrapeableCompensationSalarySummary
          __typename
        }
      }
    `
  };

  try {
    const fetchOptions = {
      method: "POST",
      headers: {
        "content-type": "application/json",
        "apollographql-client-name": "frontend_non_user",
        "apollographql-client-version": "0.1.0"
      },
      body: JSON.stringify(body)
    };
    
    const response = await fetchWithRetry(
      "https://jobs.ashbyhq.com/api/non-user-graphql?op=ApiJobPosting",
      fetchOptions
    );

    if (!response.ok) {
      console.error(`Ashby job detail HTTP ${response.status} for ${orgName}/${jobId}`);
      return null;
    }

    const json = await response.json();
    return json.data?.jobPosting || null;
  } catch (err) {
    console.error(`Error fetching Ashby detail for ${orgName}/${jobId}: ${err.message}`);
    return null;
  }
}

// ================================
// GREENHOUSE EXTRACTORS
// ================================
function extractGreenhouseOrg(url) {
  try {
    const u = new URL(url);
    if (!u.hostname.includes("boards.greenhouse.io")) return null;
    
    const parts = u.pathname.split("/").filter(Boolean);
    return parts.length > 0 ? decodeURIComponent(parts[0]) : null;
  } catch {
    return null;
  }
}

async function fetchGreenhouseJobs(orgName) {
  const url = `https://boards-api.greenhouse.io/v1/boards/${orgName}/jobs?content=true`;

  try {
    const fetchOptions = {
      headers: { accept: "application/json" }
    };
    
    const res = await fetchWithRetry(url, fetchOptions);

    if (!res.ok) {
      console.error(`Greenhouse HTTP ${res.status} for ${orgName}`);
      return [];
    }

    const data = await res.json();
    return data.jobs || [];
  } catch (err) {
    console.error(`Error fetching Greenhouse jobs for ${orgName}: ${err.message}`);
    return [];
  }
}

// ================================
// MAIN EXECUTION
// ================================
async function main() {
  const { keyword, daysBack } = parseArgs();
  
  console.error("=================================");
  console.error("JOB SCRAPER");
  console.error("=================================");
  console.error(`Keyword: ${keyword || "none"}`);
  console.error(`Days back: ${daysBack || "all time"}`);
  console.error("");
  
  // Load proxies
  console.error("Loading Webshare proxies...");
  proxyList = await fetchProxies();
  console.error(`Loaded ${proxyList.length} proxies`);
  console.error("");
  
  const allJobs = [];
  
  // ================================
  // ASHBY SEARCH
  // ================================
  console.error("--- ASHBY SEARCH ---");
  const ashbyUrls = await fetchGoogleResults("jobs.ashbyhq.com", keyword, daysBack);
  const ashbyOrgs = new Set(ashbyUrls.map(extractAshbyOrg).filter(Boolean));
  
  console.error(`Found ${ashbyOrgs.size} Ashby organizations`);
  
  // Process Ashby orgs concurrently (increased from 5 to 10)
  const ashbyOrgArray = [...ashbyOrgs];
  const concurrency = 10;
  const jobConcurrency = 20; // Max concurrent job detail requests per org
  
  for (let i = 0; i < ashbyOrgArray.length; i += concurrency) {
    const batch = ashbyOrgArray.slice(i, i + concurrency);
    
    await Promise.all(batch.map(async (org) => {
      console.error(`\nFetching Ashby: ${org}...`);
      const briefJobs = await fetchAshbyJobs(org);
      
      // Process jobs in batches to avoid overwhelming proxies
      const jobBatches = [];
      for (let j = 0; j < briefJobs.length; j += jobConcurrency) {
        jobBatches.push(briefJobs.slice(j, j + jobConcurrency));
      }
      
      const allOrgJobs = [];
      for (const jobBatch of jobBatches) {
        const jobPromises = jobBatch.map(async (job) => {
          const detail = await fetchAshbyJobDetail(org, job.id);
          
          const compensation =
            detail?.scrapeableCompensationSalarySummary ||
            detail?.compensationTierSummary ||
            job.compensationTierSummary ||
            "";
          
          return {
            source: "ashby",
            organization: org,
            id: job.id,
            title: job.title,
            locationName: job.locationName || detail?.locationName || "",
            workplaceType: job.workplaceType || detail?.workplaceType || "",
            employmentType: job.employmentType || detail?.employmentType || "",
            compensation: compensation,
            url: `https://jobs.ashbyhq.com/${org}/${job.id}`,
            description: stripHtml(detail?.descriptionHtml || "")
          };
        });
        
        const batchResults = await Promise.all(jobPromises);
        allOrgJobs.push(...batchResults);
      }
      
      allJobs.push(...allOrgJobs);
      
      console.error(`  -> ${briefJobs.length} jobs`);
    }));
  }
  
  // ================================
  // GREENHOUSE SEARCH
  // ================================
  console.error("\n--- GREENHOUSE SEARCH ---");
  const greenhouseUrls = await fetchGoogleResults("boards.greenhouse.io", keyword, daysBack);
  const greenhouseOrgs = new Set(greenhouseUrls.map(extractGreenhouseOrg).filter(Boolean));
  
  console.error(`Found ${greenhouseOrgs.size} Greenhouse organizations`);
  
  // Process Greenhouse orgs concurrently (5 at a time)
  const greenhouseOrgArray = [...greenhouseOrgs];
  
  for (let i = 0; i < greenhouseOrgArray.length; i += concurrency) {
    const batch = greenhouseOrgArray.slice(i, i + concurrency);
    
    await Promise.all(batch.map(async (org) => {
      console.error(`\nFetching Greenhouse: ${org}...`);
      const jobs = await fetchGreenhouseJobs(org);
      
      const formattedJobs = jobs.map((j) => ({
        source: "greenhouse",
        organization: org,
        id: j.id,
        title: j.title,
        locationName: j.location?.name || "",
        workplaceType: "",
        employmentType: "",
        compensation: "",
        url: j.absolute_url,
        description: stripHtml(j.content || "")
      }));
      
      allJobs.push(...formattedJobs);
      
      console.error(`  -> ${jobs.length} jobs`);
    }));
  }
  
  // ================================
  // OUTPUT
  // ================================
  console.error("\n=================================");
  console.error(`TOTAL JOBS: ${allJobs.length}`);
  console.error(`Proxies used: ${proxyStats.size}`);
  console.error(`Proxies blacklisted: ${blacklistedProxies.size}`);
  console.error("=================================\n");
  
  // Save files
  saveJSON(allJobs);
  saveCSV(allJobs);
  
  // Also output to stdout for piping
  console.log(JSON.stringify(allJobs, null, 2));
}

main().catch((err) => {
  console.error("Fatal error:", err);
  process.exit(1);
});
