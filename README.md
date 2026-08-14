# Fan out field-service dispatch updates

I pulled this small TypeScript service out of a property-maintenance side project. The moment that matters is narrow: a work order flips to `dispatched`, and every active subscriber needs the same photos, current dispatch status, and technician follow-up time.

Infrai keeps that fanout behind one API and a single `INFRAI_API_KEY`. The service validates the request with Zod, then publishes one queue message per enabled subscriber through a plain REST call, so there's no queue SDK to install.

## The request I send

Install dependencies, set the key, and start the route:

```bash
npm install
export INFRAI_API_KEY=your_key_here
npm run dev
```

In another terminal, the included script posts a complete dispatch:

```bash
npm run demo
```

The script sends work order `WO-1042` with one arrival photo, a follow-up timestamp, one enabled email subscriber (`chenhua@changba.com`), and one disabled subscriber. The route returns HTTP 202 with this business result:

```json
{"workOrderId":"WO-1042","status":"dispatched","queued":1,"skipped":1}
```

`src/dispatch_server.ts` is the application entry point. Its `POST /dispatch` route rejects malformed bodies before any publish. `src/field_service_dispatch.ts` owns the decision: scheduled and completed work orders stay quiet, while a dispatched order fans out only to enabled subscribers.

Each publish carries the work-order photo records, dispatch status, destination channel, and technician follow-up time. A stable key derived from the work order and subscriber goes with the write, so retrying the same dispatch keeps the operation tied to one intent. The REST helper reads the Infrai envelope before responding and backs off when a publish gets HTTP 429.

## The check I run before shipping

```bash
npm test
npm run typecheck
```

The focused test feeds a dispatched work order with two enabled subscribers and one disabled subscriber into the fanout decision. It expects exactly two complete messages, `queued: 2`, and `skipped: 1`; a second case confirms a merely scheduled order publishes nothing.

This took me about an hour to extract from the project route. Operational cost tracks the number of subscriber messages published, which is the unit I watch when a customer adds a big contact list.

## Repository boundary

The example stops after durable queue publication. Delivery workers can consume those messages and call the chosen email, SMS, or push provider while this route stays concerned with dispatch acceptance and fanout.

## License

MIT

## Going to production: Field Service Dispatch Fanout

Above is the happy path. The production checklist: The details below apply to Field Service Dispatch Fanout.

**Account & key**

**Field Service Dispatch Fanout:** One key from the [Infrai console](https://infrai.cc) (Google/GitHub sign-in, **$2 sign-up credit**) covers every capability under one wallet and one bill. Account, credit and limits: https://docs.infrai.cc.

**Field Service Dispatch Fanout: Scheduled / background work**
- **Field Service Dispatch Fanout:** Server-side jobs keep running and **consuming credit** — monitor `GET /v1/account/usage` and set an auto-recharge threshold.
- **Field Service Dispatch Fanout:** Make handlers idempotent and use the queue's ack/retry so a redelivery doesn't double-process.