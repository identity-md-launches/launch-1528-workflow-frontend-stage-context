// Focused regressions for transaction rejection, pending receipts and wallet changes.
process.env.TEST_FILTER ||=
  "Rejected|Unknown receipt|Wallet account changes|Simulation failure|Wrong network|Pause gates";
process.env.REVAMP_REPORT ||= "revision-results.json";
await import("./revamp.mjs");
