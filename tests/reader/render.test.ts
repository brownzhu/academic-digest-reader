// @vitest-environment happy-dom

import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { beforeAll, describe, expect, it } from "vitest";
import { PROJECT_ROOT } from "../helpers";

beforeAll(async () => {
  const html = readFileSync(resolve(PROJECT_ROOT, "sidepanel.html"), "utf8");
  document.documentElement.innerHTML = html
    .replace(/^<!doctype html>/i, "")
    .replace(/<link[^>]+rel="stylesheet"[^>]*>/i, "")
    .replace(/<script[\s\S]*?<\/script>/i, "");
  await import("../../src/reader/main");
});

describe("Side Panel startup", () => {
  it("boots from the real HTML and renders the verified fixture", () => {
    expect(document.querySelectorAll(".item-card")).toHaveLength(17);
    expect(document.getElementById("overview-total")?.textContent).toBe("17");
    expect(document.getElementById("result-count")?.textContent).toBe("17 of 17 items");
    expect(document.getElementById("stage-note")?.textContent).toContain("Fixture preview");
  });

  it("renders text and outbound links without injecting announcement HTML", () => {
    const firstCard = document.querySelector<HTMLElement>(".item-card");
    expect(firstCard?.querySelector("h2")?.textContent).toBeTruthy();
    const link = document.querySelector<HTMLAnchorElement>(".primary-link");
    expect(link?.target).toBe("_blank");
    expect(link?.rel).toContain("noopener");
  });

  it("supports search, filters, expansion, and theme changes in the real DOM", async () => {
    const search = document.getElementById("search-input") as HTMLInputElement;
    search.value = "numerical weather prediction";
    search.dispatchEvent(new Event("input"));
    expect(document.querySelectorAll(".item-card")).toHaveLength(1);
    expect(document.querySelector(".item-card h2")?.textContent).toContain(
      "Numerical Weather Prediction",
    );

    search.value = "";
    search.dispatchEvent(new Event("input"));
    const relevant = document.querySelector<HTMLButtonElement>("button[data-filter='relevant']")!;
    relevant.click();
    expect(document.querySelectorAll(".item-card")).toHaveLength(13);
    expect(relevant.getAttribute("aria-pressed")).toBe("true");

    document.querySelector<HTMLButtonElement>("button[data-filter='all']")!.click();
    const expand = document.querySelector<HTMLButtonElement>(".text-button")!;
    const detailsId = expand.getAttribute("aria-controls")!;
    expand.click();
    expect(document.getElementById(detailsId)?.hidden).toBe(false);
    expect(expand.getAttribute("aria-expanded")).toBe("true");

    const theme = document.getElementById("theme-select") as HTMLSelectElement;
    theme.value = "dark";
    theme.dispatchEvent(new Event("change"));
    await Promise.resolve();
    expect(document.documentElement.dataset.theme).toBe("dark");
    expect(localStorage.getItem("displayMode")).toBe("dark");
  });
});
