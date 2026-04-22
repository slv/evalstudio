/**
 * Simple mock echo server for testing the custom connector.
 * Run: node mock-server.js
 * Listens on http://localhost:4000
 */
import http from "node:http";

const server = http.createServer((req, res) => {
  res.setHeader("Content-Type", "application/json");

  if (req.url === "/health" && req.method === "GET") {
    res.end(JSON.stringify({ status: "ok", server: "echo-bot" }));
    return;
  }

  if (req.url === "/chat" && req.method === "POST") {
    let body = "";
    req.on("data", (chunk) => (body += chunk));
    req.on("end", () => {
      try {
        const { messages, prefix } = JSON.parse(body);
        const last = messages.at(-1)?.content ?? "";
        const tag = prefix ? `${prefix} Echo:` : "Echo:";
        res.end(JSON.stringify({ reply: `${tag} ${last}` }));
      } catch {
        res.statusCode = 400;
        res.end(JSON.stringify({ error: "Invalid JSON" }));
      }
    });
    return;
  }

  res.statusCode = 404;
  res.end(JSON.stringify({ error: "Not found" }));
});

server.listen(4000, () => {
  console.log("Mock echo server running at http://localhost:4000");
  console.log("  GET  /health  → { status: 'ok' }");
  console.log("  POST /chat    → { reply: 'Echo: <last message>' }");
});
