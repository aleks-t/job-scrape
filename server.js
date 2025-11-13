import express from "express";
import path from "path";
import { fileURLToPath } from "url";
import { spawn } from "child_process";

const app = express();
const PORT = process.env.PORT || 3000;

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// serve static frontend
app.use(express.static(path.join(__dirname, "public")));
app.use(express.json());

// in-memory cache of last scrape
let jobsCache = {
  jobs: [],
  count: 0,
  lastUpdated: null
};

let scrapeRunning = false;

// GET /api/jobs -> return cached jobs
app.get("/api/jobs", (req, res) => {
  res.json(jobsCache);
});

// GET /api/status -> is scraper running
app.get("/api/status", (req, res) => {
  res.json({ isRunning: scrapeRunning });
});

// POST /api/scrape -> trigger new scrape
app.post("/api/scrape", (req, res) => {
  if (scrapeRunning) {
    return res.status(409).json({ error: "Scrape already running" });
  }

  scrapeRunning = true;
  const days =
    req.body && Number.isInteger(req.body.days) ? String(req.body.days) : "1";

  console.log(`[server] Starting scrape for last ${days} day(s)...`);

  const child = spawn("node", ["ash.js", days], {
    cwd: __dirname,
    env: process.env
  });

  let stdoutData = "";

  child.stdout.setEncoding("utf8");
  child.stdout.on("data", chunk => {
    stdoutData += chunk;
  });

  child.stderr.setEncoding("utf8");
  child.stderr.on("data", chunk => {
    console.error("[ash.js]", chunk.trim());
  });

  child.on("close", code => {
    scrapeRunning = false;
    if (code !== 0) {
      console.error(`[server] ash.js exited with code ${code}`);
      return;
    }

    try {
      const parsed = JSON.parse(stdoutData);

      const jobs = Array.isArray(parsed)
        ? parsed
        : Array.isArray(parsed.jobs)
        ? parsed.jobs
        : [];

      jobsCache.jobs = jobs;
      jobsCache.count = jobs.length;
      jobsCache.lastUpdated = new Date().toISOString();

      console.log(`[server] Scrape complete, cached ${jobs.length} jobs`);
    } catch (err) {
      console.error("[server] Failed to parse ash.js JSON:", err.message);
    }
  });

  // respond immediately; frontend polls /api/status
  res.json({ ok: true });
});

// fallback -> index.html (SPAish)
app.get("*", (req, res) => {
  res.sendFile(path.join(__dirname, "public", "index.html"));
});

app.listen(PORT, () => {
  console.log(`[server] Listening on port ${PORT}`);
});
