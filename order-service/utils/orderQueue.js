const { Queue, Worker } = require("bullmq");
const IORedis = require("ioredis");
const { publishOrderCreatedEvent } = require("./rabbitmq");

require("dotenv").config();

const redisUrl = process.env.REDIS_URL || "redis://127.0.0.1:6379";
const queueName = process.env.ORDER_EVENTS_QUEUE || "order-events";
const attempts = Number(process.env.ORDER_EVENTS_ATTEMPTS || 5);
const backoffDelayMs = Number(process.env.ORDER_EVENTS_BACKOFF_MS || 3000);
const concurrency = Number(process.env.ORDER_EVENTS_CONCURRENCY || 4);

const producerConnection = new IORedis(redisUrl, {
  maxRetriesPerRequest: null,
  enableReadyCheck: false
});
const workerConnection = new IORedis(redisUrl, {
  maxRetriesPerRequest: null,
  enableReadyCheck: false
});

const orderEventsQueue = new Queue(queueName, {
  connection: producerConnection,
  defaultJobOptions: {
    attempts,
    removeOnComplete: 100,
    removeOnFail: 1000,
    backoff: {
      type: "exponential",
      delay: backoffDelayMs
    }
  }
});

let worker = null;
let workerStarted = false;

async function enqueueOrderCreatedEvent(order) {
  await orderEventsQueue.add(
    "order.created",
    { order },
    {
      jobId: `order-created-${order.orderId}`
    }
  );

  return true;
}

async function startOrderEventWorker() {
  if (workerStarted) {
    return;
  }

  worker = new Worker(
    queueName,
    async (job) => {
      const { order } = job.data;
      const published = await publishOrderCreatedEvent(order);

      if (!published) {
        throw new Error(`RabbitMQ publish failed for order ${order.orderId}`);
      }

      return { published: true, orderId: order.orderId };
    },
    {
      connection: workerConnection,
      concurrency
    }
  );

  worker.on("completed", (job) => {
    const orderId = job.data && job.data.order ? job.data.order.orderId : "unknown";
    console.log(`[Order Service] BullMQ delivered order ${orderId} to RabbitMQ`);
  });

  worker.on("failed", (job, error) => {
    const orderId = job && job.data && job.data.order ? job.data.order.orderId : "unknown";
    console.error(
      `[Order Service] BullMQ failed job for order ${orderId}: ${error.message}`
    );
  });

  await worker.waitUntilReady();
  workerStarted = true;

  console.log(`[Order Service] BullMQ worker is ready on queue ${queueName}`);
}

function getOrderQueueStatus() {
  return {
    queueName,
    redisUrl,
    workerStarted
  };
}

module.exports = {
  enqueueOrderCreatedEvent,
  startOrderEventWorker,
  getOrderQueueStatus
};
