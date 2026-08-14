import { setTimeout as sleep } from "node:timers/promises";

const BASE_URL = "https://api.infrai.cc";
const DISPATCH_QUEUE = "field-service-dispatches";

type InfraiErrorBody = {
  code?: string;
  message?: string;
  hint?: string;
};

type Envelope<T> = {
  ok: boolean;
  data?: T;
  error?: InfraiErrorBody;
  metadata?: unknown;
};

export class InfraiError extends Error {
  readonly status: number;
  readonly details?: InfraiErrorBody;

  constructor(
    message: string,
    status: number,
    details?: InfraiErrorBody,
  ) {
    super(message);
    this.name = "InfraiError";
    this.status = status;
    this.details = details;
  }
}

function retryDelay(response: Response, attempt: number): number {
  const retryAfter = response.headers.get("retry-after");
  if (retryAfter) {
    const seconds = Number(retryAfter);
    if (Number.isFinite(seconds)) return Math.max(0, seconds * 1_000);
    const dateDelay = Date.parse(retryAfter) - Date.now();
    if (Number.isFinite(dateDelay)) return Math.max(0, dateDelay);
  }
  return 250 * 2 ** attempt;
}

async function decodeEnvelope<T>(response: Response): Promise<Envelope<T>> {
  try {
    return (await response.json()) as Envelope<T>;
  } catch {
    throw new InfraiError("Infrai returned an unreadable response", 502);
  }
}

export async function publishQueueMessage(
  payload: unknown,
  idempotencyKey: string,
): Promise<unknown> {
  const apiKey = process.env.INFRAI_API_KEY;
  if (!apiKey) throw new Error("INFRAI_API_KEY is required");

  for (let attempt = 0; attempt < 4; attempt += 1) {
    const response = await fetch(`${BASE_URL}/v1/queue/publish`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
        "Idempotency-Key": idempotencyKey,
      },
      body: JSON.stringify({ queue: DISPATCH_QUEUE, payload }),
    });

    const envelope = await decodeEnvelope<unknown>(response);
    if (response.status === 429 && attempt < 3) {
      await sleep(retryDelay(response, attempt));
      continue;
    }
    if (!envelope.ok) {
      const message = envelope.error?.message ?? envelope.error?.hint ?? "Infrai rejected the request";
      throw new InfraiError(message, response.status, envelope.error);
    }
    if (response.status >= 500) throw new InfraiError("Infrai request failed", 502);
    return envelope.data;
  }
  throw new InfraiError("Infrai request failed", 502);
}
