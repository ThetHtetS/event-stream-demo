const express = require("express");

const router = express.Router();
const statsByDay = new Map();
const seenOrders = new Set();
const sseClients = new Set();
let totalOrders = 0;
let totalRevenue = 0;
let lastUpdatedAt = null;

function toDayKey(value) {
  return new Date(value).toISOString().slice(0, 10);
}

function getOrdersByDay() {
  return Array.from(statsByDay.entries())
    .sort((left, right) => left[0].localeCompare(right[0]))
    .map(([date, stats]) => ({
      date,
      orderCount: stats.orderCount,
      quantity: stats.quantity,
      revenue: Number(stats.revenue.toFixed(2)),
      lastOrderAt: stats.lastOrderAt
    }));
}

function getDashboardSnapshot() {
  return {
    totalOrders,
    totalRevenue: Number(totalRevenue.toFixed(2)),
    lastUpdatedAt,
    ordersByDay: getOrdersByDay()
  };
}

function broadcastSnapshot() {
  const payload = `data: ${JSON.stringify(getDashboardSnapshot())}\n\n`;

  for (const client of sseClients) {
    client.write(payload);
  }
}

function recordOrderCreatedEvent(event) {
  const order = event.data || {};

  if (!order.orderId || seenOrders.has(order.orderId)) {
    return;
  }

  seenOrders.add(order.orderId);

  const dayKey = toDayKey(order.createdAt || event.timestamp || new Date().toISOString());
  const current = statsByDay.get(dayKey) || {
    orderCount: 0,
    quantity: 0,
    revenue: 0,
    lastOrderAt: null
  };

  current.orderCount += 1;
  current.quantity += Number(order.quantity || 0);
  current.revenue += Number(order.total || 0);
  current.lastOrderAt = order.createdAt || event.timestamp || new Date().toISOString();

  statsByDay.set(dayKey, current);

  totalOrders += 1;
  totalRevenue += Number(order.total || 0);
  lastUpdatedAt = new Date().toISOString();

  broadcastSnapshot();
}

router.get("/", (req, res) => {
  res.status(200).json(getDashboardSnapshot());
});

router.get("/orders-by-day", (req, res) => {
  res.status(200).json({
    count: statsByDay.size,
    ordersByDay: getOrdersByDay()
  });
});

router.get("/stream", (req, res) => {
  res.setHeader("Content-Type", "text/event-stream; charset=utf-8");
  res.setHeader("Cache-Control", "no-cache");
  res.setHeader("Connection", "keep-alive");

  res.write(`data: ${JSON.stringify(getDashboardSnapshot())}\n\n`);
  sseClients.add(res);

  req.on("close", () => {
    sseClients.delete(res);
  });
});

router.get("/live", (req, res) => {
  res.setHeader("Content-Type", "text/html; charset=utf-8");
  res.send(`<!doctype html>
<html lang="en">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <title>Orders Dashboard</title>
    <style>
      :root {
        --bg: #0f172a;
        --panel: rgba(15, 23, 42, 0.82);
        --panel-border: rgba(148, 163, 184, 0.2);
        --text: #e2e8f0;
        --muted: #94a3b8;
        --accent: #f97316;
        --accent-soft: rgba(249, 115, 22, 0.18);
        --good: #22c55e;
      }

      * {
        box-sizing: border-box;
      }

      body {
        margin: 0;
        min-height: 100vh;
        font-family: "Trebuchet MS", "Segoe UI", sans-serif;
        color: var(--text);
        background:
          radial-gradient(circle at top left, rgba(249, 115, 22, 0.25), transparent 30%),
          linear-gradient(135deg, #020617, #111827 48%, #0f172a);
      }

      main {
        max-width: 1080px;
        margin: 0 auto;
        padding: 32px 20px 48px;
      }

      h1 {
        margin: 0 0 10px;
        font-size: clamp(2rem, 4vw, 3.6rem);
        letter-spacing: 0.04em;
        text-transform: uppercase;
      }

      p {
        margin: 0;
        color: var(--muted);
      }

      .grid {
        display: grid;
        grid-template-columns: repeat(auto-fit, minmax(220px, 1fr));
        gap: 16px;
        margin-top: 28px;
      }

      .card, .table-wrap {
        background: var(--panel);
        border: 1px solid var(--panel-border);
        border-radius: 20px;
        backdrop-filter: blur(10px);
        box-shadow: 0 22px 60px rgba(15, 23, 42, 0.3);
      }

      .card {
        padding: 20px;
      }

      .label {
        color: var(--muted);
        text-transform: uppercase;
        letter-spacing: 0.08em;
        font-size: 0.8rem;
      }

      .value {
        margin-top: 12px;
        font-size: 2rem;
        font-weight: 700;
      }

      .pulse {
        display: inline-flex;
        align-items: center;
        gap: 8px;
        margin-top: 20px;
        color: var(--good);
      }

      .pulse::before {
        content: "";
        width: 10px;
        height: 10px;
        border-radius: 999px;
        background: var(--good);
        box-shadow: 0 0 0 0 rgba(34, 197, 94, 0.55);
        animation: pulse 1.8s infinite;
      }

      .table-wrap {
        margin-top: 24px;
        overflow: hidden;
      }

      table {
        width: 100%;
        border-collapse: collapse;
      }

      th, td {
        padding: 16px 18px;
        text-align: left;
        border-bottom: 1px solid rgba(148, 163, 184, 0.12);
      }

      th {
        color: var(--muted);
        font-size: 0.82rem;
        letter-spacing: 0.08em;
        text-transform: uppercase;
      }

      tr:last-child td {
        border-bottom: none;
      }

      .badge {
        display: inline-block;
        padding: 4px 10px;
        border-radius: 999px;
        background: var(--accent-soft);
        color: #fdba74;
      }

      @keyframes pulse {
        0% { box-shadow: 0 0 0 0 rgba(34, 197, 94, 0.55); }
        70% { box-shadow: 0 0 0 16px rgba(34, 197, 94, 0); }
        100% { box-shadow: 0 0 0 0 rgba(34, 197, 94, 0); }
      }
    </style>
  </head>
  <body>
    <main>
      <h1>Orders Live Dashboard</h1>
      <p>Streaming day-by-day order counts from Kafka in real time.</p>

      <section class="grid">
        <article class="card">
          <div class="label">Total Orders</div>
          <div class="value" id="totalOrders">0</div>
        </article>
        <article class="card">
          <div class="label">Total Revenue</div>
          <div class="value" id="totalRevenue">$0.00</div>
        </article>
        <article class="card">
          <div class="label">Last Updated</div>
          <div class="value" id="lastUpdated">Waiting</div>
        </article>
      </section>

      <div class="pulse">Live stream connected</div>

      <section class="table-wrap">
        <table>
          <thead>
            <tr>
              <th>Date</th>
              <th>Orders</th>
              <th>Quantity</th>
              <th>Revenue</th>
              <th>Last Order</th>
            </tr>
          </thead>
          <tbody id="rows"></tbody>
        </table>
      </section>
    </main>

    <script>
      const totalOrdersEl = document.getElementById("totalOrders");
      const totalRevenueEl = document.getElementById("totalRevenue");
      const lastUpdatedEl = document.getElementById("lastUpdated");
      const rowsEl = document.getElementById("rows");

      function render(snapshot) {
        totalOrdersEl.textContent = snapshot.totalOrders;
        totalRevenueEl.textContent = "$" + Number(snapshot.totalRevenue || 0).toFixed(2);
        lastUpdatedEl.textContent = snapshot.lastUpdatedAt || "Waiting";

        rowsEl.innerHTML = snapshot.ordersByDay.map((row) => \`
          <tr>
            <td><span class="badge">\${row.date}</span></td>
            <td>\${row.orderCount}</td>
            <td>\${row.quantity}</td>
            <td>$\${Number(row.revenue || 0).toFixed(2)}</td>
            <td>\${row.lastOrderAt || "-"}</td>
          </tr>
        \`).join("");
      }

      const source = new EventSource("/dashboard/stream");
      source.onmessage = (event) => render(JSON.parse(event.data));
    </script>
  </body>
</html>`);
});

module.exports = router;
module.exports.recordOrderCreatedEvent = recordOrderCreatedEvent;
module.exports.getDashboardSnapshot = getDashboardSnapshot;
