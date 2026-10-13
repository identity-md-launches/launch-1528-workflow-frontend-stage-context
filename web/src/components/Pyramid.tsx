import { useMemo, useState } from "react";
import { Crown, Pause, Play } from "lucide-react";
import { Button } from "./ui/button";
export function Pyramid({
  count,
  withdrawn = new Set<number>(),
  loading = false,
  statusesUnavailable = false,
}: {
  count?: bigint;
  withdrawn?: Set<number>;
  loading?: boolean;
  statusesUnavailable?: boolean;
}) {
  const [motion, setMotion] = useState(true);
  const shapes = useMemo(() => {
    const blocks = [];
    let index = 0;
    const project = (x: number, y: number, z: number) => [
      280 + (x - y) * 25,
      140 + (x + y) * 12.5 - z * 26,
    ];
    const points = (a: number[][]) => a.map((p) => p.join(",")).join(" ");
    for (let z = 0; z < 8; z++) {
      const size = 8 - z;
      for (let y = 0; y < size; y++)
        for (let x = 0; x < size; x++) {
          const xx = x + z / 2,
            yy = y + z / 2;
          const a = project(xx, yy, z),
            b = project(xx + 0.95, yy, z),
            cc = project(xx + 0.95, yy + 0.95, z),
            d = project(xx, yy + 0.95, z);
          const down = (p: number[]) => [p[0], p[1] + 23];
          blocks.push({
            index: index++,
            top: points([a, b, cc, d]),
            left: points([d, cc, down(cc), down(d)]),
            right: points([b, cc, down(cc), down(b)]),
            depth: x + y + z * 20,
          });
        }
    }
    return blocks;
  }, []);
  const visible = count === undefined ? 0 : Number(count > 204n ? 204n : count);
  return (
    <div className={`pyramid-scene ${motion ? "" : "motion-paused"}`}>
      <div className="scene-heading">
        <span>
          {loading
            ? "Reading confirmed bricks"
            : count === undefined
              ? "Awaiting chain data"
              : `${count.toLocaleString()} confirmed ${count === 1n ? "brick" : "bricks"}`}
        </span>
        <Button
          variant="ghost"
          size="small"
          aria-label={motion ? "Pause crown animation" : "Play crown animation"}
          onClick={() => setMotion(!motion)}
        >
          {motion ? <Pause size={16} /> : <Play size={16} />}
        </Button>
      </div>
      <svg
        className="pyramid"
        viewBox="0 -100 560 490"
        role="img"
        aria-label={
          count === undefined
            ? "Pyramid blueprint, waiting for live chain data"
            : `Isometric pyramid with ${count} confirmed bricks. Withdrawn Stone is shown in dark stone.`
        }
      >
        <defs>
          <radialGradient id="sand">
            <stop stopColor="#b98650" stopOpacity=".23" />
            <stop offset="1" stopColor="#b98650" stopOpacity="0" />
          </radialGradient>
        </defs>
        <ellipse cx="280" cy="280" rx="270" ry="100" fill="url(#sand)" />
        <path
          d="M52 244 280 130 508 244 280 358Z"
          fill="none"
          stroke="#585044"
          strokeDasharray="3 8"
        />
        {shapes.map((b) => {
          const filled = b.index < visible,
            off = withdrawn.has(b.index);
          return (
            <g
              key={b.index}
              opacity={filled ? (statusesUnavailable ? 0.4 : 1) : 0.07}
              className={filled ? "confirmed-brick" : "blueprint-brick"}
            >
              <polygon
                points={b.left}
                fill={off ? "#635c4f" : "#c49860"}
                stroke="#171815"
                strokeWidth=".65"
              />
              <polygon
                points={b.right}
                fill={off ? "#4c483f" : "#966842"}
                stroke="#171815"
                strokeWidth=".65"
              />
              <polygon
                points={b.top}
                fill={off ? "#807566" : "#ead1a5"}
                stroke="#171815"
                strokeWidth=".65"
              />
            </g>
          );
        })}
      </svg>
      <Crown
        className="scene-crown"
        size={32}
        strokeWidth={1.5}
        aria-hidden="true"
      />
      <div className="scene-caption">
        {visible === 0
          ? "Every monument begins with one brick."
          : count && count > 204n
            ? "First 204 slots shown. All confirmed bricks count."
            : "Built together. One confirmed brick at a time."}
      </div>
    </div>
  );
}
