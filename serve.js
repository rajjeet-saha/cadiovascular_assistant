/**
 * Minimal static file server for the frontend demo (zero dependencies).
 * Serves index.html, frontend/, simulator/ and docs/ from the project root.
 *
 *   node serve.js        -> http://localhost:3001
 *   PORT=4000 node serve.js
 */

const http = require("http");
const fs = require("fs");
const path = require("path");

const PORT = Number(process.env.PORT) > 0 ? Number(process.env.PORT) : 3001;
const ROOT = __dirname;

const MIME = {
  ".html": "text/html; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".md": "text/markdown; charset=utf-8",
  ".svg": "image/svg+xml",
  ".png": "image/png",
  ".ico": "image/x-icon"
};

const server = http.createServer((req, res) => {
  let urlPath = decodeURIComponent(req.url.split("?")[0]);

  if (urlPath === "/" || urlPath === "") urlPath = "/index.html";

  // directory-style URLs -> index.html
  if (urlPath.endsWith("/")) urlPath += "index.html";

  const filePath = path.normalize(path.join(ROOT, urlPath));
  if (!filePath.startsWith(ROOT)) {
    res.writeHead(403);
    res.end("Forbidden");
    return;
  }

  fs.readFile(filePath, (err, data) => {
    if (err) {
      res.writeHead(404, { "Content-Type": "text/plain" });
      res.end("Not found: " + urlPath);
      return;
    }
    const ext = path.extname(filePath).toLowerCase();
    res.writeHead(200, { "Content-Type": MIME[ext] || "application/octet-stream" });
    res.end(data);
  });
});

server.listen(PORT, "0.0.0.0", () => {
  console.log("-----------------------------------------------");
  console.log("Cardiovascular Care Assistant — demo server");
  console.log("  Hub:        http://localhost:" + PORT + "/");
  console.log("  Dashboard:  http://localhost:" + PORT + "/frontend/doctor-dashboard/");
  console.log("  Patient:    http://localhost:" + PORT + "/frontend/patient-app/");
  console.log("  Simulator:  http://localhost:" + PORT + "/frontend/simulator/");
  console.log("-----------------------------------------------");
});
