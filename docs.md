# xProWeb3 Overview

## MVP Overview (public-facing, paste-ready)

**xPro Web3 (MVP)** = a public Meme Wall at **xProWeb3.com** where anyone can post a meme and instantly turn it into a tradable SPL token on Solana.

- **Post**: Anyone uploads a meme (image + caption).  
- **Mint**: Any visitor can one-click mint the meme’s token for **0.01 SOL** (creates an SPL token with preset supply + metadata).  
- **Seed Liquidity**: Any visitor can one-click add initial liquidity for **0.02 SOL** to create a live market on an AMM (Raydium/Orca).  
- **Out of scope**: Influencer-run meme competitions and bots. Those ship after MVP.

**Result**: a dead-simple **meme → token → market** loop with zero wait, all on one page.

---

## Scope (In / Out)

### In
- Meme Wall (infinite scroll, newest first, basic search/filter)
- Meme → Token pipeline (SPL mint, metadata, default supply template)
- One-click “Mint for 0.01 SOL”
- One-click “Add LP for 0.02 SOL”
- Token page (price/LP status, basic chart via public API, share links)
- Minimal moderation (copyright/NSFW toggle + takedown)
- Wallet connect (Phantom + standard Solana wallets)

### Out (for now)
- Influencer contests, escrow, prize logic
- Advanced bonding curves
- Leaderboards/XP systems
- Fiat on-ramp
- Mobile app

---

## Core User Flows (acceptance criteria)

### 1. Post Meme
- Connect wallet → upload image (≤5MB), caption (≤140 chars).
- On submit: server writes record, image → CDN, returns Meme ID + “Mint” CTA.
- Rate-limit: ≤5 posts/wallet/day; CAPTCHA on first post.

### 2. Mint Token (0.01 SOL)
- Click “Mint for 0.01 SOL” → single on-chain tx: create SPL mint, set supply, assign mint authority to locked program, write metadata.
- **Where minted tokens go**:  
  - The **full supply (1B tokens)** is minted into a **protocol-controlled vault** (not to the user).  
  - This prevents “ghost tokens” or monopoly minters.  
  - The vault later dispenses MEME when liquidity is added.  
  - Optionally: protocol may reward the original minter with a small % of supply (e.g., 1–2%) as an incentive.
- **Success**: token appears on Token Page within <10s; transaction hash shown.

### 3. Add Liquidity (0.02 SOL)
- Click “Add LP for 0.02 SOL” → create pool (if absent) or add to existing pool (Raydium/Orca).
- **Initial seeding**:  
  - User contributes 0.02 SOL.  
  - The protocol pairs it with MEME from the vault (amount determines starting price).  
- **Subsequent liquidity**:  
  - Anyone can add liquidity, but must follow the existing **pool ratio** (AMM rule).  
  - Example: if pool = 10 SOL : 1,000,000 MEME, ratio = 1 SOL : 100,000 MEME. Adding 1 SOL requires 100,000 MEME.  
- **LP tokens**:  
  - Liquidity providers receive LP tokens (receipt of their share).  
  - They can withdraw later to reclaim their portion of SOL + MEME.  
- **Success**: pool address + price shown; LP receipt shown.

### 4. View Token Page
- Shows: image, caption, supply, holders, pool status, price (if LP), recent txs, share links.
- If no LP: “Be first liquidity” CTA.

---

## On-Chain Design (minimal but sane)

- **Chain**: Solana  
- **Token**: SPL (2022), metadata via Metaplex standard  
- **Supply Template**:
  - Total supply: 1,000,000,000 (configurable constant at launch)
  - 0% dev/reserve (keeps MVP neutral)
  - Mint authority: program-owned (non-transferable); no freeze authority
- **Program responsibilities**:
  - Enforce fixed mint fee (0.01 SOL)
  - Route full supply to vault (with optional small cut to minter)
  - Pair vault tokens with SOL during liquidity add
  - Emit events (`Minted`, `LiquiditySeeded`)
  - Allowlist AMMs (start with one)
- **Indexing**: Helius or custom webhooks for fast frontend updates

---

## Economics & Fees

- **User pays**:
  - 0.01 SOL to mint
  - 0.02 SOL to seed LP
- **Protocol fee**: 10–20% routed to treasury  
  Example:  
  - 0.001–0.002 SOL on mint  
  - 0.002–0.004 SOL on LP
- Remainder covers on-chain + pool costs.  
- **Hard truth**: at 0.01/0.02 SOL you will attract spam → enforce fees + limits.

---

## Anti-Abuse & Moderation

- Per-wallet caps (posts/day, mints/day)  
- Global throttle if mempool spikes  
- Hash-based duplicate detection  
- NSFW toggle + report button → takedown queue  
- DMCA email + policy page  
- Known-bad wallet denylist  

---

## UX Requirements

- One-page flow (post, mint, LP, share)  
- Clear SOL price tags on buttons  
- Progress states: Pending → Confirmed → View Tx  
- Empty states: “No LP yet—be first”  
- Error handling: retry + explorer link  

---

## Data & Events

**Backend tables (or Firestore):**
- `memes`: id, creator_wallet, image_url, caption, hash, created_at, status
- `tokens`: meme_id, mint_addr, supply, created_at
- `pools`: mint_addr, amm, pool_addr, created_at, liquidity_sol, liquidity_tokens
- `actions`: wallet, type {post|mint|lp}, tx_sig, amounts, created_at
- `reports`: meme_id, reporter_wallet, reason, created_at, status

**Events**: MemePosted, TokenMinted, LiquiditySeeded, ShareClicked

---

## KPIs

- **Activation**: % memes minted (≥15% week 1)  
- **Liquidity**: % tokens LP’d in 24h (≥25%)  
- **Speed**: p95 confirmation <10s  
- **Spam rate**: <3% flagged posts  
- **Revenue/DAU**: SOL fees per daily active user  
- **Retention**: D2/D7 return rates  
- **Viral loop**: shares per token page  

---

## Risks & Mitigations

- **Spam floods**: caps + fees + CAPTCHA  
- **Copyright/NSFW**: takedown workflow + DMCA  
- **Rug optics**: no team allocation; program-owned mint authority  
- **Regulatory**: entertainment-only, TOS vetted by counsel  

---

## Execution Priorities

1. Smart contract: fixed-fee mint + LP seed, event logs  
2. Frontend: single-page flow with wallet connect  
3. Indexing: token/pool status in seconds  
4. Moderation: report → review queue + takedown  
5. Observability: health checks, error logging, PostHog  

---

## Developer Notes & Defaults

- Start with one AMM (Raydium) → add Orca later  
- Hardcode default supply + AMM configs server-side  
- Signed upload URLs to S3/Cloudflare R2; dedupe with image hash  
- Cache token/pool lookups; fallback to explorer  
- Keep UI text blunt and literal  

---

## Influencer Contests (Self-Serve in MVP)

Though influencer contests are out of scope, the Meme Wall already enables them:

- Influencers tell community to post memes with a hashtag  
- Followers upload memes to Wall  
- Community mints & seeds liquidity → winners emerge naturally  
- Influencer shares token pages of top entries  

**Why it matters**:
- Viral contests with zero extra dev work  
- Real-world data before building contest tools  
- Influencers not bottlenecked  
- Team learns patterns → builds better tools later  

**Conclusion**: MVP = contest framework out of the box.

---
