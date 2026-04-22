@AGENTS.md

# Spa Orders - Internal Ordering System

## Overview
Internal web app for Hibernation Stoves & Spas (Angels Camp, CA) to order spas from two manufacturers: **Marquis** (dealer #101099) and **Sundance** (dealer #1805). Replaces paper PDF order forms with a modern web form that calculates pricing, generates downloadable PDFs, and emails orders.

## Tech Stack
- **Next.js 16.2.2** (App Router) with TypeScript
- **Tailwind CSS v4** with dark theme (slate-900 bg, slate-800 cards, brand blue #1565A6)
- **jsPDF + jspdf-autotable** for server-side PDF generation
- **Nodemailer** (Gmail SMTP) for email sending
- **Cookie-based auth** via middleware (NOT NextAuth)
- **No database** - all manufacturer/model data as TypeScript constants
- Deploy target: Vercel at orders.hibernation.com

## Project Structure
```
spa-orders/
  src/
    app/
      page.tsx              # Main order form (single page, all logic)
      login/page.tsx        # Login page
      layout.tsx            # Root layout with dark theme
      globals.css           # CSS variables and Tailwind config
      api/
        auth/route.ts       # POST login, DELETE logout
        generate-pdf/route.ts  # PDF download endpoint
        send-order/route.ts    # Email order via Gmail SMTP
    types/
      manufacturer.ts       # Core types: SpaModel, Series, OptionDef, CoverDef, etc.
      order.ts              # OrderLineItem, Order interfaces
    data/
      index.ts              # Exports all series, getSeriesForManufacturer(), findSeries()
      dealer.ts             # Default dealer info for both manufacturers, freight defaults
      marquis/
        shared.ts           # Shell colors (6), covers (vinyl + WeatherShield)
        celebrity.ts        # 6 models, Ash/Pecan cabinets
        elite.ts            # 6 models, Granite/Hickory/Harbor cabinets
        vector21.ts         # 6 models, Barnwood/Chestnut cabinets
        crown.ts            # 7 models, Granite/Timber cabinets (all 240V)
      sundance/
        shared.ts           # Shell colors with upcharges, covers for 780/880 and 980
        series980.ts        # 2 models, Coastal/Mahogany cabinets
        series880.ts        # 7 models, Windy Oak/Ironwood/Flint Gray cabinets
        series780.ts        # 5 models, Modern Hardwood/Brushed Gray/Vintage Oak cabinets
        series680.ts        # 5 models, Slate/Graphite cabinets
    lib/
      pricing.ts            # Price calculation, option availability, formatting
      pdf.ts                # PDF generation with jsPDF
  middleware.ts             # Cookie-based auth middleware (also proxy.ts at root)
```

## Key Architecture Decisions

### Data Model
All spa data is declarative TypeScript constants. The `OptionDef` type drives conditional logic:
- `availableOn?: string[]` - only show for these model IDs
- `unavailableOn?: string[]` - hide for these model IDs
- `requires?: string` - requires another option to be selected first
- `excludes?: string[]` - mutually exclusive with these options
- `includedByDefault?: boolean` - pre-checked and $0 (e.g., SmartTub on Sundance 780+, DuraBase on Crown)

### Covers
- `isDefault?: boolean` on CoverDef - but cover is NOT auto-selected in the UI (user must explicitly choose)
- Marquis: Black Vinyl ($0) or WeatherShield Upgrade ($100)
- Sundance 680/780/880: SUNSTRONG ($0) or Extreme ($98)
- Sundance 980: SUNSTRONG ($0) or Extreme ($0, free upgrade)

### Voltage Tags
Models with `voltage: 'both'` show a yellow "120V/240V" tag. These default to 120V but can be upgraded to 240V:
- Celebrity: Broadway, Monaco, Nashville
- Elite: Monaco Elite, Nashville Elite
- Vector21: V65L
- Sundance 780: Dover
- Sundance 680: Prado, Alicia
- Crown: ALL are 240V standard (no tag, no upgrade option)

### Lounge Tags
Models with `hasLounge: true` show "(Lounge)" tag. Can also be `'double'` for double-lounge models.

### Pricing
- One spa per order/PO
- Always EFT/prepay payment
- Marquis gets 2% EFT discount on spa cost (before freight)
- Sundance has no discount
- Default freight: $300 Marquis, $550 Sundance (editable)
- Sundance shell colors may have upcharges

### UI Layout
Single-page form with two-column layout:
- **Left column**: Model selection + Spa Options (with "No Additional Options" button)
- **Right column**: Shell Color + Cabinet Color + Cover + Steps & Benches (with "No Steps" button)
- All sections require explicit selection before PDF can be generated
- Selected items get amber/yellow border + yellow price text
- Unselected items show prices in brand-light blue

### PDF & Email
- PDF: PO # appears both in header (top-right) and as first row of dealer info table
- Both PDF and email include: "Please send order confirmations to: info@hibernation.com and jeremy@hibernation.com"
- Email sends via Gmail SMTP (nodemailer) with PDF attachment
- PO# format: MMDDYYLASTNAME (auto-generated from order date + last name)

## Auth
- Simple cookie-based auth, NOT NextAuth
- Credentials in `.env.local`: AUTH_USERNAME=jeremy, AUTH_PASSWORD=hibernation2026
- Cookie: `spa-orders-auth=authenticated`, httpOnly, 7-day expiry
- Middleware redirects unauthenticated users to /login

## Environment Variables
```
AUTH_USERNAME=jeremy
AUTH_PASSWORD=hibernation2026
GMAIL_USER=<gmail address>
GMAIL_APP_PASSWORD=<gmail app password>
```

## Common Tasks

### Adding a new spa model
1. Edit the appropriate series file in `src/data/marquis/` or `src/data/sundance/`
2. Add to the `models` array with: id, name, dealerCost, msrp, voltage (if 120V capable), hasLounge (if applicable)

### Adding a new option
Add to the `options` array in the series file with appropriate conditional fields (availableOn, requires, excludes, etc.)

### Adding a new series
1. Create a new file in `src/data/marquis/` or `src/data/sundance/`
2. Export the series constant
3. Import and add to the array in `src/data/index.ts`

### Importing the Travis Industries catalog
Re-run after the 2026 dealer-cost PDF is updated in `docs/`:
```bash
npm run import:travis
```
Outputs: `src/data/travis/stoves.ts` (anchor products) and `src/data/travis/parts.ts`
(log sets, conversion kits, accessories). Uses Tier 4 pricing (50% column for
anchors, Cost column for sub-items). Classification overrides live in
`scripts/import-travis-overrides.json`.

## Known Issues / Notes
- Dropbox syncing can cause EPERM errors on `.next/` folder. Fix: stop server, delete `.next`, restart.
- The `proxy.ts` at project root is the Next.js 16 convention (renamed from middleware.ts). There's also a `src/middleware.ts` that works with the current setup.
- Sundance models have msrp: 0 (not tracked). Marquis MSRP is in the data but NOT shown in the UI (dealer-only pricing).
