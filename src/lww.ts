type Msg = { type: "set"; text: string };

export function connectLww(room: string, onRemoteText: (text: string) => void) {
  let ws: WebSocket;
  let closed = false;

  function open() {
    const proto = location.protocol === "https:" ? "wss:" : "ws:";
    ws = new WebSocket(`${proto}//${location.host}/parties/room/${room}`);

    ws.onmessage = (e) => {
      const msg: Msg = JSON.parse(e.data);
      if (msg.type === "set") onRemoteText(msg.text);
    };

    ws.onclose = () => {
      if (!closed) setTimeout(open, 1000);
    };
  }

  open();

  return {
    sendText(text: string) {
      if (ws.readyState === WebSocket.OPEN) {
        ws.send(JSON.stringify({ type: "set", text } satisfies Msg));
      }
    },
    close() {
      closed = true;
      ws.close();
    },
  };
}