const amqp = require("amqplib");
const { Kafka } = require("kafkajs");

require("dotenv").config();

const rabbitmqUrl = process.env.RABBITMQ_URL || "amqp://guest:guest@localhost:5672";
const exchangeName = process.env.RABBITMQ_EXCHANGE || "app.events";
const exchangeType = process.env.RABBITMQ_EXCHANGE_TYPE || "topic";
const queueName = process.env.RABBITMQ_QUEUE || "analytics.order.created";
const routingKey = process.env.RABBITMQ_ROUTING_KEY || "order.created";
const reconnectDelayMs = Number(process.env.RABBITMQ_RECONNECT_DELAY_MS || 5000);
const brokers = (process.env.KAFKA_BROKERS || "127.0.0.1:9092")
  .split(",")
  .map((broker) => broker.trim())
  .filter(Boolean);
const kafkaTopic = process.env.KAFKA_TOPIC || "orders.events";
const kafkaClientId = process.env.KAFKA_CLIENT_ID || "stream-bridge-service";

let connection = null;
let channel = null;
let isConnecting = false;
let reconnectTimer = null;
let forwardedMessages = 0;
let kafkaConnected = false;

const kafka = new Kafka({
  clientId: kafkaClientId,
  brokers
});
const producer = kafka.producer();

async function ensureKafkaProducer() {
  if (kafkaConnected) {
    return;
  }

  await producer.connect();
  kafkaConnected = true;
  console.log(`[Stream Bridge Service] Connected to Kafka topic ${kafkaTopic}`);
}

async function publishToKafka(event) {
  await ensureKafkaProducer();

  await producer.send({
    topic: kafkaTopic,
    messages: [
      {
        key: event.data && event.data.orderId ? event.data.orderId : event.eventId,
        value: JSON.stringify(event)
      }
    ]
  });
}

async function connectAndConsume() {
  if (isConnecting) {
    return;
  }

  isConnecting = true;

  try {
    await ensureKafkaProducer();

    console.log("[Stream Bridge Service] Connecting to RabbitMQ...");

    connection = await amqp.connect(rabbitmqUrl);

    connection.on("error", (error) => {
      console.error("[Stream Bridge Service] RabbitMQ connection error:", error.message);
    });

    connection.on("close", () => {
      console.warn("[Stream Bridge Service] RabbitMQ connection closed. Reconnecting...");
      channel = null;
      connection = null;
      scheduleReconnect();
    });

    channel = await connection.createChannel();
    await channel.assertExchange(exchangeName, exchangeType, { durable: true });
    await channel.assertQueue(queueName, { durable: true });
    await channel.bindQueue(queueName, exchangeName, routingKey);
    await channel.prefetch(10);

    await channel.consume(queueName, async (message) => {
      if (!message) {
        return;
      }

      try {
        const event = JSON.parse(message.content.toString());

        await publishToKafka(event);
        forwardedMessages += 1;

        console.log(
          `[Stream Bridge Service] Forwarded ${event.eventType} for order ${event.data.orderId} to Kafka`
        );

        channel.ack(message);
      } catch (error) {
        console.error("[Stream Bridge Service] Failed to bridge message:", error.message);
        channel.nack(message, false, true);
      }
    });

    console.log("[Stream Bridge Service] RabbitMQ consumer is ready");
  } catch (error) {
    console.error("[Stream Bridge Service] Failed to start bridge:", error.message);
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

async function startStreamBridgeConsumer() {
  await connectAndConsume();
}

function getBridgeStatus() {
  return {
    rabbitmqConnected: Boolean(connection && channel),
    kafkaConnected,
    queueName,
    topic: kafkaTopic,
    forwardedMessages
  };
}

module.exports = {
  startStreamBridgeConsumer,
  getBridgeStatus
};
