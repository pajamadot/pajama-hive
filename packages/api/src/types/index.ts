export interface Env {
  // Hyperdrive binding for Neon Postgres
  HYPERDRIVE: Hyperdrive;

  // Durable Object bindings
  WS_ROOM: DurableObjectNamespace;
  ORCHESTRATOR: DurableObjectNamespace;
  META_OBSERVER: DurableObjectNamespace;

  // Secrets
  CLERK_SECRET_KEY: string;
  CLERK_PUBLISHABLE_KEY: string;

  // Vars
  ENVIRONMENT: string;
}
