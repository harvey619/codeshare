import { normalizeRoomName, randomRoomName } from "../shared/limits";

export function resolveRoom(): string {
  let raw = "";
  try {
    raw = decodeURIComponent(location.pathname.slice(1));
  } catch {
    // malformed URL like /%E0, treat as empty
  }
  const room = normalizeRoomName(raw) ?? randomRoomName();
  if (location.pathname !== `/${room}`) {
    history.replaceState(null, "", `/${room}`);
  }
  return room;
}