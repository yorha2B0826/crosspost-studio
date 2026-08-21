// @vitest-environment jsdom

import { afterEach, describe, expect, it, vi } from "vitest";

import { waitFor } from "./query";

describe("waitFor", () => {
  afterEach(() => {
    vi.useRealTimers();
  });

  it("resolves true once a mutation makes the predicate pass", async () => {
    document.body.innerHTML = `<div id="root"></div>`;
    const pending = waitFor(
      () => document.querySelector("#ready") !== null,
      1_000
    );
    document.body.insertAdjacentHTML("beforeend", `<span id="ready"></span>`);
    await expect(pending).resolves.toBe(true);
  });

  it("coalesces a burst of mutations into a single predicate evaluation", async () => {
    document.body.innerHTML = `<div id="root"></div>`;
    let evaluations = 0;
    const pending = waitFor(() => {
      evaluations += 1;
      return document.querySelectorAll(".item").length >= 10;
    }, 1_000);
    for (let index = 0; index < 10; index += 1) {
      document
        .querySelector("#root")!
        .insertAdjacentHTML("beforeend", `<span class="item"></span>`);
    }
    await expect(pending).resolves.toBe(true);
    // One initial evaluation plus one for the coalesced burst; the previous
    // per-mutation behavior would evaluate ten times.
    expect(evaluations).toBeLessThanOrEqual(2);
  });

  it("resolves false after the timeout when the predicate never passes", async () => {
    vi.useFakeTimers();
    const pending = waitFor(() => false, 250);
    const settled = expect(pending).resolves.toBe(false);
    await vi.advanceTimersByTimeAsync(260);
    await settled;
  });
});
