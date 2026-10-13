import { useEffect, useState } from "react";
import { ArrowUpRight, Crown, Layers3, ArrowDownLeft } from "lucide-react";
import { decodeEventLog, type Hex, type AbiEvent } from "viem";
import { shortAddress } from "../format";
import type { Runtime } from "../config";
import type { Reader, Snapshot } from "../chain";
interface ActivityItem {
  key: string;
  label: string;
  detail: string;
  hash: Hex;
  kind: string;
}
export function Activity({
  runtime,
  reader,
  s,
}: {
  runtime?: Runtime;
  reader?: Reader;
  s?: Snapshot;
}) {
  const [items, setItems] = useState<ActivityItem[]>([]),
    [error, setError] = useState(false),
    [loading, setLoading] = useState(true);
  useEffect(() => {
    let alive = true;
    if (!runtime || !reader || !s) return;
    const from =
      s.block > runtime.deploymentBlock + 63n
        ? s.block - 63n
        : runtime.deploymentBlock;
    reader
      .getLogs({
        address: runtime.game,
        events: runtime.abis.Ponziramid.filter(
          (item): item is AbiEvent =>
            item.type === "event" &&
            [
              "BrickPlaced",
              "BrickDeactivated",
              "RoundFinalized",
              "BrickETHClaimed",
              "ETHClaimed",
            ].includes(item.name),
        ),
        fromBlock: from,
        toBlock: s.block,
      })
      .then((logs) => {
        const list: ActivityItem[] = [];
        for (const log of logs) {
          try {
            const e = decodeEventLog({
              abi: runtime.abis.Ponziramid,
              data: log.data,
              topics: log.topics,
            });
            const a = e.args as unknown as Record<string, bigint | string>;
            let label = "",
              detail = "";
            if (e.eventName === "BrickPlaced") {
              label = `${shortAddress(String(a.player))} built`;
              detail = `Brick #${a.brickId} · Round ${a.roundId}`;
            } else if (e.eventName === "BrickDeactivated") {
              label = "Stone withdrawn";
              detail = `Brick #${a.brickId}`;
            } else if (e.eventName === "RoundFinalized") {
              label = `Round ${a.roundId} finalized`;
              detail = `Pharaoh ${shortAddress(String(a.pharaoh))}`;
            } else if (e.eventName === "BrickETHClaimed") {
              label = "Brick earnings claimed";
              detail = `Brick #${a.brickId}`;
            } else if (e.eventName === "ETHClaimed") {
              label = "ETH reward claimed";
              detail = shortAddress(String(a.player));
            }
            if (label && log.transactionHash)
              list.push({
                key: log.transactionHash + log.logIndex,
                label,
                detail,
                hash: log.transactionHash,
                kind: e.eventName || "event",
              });
          } catch {
            /* Skip unrelated events. */
          }
        }
        if (alive) {
          setItems(list.reverse().slice(0, 4));
          setError(false);
          setLoading(false);
        }
      })
      .catch(() => {
        if (alive) {
          setError(true);
          setLoading(false);
        }
      });
    return () => {
      alive = false;
    };
  }, [runtime, reader, s?.block]);
  return (
    <aside className="activity">
      <div className="section-title">
        <h3>On the sand</h3>
        <span className="live-label">
          <i className="live-dot" />
          {error ? "Unavailable" : "Live activity"}
        </span>
      </div>
      {items.length ? (
        <ul>
          {items.map((item) => (
            <li key={item.key}>
              <span className="activity-icon">
                {item.kind === "RoundFinalized" ? (
                  <Crown size={18} />
                ) : item.kind === "BrickPlaced" ? (
                  <Layers3 size={18} />
                ) : (
                  <ArrowDownLeft size={18} />
                )}
              </span>
              <div>
                <span>{item.label}</span>
                <small>{item.detail}</small>
              </div>
              <a
                className="icon-button"
                href={`${runtime!.deployment.network.explorer}/tx/${item.hash}`}
                target="_blank"
                rel="noreferrer"
                aria-label={`View ${item.detail} transaction`}
              >
                <ArrowUpRight size={16} />
              </a>
            </li>
          ))}
        </ul>
      ) : (
        <p className="empty-copy">
          {error
            ? "Activity unavailable; use Refresh to retry."
            : loading
              ? "Reading recent events…"
              : "No game events in the latest 64 blocks."}
        </p>
      )}
    </aside>
  );
}
