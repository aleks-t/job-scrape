import express from "express";
import { spawn } from "child_process";
import path from "path";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const app = express();
const PORT = process.env.PORT || 8080;

// Serve frontend
app.use(express.static(path.join(__dirname, "public")));

function runScraper() {
  console.log("[server] Starting scraper…");

  const scraper = spawn("node", ["ash.js"], { stdio: "inherit" });

  scraper.on("close", code => {
    console.log(`[server] Scraper finished with code ${code}`);
  });
}

// Run once at startup
console.log("[server] Automatic scrape triggered on startup...");
runScraper();

// Schedule once every 24 hours
const DAY = 24 * 60 * 60 * 1000;
setInterval(() => {
  console.log("[server] Daily scrape triggered...");
  runScraper();
}, DAY);

app.listen(PORT, () => {
  console.log(`[server] Listening on port ${PORT}`);
  console.log("[server] Public folder:", path.join(__dirname, "public"));
});
