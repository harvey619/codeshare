Each message was the whole document: “the text is now ab”. When two people type at the same moment, their messages cross. Each browser receives the other’s version and replaces its own, so each person’s keystroke gets deleted by the other’s. They end up showing different text, and half the typing is lost.

The message is missing two things: what the person actually did (“I added a here”), and what version they did it on. Without those, the only option is to overwrite, and overwriting loses work.

Yjs fixes this by giving every character a permanent ID. An insert says “put a right after character #7”, not “the doc is now X”. Edits get merged instead of overwritten, and every computer merges them the same way, in any order. So everyone always ends up with the same text, and nothing is lost.

LWW sends snapshots, and snapshots can only overwrite. A CRDT sends operations anchored to stable IDs, which can be merged in any order. So it converges.