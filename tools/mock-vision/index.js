import http from "node:http";

const PORT = Number.parseInt(process.env.PORT ?? "8080", 10);

http
  .createServer((req, res) => {
    if (req.method === "POST") {
      let body = "";
      req.on("data", (chunk) => {
        body += chunk;
      });
      req.on("end", () => {
        const response = {
          output_text: JSON.stringify({
            resourceGroupName: "rg-test-disposable",
            uncertainty: 0.1,
            rawText: "rg-test-disposable",
          }),
        };
        res.writeHead(200, { "Content-Type": "application/json" });
        res.end(JSON.stringify(response));
      });
    } else {
      res.writeHead(404);
      res.end();
    }
  })
  .listen(PORT, () => console.log(`Mock vision listening on port ${PORT}`));
