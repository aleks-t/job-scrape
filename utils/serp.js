// ================================
// SERP API SEARCH
// ================================

const SERP_API_KEY = process.env.SERP_API_KEY || "your_serp_api_key_here";

export async function serpSearch(site, keyword = "", daysBack = 3) {
  const query = keyword ? `site:${site} ${keyword}` : `site:${site}`;
  const dateRestrict = `d${daysBack}`;
  
  const params = new URLSearchParams({
    q: query,
    location: "United States",
    hl: "en",
    gl: "us",
    google_domain: "google.com",
    api_key: SERP_API_KEY,
    num: "100",
    dateRestrict: dateRestrict,
  });

  const url = `https://serpapi.com/search.json?${params}`;

  try {
    const res = await fetch(url);
    if (!res.ok) {
      console.error(`[SERP] Error ${res.status} for query: ${query}`);
      return [];
    }

    const json = await res.json();
    return json.organic_results || [];
  } catch (err) {
    console.error(`[SERP] Exception for query "${query}":`, err.message);
    return [];
  }
}

