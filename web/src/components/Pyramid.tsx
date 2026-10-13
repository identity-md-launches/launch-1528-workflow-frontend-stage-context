import { useMemo, useState } from "react";
import { Crown, Pause, Play } from "lucide-react";
import { Button } from "./ui/button";
import { pyramidLayout } from "../pyramid";
export function Pyramid({
  count,
  withdrawn = new Set<bigint>(),
  loading = false,
  statusesUnavailable = false,
}: {
  count?: bigint;
  withdrawn?: Set<bigint>;
  loading?: boolean;
  statusesUnavailable?: boolean;
}) {
  const [motion, setMotion] = useState(true);
  const layout = useMemo(() => pyramidLayout(count), [count]);
  const { side, grouped, groupSize, detailStart, detailCount, units } = layout;
  const shapes = useMemo(() => {
    const blocks = [];
    let index = 0;
    const project = (x: number, y: number, z: number) => [
      280 + (x - y) * (200 / side),
      140 + (x + y) * (100 / side) - z * (208 / side),
    ];
    const points = (a: number[][]) => a.map((p) => p.join(",")).join(" ");
    for (let z = 0; z < side; z++) {
      const size = side - z;
      for (let y = 0; y < size; y++)
        for (let x = 0; x < size; x++) {
          const xx = x + z / 2,
            yy = y + z / 2;
          const a = project(xx, yy, z),
            b = project(xx + 0.95, yy, z),
            cc = project(xx + 0.95, yy + 0.95, z),
            d = project(xx, yy + 0.95, z);
          const down = (p: number[]) => [p[0], p[1] + 184 / side];
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
  }, [side]);
  const representation = grouped
    ? `Overview: up to ${groupSize.toLocaleString()} bricks per stone. Bricks ${(detailStart + 1n).toLocaleString()}–${count!.toLocaleString()} enlarged below; dark bricks have withdrawn Stone.`
    : "Individual bricks, filled bottom-up. Dark bricks have withdrawn Stone.";
  return (
    <div
      className={`pyramid-scene ${grouped ? "grouped-scene" : ""} ${motion ? "" : "motion-paused"}`}
    >
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
        viewBox={grouped ? "0 -100 560 650" : "0 -100 560 490"}
        role="img"
        aria-label={
          count === undefined
            ? "Pyramid blueprint, waiting for live chain data"
            : `Isometric pyramid with ${count} confirmed bricks. ${representation}${statusesUnavailable ? " Withdrawal statuses are unavailable." : ""}`
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
          const filled = b.index < units,
            off = !grouped && withdrawn.has(BigInt(b.index));
          return (
            <g
              key={b.index}
              opacity={filled ? (statusesUnavailable ? 0.4 : 1) : 0.07}
              className={
                filled
                  ? grouped
                    ? "aggregate-brick"
                    : "confirmed-brick"
                  : "blueprint-brick"
              }
              data-index={grouped ? undefined : b.index}
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
        {grouped &&
          Array.from({ length: 64 }, (_, i) => {
            // An enlarged 8×8 course makes each newly confirmed brick visible,
            // even when one overview stone represents many thousands of bricks.
            const x = 70 + (i % 8) * 48 + Math.floor(i / 8) * 5;
            const y = 370 + Math.floor(i / 8) * 18;
            const filled = i < detailCount;
            const index = detailStart + BigInt(i);
            const off = withdrawn.has(index);
            return (
              <g
                key={index.toString()}
                data-index={index.toString()}
                className={filled ? "confirmed-brick" : "blueprint-brick"}
                opacity={filled ? (statusesUnavailable ? 0.4 : 1) : 0.07}
              >
                <path
                  d={`M${x} ${y}h42v12l-6 4h-42v-12Z`}
                  fill={off ? "#635c4f" : "#c49860"}
                  stroke="#171815"
                />
                <path
                  d={`M${x} ${y}h42l-6 4h-42Z`}
                  fill={off ? "#807566" : "#ead1a5"}
                  stroke="#171815"
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
      <div className={`scene-caption ${grouped ? "representation-limit" : ""}`}>
        {units === 0
          ? "Every monument begins with one brick."
          : grouped
            ? representation
            : "Built together. One confirmed brick at a time."}
      </div>
    </div>
  );
}
