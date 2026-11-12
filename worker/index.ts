import { DurableObject } from "cloudflare:workers";

export class Room extends DurableObject {}

export default {
  fetch() {
    return new Response("not found", { status: 404 });
  },
} satisfies ExportedHandler<Env>;