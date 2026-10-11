// Records the Tessera demo from the live app.
// Frames come from Chrome's screencast API (JPEG q92 at 1920x1080), which looks far better than
// Playwright's built-in 1 Mbps webm. Captions, highlight rings and camera moves are drawn in-page
// in the app's own design system. Timeline marks are written for edit.mjs (speed ramps + cuts).
//   node demo/record.mjs [--rehearse]
import { chromium } from "playwright";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const DIR = path.dirname(fileURLToPath(import.meta.url));
const OUT = path.join(DIR, "build");
const FRAMES = path.join(OUT, "frames");
const APP = process.env.APP_URL ?? "https://masterbrainy.github.io/Tessera/";
const REHEARSE = process.argv.includes("--rehearse");
const VIEW = { width: 1536, height: 864 };

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const marks = [];
const t0 = Date.now() / 1000;
const mark = (name, speed = 1) => {
  marks.push({ name, t: Date.now() / 1000, speed });
  console.log(`mark ${name.padEnd(18)} +${(Date.now() / 1000 - t0).toFixed(1)}s ×${speed}`);
};

// ---------- in-page overlay kit (bloom palette, Inter) ----------
const KIT = `
(() => {
  if (window.__kit) return;
  window.__kit = true;
  const css = document.createElement('style');
  css.textContent = \`
    @import url('https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700;800&display=swap');
    #d-cur{position:fixed;z-index:2147483647;pointer-events:none;width:26px;height:26px;left:-40px;top:-40px;
      filter:drop-shadow(0 2px 3px rgba(60,35,15,.35));transition:transform .12s}
    #d-cur.down{transform:scale(.82)}
    #d-ripple{position:fixed;z-index:2147483646;pointer-events:none;width:44px;height:44px;margin:-22px 0 0 -22px;border-radius:50%;
      border:2.5px solid #d9703a;opacity:0}
    #d-ripple.go{animation:d-rip .6s ease-out}
    @keyframes d-rip{0%{opacity:.9;transform:scale(.3)}100%{opacity:0;transform:scale(1.6)}}
    #d-cap{position:fixed;left:50%;bottom:34px;z-index:2147483645;transform:translate(-50%,24px);opacity:0;pointer-events:none;
      max-width:1080px;padding:16px 26px 18px;border-radius:18px;background:rgba(43,33,24,.92);color:#fffdf9;
      font:600 23px/1.38 Inter,sans-serif;letter-spacing:-.2px;text-align:center;box-shadow:0 18px 50px rgba(60,35,15,.28);
      transition:opacity .45s cubic-bezier(.22,1,.36,1),transform .45s cubic-bezier(.22,1,.36,1)}
    #d-cap.on{opacity:1;transform:translate(-50%,0)}
    #d-cap .eb{display:block;margin-bottom:6px;font:700 12px Inter,sans-serif;letter-spacing:.16em;color:#f2a874}
    #d-cap b{color:#fbbf24;font-weight:700}
    #d-spot{position:fixed;z-index:2147483640;pointer-events:none;border:3px solid #d9703a;border-radius:18px;opacity:0;
      box-shadow:0 0 0 9999px rgba(43,33,24,.0),0 0 0 6px rgba(217,112,58,.18);transition:all .5s cubic-bezier(.22,1,.36,1)}
    #d-spot.on{opacity:1;box-shadow:0 0 0 9999px rgba(43,33,24,.28),0 0 0 6px rgba(217,112,58,.22)}
    #d-card{position:fixed;inset:0;z-index:2147483644;display:flex;align-items:center;justify-content:center;flex-direction:column;
      background:radial-gradient(1200px 700px at 50% 42%,#fff3dc 0%,#fbf6ee 70%);opacity:0;pointer-events:none;
      transition:opacity .7s ease;font-family:Inter,sans-serif;color:#2b2118;text-align:center}
    #d-card.on{opacity:1}
    #d-card .in{transform:translateY(14px);opacity:0;transition:all .9s cubic-bezier(.22,1,.36,1) .15s}
    #d-card.on .in{transform:none;opacity:1}
    #d-card .eb{font-weight:700;font-size:14px;letter-spacing:.2em;color:#8a7663;margin-bottom:18px}
    #d-card h1{margin:0;font-size:76px;font-weight:800;letter-spacing:-2.6px;line-height:1.02}
    #d-card h2{margin:0;font-size:46px;font-weight:700;letter-spacing:-1.4px;line-height:1.15;max-width:1100px}
    #d-card p{margin:22px auto 0;max-width:860px;font-size:22px;line-height:1.55;color:#4d3f31}
    #d-card .accent{color:#d9703a}
    #d-card .logo{width:84px;height:84px;margin-bottom:26px}
    #d-card .chips{display:flex;gap:12px;justify-content:center;flex-wrap:wrap;margin-top:30px}
    #d-card .chip{padding:10px 18px;border-radius:999px;border:1px solid #eadccb;background:#fffdf9;font-size:17px;font-weight:600;color:#4d3f31}
    #d-card .row{display:flex;gap:18px;justify-content:center;margin-top:34px}
    #d-card .tile{width:250px;padding:20px 18px;border-radius:18px;background:#fffdf9;border:1px solid #eadccb;text-align:left}
    #d-card .tile b{display:block;font-size:17px;margin-bottom:6px}
    #d-card .tile span{font-size:15px;color:#8a7663;line-height:1.45}
    #d-card .url{margin-top:34px;font-size:20px;font-weight:700;color:#d9703a}
    #root{transition:transform 1.3s cubic-bezier(.65,0,.35,1);will-change:transform}
  \`;
  document.head.appendChild(css);
  const cur = document.createElement('div');
  cur.id = 'd-cur';
  cur.innerHTML = '<svg viewBox="0 0 24 24" width="26" height="26"><path d="M5 3L19 12L12.5 13.2L9.3 20L5 3Z" fill="#2b2118" stroke="#fffdf9" stroke-width="1.6" stroke-linejoin="round"/></svg>';
  const rip = document.createElement('div'); rip.id = 'd-ripple';
  const cap = document.createElement('div'); cap.id = 'd-cap';
  const spot = document.createElement('div'); spot.id = 'd-spot';
  const card = document.createElement('div'); card.id = 'd-card';
  document.body.append(spot, card, cap, rip, cur);
  addEventListener('mousemove', e => { cur.style.left = e.clientX - 4 + 'px'; cur.style.top = e.clientY - 2 + 'px'; }, true);
  addEventListener('mousedown', e => { cur.classList.add('down'); rip.style.left = e.clientX + 'px'; rip.style.top = e.clientY + 'px';
    rip.classList.remove('go'); void rip.offsetWidth; rip.classList.add('go'); }, true);
  addEventListener('mouseup', () => cur.classList.remove('down'), true);
  window.__cap = (eb, html) => {
    if (!html) { cap.classList.remove('on'); return; }
    const set = () => { cap.innerHTML = (eb ? '<span class="eb">' + eb + '</span>' : '') + html; cap.classList.add('on'); };
    if (cap.classList.contains('on')) { cap.classList.remove('on'); setTimeout(set, 260); } else set();
  };
  window.__spot = (sel, pad = 10) => {
    if (!sel) { spot.classList.remove('on'); return; }
    const el = typeof sel === 'string' ? document.querySelector(sel) : sel;
    if (!el) return;
    const r = el.getBoundingClientRect();
    Object.assign(spot.style, { left: r.left - pad + 'px', top: r.top - pad + 'px', width: r.width + pad * 2 + 'px', height: r.height + pad * 2 + 'px' });
    spot.classList.add('on');
  };
  window.__card = (html) => {
    if (!html) { card.classList.remove('on'); return; }
    card.innerHTML = '<div class="in">' + html + '</div>';
    void card.offsetWidth; card.classList.add('on');
  };
  window.__zoom = (sel, scale = 1.25) => {
    const root = document.getElementById('root');
    if (!root) return;
    if (!sel) { root.style.transform = 'none'; return; }
    const el = document.querySelector(sel);
    const r = el.getBoundingClientRect();
    const rr = root.getBoundingClientRect();
    root.style.transformOrigin = (r.left + r.width / 2 - rr.left) + 'px ' + (r.top + r.height / 2 - rr.top) + 'px';
    root.style.transform = 'scale(' + scale + ')';
  };
})();
`;

const LOGO = `<svg class="logo" viewBox="0 0 64 64"><rect x="6" y="6" width="24" height="24" rx="6" fill="#e8799a"/><rect x="34" y="6" width="24" height="24" rx="6" fill="#b39ddb"/><rect x="6" y="34" width="24" height="24" rx="6" fill="#7cc4b3"/><rect x="34" y="34" width="24" height="24" rx="6" fill="#fbbf24"/><circle cx="32" cy="32" r="7" fill="#d9703a" stroke="#fffdf9" stroke-width="3"/></svg>`;

// ---------- page helpers ----------
let page;
const kit = () => page.evaluate(KIT);
const cap = (eb, html) => page.evaluate(([e, h]) => window.__cap(e, h), [eb, html]);
const spot = (sel, pad) => page.evaluate(([s, p]) => window.__spot(s, p), [sel, pad]);
const card = (html) => page.evaluate((h) => window.__card(h), html);
const zoom = (sel, scale) => page.evaluate(([s, k]) => window.__zoom(s, k), [sel, scale]);
const scrollTo = (y) => page.evaluate((top) => window.scrollTo({ top, behavior: "smooth" }), y);
const scrollToEl = (sel, offset = 90) =>
  page.evaluate(([s, o]) => {
    const el = document.querySelector(s);
    window.scrollTo({ top: el.getBoundingClientRect().top + window.scrollY - o, behavior: "smooth" });
  }, [sel, offset]);

async function glide(locator, label) {
  const el = typeof locator === "string" ? page.locator(locator).first() : locator;
  if (!(await el.isVisible().catch(() => false))) throw new Error(`not visible: ${label}`);
  const box = await el.boundingBox();
  await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2, { steps: 28 });
  await sleep(250);
  return el;
}
async function click(locator, label, after = 600) {
  const el = await glide(locator, label);
  await page.mouse.down();
  await sleep(90);
  await page.mouse.up();
  await sleep(after);
}

// ---------- screencast capture ----------
async function startCapture(cdp) {
  fs.rmSync(OUT, { recursive: true, force: true });
  fs.mkdirSync(FRAMES, { recursive: true });
  const frames = [];
  cdp.on("Page.screencastFrame", async (f) => {
    const name = `${String(frames.length).padStart(6, "0")}.jpg`;
    fs.writeFileSync(path.join(FRAMES, name), Buffer.from(f.data, "base64"));
    frames.push({ name, t: f.metadata.timestamp });
    await cdp.send("Page.screencastFrameAck", { sessionId: f.sessionId }).catch(() => {});
  });
  await cdp.send("Page.startScreencast", { format: "jpeg", quality: 92, maxWidth: 1920, maxHeight: 1080, everyNthFrame: 1 });
  return frames;
}

// Keeps the screencast producing frames during static moments (it only emits on repaint).
async function keepAlive() {
  await page.evaluate(() => {
    const d = document.createElement("div");
    d.style.cssText = "position:fixed;right:0;bottom:0;width:1px;height:1px;opacity:.01;z-index:2147483647;pointer-events:none";
    document.body.appendChild(d);
    let i = 0;
    setInterval(() => { d.style.background = i++ % 2 ? "#fbf6ee" : "#fbf6ef"; }, 33);
  });
}

// The headline tiles show "…" until the solo/pooled baselines finish in their worker.
const waitBaselines = () =>
  page.waitForFunction(() => {
    const r = document.getElementById("results");
    return !!r && !r.innerText.split("\n").slice(0, 12).some((l) => l.trim() === "…");
  }, null, { timeout: 60000 }).catch(() => console.warn("baselines still computing"));

// ---------- the story ----------
async function story() {
  await page.goto(APP, { waitUntil: "networkidle" });
  await kit();
  await keepAlive();
  await card(`${LOGO}<h1>Tessera</h1><p>The anti-money-laundering model <span class="accent">no exchange can build alone.</span></p>`);
  await sleep(600);
  mark("title");
  await sleep(3600);

  await card(`<div class="eb">THE BOTTLENECK</div><h2>A scam wave cashes out through <span class="accent">many exchanges.</span><br/>Each one sees only a slice.</h2><p>Pooling the data would catch it. But no exchange can hand its customers' transactions to a competitor.</p>`);
  mark("problem");
  await sleep(5200);
  await card(null);
  await page.mouse.move(1180, 520, { steps: 1 });
  await sleep(700);

  mark("landing");
  await cap("TESSERA", "Five exchanges train <b>one shared AML model</b> on 46,564 real Bitcoin transactions. Every transaction stays inside its own exchange.");
  await spot(".garden-panel", 6);
  await page.mouse.move(700, 500, { steps: 30 });
  await sleep(3800);
  await spot(null);
  const attackerSelect = page.locator(".activity-column [role=combobox]").first();
  await attackerSelect.scrollIntoViewIfNeeded();
  await sleep(500);
  await glide(attackerSelect, "attacker select");
  await cap("THE THREAT", "One member, <b>Lumen</b>, has been compromised. It will try to poison the shared model.");
  await spot(".activity-column [role=combobox]", 12);
  await sleep(3200);
  await spot(null);
  await scrollTo(0);
  await sleep(700);

  mark("run1", 1);
  await click("button.continue-btn", "Run the consortium", 400);
  await cap("TRAINING", "Each round the global model goes out, every exchange trains on its own data, and <b>only weight updates</b> come back.");
  await page.mouse.move(980, 600, { steps: 30 });
  await sleep(2600);
  mark("run1-fast", 1.6);
  await page.waitForFunction(() => document.body.innerText.includes("Round 3 of"), null, { timeout: 30000 });
  mark("run1-attack", 1);
  await cap("SCREENING", "Lumen's update points the wrong way. The coordinator <b>catches and rejects it</b>, every single round.");
  await spot('g[aria-label="About Lumen"]', 26);
  await sleep(3400);
  await spot(null);
  mark("run1-fast2", 1.8);
  await cap("PRICING", "Every exchange's contribution is priced with <b>exact Shapley values</b>: all 32 coalitions, every round.");
  await page.waitForFunction(() => document.querySelector("button.continue-btn")?.innerText.includes("Run again"), null, { timeout: 90000 });
  await sleep(1600);
  mark("run1-wait", 0);
  await waitBaselines();
  mark("results", 1);
  await cap(null);
  await scrollToEl("#results", 40);
  await sleep(1400);
  await spot("#results > div:first-child", 4);
  await cap("RESULT", "Together they catch <b>70.3%</b> of illicit transactions in weeks nobody trained on. Better than any exchange alone, and equal to pooling all the raw data.");
  await sleep(5200);
  await spot(null);

  const payouts = page.locator("text=Paid for value added, not for volume").first();
  await payouts.scrollIntoViewIfNeeded();
  await page.evaluate(() => window.scrollBy({ top: 120, behavior: "smooth" }));
  await sleep(900);
  await page.evaluate(() => {
    const h = [...document.querySelectorAll("p, div")].find((e) => e.textContent?.trim() === "Paid for value added, not for volume");
    let e = h;
    while (e && e.getBoundingClientRect().width < 480) e = e.parentElement;
    e?.setAttribute("data-demo", "payouts");
  });
  await cap("PAYOUTS", "Paid for value, not volume. The offshore venue that saw the most fraud earns most. <b>The attacker earns 0 cUSD.</b>");
  await zoom('[data-demo="payouts"]', 1.18);
  await sleep(4400);
  await zoom(null);
  await sleep(1400);
  await click(page.locator("text=Lumen · attacker").first(), "Lumen row", 1400);
  await cap("AUDIT TRAIL", "Every round: how far Lumen's update disagreed with the others, and the verdict.");
  await sleep(3400);
  await page.keyboard.press("Escape");
  await sleep(700);

  mark("defense-off", 1);
  await cap("WITHOUT TESSERA", "Turn the defense off: plain federated averaging, same attacker.");
  const plain = page.locator("button:has-text('Plain FedAvg')").first();
  await plain.scrollIntoViewIfNeeded();
  await sleep(500);
  await click(plain, "Plain FedAvg", 700);
  await scrollTo(0);
  await sleep(800);
  await click("button.continue-btn", "Run again", 300);
  mark("run2-fast", 3);
  await page.waitForFunction(() => document.querySelector("button.continue-btn")?.innerText.includes("Stop run"), null, { timeout: 30000 });
  await page.waitForFunction(() => document.querySelector("button.continue-btn")?.innerText.includes("Run again"), null, { timeout: 90000 });
  await sleep(1200);
  mark("run2-wait", 0);
  await waitBaselines();
  mark("run2-result", 1);
  await scrollToEl("#results", 40);
  await sleep(1200);
  await cap("WITHOUT TESSERA", "One bad actor drags the shared model down to <b>40%</b>, worse than every exchange alone.");
  await spot("#results > div:first-child", 4);
  await sleep(4000);
  await spot(null);
  await cap(null);

  // Real network: one process per exchange, coordinator commits to BNB Chain.
  mark("terminal", 1);
  await page.goto(`file://${path.join(DIR, "terminal.html")}`);
  await kit();
  await keepAlive();
  await page.mouse.move(1300, 760, { steps: 1 });
  await cap("REAL NETWORK", "In production each exchange runs <b>its own Tessera node</b>. The coordinator trains over the network and commits the run to <b>BNB Chain</b>.");
  await page.evaluate(() => window.play(1.25));
  mark("terminal-fast", 1.5);
  await sleep(9000);
  mark("terminal-end", 1);
  await sleep(2200);

  mark("ledger", 1);
  await page.goto(APP, { waitUntil: "networkidle" });
  await kit();
  await keepAlive();
  await page.mouse.move(900, 300, { steps: 1 });
  await click("nav button:has-text('Ledger')", "Ledger tab", 1800);
  await cap("ONCHAIN", "The ledger stores every run's config, a fingerprint of the model after every round, and every payout.");
  await page.waitForSelector("text=Run #0", { timeout: 30000 });
  const run0 = page.locator("div", { has: page.locator("text=Run #0") }).filter({ has: page.locator("button:has-text('Replay & verify')") }).last();
  const verify = run0.locator("button:has-text('Replay & verify')").first();
  await verify.scrollIntoViewIfNeeded();
  await page.evaluate(() => window.scrollBy({ top: 160, behavior: "smooth" }));
  await sleep(2600);
  await click(verify, "Replay & verify", 300);
  await cap("VERIFY", "Anyone can <b>replay the training in their own browser</b>. Every model hash and every payout must match the chain exactly.");
  mark("replay-fast", 2.4);
  await page.waitForFunction(() => document.body.innerText.includes("Verified: all"), null, { timeout: 90000 });
  mark("verified", 1);
  await cap("VERIFIED", "<b>10 of 10 rounds reproduced bit-for-bit.</b> Payouts are auditable, not trusted.");
  await page.evaluate(() => {
    const v = [...document.querySelectorAll("p, div")].reverse().find((e) => e.textContent?.startsWith("Verified: all"));
    v?.parentElement?.setAttribute("data-demo", "verified");
  });
  await spot('[data-demo="verified"]', 8);
  await sleep(4200);
  await spot(null);
  await cap(null);
  await sleep(600);

  mark("outro", 1);
  await card(`${LOGO}<h2>Exchanges pool what they <span class="accent">learn</span>, not what they hold.</h2>
    <div class="row">
      <div class="tile"><b>Stake to join</b><span>Members bond collateral. A rejected update gets slashed.</span></div>
      <div class="tile"><b>Pay-per-query API</b><span>Anyone pays to score a wallet. Revenue streams to members by Shapley share.</span></div>
      <div class="tile"><b>Secure aggregation</b><span>Masked updates, so even the coordinator never sees one alone.</span></div>
    </div>
    <div class="url">masterbrainy.github.io/Tessera</div>`);
  await sleep(6500);
  mark("end", 1);
}

async function rehearse() {
  await page.goto(APP, { waitUntil: "networkidle" });
  for (const [label, sel] of [
    ["run button", "button.continue-btn"],
    ["garden", ".garden-panel"],
    ["Lumen flower", 'g[aria-label="About Lumen"]'],
    ["plain fedavg", "button:has-text('Plain FedAvg')"],
    ["ledger tab", "nav button:has-text('Ledger')"],
    ["attacker combobox", ".activity-column [role=combobox]"],
  ]) {
    const ok = await page.locator(sel).first().isVisible().catch(() => false);
    console.log(`${ok ? "OK  " : "FAIL"} ${label} (${sel})`);
  }
}

const browser = await chromium.launch({ headless: true, channel: "chrome" });
const context = await browser.newContext({ viewport: VIEW, deviceScaleFactor: 1.25 });
page = await context.newPage();
page.on("pageerror", (e) => console.error("pageerror:", e.message));
if (REHEARSE) {
  await rehearse();
} else {
  const cdp = await context.newCDPSession(page);
  const frames = await startCapture(cdp);
  try {
    await story();
  } catch (err) {
    console.error("DEMO ERROR:", err.message);
    mark("end", 1);
  } finally {
    await cdp.send("Page.stopScreencast").catch(() => {});
    await sleep(300);
    fs.writeFileSync(path.join(OUT, "timeline.json"), JSON.stringify({ frames, marks }, null, 0));
    console.log(`captured ${frames.length} frames`);
  }
}
await browser.close();
