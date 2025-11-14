// ================================
// server.js
// ================================
import express from "express";
import { spawn } from "child_process";
import path from "path";
import fs from "fs";
import { fileURLToPath } from "url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
const PORT = process.env.PORT || 8080;

// Absolute path for jobs.json (shared by scraper + API)
const JOBS_FILE = path.join(__dirname, "jobs.json");

console.log("[server] Jobs file location:", JOBS_FILE);

// ======================================================================
// SERVE FRONTEND
// ======================================================================
app.use(express.static(path.join(__dirname, "public")));

console.log("[server] Serving public folder:", path.join(__dirname, "public"));

// ======================================================================
// /jobs API ENDPOINT
// ======================================================================
app.get("/jobs", (req, res) => {
  if (!fs.existsSync(JOBS_FILE)) {
    console.log("[server] jobs.json not found. Returning empty.");
    return res.json({ jobs: [], count: 0 });
  }

  try {
    const raw = fs.readFileSync(JOBS_FILE, "utf8");
    const arr = JSON.parse(raw);
    return res.json({ jobs: arr, count: arr.length });
  } catch (err) {
    console.error("[server] Failed to parse jobs.json:", err);
    return res.json({ jobs: [], count: 0 });
  }
});

// ======================================================================
// SCRAPER RUNNER
// ======================================================================
function runScraper() {
  console.log("[server] Running scraper…");

  const scraper = spawn("node", ["ash.js"], {
    cwd: __dirname,
    stdio: "inherit"
  });

  scraper.on("close", (code) => {
    console.log(`[server] Scraper finished with code ${code}`);
  });
}

// Run immediately on startup/deploy
runScraper();

// Run daily
setInterval(runScraper, 24 * 60 * 60 * 1000);

// ======================================================================
// START SERVER
// ======================================================================
app.listen(PORT, () => {
  console.log(`[server] Listening on port ${PORT}`);
});
