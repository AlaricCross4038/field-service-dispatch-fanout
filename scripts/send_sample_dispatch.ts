export {};

const response = await fetch("http://localhost:3000/dispatch", {
  method: "POST",
  headers: { "content-type": "application/json" },
  body: JSON.stringify({
    workOrderId: "WO-1042",
    status: "dispatched",
    photos: [{
      url: "https://images.example.com/work-orders/WO-1042/arrival.jpg",
      caption: "Technician arrived at the service entrance",
    }],
    technicianFollowUpAt: "2026-08-14T09:30:00.000Z",
    subscribers: [
      { subscriberId: "chenhua@changba.com", channel: "email", enabled: true },
      { subscriberId: "archive", channel: "email", enabled: false }
    ],
  }),
});

console.log(response.status, await response.json());
