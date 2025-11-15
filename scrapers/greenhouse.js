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
  for (const org of orgs) {
    console.log("[scraper] Fetching Greenhouse jobs:", org);
    await delay(1000);
    
    const jobs = await fetchGreenhouseJobs(org);
      
    for (const j of jobs) {
      all.push({
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
      });
    }
  }
}

