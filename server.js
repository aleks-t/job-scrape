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

// ======================================================================
// SERVE PUBLIC
// ======================================================================
app.use(express.static(path.join(__dirname, "public")));
console.log("[server] Serving public folder:", path.join(__dirname, "public"));
console.log("[server] Jobs file location:", JOB_FILE);

// ======================================================================
// BLOCKING SCRAPER – WAIT UNTIL COMPLETE
// ======================================================================
function runScraperBlocking() {
  return new Promise((resolve) => {
    console.log("[server] Running scraper…");

    const scraper = spawn("node", ["ash.js"], {
      cwd: __dirname,
    });

    scraper.stdout.on("data", (d) => process.stdout.write("[scraper] " + d));
    scraper.stderr.on("data", (d) => process.stderr.write("[scraper] " + d));

    scraper.on("close", (code) => {
      console.log(`[server] Scraper exited with code ${code}`);
      resolve();
    });
  });
}

// ======================================================================
// /jobs ENDPOINT — NOW SAFE
// ======================================================================
app.get("/jobs", (req, res) => {
  if (!fs.existsSync(JOB_FILE)) {
    console.log("[server] jobs.json missing.");
    return res.json({ jobs: [], count: 0 });
  }

  try {
    const jobs = JSON.parse(fs.readFileSync(JOB_FILE, "utf8"));
    return res.json({ jobs, count: jobs.length });
  } catch (err) {
    console.error("[server] Failed reading jobs.json:", err);
    return res.json({ jobs: [], count: 0 });
  }
});

// ======================================================================
// STARTUP SEQUENCE — RUN SCRAPER FIRST
// ======================================================================
async function start() {
  console.log("[server] Starting…");

  // Run scraper before allowing users to hit /jobs
  await runScraperBlocking();

  // Start server AFTER scraper finishes
  app.listen(PORT, () => {
    console.log(`[server] Listening on port ${PORT}`);
  });

  // Daily scrape
  setInterval(runScraperBlocking, 24 * 60 * 60 * 1000);
}

start();
