import { delay, stripHtml } from "../utils/helpers.js";

// ================================
// GREENHOUSE SCRAPER
// ================================

export function extractGreenhouseSlug(url) {
  try {
    const u = new URL(url);
    if (!u.hostname.includes("boards.greenhouse.io")) return null;
    return u.pathname.split("/").filter(Boolean)[0] || null;
  } catch {
    return null;
  }
}

export async function fetchGreenhouseJobs(org) {
  try {
    const res = await fetch(
      `https://boards-api.greenhouse.io/v1/boards/${org}/jobs?content=true`
    );

    if (!res.ok) return [];

    const json = await res.json();
    return json.jobs || [];

  } catch {
    return [];
  }
}

export async function scrapeGreenhouse(orgs, all) {
  console.log(`[greenhouse] Scraping ${orgs.length} orgs concurrently...`);
  
  const results = await Promise.allSettled(
    orgs.map(async (org) => {
      try {
        const jobs = await fetchGreenhouseJobs(org);
        
        return jobs.map(j => ({
          source: "greenhouse",
          organization: org,
          id: j.id,
          title: j.title,
          locationName: j.location?.name || "",
          workplaceType: "",
          employmentType: "",
          compensation: "",
          description: stripHtml(j.content || ""),
          url: j.absolute_url,
          timestamp: new Date().toISOString()
        }));
      } catch (err) {
        console.error(`[greenhouse] Error with ${org}:`, err.message);
        return [];
      }
    })
  );
  
  results.forEach(result => {
    if (result.status === 'fulfilled') {
      all.push(...result.value);
    }
  });
  
  console.log(`[greenhouse] Scraped ${all.filter(j => j.source === 'greenhouse').length} jobs`);
}

