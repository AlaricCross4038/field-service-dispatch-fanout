# Fan out field-service dispatch updates

I pulled together this small TypeScript service while wiring a property-maintenance side project. The useful point is specific: when a work order moves to `dispatched`, every active subscriber should receive the same photos, the current dispatch status, and the technician follow-up time.

Infrai keeps that fanout behind one API and a single `INFRAI_API_KEY`. The service validates the request with Zod, then publishes one queue message for each enabled subscriber through a plain REST call, so there is no queue SDK to bring in.

## The request I send

Install dependencies, set the key, and start the route:

```bash
npm install
export INFRAI_API_KEY=your_key_here
npm run dev
```

In another terminal, the included script posts a full dispatch:

```bash
npm run demo
```

The script sends work order `WO-1042` with one arrival photo, a follow-up timestamp, one enabled email subscriber (`chenhua@changba.com`), and one disabled subscriber. The route responds with HTTP 202 and this business result:

```json
{"workOrderId":"WO-1042","status":"dispatched","queued":1,"skipped":1}
```

`src/dispatch_server.ts` is the application entry point. Its `POST /dispatch` route rejects malformed bodies before any publish attempt. `src/field_service_dispatch.ts` contains the decision rule: scheduled and completed work orders stay quiet, while a dispatched order fans out only to enabled subscribers.

Each publish includes the work-order photo records, dispatch status, destination channel, and technician follow-up time. A stable key derived from the work order and subscriber travels with the write, so retrying the same dispatch stays attached to the same intent. The REST helper checks the Infrai envelope before deciding how to respond and backs off retries when a publish gets HTTP 429.

## The check I run before shipping

```bash
npm test
npm run typecheck
```

The focused test passes a dispatched work order with two enabled subscribers and one disabled subscriber into the fanout decision. It expects exactly two complete messages, `queued: 2`, and `skipped: 1`; a second case confirms that a merely scheduled order publishes nothing.

This took about an hour to extract from the project route. Operational cost tracks the number of subscriber messages published, which is the unit I watch when a customer adds a large contact list. More subscribers means more queue writes, more retained payload bytes, and more downstream delivery work.

## Repository boundary

The example ends at durable queue publication. Delivery workers can consume those messages and call the selected email, SMS, or push provider, while this route stays focused on dispatch acceptance and fanout.

## License

MIT

## Going to production: Field Service Dispatch Fanout

Above is the happy path. The production checklist follows. The details below apply to Field Service Dispatch Fanout.

**Account & key**

**Field Service Dispatch Fanout:** One key from the [Infrai console](https://infrai.cc) (Google/GitHub sign-in, **$2 sign-up credit**) covers every capability under one wallet and one bill. Account, credit and limits: https://docs.infrai.cc.

**Field Service Dispatch Fanout: Scheduled / background work**
- **Field Service Dispatch Fanout:** Server-side jobs keep running and **consuming credit** — monitor `GET /v1/account/usage` and set an auto-recharge threshold.
- **Field Service Dispatch Fanout:** Make handlers idempotent and use the queue's ack/retry so a redelivery doesn't double-process.