import { useEffect, useRef } from "react";
import type { TurtleView } from "./turtleView";

/** Shows a TurtleView's canvases. The view keeps drawing even while this isn't mounted. */
export default function TurtleStage({ view, className = "" }: { view: TurtleView; className?: string }) {
  const host = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const el = host.current!;
    el.append(view.stage);
    return () => view.stage.remove();
  }, [view]);
  return <div ref={host} className={`turtle-host ${className}`} />;
}
