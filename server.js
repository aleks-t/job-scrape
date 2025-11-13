import express from "express";
import { spawn } from "child_process";
import path from "path";
import fs from "fs";
import { fileURLToPath } from "url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
const PORT = process.env.PORT || 8080;

// ===================================================
// SERVE FRONTEND
// ===================================================
app.use(express.static(path.join(__dirname, "public")));
console.log("[server] Public folder:", path.join(__dirname, "public"));

// ===================================================
// /jobs API ENDPOINT
// ===================================================
app.get("/jobs", (req, res) => {
  const file = path.join(__dirname, "jobs.json");

  if (!fs.existsSync(file)) {
    console.log("[server] jobs.json not found.");
    return res.json({ jobs: [], count: 0 });
  }

  try {
    const raw = fs.readFileSync(file, "utf8");
    const arr = JSON.parse(raw);
    return res.json({ jobs: arr, count: arr.length });
  } catch (err) {
    console.error("[server] Error reading jobs.json:", err);
    return res.json({ jobs: [], count: 0 });
  }
});

// ===================================================
// SCRAPER RUNNER
// ===================================================
function runScraper() {
  console.log("[server] Running scraper…");

  const scraper = spawn("node", ["ash.js"], {
    cwd: __dirname,
    stdio: "inherit"
  });

  scraper.on("close", (code) => {
    console.log(`[server] Scraper exited with code ${code}`);
  });
}

// Run immediately on deploy
console.log("[server] Triggering initial scrape…");
runScraper();

// ===================================================
// DAILY SCRAPE
// ===================================================
const DAY = 24 * 60 * 60 * 1000;

setInterval(() => {
  console.log("[server] Daily scrape...");
  runScraper();
}, DAY);

// ===================================================
// START SERVER
// ===================================================
app.listen(PORT, () => {
  console.log(`[server] Listening on port ${PORT}`);
});
