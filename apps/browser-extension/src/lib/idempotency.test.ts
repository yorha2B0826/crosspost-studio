import { describe, expect, it } from "vitest";

import { IdempotencyLedger } from "./idempotency";

describe("idempotency ledger", () => {
  it("never treats a duplicate active or completed job as new", () => {
    const ledger = new IdempotencyLedger<string>();

    expect(ledger.claim("job-1")).toEqual({ status: "new" });
    expect(ledger.claim("job-1")).toEqual({ status: "active" });
    ledger.complete("job-1", "draft-saved");
    expect(ledger.claim("job-1")).toEqual({
      status: "completed",
      value: "draft-saved"
    });
  });

  it("bounds completed metadata without retaining article content", () => {
    const ledger = new IdempotencyLedger<string>(1);
    expect(ledger.claim("job-1").status).toBe("new");
    ledger.complete("job-1", "done-1");
    expect(ledger.claim("job-2").status).toBe("new");
    ledger.complete("job-2", "done-2");

    expect(ledger.claim("job-1").status).toBe("new");
    expect(ledger.claim("job-2")).toEqual({
      status: "completed",
      value: "done-2"
    });
  });
});
