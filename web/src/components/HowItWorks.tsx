import {
  ArrowDown,
  ArrowRight,
  Crown,
  Diamond,
  Hourglass,
  Layers3,
  TrendingUp,
  Waves,
  ChevronDown,
  Info,
} from "lucide-react";
import { HoverCard } from "./ui/overlays";
import { Amount } from "./common";
export const definitions = {
  Stone:
    "90% of your brick price, held in the vault and refundable at any time.",
  Mortar:
    "The non-refundable 10% that funds earlier bricks, the Tomb and the owner.",
  Tomb: "Mortar-funded ETH: 40% to Pharaoh, 40% to diamond hands, 20% rolls forward.",
  Pharaoh:
    "The last builder at expiry wins 40% of the Tomb and 300k PONZIRAM, plus a participation share.",
  "Diamond hands":
    "Bricks held through expiry share 40% of the Tomb in proportion to their Stone.",
};
export function Term({ name }: { name: keyof typeof definitions }) {
  return (
    <HoverCard content={<p>{definitions[name]}</p>}>
      <span className="term">
        {name}
        <Info size={12} />
      </span>
    </HoverCard>
  );
}
export function HowItWorks({ price }: { price?: bigint }) {
  return (
    <section id="how-it-works" className="how-section">
      <div className="section-title">
        <div>
          <h2>How the pyramid works</h2>
          <p className="muted">Follow the ETH from one brick.</p>
        </div>
        <span className="round-reward">
          <Crown size={18} />
          1M PONZIRAM / round
        </span>
      </div>
      <div className="money-flow">
        <div className="flow-origin">
          <Layers3 size={30} />
          <strong>
            <Amount value={price} />
          </strong>
          <span className="hint">One brick</span>
        </div>
        <ArrowRight className="flow-arrow" />
        <div className="flow-stone">
          <span className="flow-percent">90%</span>
          <Term name="Stone" />
          <span className="hint">Back to you</span>
        </div>
        <div className="flow-mortar">
          <div>
            <span className="flow-percent">10%</span>
            <Term name="Mortar" />
          </div>
          <div className="flow-split">
            <span>
              <strong>5%</strong> earlier bricks
            </span>
            <span>
              <strong>4%</strong> <Term name="Tomb" />
            </span>
            <span>
              <strong>1%</strong> owner
            </span>
          </div>
        </div>
      </div>
      <div className="game-theory">
        <div>
          <TrendingUp size={26} />
          <h3>Early = dividends.</h3>
          <p>Later bricks pay active earlier bricks.</p>
        </div>
        <div>
          <Crown size={26} />
          <h3>
            Last = <Term name="Pharaoh" />.
          </h3>
          <p>40% of Tomb + 300k PONZIRAM.</p>
        </div>
        <div>
          <Waves size={26} />
          <h3>Middle = vibes.</h3>
          <p>A participation share, with no guarantees.</p>
        </div>
      </div>
      <div className="timeline" aria-label="Round timeline">
        {[
          ["1", "Start"],
          ["2", "Each brick resets 24h"],
          ["3", "Max 7 days"],
          ["4", "Finalize"],
          ["5", "Claim"],
        ].map(([n, label]) => (
          <div key={n}>
            <span>{n}</span>
            <p>{label}</p>
          </div>
        ))}
      </div>
      <div className="rules-grid" id="rules">
        {[
          ["Refunds", "Stone is refundable anytime; Mortar and gas are not."],
          [
            "Leaving early",
            "Early exit: −10 min, no new dividends or diamond share.",
          ],
          [
            "Keeping earned rewards",
            "Earned ETH and token eligibility survive an early exit.",
          ],
          [
            "Price & building",
            "Price rises 0.5%; 60s cooldown, no back-to-back builds.",
          ],
          [
            "Bots & bank runs",
            "Bots and ordering affect outcomes; bank runs can end rounds.",
          ],
          [
            "The owner can pause",
            "The owner can build, then pause rivals while the clock runs.",
          ],
          [
            "Claims stay open",
            "Pauses still allow refunds, claims and finalization.",
          ],
          [
            "PONZIRAM rewards",
            "1M per round: 300k to Pharaoh, 700k split by unique players.",
          ],
        ].map(([label, copy]) => (
          <details key={label}>
            <summary>
              {label}
              <ChevronDown size={16} />
            </summary>
            <p>{copy}</p>
          </details>
        ))}
      </div>
      <div className="risk-footnote">
        <Term name="Diamond hands" />
        <p>
          No promised profit, bot-proof fairness or token value. Multiple
          wallets can influence results; the owner cannot take your Stone or
          permanent token funding.
        </p>
      </div>
      <p className="rounding-note">
        Mortar splits are before integer rounding; without earlier active
        bricks, their share joins the Tomb. Gas is additional and
        non-refundable.
      </p>
    </section>
  );
}
