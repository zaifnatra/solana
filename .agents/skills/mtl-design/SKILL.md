---
name: mtl-design
description: Design system for the MTL Minted in-app UI (Discover, Profile, Friends, Wallet pages in web/, and the staging dashboard). Use when building or changing any screen, component, or style in web/ or staging/ so it matches the existing dark, glass, glow look.
---

# MTL Minted in-app design

The app is a dark, cinematic, mobile-first social feed for artist tokens.
Content floats on full-screen media in translucent "glass" cards. Accents are a soft indigo glow and a green "buy" action.

The source of truth is the code. Read these before you change a pattern:
- `web/src/index.css`: global tokens, buttons, links
- `web/src/components/ArtistCard.{jsx,css}`: the main card and trade controls
- `web/src/components/Header.{jsx,css}`, `Navbar.{jsx,css}`, `WalletOverrides.css`
- `web/src/components/BackgroundVideo.{jsx,css}`, `web/src/pages/MyTokensPage.css`

## Tokens

Use these exact values. Do not add new colors, radii, or fonts.

| Token | Value | Use |
|---|---|---|
| Page background | `#000` (root `#0f0f0f`) | Behind all media |
| Text | `#fff` headings, `rgba(255,255,255,0.92)` body, `#ddd`/`#eee` card body | |
| Muted text | `#aaa`, `#888`; nav inactive `#666` | Labels, handles, hints |
| Accent | `#646cff` | Focus, hover borders, links |
| Accent glow | `rgba(100,108,255,0.2)` fill, `0 0 15px rgba(100,108,255,0.3)` shadow | Hover, focus ring `0 0 0 4px rgba(100,108,255,0.2)` |
| Badge | bg `rgba(100,108,255,0.2)`, text `#aab0ff`, radius 8px, `4px 8px` | Genre tags |
| Buy / positive | `linear-gradient(45deg, #4CAF50, #45a049)`; text `#4CAF50` or `#4cd964` | Buy button, balances, success |
| Error | `#ff6b6b` | Error messages |
| Glass card | bg `rgba(30,30,30,0.6)`, border `1px solid rgba(255,255,255,0.1)`, `backdrop-filter: blur(10px)` | All content panels |
| Glass control | bg `rgba(255,255,255,0.1)`, border `rgba(255,255,255,0.2)` | Secondary buttons, pills |
| Dark input | bg `rgba(0,0,0,0.3–0.4)`, border `#444` or `rgba(255,255,255,0.2)` | Inputs |
| Solid surface | `#111` / `#1a1a1a`, border `#333`, hover `#222` | Dropdowns, menus |
| Font | `'Inter', system-ui, …`, antialiased | Everything |
| Weights | 800 page titles, 700 card titles and buttons, 600 controls, 500 nav and pills | |

Radii: 16px cards, 12px inputs and dropdowns, 8px small controls and badges, 20px pills and the wallet button, 50% avatars.

Motion: `0.2s` for color and background, `0.3s ease` for transform and shadow. Only small lifts (`translateY(-2px)` to `-5px`) and fades (`fadeIn`: opacity + `translateY(-10px)`). No bounces, spins, or long animations.

## Layout

- Each page is: fixed background layer (`z-index: 0`) → content wrapper (`position: relative; z-index: 1`) → sticky `Header` → content → fixed `Navbar`.
- Every page renders `<Header title="…" />` and `<Navbar />` itself.
- Leave `paddingBottom: 80–100px` so the 60px bottom navbar does not cover content.
- Lists are a centered column with `max-width: 600px`. Grids use `repeat(auto-fit, minmax(350px, 1fr))`, `gap: 20px`, `max-width: 1200px`.
- Page padding is `20px`.

## Backgrounds

Each page has a full-screen background. Choose one of the existing types:
1. **Video**: `<BackgroundVideo />` (`/images/background.mp4`, opacity 0.9, 15% black vignette on every edge). Used by Discover and Profile.
2. **Grid**: `.square-pattern-bg`, black with 1px `rgba(255,255,255,0.4)` lines every 50px and a radial vignette `transparent 40% → #000`. Used by Wallet.
3. **Photo**: `position: fixed` cover image plus a `rgba(0,0,0,0.6)` overlay. Used by Friends (`/images/friends_bg.png`).

Text on media needs `text-shadow: 0 2px 10px rgba(0,0,0,0.5)` or a dark overlay.

## Components

- **Glass card (ArtistCard)**: horizontal, 220px high. Image is 35% wide on the left, with `linear-gradient(135deg,#1a1a1a,#333)` and a 🎵 fallback. Content is on the right with `1.5rem` padding. Base shadow is `0 10px 30px -10px rgba(0,0,0,0.8), 0 0 20px rgba(255,255,255,0.05)`. On hover it lifts 5px, the white glow grows to 0.2, the border to 0.3, and an ambient `0 0 60px rgba(100,200,255,0.1)` light fades in behind it.
- **Trade row**: an 80×36 stepper (custom ▲/▼ column, native spinners hidden), then a green **Buy** and a glass **Sell**, both `flex: 1`, height 36px. Show the result message under the row in green or red.
- **Header**: title on the left (1.5rem/800). On the right: `WalletMultiButton` (pill, styled by `WalletOverrides.css`) and a round profile icon button with a `#111` dropdown.
- **Bottom navbar**: solid `#000`, 60px, top border `rgba(255,255,255,0.2)`, upward shadow. Four items, each a 24px stroke icon above a 0.75rem label. Inactive `#666`, active `#fff`, hover bg `#111`. Respect `safe-area-inset-bottom`.
- **Search input**: full width, left icon at 12px, `padding-left: 40px`, radius 12px. On focus the bg becomes `rgba(0,0,0,0.8)`, the border becomes the accent, and the 4px accent ring appears.
- **Empty or coming-soon state**: centered emoji (3rem, 0.8 opacity), h2, muted line, and a glass pill (`rgba(255,255,255,0.15)`, `blur(10px)`, radius 20px).
- **Primary call to action (special)**: the gold gradient pill `linear-gradient(45deg,#FFD700,#FFA500)` with black text. Use it only for the main artist action ("Launch Artist Token"). Use at most one per screen.

## Icons and imagery

- Inline SVG, 24px, `stroke="currentColor"`, `strokeWidth="2"`, round caps and joins, no fill. Do not add an icon library.
- Artist images are square-ish photos in `web/public/images/`. Use `background-size: cover`.

## Rules

- Dark only. Do not make a light theme.
- Every panel is glass on top of media. Do not use flat opaque cards, except for menus.
- Use the accent glow for interaction only. Do not use it as decoration.
- Use green only for buying or positive values. Use red only for errors.
- Reuse the existing CSS classes and components before you add new ones. New styles go in a component `.css` file next to the component. Inline styles are acceptable for one-off layout, as the existing pages do.
- Mobile-first. Check at 375px wide and at desktop width.
- Keep visible focus states (accent ring).

## staging/

The staging dashboard uses the same tokens in `staging/src/index.css`, but it is a dense developer tool. It has the grid background, glass cards, and tables with tabular numbers. It has no video, no navbar, and no wallet button.
