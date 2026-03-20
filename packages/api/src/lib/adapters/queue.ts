/**
 * QueueAdapter — pluggable async messaging interface.
 * Default: Cloudflare Queues / Durable Objects
 * Swappable to: NSQ, SQS, RabbitMQ, Kafka
 */

export interface QueueMessage<T = unknown> {
  id: string;
  topic: string;
  body: T;
  timestamp: number;
  attempts?: number;
}

export interface QueueAdapter {
  /** Publish a message to a topic */
  publish<T>(topic: string, body: T): Promise<void>;

  /** Publish multiple messages */
  publishBatch<T>(topic: string, messages: T[]): Promise<void>;

  /** Subscribe to a topic (pull-based) */
  subscribe(topic: string, handler: (message: QueueMessage) => Promise<void>): Promise<void>;

  /** Acknowledge message processed */
  ack(messageId: string): Promise<void>;
}

/**
 * Default implementation using Durable Objects for message passing.
 * Falls back to direct function calls for simple cases.
 * Can be upgraded to Cloudflare Queues when needed.
 */
export class DOQueueAdapter implements QueueAdapter {
  private handlers = new Map<string, (message: QueueMessage) => Promise<void>>();

  async publish<T>(topic: string, body: T): Promise<void> {
    const handler = this.handlers.get(topic);
    if (handler) {
      await handler({
        id: crypto.randomUUID(),
        topic,
        body,
        timestamp: Date.now(),
        attempts: 1,
      });
    }
    // If no handler registered, message is fire-and-forget
    // In production, would use Cloudflare Queues for persistence
  }

  async publishBatch<T>(topic: string, messages: T[]): Promise<void> {
    await Promise.all(messages.map((body) => this.publish(topic, body)));
  }

  async subscribe(topic: string, handler: (message: QueueMessage) => Promise<void>): Promise<void> {
    this.handlers.set(topic, handler);
  }

  async ack(_messageId: string): Promise<void> {
    // In DO-based queue, ack is implicit on handler success
  }
}
