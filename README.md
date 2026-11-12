# Delhivery One · Order Management & Shipping Command Center

A mobile-first, dual-pane Next.js 16 (App Router) shipping & dispatch command center built for **Vercel** and **Supabase PostgreSQL**, integrated with the **Delhivery One API**.

## Key Capabilities

- **Mobile-First + Desktop Dual-Pane UI**: Compact touch-friendly order cards (`44×44px` tap targets) with `vaul` bottom drawer & sticky thumb action bar on mobile; sortable multi-column table, persistent side inspector, and batch toolbar on desktop.
- **Check PIN Serviceability**: Instant Express + COD verification (`/c/api/pin-codes/json/`) with warm-instance caching.
- **Saved Product Presets & 1-Click Shipping**: Save reusable products (name, SKU, size, weight in grams, L×W×H dimensions, price) in Supabase and manifest orders in one click with immediate **Print 4x6** toast actions.
- **Track All & Live Timeline**: Track single shipments, selected batches, or **Track All** shipped orders across Delhivery statuses (`/api/v1/packages/json/`).
- **Download AWB Shipping CSV**: One-click CSV export (`/api/export/awbs`) containing Order #, AWB numbers, statuses, weight/dimensions, Delhivery tracking links, and 4x6 label URLs.
- **4x6 Thermal Shipping Labels**: Fetches official Delhivery labels (`/api/p/packing_slip`), caches cleanly in Supabase Storage (`shipping-labels`), and includes a valid multi-label PDF fallback if packing slip API permissions are restricted.
- **One-Click WhatsApp Customer Updates**: Pre-filled `wa.me` messages with Order #, live status, AWB, COD balance reminder, and clickable Delhivery tracking link (`https://www.delhivery.com/track-v2/package/<AWB>`).
- **NDR Resolution & Push Webhooks**: Trigger Re-attempt, Defer Delivery, Edit Consignee Details, or RTO, plus `/api/webhooks/delhivery` for real-time Delhivery push updates.

## Setup (Supabase + Vercel)

### 1. Apply Database Migration in Supabase

Open your Supabase Dashboard → **SQL Editor**, paste and run:

- [`supabase/migrations/0001_init.sql`](./supabase/migrations/0001_init.sql)

Optional: Create a **private** Storage bucket named `shipping-labels` if you want 4×6 label PDFs cached in Supabase Storage.

### 2. Configure Environment Variables

Copy `.env.example` to `.env.local` (for local dev) and configure the same keys in **Vercel Project Settings → Environment Variables**:

```env
NEXT_PUBLIC_SUPABASE_URL=https://your-project-ref.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=your_supabase_anon_key
SUPABASE_SERVICE_ROLE_KEY=your_supabase_service_role_key
SUPABASE_LABELS_BUCKET=shipping-labels

DELHIVERY_API_TOKEN=your_delhivery_api_token
DELHIVERY_ENV=production
DELHIVERY_PICKUP_LOCATION=your_warehouse_name
DELHIVERY_WEBHOOK_SECRET=
```

### 3. Run Locally & Deploy

```bash
npm install
npm run typecheck
npm run lint
npm run build
npm run dev
```

Deploy directly to Vercel (`vercel --prod` or Git integration). Region is tuned via [`vercel.json`](./vercel.json) (`bom1` Mumbai) for minimal latency to Delhivery APIs and India-hosted Supabase projects.
