export type User = { name: string; color: string };

const KEY = "codeshare-user";

const ANIMALS = ["Otter", "Panda", "Fox", "Koala", "Owl", "Tiger", "Whale", "Llama", "Gecko", "Bison"];
const COLORS = ["#d1242f", "#bc4c00", "#9a6700", "#1a7f37", "#0969da", "#8250df", "#bf3989", "#1b7c83"];

const pick = <T,>(list: T[]) => list[Math.floor(Math.random() * list.length)];

export function getLocalUser(): User {
  try {
    const saved = JSON.parse(localStorage.getItem(KEY) ?? "null");
    if (saved?.name && saved?.color) return saved;
  } catch {
    // storage blocked or corrupted, fall through to a fresh user
  }
  const user = { name: pick(ANIMALS), color: pick(COLORS) };
  saveLocalUser(user);
  return user;
}

export function saveLocalUser(user: User) {
  try {
    localStorage.setItem(KEY, JSON.stringify(user));
  } catch {
    // private mode: works for this tab only
  }
}