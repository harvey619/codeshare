import { useState } from "react";
import { normalizeRoomName, randomRoomName } from "../shared/limits";

export default function NewRoomDialog({ onClose }: { onClose: () => void }) {
  const [name, setName] = useState("");
  const clean = normalizeRoomName(name);

  function go(e: React.FormEvent) {
    e.preventDefault();
    location.href = `/${clean ?? randomRoomName()}`;
  }

  return (
    <div className="backdrop" onClick={onClose}>
      <form className="dialog" onSubmit={go} onClick={(e) => e.stopPropagation()}>
        <label htmlFor="room-name">Room name</label>
        <input
          id="room-name"
          autoFocus
          value={name}
          onChange={(e) => setName(e.target.value)}
          onKeyDown={(e) => e.key === "Escape" && onClose()}
          placeholder="e.g. python-class"
          maxLength={80}
        />
        <p className="hint">
          {clean ? `${location.host}/${clean}` : "Leave empty for a random name"}
        </p>
        <div className="dialog-actions">
          <button type="button" className="btn" onClick={onClose}>Cancel</button>
          <button type="submit" className="btn primary">Open room</button>
        </div>
      </form>
    </div>
  );
}