import { delay, stripHtml } from "../utils/helpers.js";

// ================================
// WORKABLE SCRAPER
// ================================

export function extractWorkableAccount(url) {
  try {
    const u = new URL(url);
    if (!u.hostname.includes("apply.workable.com")) return null;
    return u.pathname.split("/").filter(Boolean)[0] || null;
  } catch {
    return null;
  }
}

export async function fetchWorkableJobs(account) {
  const url = `https://apply.workable.com/api/v3/accounts/${account}/jobs`;
  
  try {
    const response = await fetch(url, {
      method: 'POST',
      headers: {
        'accept': 'application/json, text/plain, */*',
        'content-type': 'application/json',
      },
      body: JSON.stringify({
        query: '',
        department: [],
        location: [],
        workplace: [],
        worktype: []
      })
    });

    if (!response.ok) {
      console.error(`Workable list error ${response.status} for ${account}`);
      return [];
    }

    const data = await response.json();
    return data.results || [];
  } catch (err) {
    console.error(`Workable list exception for ${account}:`, err.message);
    return [];
  }
}

export async function fetchWorkableDetail(account, shortcode) {
  const url = `https://apply.workable.com/api/v2/accounts/${account}/jobs/${shortcode}`;
  
  try {
    const response = await fetch(url, {
      headers: {
        'accept': 'application/json, text/plain, */*',
      }
    });

    if (!response.ok) {
      console.error(`Workable detail error ${response.status} for ${account}/${shortcode}`);
      return null;
    }

    return await response.json();
  } catch (err) {
    console.error(`Workable detail exception for ${account}/${shortcode}:`, err.message);
    return null;
  }
}

export async function scrapeWorkable(accounts, all) {
  for (const account of accounts) {
    console.log("[scraper] Fetching Workable jobs:", account);
    await delay(1000);
    
    const jobList = await fetchWorkableJobs(account);
    console.log(`[scraper] -> ${jobList.length} jobs from ${account}`);

    for (const job of jobList) {
      await delay(800);
      
      const detail = await fetchWorkableDetail(account, job.shortcode);
      if (!detail) continue;

      const location = job.locations && job.locations[0] 
        ? `${job.locations[0].city || ''}, ${job.locations[0].region || ''}`.trim().replace(/^,\s*|,\s*$/g, '')
        : (job.location ? `${job.location.city || ''}, ${job.location.region || ''}`.trim().replace(/^,\s*|,\s*$/g, '') : '');

      all.push({
        source: "workable",
        organization: account.split('-').map(w => w.charAt(0).toUpperCase() + w.slice(1)).join(' '),
        id: job.id.toString(),
        title: detail.title || job.title,
        locationName: location,
        workplaceType: job.workplace || "",
        employmentType: job.type || "",
        compensation: "",
        description: stripHtml(detail.description || ''),
        url: `https://apply.workable.com/${account}/j/${job.shortcode}/`,
        timestamp: new Date().toISOString()
      });
    }
  }
}

