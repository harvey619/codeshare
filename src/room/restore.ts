import * as Y from "yjs";
import { MAIN_ID, dedupeTabs, legacyMainName, textKey, type FileTab } from "../../shared/files";

export type SnapshotFile = { id: string; name: string; text: string };

/** The files inside a saved room state (a Yjs update), including rooms from before multi-file. */
export function readSnapshot(bytes: Uint8Array): SnapshotFile[] {
  const tmp = new Y.Doc();
  Y.applyUpdate(tmp, bytes);
  let tabs = dedupeTabs(tmp.getArray<FileTab>("tabs").toArray());
  if (tabs.length === 0) tabs = [{ id: MAIN_ID, name: legacyMainName(tmp.getMap<string>("meta").get("language")) }];
  const files = tabs.map((t) => ({ ...t, text: tmp.getText(textKey(t.id)).toString() }));
  tmp.destroy();
  return files;
}

/**
 * Make the live doc match a snapshot, as one normal edit: it syncs to everyone and the
 * room's own history keeps the state from before, so a restore can itself be undone.
 */
export function restoreInto(doc: Y.Doc, files: SnapshotFile[]) {
  doc.transact(() => {
    const live = doc.getArray<FileTab>("tabs");
    for (const tab of dedupeTabs(live.toArray())) {
      if (!files.some((f) => f.id === tab.id)) {
        const text = doc.getText(textKey(tab.id));
        text.delete(0, text.length);
      }
    }
    for (const f of files) {
      const text = doc.getText(textKey(f.id));
      if (text.toString() !== f.text) {
        text.delete(0, text.length);
        text.insert(0, f.text);
      }
    }
    live.delete(0, live.length);
    live.push(files.map(({ id, name }) => ({ id, name })));
  });
}
