# 🎮 Bedwars Championship Overlay

A complete, professional live-streaming overlay system for Minecraft Ranked Bedwars Championship events. No server required — runs entirely on GitHub Pages or any static web host.

---

## 🚀 Quick Start

1. Deploy all files to GitHub Pages (Settings → Pages → main branch)
2. Open **`admin/index.html`** on your control device (phone, tablet, or second monitor)
3. In OBS: **Add Source → Browser** → paste the Overlay URL → set **Width: 1920, Height: 1080**
4. Set your event name and teams, then switch to **Starting Soon** screen
5. When ready, click **GAME** to go live!

---

## 📁 File Structure

```
bedwars-overlay/
├── index.html              ← Landing page with links
├── overlay/index.html      ← OBS Browser Source (1920×1080)
├── admin/index.html        ← Admin control panel
├── shared/state.js         ← State sync engine
├── maps/README.md          ← Maps folder instructions
└── README.md               ← This file
```

---

## 🖥️ Overlay Screens

Switch between screens from the **Dashboard → Overlay Screen** section:

| Screen | Description |
|--------|-------------|
| ⏳ **Starting Soon** | Pre-stream screen with logo, event name, team list, and countdown timer |
| 🎮 **Game** | Main gameplay overlay with timer, team cards, scoreboard |
| 📊 **Summary** | Full-screen match summary cycling through each team's stats |
| 🗺️ **Map Select** | Animated map selection screen with slot machine reveal |
| ☕ **BRB** | Be Right Back screen with logo animation |

---

## 🎛️ Admin Panel Sections

### Dashboard
- Switch overlay screens instantly
- Start/pause the game timer
- Jump to Next Game (resets timer)
- Set game number, stage (QF/SF/Finals), and map name
- Select and trigger map reveal animation
- Copy the OBS browser source URL

### Teams
- Choose **4-team** (Red/Blue/Green/Yellow) or **8-team** mode
- Enter up to 4 player IGNs per team — avatars auto-load from mc-heads.net
- Toggle team **Eliminated** status
- Toggle team **Bed** status (🛏 / 💔)
- Mark players as **finally dead** (💀) — only enabled when their team's bed is gone. Dead players show greyscale on the overlay.

### Scores
- Manually adjust scores with + / − buttons
- **Apply Point Rules** button auto-computes scores from player stats

### Timer
- Countdown timer through all Bedwars phases:
  - Diamond II → Emerald II → Diamond III → Emerald III → Bed Destruction → Sudden Death → Game Over
- Each phase is **6 minutes** (Sudden Death and Game Over are **10 minutes** each)
- Shows **PREGAME** until first started

### Stats & Points
- **Player Statistics**: Edit kills, deaths, final kills, bed breaks per player (pulled from your team rosters automatically)
- **CSV Import**: Drag & drop a CSV file with format: `IGN, TEAMCOLOUR, POINTS, KILLS, DEATHS, FINALS, KDR, BEDBREAKS`
- **Point Rules**: Set how many points each stat is worth (e.g. 1 Kill = 1pt, 1 Final Kill = 2pts, 1 Bed Break = 3pts)
- **Preview**: See computed team scores before applying
- **Apply Now**: Writes computed scores to the Scores panel and updates individual player point totals

### Info Cards
- Add custom info cards that cycle in the **top-left panel** on the overlay
- Each card has a title, body text, and optional image URL
- Reorder by dragging ↑ ↓ buttons
- Set the cycle interval in seconds

### Stream Screens

**Starting Soon:**
- Event name (e.g. "All Stars S9 — Day 1") with animated text
- Subtitle text (e.g. "Starting Soon")
- Logo image URL (PNG recommended)
- Logo animation: Pulse / Float / Bounce / Spin / Glitch / Reveal
- Title text animation: Shimmer / Glitch / Fade / Typewriter
- **Starting Timer**: Counts up to show how long you've been live — start/pause/reset independently

**Be Right Back:**
- Custom subtitle, logo, and animations (same options as Starting Soon)

### Live Chat
- Paste a **Twitch** or **YouTube** stream URL
- Toggle chat panel visibility
- Position and size via the Layout Editor
- Note: Twitch embeds require HTTPS

### Layout Editor
- Visual 16:9 preview of your overlay
- **Drag** any panel to reposition it
- **Yellow ↕ handle** (top-right of each panel): drag up/down to **scale**
- **Blue corner handle** (bottom-right): drag to **resize** the actual box
- **Snap grid**: elements snap to edges, center lines (25%/50%/75%), and edges of other elements
- **Reset** buttons restore each panel to its default position
- Four panels: Main Panel (timer+teams), Scoreboard, Info Panel, Chat

### Theme & Config
- **Accent presets**: Blue, Red, Green, Gold, Purple, Off
- **Custom colour**: Pick any hex colour — the second accent and all gradient backgrounds are auto-derived from your pick
- **Map Pool**: Add/remove/reorder maps with names and image URLs
- **Phase Icons**: Custom image URLs for Diamond, Emerald, Bed, and Bed Gone icons (leave blank for default emoji)

---

## 🗺️ Map Selection

Maps are configured in **Theme & Config → Map Pool**.

**To reveal a map:**
1. Add maps in Config (name + image URL)
2. In Dashboard → Match Info: select your map and choose reveal animation
3. Click **🎲 Play Reveal** → switches to Map Select screen and plays the animation

**Reveal animations:**
- **Slot Machine** — vertical scroll through random maps, lands on selected
- **Roulette** — horizontal scroll (like a roulette wheel)
- **Fade** — crossfades between random maps, settles on selected
- **Page Flip** — flips pages like a book
- **Glitch** — chaotic glitching effect before reveal

**Map images** can be hosted anywhere (Imgur, GitHub, your own server). Put them in the `/maps/` folder if hosting on GitHub Pages and reference them as `maps/mapname.png`.

---

## 📊 Summary Screen

Cycles automatically through:
1. **Each team's slide** — shows all 4 players with their stats (Points, Kills, Deaths, Final Kills, Bed Breaks). Dead players shown in greyscale.
2. **Top Players** — podium of the top 3 players by points with full-body 3D skin renders.

Data comes from the Stats & Points section. Apply Point Rules first to populate individual points.

---

## 🔄 Real-time Sync

Uses `BroadcastChannel` API + `localStorage` for instant sync between the admin and overlay — **no server needed**.

- Both pages must share the **same origin** (URL) for sync to work
- Works on **GitHub Pages**, local file server, or any static host
- All settings are **automatically saved** to browser localStorage and restored on reload

---

## 💬 Chat Integration

Supports **Twitch** and **YouTube** live chat embeds:
- Twitch: `https://www.twitch.tv/yourchannel`
- YouTube: `https://www.youtube.com/watch?v=VIDEO_ID`

The chat panel appears as a movable, resizable widget on the overlay.

> **Note:** Twitch requires the page to be served over HTTPS. For local testing, YouTube works without HTTPS.

---

## 🎨 Theming

The overlay uses a dynamic CSS variable theming system. When you change the accent colour in the admin:
- All glows, borders, and highlights update
- Gradient backgrounds on fullscreen screens (Summary, Map, Starting, BRB) are automatically derived from your accent colour
- A complementary second accent colour is auto-generated

---

## 📋 CSV Format

```
IGN,TEAMCOLOUR,POINTS,KILLS,DEATHS,FINALS,KDR,BEDBREAKS
Player1,Red,24,8,2,3,4.0,2
Player2,Blue,18,6,3,2,2.0,1
```

- First row is the header (skipped)
- Team colours must match exactly: `Red`, `Blue`, `Green`, `Yellow`, `Aqua`, `White`, `Pink`, `Gray`
- All parsing happens locally — no data leaves your browser

---

## 🧩 OBS Setup

1. Open OBS → click **+** under Sources → **Browser**
2. URL: paste from Dashboard → OBS URL (copy button)
3. Width: **1920**, Height: **1080**
4. ✅ **Shutdown source when not visible**: OFF
5. ✅ **Refresh browser when scene becomes active**: ON (recommended)
6. Background colour: **#00000000** (transparent)

---

## ⌨️ Tips

- **Test everything** with the overlay open in a separate browser tab before going live
- **Starting Soon** is the default screen when first opening the overlay — switch to Game when ready
- The **dead player** (💀) feature only activates when a team's bed is gone, preventing accidental clicks
- **Point Rules** → Apply updates both team scores AND individual player points shown under their head
- The **Layout Editor** preview is 1:1 in proportions — what you see is what you get on stream
