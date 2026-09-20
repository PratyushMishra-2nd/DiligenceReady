// Photograph the /og route into public/og.png.
//
// The share card is composed as a real page so it can be set in Anek and
// Newsreader — Satori, which next/og renders through, does not read variable
// woff2 and would substitute both faces. Run this after any change to the
// card's copy or to the seeded figures:
//
//     node scripts/shoot-og.mjs            # against a dev server on :3000
//     BASE=https://… node scripts/shoot-og.mjs
//
// It needs a dev or production server already running, and playwright
// available — both true in this repository's toolchain.
import { chromium } from "playwright";
import { mkdir } from "node:fs/promises";

const BASE = process.env.BASE ?? "http://localhost:3000";
const OUT = new URL("../public/og.png", import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, "$1");

const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 1200, height: 630 } });
await page.goto(`${BASE}/og`, { waitUntil: "networkidle" });
// The two faces are declared by hand in globals.css, so the browser only
// fetches them once it has parsed the stylesheet and found a character that
// needs them. Photographing before that lands gives a card set in Georgia.
await page.evaluate(() => document.fonts.ready);
await page.waitForTimeout(600);
await mkdir(new URL("../public/", import.meta.url), { recursive: true });
await page.screenshot({ path: OUT, clip: { x: 0, y: 0, width: 1200, height: 630 } });
await browser.close();
console.log(`wrote ${OUT}`);
