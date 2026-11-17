import { DEFAULT_ROOM, normalizeRoomName } from "../shared/limits";

export function resolveRoom(): string {
  let raw = "";
  try {
    raw = decodeURIComponent(location.pathname.slice(1));
  } catch {
    // malformed URL like /%E0, treat as empty
  }
  // harveycodes.com (or a name with nothing usable in it) opens the shared room, so a
  // class can all type the bare domain and land on the same page.
  const room = normalizeRoomName(raw) ?? DEFAULT_ROOM;
  if (location.pathname !== `/${room}`) {
    history.replaceState(null, "", `/${room}`);
  }
  return room;
}