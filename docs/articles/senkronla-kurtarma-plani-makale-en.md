# Keeping data on the user's device while still solving cross-device sync: why I built Senkronla

![Senkronla: sync across devices without compromising privacy](./assets/00-kapak-en.svg)

It started with one small, stubborn rule: the user's debts, accounts, and income/expense history stay on their device. I was building a personal finance app and I wasn't about to bend on that. I had no plan to dump everything on a server and leave it sitting there in plain text.

But I'll be honest: I still want what everyone wants. Something I log on my phone in the morning should be there on my desktop that evening. And that's the old dilemma in a nutshell: trade privacy for sync, or give up sync altogether. Call me the user who wants both. I won't fight you on it.

Peel back most "cloud sync" and what do you get? Readable data on the server. Account balances, loan payments, sometimes an API key tucked away in a corner. If the layer in the middle (call it a relay) can read what's inside, the security and privacy of that data are your problem now.

![Classic cloud sync vs. the sealed-envelope approach](./assets/04-karsilastirma-en.svg)

I wanted the flip side. The app owns its data. The middle layer just carries a sealed envelope and never opens it. That stubborn idea became **Senkronla**.

## What is Senkronla, exactly?

The short version: an open-source sync transport layer you can self-host. The slightly dressier version: an **Envelope Sync Relay**. Yeah, the name sounds a bit formal. The idea itself is as plain as a letter in an envelope.

Here's how it works. Your app takes a snapshot, encrypts it on the device, and wraps it in a sealed envelope using the `ESR-DOC1` format. Senkronla picks up that envelope, stores it, tracks the revision, handles device pairing and per-user device quotas, and pings other devices when something new lands ("hey, fresh content"). It never looks inside. Not once. Not under any circumstances.

![Envelope model: device encrypts, relay carries but cannot see inside, other device decrypts](./assets/01-zarf-modeli-en.svg)

The textbooks call this zero-knowledge. I call it deliberate ignorance, because I like the ring of it: the less the layer knows, the less it can spill on a bad day.

One thing people get wrong a lot: Senkronla is not a notes-app backend or a drop-in finance API. Business logic, data model, encryption, all of it lives in your app. Senkronla is only trying to be the thin, quiet courier. Modest on purpose.

Handy links:

- Site and docs: [senkron.la](https://senkron.la)
- Source: [github.com/kemalersin/senkronla](https://github.com/kemalersin/senkronla)
- Client SDK: [`@senkronla/client`](https://www.npmjs.com/package/@senkronla/client) (comes with `EsrSync`, a facade that handles offline queuing and conflict callbacks)

You can spin up your own relay with Docker Compose or Node.js 22+. Traffic goes over REST `/v1`, with optional WebSocket on top. The WebSocket piece is push-to-pull: the server taps you on the shoulder ("something changed"), and you still fetch the payload over HTTP. You get that live feel without the traffic going haywire.

## What do I mean by "envelope"?

In classic sync, the server likes to play savior: "I hold the truth, leave the rest to me." The Envelope Sync Relay model turns that around. Roughly:

![Sync flow: ask for revision first, then pull the envelope; on conflict, leave the decision to the user](./assets/02-push-pull-en.svg)

1. The client hits `GET head/meta` first: "What's the latest revision out there?"
2. If it changed, `GET head` pulls the envelope down and the client opens it with its own password. The server never had the password, so only the user can unlock it.
3. Local changes go up via `PUT`. The `expectedRevision` field does optimistic concurrency: "I last saw revision X, is that still current?"
4. If another device got in first, you get `409 Conflict`. Crucially, the server does not merge on its own. It hands the call to your app's UI, which means the user in practice.

That last bit was never up for debate. When you're moving sensitive finance data around, almost nothing is scarier than "the server auto-merged and quietly clobbered something." With Senkronla, merging is your call. The server just flags the collision. You can scale the relay without sweating it, because there's no business logic or decryption running there. That weight stays in the app, where it belongs.

The operator side is covered too. Multiple documents per namespace (say `primary` and `settings` separately), device pairing and recovery-phrase flows, slot licensing to cap devices, app registry to lock down which origins can connect. It's all in the docs and the operator portal.

## From theory to practice: Recovery Plan

Here's a confession: I only trust something once I've lived with it and felt it bite. So the first place I plugged in Senkronla was my own project. Dogfooding, if you like: **Recovery Plan** (Kurtarma Planı).

- Repo: [github.com/kemalersin/kurtarma-plani](https://github.com/kemalersin/kurtarma-plani)
- Live demo: [kurtar.co](https://kurtar.co/)

Recovery Plan is local-first all the way. Vue 3, IndexedDB in the browser (via Dexie), production build as a single HTML file. You can download it and open it with `file://` if you want. No secret server humming behind the curtain, no surprise bill. Debt tracking, cash flow, dashboards, analytics, all inside the browser.

![Recovery Plan sync architecture: browser SPA, EsrSync, and relay](./assets/03-kurtarma-plani-en.svg)

Users get two sync paths:

1. **File-based auto sync.** Uses the browser's File System Access API, with a graceful fallback to manual mode where that's missing. The old faithful of local-first.
2. **Senkronla.** This is where `@senkronla/client` and `EsrSync` come in. In production the app talks to `https://sync.senkron.la/v1`.

Pick "Senkron.la" in settings and the app connects as registered web app `esr_app_kurtar_co`. In the operator console, `kurtar.co` and `www.kurtar.co` are verified origins, so random sites don't stroll through the front door.

A few details that still make me grin:

**Pairing is easy.** The main device spits out a 6-digit code and a QR. The second device joins the same namespace through a "join" flow. Scan the code on your phone, link the desktop, done before your coffee cools.

**Live notification is actually live.** Once the UI says "Relay connected, live notification active," push-to-pull kicks in and a change on one screen shows up on the other almost right away. I won't pretend I wasn't a little thrilled the first time I lined up two displays and watched it happen.

**Slot quota is visible.** Users see something like "2/3 devices" plain as day. The free tier is enforced on the relay; the app doesn't need its own bookkeeping.

**Envelope password is optional, and blunt about it.** You set the sync password in the app, separate from the recovery phrase. Lose the password and the remote ciphertext stays locked. That's not a fun sentence, but it's the cost of meaning it when you say "nobody can read your data." A magic undo button would break that promise.

Bottom line: Recovery Plan got phone-to-desktop sync without a single line of finance API. The relay carried boxes; it never peeked. That convinced me a dedicated sync layer for local-first apps is worth having. Not every project needs to reinvent REST, conflict handling, and device pairing from zero. We've built that wheel plenty.

Screenshots live in the Senkronla repo under [docs/screenshots/](../screenshots/), `kurtar_co_00.png` through `kurtar_co_03.png`.

## Who is this for?

Straight talk: Senkronla isn't for everything. Don't swing a hammer at every problem. But if you see yourself in any of these, it's worth a look:

![Four profiles Senkronla fits: offline app, sensitive data, self-hosted relay, indie and open source](./assets/05-kimler-icin-en.svg)

- You ship web or mobile apps that need to work offline.
- You handle sensitive stuff (notes, budgets, health, productivity) and storing it in the clear on a server feels wrong.
- You want a relay on your own metal, or a single-tenant setup.
- You're an indie dev or open-source maintainer thinking "I don't have a real backend, but I need sync across devices."

MIT licensed. Spec, OpenAPI, operator portal, integration guides, all at [senkron.la/guides](https://senkron.la/guides).

## Wrapping up

I wrote this to poke a hole in one myth: that user-side data and cross-device sync can't coexist. Slip a thin, sealed, know-nothing layer between them and privacy breathes easier while your ops load gets lighter. Both at once is more doable than people assume.

![Privacy and sync intersect at Senkronla: you can have both](./assets/06-toparlarsak-en.svg)

That's why I'm putting Senkronla out there. The Recovery Plan story is my answer to "fine, but what does it feel like in a real app?"

Want to kick the tires?

- Senkronla: [senkron.la](https://senkron.la) and [GitHub](https://github.com/kemalersin/senkronla)
- Recovery Plan: [kurtar.co](https://kurtar.co) and [GitHub](https://github.com/kemalersin/kurtarma-plani)

Issues, ideas, "maybe do it this way instead" notes, all welcome in either repo. The back-and-forth is half the fun of open source. The code will change tomorrow anyway.

---

![This article was produced with Claude Opus 4.8 based on the project's existing documentation](./assets/07-ai-notu-en.svg)
