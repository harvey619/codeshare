import { useEffect, useRef, useState } from "react";
import { formatTime, parseNames, pickNext } from "./picker";

const NAMES_KEY = "tools.picker.names";
const PRESETS = [1, 3, 5, 10];

function load(key: string) {
  try {
    return localStorage.getItem(key) ?? "";
  } catch {
    return "";
  }
}
function save(key: string, value: string) {
  try {
    localStorage.setItem(key, value);
  } catch {
    // private mode or storage blocked: the list just won't be remembered
  }
}

function beep() {
  try {
    const ctx = new AudioContext();
    [0, 0.35, 0.7].forEach((t) => {
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.frequency.value = 880;
      gain.gain.setValueAtTime(0.25, ctx.currentTime + t);
      gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + t + 0.3);
      osc.connect(gain).connect(ctx.destination);
      osc.start(ctx.currentTime + t);
      osc.stop(ctx.currentTime + t + 0.3);
    });
    setTimeout(() => ctx.close(), 1500);
  } catch {
    // no audio available
  }
}

const reducedMotion = () => matchMedia("(prefers-reduced-motion: reduce)").matches;

export default function PickerTool() {
  const [text, setText] = useState(() => load(NAMES_KEY));
  const names = parseNames(text);
  const [picked, setPicked] = useState<string[]>([]);
  const [current, setCurrent] = useState<string | null>(null);
  const [left, setLeft] = useState<number | null>(null);
  const [shuffling, setShuffling] = useState(false);

  const [duration, setDuration] = useState(3 * 60_000);
  const [remaining, setRemaining] = useState(3 * 60_000);
  const [endsAt, setEndsAt] = useState<number | null>(null); // set while running
  const [finished, setFinished] = useState(false);
  const stage = useRef<HTMLDivElement>(null);

  useEffect(() => save(NAMES_KEY, text), [text]);

  // Tick from the end time, so a throttled background tab stays accurate.
  useEffect(() => {
    if (endsAt === null) return;
    const id = setInterval(() => {
      const ms = endsAt - Date.now();
      setRemaining(Math.max(0, ms));
      if (ms <= 0) {
        setEndsAt(null);
        setFinished(true);
        beep();
      }
    }, 200);
    return () => clearInterval(id);
  }, [endsAt]);

  function pick() {
    const result = pickNext(names, picked);
    if (!result) return;
    const land = () => {
      setCurrent(result.name);
      setPicked(result.picked);
      setLeft(result.left);
      setShuffling(false);
    };
    if (reducedMotion() || names.length < 2) return land();
    // A short shuffle through names before landing, for suspense.
    setShuffling(true);
    let n = 0;
    const id = setInterval(() => {
      setCurrent(names[Math.floor(Math.random() * names.length)]);
      if (++n >= 12) {
        clearInterval(id);
        land();
      }
    }, 70);
  }

  function setMinutes(min: number) {
    const ms = Math.round(Math.max(0.1, Math.min(180, min)) * 60_000);
    setDuration(ms);
    setRemaining(ms);
    setEndsAt(null);
    setFinished(false);
  }

  function startPause() {
    if (endsAt !== null) {
      setEndsAt(null); // pause: `remaining` already holds the time left
    } else {
      const from = remaining > 0 ? remaining : duration;
      setRemaining(from);
      setFinished(false);
      setEndsAt(Date.now() + from);
    }
  }

  const running = endsAt !== null;

  return (
    <div className="picker">
      <div className="picker-list">
        <label htmlFor="picker-names">Class list (one name per line)</label>
        <textarea
          id="picker-names"
          value={text}
          onChange={(e) => {
            setText(e.target.value);
            setPicked([]);
            setLeft(null);
          }}
          rows={12}
          placeholder={"Ana\nBen\nCy"}
        />
        <p className="side-note">{names.length} {names.length === 1 ? "name" : "names"}, saved in this browser</p>
      </div>

      <div className="picker-stage" ref={stage}>
        <section className="picker-card">
          <div className={`picker-name${shuffling ? " shuffling" : ""}`} aria-live="polite">
            {current ?? (names.length ? "Who's next?" : "Add some names")}
          </div>
          <div className="picker-row">
            <button className="btn primary big" onClick={pick} disabled={names.length === 0 || shuffling}>
              Pick a student
            </button>
            <button
              className="btn"
              onClick={() => {
                setPicked([]);
                setCurrent(null);
                setLeft(null);
              }}
              disabled={picked.length === 0}
            >
              New round
            </button>
          </div>
          {left !== null && (
            <p className="side-note">
              {left === 0 ? "Everyone's had a turn. Next pick starts a new round." : `${left} left this round`}
            </p>
          )}
        </section>

        <section className={`picker-card${finished ? " timer-done" : ""}`}>
          <div className="timer" role="timer" aria-live="off">{formatTime(remaining)}</div>
          <div className="picker-row">
            {PRESETS.map((m) => (
              <button key={m} className="btn small" onClick={() => setMinutes(m)}>
                {m} min
              </button>
            ))}
            <label className="timer-custom">
              <input
                type="number"
                min={0.1}
                max={180}
                step={0.5}
                aria-label="Minutes"
                value={Math.round((duration / 60_000) * 10) / 10}
                onChange={(e) => e.target.value && setMinutes(Number(e.target.value))}
              />
              min
            </label>
          </div>
          <div className="picker-row">
            <button className="btn primary big" onClick={startPause}>
              {running ? "Pause" : remaining > 0 && remaining < duration ? "Resume" : "Start"}
            </button>
            <button className="btn" onClick={() => setMinutes(duration / 60_000)}>Reset</button>
            <button className="btn" onClick={() => stage.current?.requestFullscreen?.()}>Fullscreen</button>
          </div>
          {finished && <p className="timer-note">Time's up!</p>}
        </section>
      </div>
    </div>
  );
}
