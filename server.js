import 'dotenv/config';
import express from "express";
import { spawn } from "child_process";
import path from "path";
import fs from "fs";
import { fileURLToPath } from "url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
const PORT = process.env.PORT || 8080;

const JOB_FILE = path.join(__dirname, "jobs.json");

app.use(express.static(path.join(__dirname, "public")));
console.log("[server] Serving:", path.join(__dirname, "public"));
console.log("[server] Job file:", JOB_FILE);

// ======================================================================
// NON BLOCKING SCRAPER
// ======================================================================
function runScraper() {
  console.log("[server] Running scraper…");

  const scraper = spawn("node", ["scraper.js"], {
    cwd: __dirname
  });

  scraper.stdout.on("data", d => process.stdout.write("[scraper] " + d));
  scraper.stderr.on("data", d => process.stderr.write("[scraper] " + d));

  scraper.on("close", code => {
    console.log("[server] Scraper finished with code", code);
  });
}

// ======================================================================
// /jobs ENDPOINT
// ======================================================================
app.get("/jobs", (req, res) => {
  if (!fs.existsSync(JOB_FILE)) {
    console.log("[server] jobs.json missing");
    return res.json({ jobs: [], count: 0 });
  }

  try {
    const jobs = JSON.parse(fs.readFileSync(JOB_FILE, "utf8"));
    return res.json({ jobs, count: jobs.length });
  } catch (err) {
    console.error("[server] Error reading jobs.json:", err);
    return res.json({ jobs: [], count: 0 });
  }
});

// ======================================================================
// START SERVER IMMEDIATELY (no blocking)
// ======================================================================
app.listen(PORT, () => {
  console.log("[server] Listening on port", PORT);

  // run scraper AFTER server is up
  runScraper();
});

// daily scrape
setInterval(runScraper, 24 * 60 * 60 * 1000);
