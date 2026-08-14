import assert from "node:assert/strict";
import test from "node:test";
import { fanOutDispatch, type Publish } from "../src/field_service_dispatch.js";

test("a dispatch queues one complete message per enabled subscriber", async () => {
  const published: Array<{ payload: unknown; key: string }> = [];
  const publish: Publish = async (payload, key) => {
    published.push({ payload, key });
    return {};
  };

  const result = await fanOutDispatch({
    workOrderId: "WO-1042",
    status: "dispatched",
    photos: [{ url: "https://example.com/arrival.jpg", caption: "Arrival" }],
    technicianFollowUpAt: "2026-08-14T09:30:00.000Z",
    subscribers: [
      { subscriberId: "manager", channel: "email", enabled: true },
      { subscriberId: "tenant", channel: "sms", enabled: true },
      { subscriberId: "archive", channel: "email", enabled: false },
    ],
  }, publish);

  assert.deepEqual(result, {
    workOrderId: "WO-1042",
    status: "dispatched",
    queued: 2,
    skipped: 1,
  });
  assert.equal(published.length, 2);
  assert.deepEqual(published.map(({ payload }) => payload), [
    {
      event: "work_order.dispatched",
      workOrderId: "WO-1042",
      dispatchStatus: "dispatched",
      subscriberId: "manager",
      channel: "email",
      photos: [{ url: "https://example.com/arrival.jpg", caption: "Arrival" }],
      technicianFollowUpAt: "2026-08-14T09:30:00.000Z",
    },
    {
      event: "work_order.dispatched",
      workOrderId: "WO-1042",
      dispatchStatus: "dispatched",
      subscriberId: "tenant",
      channel: "sms",
      photos: [{ url: "https://example.com/arrival.jpg", caption: "Arrival" }],
      technicianFollowUpAt: "2026-08-14T09:30:00.000Z",
    },
  ]);
  assert.notEqual(published[0]?.key, published[1]?.key);
});

test("a scheduled work order stays quiet", async () => {
  let calls = 0;
  const publish: Publish = async () => { calls += 1; };
  const result = await fanOutDispatch({
    workOrderId: "WO-1043",
    status: "scheduled",
    photos: [],
    technicianFollowUpAt: "2026-08-14T11:00:00.000Z",
    subscribers: [{ subscriberId: "manager", channel: "push", enabled: true }],
  }, publish);

  assert.equal(calls, 0);
  assert.equal(result.queued, 0);
  assert.equal(result.skipped, 1);
});
