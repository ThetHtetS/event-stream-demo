const amqp = require("amqplib");

require("dotenv").config();

const rabbitmqUrl = process.env.RABBITMQ_URL || "amqp://guest:guest@localhost:5672";
const exchangeName = process.env.RABBITMQ_EXCHANGE || "app.events";
const exchangeType = process.env.RABBITMQ_EXCHANGE_TYPE || "topic";
const routingKey = process.env.RABBITMQ_ROUTING_KEY || "order.created";
const reconnectDelayMs = Number(process.env.RABBITMQ_RECONNECT_DELAY_MS || 5000);

let connection = null;
let channel = null;
let isConnecting = false;
let reconnectTimer = null;

async function connect() {
  if (isConnecting) {
    return;
  }

  isConnecting = true;

  try {
    console.log("[Order Service] Connecting to RabbitMQ...");

    connection = await amqp.connect(rabbitmqUrl);

    connection.on("error", (error) => {
      console.error("[Order Service] RabbitMQ connection error:", error.message);
    });

    connection.on("close", () => {
      console.warn("[Order Service] RabbitMQ connection closed. Reconnecting...");
      channel = null;
      connection = null;
      scheduleReconnect();
    });

    channel = await connection.createChannel();
    await channel.assertExchange(exchangeName, exchangeType, { durable: true });

    console.log("[Order Service] Connected to RabbitMQ");
  } catch (error) {
    console.error("[Order Service] Failed to connect to RabbitMQ:", error.message);
    scheduleReconnect();
  } finally {
    isConnecting = false;
  }
}

function scheduleReconnect() {
  if (reconnectTimer) {
    return;
  }

  reconnectTimer = setTimeout(async () => {
    reconnectTimer = null;
    await connect();
  }, reconnectDelayMs);
}

async function startRabbitMQ() {
  await connect();
}

function getRabbitMQStatus() {
  return {
    connected: Boolean(connection && channel),
    exchangeName,
    routingKey
  };
}

async function publishOrderCreatedEvent(order) {
  if (!channel) {
    console.warn("[Order Service] RabbitMQ channel is not ready. Event was not published.");
    return false;
  }

  const event = {
    eventId: `evt_${Date.now()}_${Math.floor(Math.random() * 10000)}`,
    eventType: "order.created",
    timestamp: new Date().toISOString(),
    source: process.env.SERVICE_NAME || "order-service",
    data: order
  };

  try {
    const buffer = Buffer.from(JSON.stringify(event));

    const published = channel.publish(exchangeName, routingKey, buffer, {
      persistent: true,
      contentType: "application/json",
      contentEncoding: "utf-8",
      timestamp: Date.now(),
      messageId: event.eventId,
      correlationId: order.orderId,
      type: event.eventType,
      appId: process.env.SERVICE_NAME || "order-service"
    });

    if (published) {
      console.log(`[Order Service] Published order.created event for order ${order.orderId}`);
    } else {
      console.warn(`[Order Service] Publish returned false for order ${order.orderId}`);
    }

    return published;
  } catch (error) {
    console.error("[Order Service] Failed to publish order.created event:", error.message);
    return false;
  }
}

module.exports = {
  startRabbitMQ,
  getRabbitMQStatus,
  publishOrderCreatedEvent
};
