import { useEffect, useMemo, useState } from "react";

const emptySnapshot = {
  totalOrders: 0,
  totalRevenue: 0,
  lastUpdatedAt: null,
  ordersByDay: []
};

function formatMoney(value) {
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    maximumFractionDigits: 2
  }).format(Number(value || 0));
}

function formatDateTime(value) {
  if (!value) {
    return "Waiting for live events";
  }

  return new Intl.DateTimeFormat("en-US", {
    dateStyle: "medium",
    timeStyle: "short"
  }).format(new Date(value));
}

function formatDate(value) {
  return new Intl.DateTimeFormat("en-US", {
    month: "short",
    day: "numeric"
  }).format(new Date(value));
}

function App() {
  const [snapshot, setSnapshot] = useState(emptySnapshot);
  const [connectionState, setConnectionState] = useState("connecting");
  const [errorMessage, setErrorMessage] = useState("");

  useEffect(() => {
    let isMounted = true;

    async function loadSnapshot() {
      try {
        const response = await fetch("/api/dashboard");

        if (!response.ok) {
          throw new Error(`Snapshot request failed with status ${response.status}`);
        }

        const data = await response.json();

        if (isMounted) {
          setSnapshot(data);
        }
      } catch (error) {
        if (isMounted) {
          setErrorMessage(error.message);
        }
      }
    }

    loadSnapshot();

    return () => {
      isMounted = false;
    };
  }, []);

  useEffect(() => {
    const stream = new EventSource("/api/dashboard/stream");

    stream.onopen = () => {
      setConnectionState("live");
      setErrorMessage("");
    };

    stream.onmessage = (event) => {
      const data = JSON.parse(event.data);
      setSnapshot(data);
      setConnectionState("live");
    };

    stream.onerror = () => {
      setConnectionState("reconnecting");
      setErrorMessage("Live stream interrupted. Waiting to reconnect.");
    };

    return () => {
      stream.close();
    };
  }, []);

  const peakOrders = useMemo(() => {
    return snapshot.ordersByDay.reduce((max, item) => {
      return Math.max(max, item.orderCount);
    }, 0);
  }, [snapshot.ordersByDay]);

  const averageOrderValue = snapshot.totalOrders
    ? snapshot.totalRevenue / snapshot.totalOrders
    : 0;

  const latestDay = snapshot.ordersByDay[snapshot.ordersByDay.length - 1];

  return (
    <div className="min-h-screen bg-hero-glow px-4 py-6 text-slate-100 sm:px-6 lg:px-8">
      <div className="mx-auto flex max-w-7xl flex-col gap-6">
        <header className="glass-panel overflow-hidden p-6 sm:p-8">
          <div className="flex flex-col gap-8 lg:flex-row lg:items-end lg:justify-between">
            <div className="max-w-3xl">
              <p className="mb-3 inline-flex rounded-full border border-orange-400/20 bg-orange-400/10 px-3 py-1 text-xs font-semibold uppercase tracking-[0.32em] text-orange-200">
                Kafka Powered Analytics
              </p>
              <h1 className="font-display text-4xl uppercase tracking-[0.08em] text-white sm:text-5xl">
                Orders Command Center
              </h1>
              <p className="mt-4 max-w-2xl text-sm leading-7 text-slate-300 sm:text-base">
                Real-time order activity streaming from the analytics service with
                live day-by-day totals, revenue movement, and operational status.
              </p>
            </div>

            <div className="grid gap-3 sm:grid-cols-2">
              <StatusPill
                label="Stream"
                value={connectionState}
                tone={connectionState === "live" ? "good" : "warn"}
              />
              <StatusPill
                label="Last update"
                value={formatDateTime(snapshot.lastUpdatedAt)}
                tone="neutral"
              />
            </div>
          </div>
        </header>

        <section className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
          <MetricCard
            label="Total Orders"
            value={snapshot.totalOrders}
            helper="All streamed orders processed"
            accent="from-orange-500/30 to-orange-500/5"
          />
          <MetricCard
            label="Total Revenue"
            value={formatMoney(snapshot.totalRevenue)}
            helper="Running revenue from dashboard events"
            accent="from-emerald-400/30 to-emerald-400/5"
          />
          <MetricCard
            label="Average Order"
            value={formatMoney(averageOrderValue)}
            helper="Revenue divided by total orders"
            accent="from-cyan-400/30 to-cyan-400/5"
          />
          <MetricCard
            label="Latest Day Count"
            value={latestDay ? latestDay.orderCount : 0}
            helper={latestDay ? `For ${latestDay.date}` : "No order days yet"}
            accent="from-fuchsia-400/30 to-fuchsia-400/5"
          />
        </section>

        <section className="grid gap-6 xl:grid-cols-[1.35fr_0.95fr]">
          <div className="glass-panel p-6 sm:p-7">
            <div className="flex items-center justify-between gap-4">
              <div>
                <h2 className="font-display text-2xl uppercase tracking-[0.08em] text-white">
                  Daily Orders
                </h2>
                <p className="mt-2 text-sm text-slate-400">
                  The frontend subscribes to `/dashboard/stream` and redraws this view
                  on every snapshot.
                </p>
              </div>
              <div className="rounded-full border border-white/10 bg-white/5 px-3 py-2 text-xs uppercase tracking-[0.3em] text-slate-300">
                {snapshot.ordersByDay.length} active day{snapshot.ordersByDay.length === 1 ? "" : "s"}
              </div>
            </div>

            <div className="mt-8 flex min-h-[320px] items-end gap-3 overflow-x-auto pb-3">
              {snapshot.ordersByDay.length === 0 ? (
                <EmptyState text="Create orders to see the chart wake up." />
              ) : (
                snapshot.ordersByDay.map((day) => {
                  const ratio = peakOrders ? day.orderCount / peakOrders : 0;
                  const height = `${Math.max(ratio * 100, 14)}%`;

                  return (
                    <div key={day.date} className="flex min-w-[92px] flex-1 flex-col items-center gap-3">
                      <div className="text-xs font-semibold uppercase tracking-[0.2em] text-orange-200">
                        {day.orderCount}
                      </div>
                      <div className="flex h-64 w-full items-end rounded-[24px] border border-white/10 bg-slate-950/40 p-2">
                        <div
                          className="w-full rounded-[18px] bg-gradient-to-t from-orange-500 via-amber-400 to-emerald-300 shadow-[0_10px_35px_rgba(249,115,22,0.35)] transition-all duration-500"
                          style={{ height }}
                        />
                      </div>
                      <div className="text-center">
                        <div className="text-sm font-semibold text-white">
                          {formatDate(day.date)}
                        </div>
                        <div className="text-xs text-slate-400">{formatMoney(day.revenue)}</div>
                      </div>
                    </div>
                  );
                })
              )}
            </div>
          </div>

          <div className="glass-panel p-6 sm:p-7">
            <h2 className="font-display text-2xl uppercase tracking-[0.08em] text-white">
              Stream Health
            </h2>
            <div className="mt-6 space-y-4">
              <InsightRow
                title="Live connection"
                value={connectionState === "live" ? "Connected" : "Recovering"}
                helper="Powered by Server-Sent Events"
              />
              <InsightRow
                title="Last ingestion"
                value={formatDateTime(snapshot.lastUpdatedAt)}
                helper="Timestamp from analytics snapshot"
              />
              <InsightRow
                title="Tracked quantity"
                value={snapshot.ordersByDay.reduce((sum, day) => sum + day.quantity, 0)}
                helper="Units sold across all streamed days"
              />
            </div>

            <div className="mt-8 rounded-[24px] border border-orange-300/10 bg-orange-400/10 p-4 text-sm leading-7 text-orange-100">
              {errorMessage || "The dashboard will update automatically whenever new orders flow through Kafka and the analytics service broadcasts a fresh snapshot."}
            </div>
          </div>
        </section>

        <section className="glass-panel overflow-hidden">
          <div className="border-b border-white/10 px-6 py-5 sm:px-7">
            <h2 className="font-display text-2xl uppercase tracking-[0.08em] text-white">
              Orders By Day
            </h2>
          </div>

          <div className="overflow-x-auto">
            <table className="min-w-full text-left">
              <thead className="bg-white/5 text-xs uppercase tracking-[0.3em] text-slate-400">
                <tr>
                  <th className="px-6 py-4 font-medium">Date</th>
                  <th className="px-6 py-4 font-medium">Orders</th>
                  <th className="px-6 py-4 font-medium">Quantity</th>
                  <th className="px-6 py-4 font-medium">Revenue</th>
                  <th className="px-6 py-4 font-medium">Last Order At</th>
                </tr>
              </thead>
              <tbody>
                {snapshot.ordersByDay.length === 0 ? (
                  <tr>
                    <td colSpan="5" className="px-6 py-10 text-center text-sm text-slate-400">
                      No analytics data yet. Post an order and this table will fill in live.
                    </td>
                  </tr>
                ) : (
                  snapshot.ordersByDay.map((day, index) => (
                    <tr
                      key={day.date}
                      className={index % 2 === 0 ? "bg-white/[0.03]" : "bg-transparent"}
                    >
                      <td className="px-6 py-4 text-sm font-semibold text-white">{day.date}</td>
                      <td className="px-6 py-4 text-sm text-slate-200">{day.orderCount}</td>
                      <td className="px-6 py-4 text-sm text-slate-200">{day.quantity}</td>
                      <td className="px-6 py-4 text-sm text-slate-200">
                        {formatMoney(day.revenue)}
                      </td>
                      <td className="px-6 py-4 text-sm text-slate-300">
                        {formatDateTime(day.lastOrderAt)}
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </section>
      </div>
    </div>
  );
}

function MetricCard({ label, value, helper, accent }) {
  return (
    <article className="glass-panel relative overflow-hidden p-5">
      <div className={`absolute inset-x-0 top-0 h-24 bg-gradient-to-br ${accent}`} />
      <div className="relative">
        <p className="text-xs font-semibold uppercase tracking-[0.28em] text-slate-400">
          {label}
        </p>
        <div className="mt-6 text-3xl font-extrabold text-white sm:text-4xl">{value}</div>
        <p className="mt-3 text-sm text-slate-300">{helper}</p>
      </div>
    </article>
  );
}

function StatusPill({ label, value, tone }) {
  const toneClasses = {
    good: "border-emerald-300/20 bg-emerald-400/10 text-emerald-100",
    warn: "border-orange-300/20 bg-orange-400/10 text-orange-100",
    neutral: "border-white/10 bg-white/5 text-slate-100"
  };

  return (
    <div className={`rounded-[24px] border px-4 py-3 ${toneClasses[tone]}`}>
      <div className="text-[10px] font-semibold uppercase tracking-[0.28em] opacity-80">
        {label}
      </div>
      <div className="mt-2 text-sm font-semibold">{value}</div>
    </div>
  );
}

function InsightRow({ title, value, helper }) {
  return (
    <div className="rounded-[24px] border border-white/10 bg-white/5 p-4">
      <div className="text-xs font-semibold uppercase tracking-[0.28em] text-slate-400">
        {title}
      </div>
      <div className="mt-2 text-lg font-bold text-white">{value}</div>
      <div className="mt-1 text-sm text-slate-400">{helper}</div>
    </div>
  );
}

function EmptyState({ text }) {
  return (
    <div className="flex h-full w-full items-center justify-center rounded-[24px] border border-dashed border-white/10 bg-slate-950/30 p-8 text-center text-sm text-slate-400">
      {text}
    </div>
  );
}

export default App;
