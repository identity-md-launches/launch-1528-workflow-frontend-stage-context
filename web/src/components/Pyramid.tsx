import { useEffect, useState } from "react";
import { Crown, Pause, Play } from "lucide-react";
import { read, same, type Brick, type Reader, type Snapshot } from "../chain";
import type { Runtime } from "../config";
import { mapLimit } from "../portfolio";
import { pyramidPage } from "../pyramid";
import type { Address } from "viem";
export function Pyramid({
  s,
  runtime,
  reader,
  account,
  onBrick,
}: {
  s?: Snapshot;
  runtime?: Runtime;
  reader?: Reader;
  account?: Address;
  onBrick: (id: bigint) => void;
}) {
  const [bricks, setBricks] = useState<Map<bigint, Brick>>(new Map()),
    [error, setError] = useState(false),
    [animate, setAnimate] = useState(true),
    [page, setPage] = useState(0n),
    [followLatest, setFollowLatest] = useState(true);
  const count = s?.round.placedBricks || 0n;
  const {
    pages,
    current: safePage,
    offset,
    visible: visibleCount,
    side,
  } = pyramidPage(count, page);
  useEffect(() => {
    setFollowLatest(true);
  }, [s?.roundId]);
  useEffect(() => {
    if (followLatest) setPage(pages - 1n);
  }, [pages, followLatest]);
  useEffect(() => {
    let alive = true;
    if (!s || !runtime || !reader || !count) {
      setBricks(new Map());
      return;
    }
    const first = s.brickCount - count + 1n;
    void mapLimit(
      Array.from(
        { length: visibleCount },
        (_, i) => first + offset + BigInt(i),
      ),
      async (id) =>
        [
          id,
          await read<Brick>(
            reader,
            runtime.game,
            runtime.abis.Ponziramid,
            "bricks",
            [id],
            s.block,
          ),
        ] as const,
    )
      .then((result) => {
        if (alive) {
          setBricks(new Map(result));
          setError(false);
        }
      })
      .catch(() => {
        if (alive) setError(true);
      });
    return () => {
      alive = false;
    };
  }, [s?.block, s?.roundId, visibleCount, safePage, runtime, reader]);
  let index = 0;
  const rows = Array.from({ length: side }, (_, row) => {
    const len = side - row;
    const cells = Array.from({ length: len }, () => index++);
    return cells;
  }).reverse();
  return (
    <div className={`pyramid-scene ${animate ? "animate-crown" : ""}`}>
      <img
        className="scene-art"
        src="./art/desert-noir.webp"
        alt="Original desert scene with a smug frog Pharaoh, a desert adventurer and a cat statue"
        fetchPriority="high"
      />
      <div className="scene-top">
        <span className="scene-caption">
          {s
            ? count
              ? "The crown is temporary."
              : "A throne waiting for its first brick."
            : "Reading the pyramid…"}
        </span>
        <button
          className="icon-button"
          aria-label={
            animate ? "Pause crown animation" : "Play crown animation"
          }
          aria-pressed={!animate}
          onClick={() => setAnimate(!animate)}
        >
          {animate ? <Pause size={14} /> : <Play size={14} />}
        </button>
      </div>
      <div
        className="pyramid-structure"
        style={{ "--pyramid-side": side } as React.CSSProperties}
        aria-label="Stepped pyramid. Bricks fill from the bottom."
      >
        {rows.map((cells, row) => (
          <div className="pyramid-tier" key={row}>
            {cells.map((i) => {
              const built = i < visibleCount,
                id = s ? s.brickCount - count + 1n + offset + BigInt(i) : 0n,
                b = bricks.get(id),
                own = same(b?.player, account),
                pharaoh = !!s && built && offset + BigInt(i) === count - 1n;
              return built ? (
                <button
                  key={i}
                  className={`pyramid-brick filled ${own ? "owned" : ""} ${b?.withdrawn ? "withdrawn" : ""} ${pharaoh ? "pharaoh" : ""}`}
                  aria-label={`Brick #${id}${own ? ", yours" : ""}${b?.withdrawn ? ", withdrawn" : ""}${pharaoh ? ", Pharaoh" : ""}`}
                  onClick={() => onBrick(id)}
                >
                  {pharaoh && <Crown className="brick-crown" size={21} />}
                  <span className="brick-carving">
                    {i % 11 === 0 ? "gm" : i % 7 === 0 ? "wagmi" : ""}
                  </span>
                  {b?.withdrawn && (
                    <svg
                      className="crack"
                      viewBox="0 0 40 25"
                      aria-hidden="true"
                    >
                      <path d="m22 0-8 9 9 3-11 13" />
                    </svg>
                  )}
                </button>
              ) : (
                <span
                  key={i}
                  className="pyramid-brick unbuilt"
                  aria-hidden="true"
                />
              );
            })}
          </div>
        ))}
        <div className="pyramid-plinth" aria-hidden="true">
          <span>gm</span>
          <span>touch sand responsibly</span>
          <span>wagmi</span>
        </div>
      </div>
      <div className="scene-bottom">
        <div className="scene-legend">
          <span>
            <i className="legend-brick" />
            Active
          </span>
          <span>
            <i className="legend-brick yours" />
            Yours
          </span>
          <span>
            <i className="legend-brick cracked" />
            Withdrawn
          </span>
        </div>
        <span className="hint">
          {error
            ? "Status read unavailable"
            : count
              ? "Tap a brick to inspect"
              : "Outline = unbuilt"}
        </span>
      </div>
      {pages > 1n && (
        <div className="pyramid-pagination">
          <button
            disabled={safePage === 0n}
            onClick={() => {
              setFollowLatest(false);
              setPage(safePage - 1n);
            }}
          >
            Previous
          </button>
          <span>
            Bricks {(offset + 1n).toString()}–
            {(offset + BigInt(visibleCount)).toString()}
          </span>
          <button
            disabled={safePage >= pages - 1n}
            onClick={() => {
              setFollowLatest(false);
              setPage(safePage + 1n);
            }}
          >
            Next
          </button>
          {!followLatest && (
            <button onClick={() => setFollowLatest(true)}>Latest</button>
          )}
        </div>
      )}
    </div>
  );
}
