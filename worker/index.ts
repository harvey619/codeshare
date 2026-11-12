import { Server, routePartykitRequest, type Connection, type WSMessage } from "partyserver";

export class Room extends Server<Env> {
  static options = { hibernate: true };

  onStart() {
    this.ctx.storage.sql.exec(
      "CREATE TABLE IF NOT EXISTS doc (id INTEGER PRIMARY KEY CHECK (id = 1), text TEXT)",
    );
  }

  onConnect(connection: Connection) {
    const row = this.ctx.storage.sql.exec("SELECT text FROM doc WHERE id = 1").toArray()[0];
    if (row) {
      connection.send(JSON.stringify({ type: "set", text: row.text }));
    }
  }

  onMessage(connection: Connection, message: WSMessage) {
    if (typeof message !== "string") return;
    let msg;
    try {
      msg = JSON.parse(message);
    } catch {
      return;
    }
    if (msg.type !== "set" || typeof msg.text !== "string") return;

    this.ctx.storage.sql.exec(
      "INSERT INTO doc (id, text) VALUES (1, ?) ON CONFLICT (id) DO UPDATE SET text = excluded.text",
      msg.text,
    );
    this.broadcast(message, [connection.id]);
  }
}

export default {
  async fetch(request, env) {
    return (
      (await routePartykitRequest(request, env)) ??
      new Response("not found", { status: 404 })
    );
  },
} satisfies ExportedHandler<Env>;