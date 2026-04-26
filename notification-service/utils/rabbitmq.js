const amqp = require("amqplib");
const {
  saveProcessedNotification,
  processedNotifications
} = require("../routes/notifications");

require("dotenv").config();

const rabbitmqUrl = process.env.RABBITMQ_URL || "amqp://guest:guest@localhost:5672";
const exchangeName = process.env.RABBITMQ_EXCHANGE || "app.events";
const exchangeType = process.env.RABBITMQ_EXCHANGE_TYPE || "topic";
const queueName = process.env.RABBITMQ_QUEUE || "notification.order.created";
const routingKey = process.env.RABBITMQ_ROUTING_KEY || "order.created";
const reconnectDelayMs = Number(process.env.RABBITMQ_RECONNECT_DELAY_MS || 5000);

let connection = null;
let channel = null;
let isConnecting = false;
let reconnectTimer = null;

async function connectAndConsume() {
  if (isConnecting) {
    return;
  }

  isConnecting = true;

  try {
    console.log("[Notification Service] Connecting to RabbitMQ...");

    connection = await amqp.connect(rabbitmqUrl);

    connection.on("error", (error) => {
      console.error("[Notification Service] RabbitMQ connection error:", error.message);
    });

    connection.on("close", () => {
      console.warn("[Notification Service] RabbitMQ connection closed. Reconnecting...");
      channel = null;
      connection = null;
      scheduleReconnect();
    });

    channel = await connection.createChannel();
    await channel.assertExchange(exchangeName, exchangeType, { durable: true });
    await channel.assertQueue(queueName, { durable: true });
    await channel.bindQueue(queueName, exchangeName, routingKey);
    await channel.prefetch(1);

    await channel.consume(queueName, async (message) => {
      if (!message) {
        return;
      }

      try {
        const event = JSON.parse(message.content.toString());
        const order = event.data || {};

        console.log(`[Notification Service] Received order.created event for order ${order.orderId}`);

        // This simulates a side effect such as sending an email or SMS.
        const processedNotification = {
          notificationId: `noti_${Date.now()}_${Math.floor(Math.random() * 10000)}`,
          eventId: event.eventId,
          eventType: event.eventType,
          correlationId: message.properties.correlationId || order.orderId,
          receivedAt: new Date().toISOString(),
          orderId: order.orderId,
          customerName: order.customerName,
          product: order.product,
          quantity: order.quantity,
          price: order.price,
          total: order.total,
          message: `Notification sent to ${order.customerName} for order ${order.orderId}`
        };

        console.log(
          `[Notification Service] Notification processed for customer ${order.customerName}`
        );

        saveProcessedNotification(processedNotification);
        channel.ack(message);
      } catch (error) {
        console.error("[Notification Service] Failed to process message:", error.message);

        // Requeue the message so it can be retried later.
        channel.nack(message, false, true);
      }
    });

    console.log("[Notification Service] Connected to RabbitMQ");
    console.log(
      `[Notification Service] Waiting for messages on queue ${queueName} with routing key ${routingKey}`
    );
  } catch (error) {
    console.error("[Notification Service] Failed to connect to RabbitMQ:", error.message);
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
    await connectAndConsume();
  }, reconnectDelayMs);
}

async function startRabbitMQConsumer() {
  await connectAndConsume();
}

function getRabbitMQStatus() {
  return {
    connected: Boolean(connection && channel),
    exchangeName,
    queueName,
    routingKey,
    processedMessages: processedNotifications.length
  };
}

module.exports = {
  startRabbitMQConsumer,
  getRabbitMQStatus
};
