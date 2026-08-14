import { createServer, type IncomingMessage, type ServerResponse } from "node:http";
import { ZodError } from "zod";
import { dispatchRequestSchema, fanOutDispatch } from "./field_service_dispatch.js";
import { InfraiError, publishQueueMessage } from "./infrai_queue.js";

const port = Number(process.env.PORT ?? 3000);

function send(response: ServerResponse, status: number, body: unknown): void {
  response.writeHead(status, { "content-type": "application/json" });
  response.end(JSON.stringify(body));
}

async function readJson(request: IncomingMessage): Promise<unknown> {
  const chunks: Buffer[] = [];
  let size = 0;
  for await (const chunk of request) {
    const buffer = Buffer.from(chunk);
    size += buffer.length;
    if (size > 1_000_000) throw new Error("Request body is too large");
    chunks.push(buffer);
  }
  return JSON.parse(Buffer.concat(chunks).toString("utf8"));
}

createServer(async (request, response) => {
  if (request.method !== "POST" || request.url !== "/dispatch") {
    send(response, 404, { error: "Route not found" });
    return;
  }

  try {
    const body = dispatchRequestSchema.parse(await readJson(request));
    const result = await fanOutDispatch(body, publishQueueMessage);
    send(response, 202, result);
  } catch (error) {
    if (error instanceof ZodError) {
      send(response, 400, { error: "Invalid dispatch", issues: error.issues });
      return;
    }
    if (error instanceof InfraiError) {
      const status = error.status >= 400 && error.status < 500 ? error.status : 502;
      send(response, status, { error: error.message });
      return;
    }
    send(response, 400, { error: error instanceof Error ? error.message : "Invalid request" });
  }
}).listen(port, () => {
  console.log(`Field-service dispatch route listening on http://localhost:${port}/dispatch`);
});
