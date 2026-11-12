import { routePartykitRequest } from "partyserver";
import { YServer } from "y-partyserver";
import * as Y from "yjs";
import { LIMITS } from "../shared/limits";

export class Room extends YServer<Env> {
  static options = { hibernate: true };
  static callbackOptions = { debounceWait: 5000, debounceMaxWait: 15000 };

  async onLoad() {
    this.ctx.storage.sql.exec(
      "CREATE TABLE IF NOT EXISTS snapshot (id INTEGER PRIMARY KEY CHECK (id = 1), state BLOB)",
    );
    const row = this.ctx.storage.sql.exec("SELECT state FROM snapshot WHERE id = 1").toArray()[0];
    if (row) {
      Y.applyUpdate(this.document, new Uint8Array(row.state as ArrayBuffer));
    }
  }

  async onSave() {
    const state = Y.encodeStateAsUpdate(this.document);
    if (state.byteLength > LIMITS.docBytesHard) {
      for (const conn of this.getConnections()) {
        this.sendCustomMessage(conn, "too-large");
        conn.close(1009, "too-large");
      }
      return;
    }
    this.ctx.storage.sql.exec(
      "INSERT INTO snapshot (id, state) VALUES (1, ?) ON CONFLICT (id) DO UPDATE SET state = excluded.state",
      state,
    );
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