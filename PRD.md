# Product Requirements Document (PRD): Delhivery One Order & Shipping Dashboard

**Document Version:** 1.0  
**Target Stack:** Next.js (App Router, Server Actions), Tailwind CSS, Shadcn UI / Radix, Lucide React, Supabase (PostgreSQL), Zod  
**External Integration:** Delhivery One / Last-Mile Express REST API  

---

## 1. Executive Summary & Goals

### 1.1 Problem Statement
Warehouse packers, dispatch operators, and operations managers need a fast, focused interface to move orders from `Unfulfilled` to `Delivered` using Delhivery One without navigating bloated enterprise courier portals on small mobile screens or handheld scanners.

### 1.2 Product Vision
A lightweight, **mobile-first** Order Management & Shipping Dashboard that feels native in a warehouse operator's thumb zone on a phone or scanner, while expanding automatically on tablet and desktop (`md:` / `lg:`) into a multi-column command center with bulk manifesting, batch label printing, and side-by-side order inspection.

### 1.3 Success Metrics & Objectives
- **Speed to Dispatch:** Verify serviceability, manifest an order, and open a 4x6 thermal label in under 3 taps on mobile.
- **Mobile Ergonomics:** 100% of primary controls meet the `44x44px` minimum touch target standard; zero horizontal page scrolling on mobile viewports (`>= 360px`).
- **Bulk Efficiency on Desktop:** Manifest and generate combined thermal labels for 25+ orders in a single batch action.
- **Credential Security:** Zero exposure of `DELHIVERY_API_TOKEN` or service-role keys to browser bundles, client network logs, or `NEXT_PUBLIC_*` environment variables.

### 1.4 Scope & Non-Goals
**In Scope:**
- Pincode serviceability check (Express & COD)
- Single and bulk shipment manifestation + AWB generation
- One-tap 4x6 thermal shipping label PDF retrieval
- Real-time shipment tracking & scan timeline
- NDR exception handling (Reattempt, Edit/Defer, Return to Origin / Cancel)
- Responsive Mobile Card/Drawer UI and Desktop Table/Split-View UI

**Out of Scope (Non-Goals):**
- Multi-courier rate shopping or carrier aggregation
- Full inventory / SKU warehouse management (WMS) or pick-list routing
- Customer-facing e-commerce storefront or checkout
- Automated COD remittance reconciliation and invoice billing

---

## 2. User Personas & Core Contexts

| Persona | Primary Device | Environment | Primary Tasks |
| :--- | :--- | :--- | :--- |
| **Warehouse Packer / Scanner Operator** | Smartphone / Rugged Android Scanner (`360px–430px`) | Packing table, warehouse floor (one-handed use) | Filter `Pending AWB`, generate AWB, print 4x6 thermal label, copy AWB, tap-to-call customer |
| **Dispatch / Ops Manager** | Laptop / Desktop (`1024px+`) | Office / Operations desk | Bulk select unfulfilled orders, check serviceability, batch manifest, batch print labels, triage `NDR` exceptions |

---

## 3. Technical Architecture & Stack

### 3.1 Application Stack
- **Framework:** Next.js (App Router) using React Server Components for initial reads and **Server Actions** for all mutations and Delhivery API calls.
- **Label PDF Streaming:** A dedicated server-side Next.js Route Handler (`GET /api/labels?wbns=...`) authenticated via user session to stream `application/pdf` responses cleanly for mobile browser print/download sheets (since Server Actions return serialized payloads rather than raw binary file downloads).
- **UI Layer:** Tailwind CSS, Lucide React icons, Shadcn UI / Radix UI primitives (`Sheet`, `Table`, `Badge`, `Button`, `Checkbox`, `Input`, `Dialog`), and `vaul` (or Shadcn bottom `Sheet`) for mobile bottom-sheet drawers.
- **Database:** Supabase (PostgreSQL) accessed exclusively from server contexts for mutations.
- **Validation:** Zod schemas shared across form validation and Server Actions.

### 3.2 Environment & Security Architecture
All Delhivery credentials must live strictly on the server:
```env
DELHIVERY_API_TOKEN=<server_only_token>
DELHIVERY_BASE_URL=https://staging-express.delhivery.com # or https://track.delhivery.com in prod
DELHIVERY_PICKUP_LOCATION=<registered_warehouse_name>
NEXT_PUBLIC_SUPABASE_URL=<supabase_project_url>
NEXT_PUBLIC_SUPABASE_ANON_KEY=<supabase_anon_key>
SUPABASE_SERVICE_ROLE_KEY=<server_only_service_key> # optional if using authenticated RLS server client
```
- **Authentication Header:** Every Delhivery request injects `Authorization: Token ${process.env.DELHIVERY_API_TOKEN}` inside a server-only `lib/delhivery/client.ts` module guarded with `import "server-only"`.
- **Input Sanitization & Rate Limiting:** All Server Actions validate inputs via Zod before invoking external APIs and apply defensive timeouts (e.g., `10s`) with structured error messages.

---

## 4. Core Delhivery One Workflows (Functional Requirements)

### WF-1: Check Serviceability
Verify whether a destination 6-digit Indian PIN code supports Express (Prepaid) and Cash on Delivery (COD) delivery before manifesting.

- **Endpoint:** `GET /c/api/pin-codes/json/?filter_codes={pincode}`
- **Inputs:** `pincode` (validated 6-digit string)
- **Server Action:** `checkServiceabilityAction(pincode: string)`
- **Delhivery Response Mapping:**
  - Inspect `delivery_codes[0].postal_code`
  - `expressServiceable`: `pre_paid === "Y"`
  - `codServiceable`: `cash === "Y"`
  - `pickupServiceable`: `pickup === "Y"`
  - Empty `delivery_codes` array = Non-serviceable PIN code.
- **UX & Edge Cases:**
  - Triggered inline when viewing/creating an order or automatically as a pre-flight badge before `Generate AWB`.
  - If `payment_method === "COD"` and `codServiceable === false`, block or display a high-visibility warning preventing an avoidable manifest failure.

### WF-2: Create Shipment & Get AWB (Single & Bulk)
Manifest one or multiple `Unfulfilled` orders with consignee details, weight, and box dimensions to obtain AWB tracking numbers.

- **Endpoint:** `POST /api/cmu/create.json`
- **Request Format:** `application/x-www-form-urlencoded` with `format=json&data=<JSON_STRING>`
  - Payload includes `pickup_location: { name: DELHIVERY_PICKUP_LOCATION }` and `shipments: [...]` containing `name`, `add`, `pin`, `city`, `state`, `country: "India"`, `phone`, `order` (`order_number`), `payment_mode` (`COD` or `Prepaid`), `cod_amount` (`total_amount` if COD, else `0`), `weight` (grams), `shipment_length`, `shipment_width`, `shipment_height` (cm).
- **Inputs (Zod Validated):**
  - `orderIds`: 1..N order UUIDs
  - `weightGrams`: positive integer (default configurable, e.g., `500`, editable per order or batch)
  - `dimensionsCm`: `{ length, width, height }` positive numbers (cm)
- **Server Action:** `createShipmentsAction(input)`
- **Database Side Effects:**
  - On success per order: insert/upsert into `shipments` (`order_id`, `awb_number`, `weight_grams`, `latest_tracking_status = 'Manifested'`, `updated_at = now()`) and update `orders.status = 'Manifested'`.
- **Edge Cases:**
  - **Idempotency:** Reject or skip orders that already have a non-cancelled `awb_number` so duplicate manifests are prevented.
  - **Partial Bulk Failures:** Return a per-order result summary (`succeeded: [{orderId, awb}]`, `failed: [{orderId, reason}]`) so valid shipments still persist without rolling back the whole batch.

### WF-3: Download 4x6 Thermal Shipping Label
Provide one-tap fetching of a 4x6 thermal packing slip / shipping label PDF for a single AWB or a bulk batch of AWBs.

- **Endpoint:** `GET /api/p/packing_slip?wbns={comma_separated_awbs}&pdf=true&pdf_size=4R`
- **Inputs:** `wbns: string[]` (1 or more valid AWB numbers)
- **Delivery Mechanism:** Server-side authenticated proxy `GET /api/labels?wbns=AWB1,AWB2` (plus optional Server Action helper to store/refresh `shipments.label_url = "/api/labels?wbns=..."`).
- **Technical Note / Fallback Requirement:** Depending on Delhivery client account configuration, `/api/p/packing_slip` may return either a direct PDF binary (`pdf=true&pdf_size=4R`) or a JSON packing-slip payload (`packages[]` containing barcode/routing metadata). The server route handler must check `Content-Type`:
  - If `application/pdf`: stream directly with `Content-Disposition: inline; filename="labels.pdf"`.
  - If `application/json`: render a compliant 4x6 inch (`288pt x 432pt`) thermal PDF server-side (using `pdf-lib` + Code128 barcode) as a fallback so one-tap printing always yields a printable PDF.
- **UX Requirements:**
  - Opens in a new tab / native mobile print-preview sheet so thermal Bluetooth/USB printers or AirPrint work in one tap.

### WF-4: Live Track
Fetch real-time shipment status and full scan timeline by AWB.

- **Endpoint:** `GET /api/v1/packages/json/?waybill={comma_separated_awbs}`
- **Inputs:** `awbs: string[]`
- **Server Action:** `syncTrackingAction(awbs: string[])`
- **Response Parsing:**
  - Read `ShipmentData[].Shipment`: `AWB`, `Status.Status`, `Status.StatusType`, `Status.Instructions` / `Remarks`, `Status.StatusDateTime` / `Time`, and `Scans[].ScanDetail` (`ScanDateTime`, `Scan`, `ScanType`, `ScannedLocation`, `Instructions`).
- **Status Normalization Mapping:**
  - Delhivery `Manifested` -> App `Manifested`
  - Delhivery `In Transit` / `Pending` / `Dispatched` (Out for Delivery) -> App `In Transit` (preserving `Out for Delivery` tag in `latest_tracking_status` so the `Out for Delivery` quick filter matches accurately)
  - Delhivery `Delivered` -> App `Delivered`
  - Delhivery `StatusType === "NDR"` or `UD` (Undelivered) / `EOD-*` -> App `NDR`
  - Delhivery `RTO` / `Returned` / `DTO` -> App `In Transit` or `NDR` (or dedicated `RTO` badge if extended; see Section 6.2)
- **Database Side Effects:**
  - Update `shipments.latest_tracking_status`, `shipments.updated_at`, cached scan timeline, and parent `orders.status`.

### WF-5: NDR Actions (Delivery Exceptions)
Resolve failed delivery attempts (`NDR` status) directly from the order drawer or side panel.

- **Action A — Trigger Reattempt / Defer / Update Details:**
  - **Endpoint:** `POST /api/p/update`
  - **Payload:**
    - Reattempt: `{ data: [{ waybill, act: "RE-ATTEMPT" }] }`
    - Defer Date: `{ data: [{ waybill, act: "DEFER_DLV", deferred_date: "YYYY-MM-DD" }] }`
    - Edit Consignee Phone/Address: `{ data: [{ waybill, act: "EDIT_DETAILS", phone, add, name }] }`
  - **Behavior:** Asynchronous; Delhivery returns a `UPL` ID (`upl_id`). Store `upl_id` and surface pending confirmation; validate inputs with Zod (10-digit phone if updating phone, future date if deferring).
- **Action B — Mark as Return to Origin (RTO) / Cancel Shipment:**
  - **Endpoint:** `POST /api/p/edit`
  - **Payload:** `{ waybill, cancellation: "true" }`
  - **Allowed Status Guardrail:** Delhivery `/api/p/edit` only accepts cancellation when the shipment status is `Manifested`, `In Transit`, `Pending`, `Open`, or `Scheduled` (converting picked-up shipments into RTO and unpicked shipments into Cancelled). If a shipment is currently `Dispatched` / `Out for Delivery`, disable/warn in the UI that Delhivery rejects cancellation mid-run until the delivery attempt resolves to `Pending`/`NDR` (or link to Delhivery One SmartNDR).

---

## 5. Responsive UI / UX Architecture

### 5.1 Breakpoint Strategy
- **Mobile (`< 768px`, Primary Focus):** Single-column card stream, sticky top filter pills, bottom sheet drawer (`vaul` / Radix Sheet), sticky thumb-zone bottom action bar.
- **Tablet & Desktop (`md: >= 768px`, `lg: >= 1024px`):** Multi-column high-density data table with bulk checkboxes, top contextual batch action toolbar, and a persistent right-hand split pane (`lg:`) or right slide-over sheet (`md:`) for order/tracking inspection.

### 5.2 Shared Top Controls: Floating Quick Filter
- Sticky horizontal pill bar anchored beneath the compact search/header bar (`overflow-x-auto no-scrollbar` on mobile):
  - `All`
  - `Pending AWB` (matches `status = 'Unfulfilled'`)
  - `Out for Delivery` (matches shipments whose `latest_tracking_status` indicates Out for Delivery / Dispatched)
  - `NDR / Failed` (matches `status = 'NDR'`)
- Each pill has a minimum height of `44px`, shows live count badges, and allows quick search by Order Number, Customer Name, Phone, PIN code, or AWB.

### 5.3 Mobile-First Experience (`< 768px`)

#### A. Card-Based Orders List
Replaces wide tables with scannable cards (`p-4`, `gap-3`):
- **Header Row:** Order ID (`#ORD-1042`) + Color-coded Status Badge (`Unfulfilled`, `Manifested`, `In Transit`, `Delivered`, `NDR`) + Optional Selection Checkbox (when multi-select is active).
- **Body Row:** Customer Name, City & 6-digit PIN code (`Bengaluru · 560001`), Payment Pill (`COD ₹1,499` or `Prepaid`).
- **Footer Quick-Action Row (all `>= 44x44px`):**
  - **Call Customer Icon Button:** `<a href="tel:${customer_phone}">` for direct mobile dialer launch.
  - **1-Tap Copy AWB Button:** Copies `awb_number` (if present) with instant `"Copied"` toast & checkmark state; disabled/hidden if `Unfulfilled`.
  - **Status / Serviceability Pill:** Shows latest tracking sub-status or quick `"Generate AWB"` inline trigger for unfulfilled orders.

#### B. Swipe / Bottom-Sheet Order Details Drawer (`vaul` / Shadcn Sheet)
Tapping any card opens a smooth bottom drawer (`max-h-[90dvh]`):
- **Header:** Order # + Status Badge + 1-tap Copy AWB & Copy Tracking Link buttons + Close handle.
- **Consignee & Address Block:** Name, clickable `tel:` phone button, full address, City, PIN code + inline Serviceability Check button/result (`COD OK / Express OK`).
- **Package & Courier Details:** Weight (`g`), dimensions (`L×W×H cm`), payment mode & COD amount.
- **Live Tracking Timeline:** Vertical scan history list (timestamp, scan status, location, remarks) + `"Refresh Track"` button.
- **Contextual Actions:**
  - If `Unfulfilled`: Weight/Dimension quick inputs + `"Generate AWB"`.
  - If `Manifested` / `In Transit`: `"Print 4x6 Label"`, `"Refresh Track"`.
  - If `NDR`: Highlighted exception alert + `"Reattempt Delivery"`, `"Edit Phone/Address"`, `"Mark as RTO"`.

#### C. Sticky Bottom Action Bar (Thumb Zone)
Pinned to the viewport bottom (`fixed bottom-0 inset-x-0 pb-[env(safe-area-inset-bottom)] bg-background/95 backdrop-blur border-t`):
- Houses 3 primary thumb-friendly actions (`min-h-[48px]`):
  1. **Generate AWB** (manifests selected unfulfilled orders or prompts quick-select of pending orders)
  2. **Print Label** (fetches 4x6 PDF for selected/active manifested orders)
  3. **Track** (syncs live tracking for active/selected shipments)
- Shows a compact badge count when orders are checked in multi-select mode (e.g., `Generate AWB (3)`).

### 5.4 Desktop Adaptation (`md:` and `lg:`)

#### A. High-Density Sortable Data Table
Transforms cards into a clean data table (`hidden md:block`):
- **Columns:** `[Checkbox]` | `Order #` | `Customer & Phone` | `Destination (City / PIN)` | `Payment & Total` | `Status` | `AWB` (with 1-tap copy) | `Latest Scan / Updated` | `Quick Actions` (Label, Track, Call/Copy)
- **Sorting:** Sort by Created/Updated timestamp, Order #, Payment Amount, or Status.

#### B. Top Batch Action Toolbar
Fixed or sticky banner appearing above the table whenever `selectedOrderIds.length > 0`:
- Displays selection count + `"Clear"` button
- **Bulk Check Serviceability**
- **Bulk Generate AWB** (opens compact modal to confirm default/per-row weight & dimensions, then shows per-order results)
- **Bulk Print 4x6 Labels** (single combined PDF for all selected manifested orders)
- **Bulk Refresh Tracking**

#### C. Right-Hand Split View / Side Panel Drawer
- On `lg:` screens (`>= 1024px`), selecting an order opens a **380px–440px right-hand detail panel** alongside the table (dual-pane command center), keeping the table visible for rapid warehouse triage.
- On `md:` screens (`768px–1023px`), opens a right-anchored Shadcn `Sheet` overlay.

---

## 6. Database Schema (Supabase / PostgreSQL)

### 6.1 Core Minimal Schema (Required Baseline)
Matches the specified relational model:

```sql
-- Canonical order statuses
create type order_status as enum (
  'Unfulfilled',
  'Manifested',
  'In Transit',
  'Delivered',
  'NDR'
);

create type payment_method_type as enum ('COD', 'Prepaid');

create table public.orders (
  id uuid primary key default gen_random_uuid(),
  order_number text not null unique,
  customer_name text not null,
  customer_phone text not null,
  address text not null,
  pincode varchar(6) not null,
  payment_method payment_method_type not null,
  total_amount numeric(10, 2) not null check (total_amount >= 0),
  status order_status not null default 'Unfulfilled'
);

create table public.shipments (
  id uuid primary key default gen_random_uuid(),
  order_id uuid not null unique references public.orders(id) on delete cascade,
  awb_number text unique,
  label_url text,
  weight_grams integer not null check (weight_grams > 0),
  latest_tracking_status text,
  updated_at timestamptz not null default now()
);
```

### 6.2 Recommended Minimal Schema Extensions (For Full PRD Functionality)
To support every workflow and UI requirement cleanly without extra tables or API roundtrips on every drawer open, the following additive columns are strongly recommended:

| Table | Column | Type | Rationale |
| :--- | :--- | :--- | :--- |
| `orders` | `city` | `text` | Displayed on mobile order cards & required by Delhivery `/api/cmu/create.json` |
| `orders` | `state` | `text` | Required by Delhivery `/api/cmu/create.json` consignee payload |
| `orders` | `created_at` | `timestamptz default now()` | Needed for default chronological sorting in Mobile List & Desktop Table |
| `shipments` | `length_cm` / `width_cm` / `height_cm` | `numeric(6,2)` | Required to store box dimensions specified in Workflow #2 |
| `shipments` | `tracking_scans` | `jsonb default '[]'` | Caches Delhivery `Scans[]` timeline so the Order Detail drawer renders immediately |
| `shipments` | `ndr_upl_id` | `text` | Stores async `UPL` ID returned by `/api/p/update` for NDR status verification |
| `shipments` | `is_rto` | `boolean default false` | Distinguishes RTO-in-progress shipments cleanly while keeping the 5 core `order_status` badges simple |

### 6.3 Indexes & Row Level Security (RLS)
- **Indexes:** `orders(status)`, `orders(pincode)`, `shipments(order_id)`, `shipments(awb_number)`.
- **RLS:** Enable RLS on both `orders` and `shipments`. Only authenticated workspace operators (or server-side authenticated contexts) may read/write order and shipment records; anonymous public access must be denied.

---

## 7. Validation & Mobile Usability Specifications

### 7.1 Zod Validation Schemas (`lib/validations/shipping.ts`)
- **Indian PIN Code:**
  - Trim whitespace; must match `/^[1-9][0-9]{5}$/` (6 digits, cannot start with `0`).
- **10-Digit Phone Number:**
  - Strip spaces, dashes, and leading `+91` or `0`; must match `/^[6-9][0-9]{9}$/` (exactly 10 digits).
- **Package Specs:**
  - `weight_grams`: integer `>= 1` and `<= 50000` (50 kg sanity bound for Express parcel).
  - `length_cm`, `width_cm`, `height_cm`: positive numbers `>= 1` and `<= 200`.
- **NDR Update:**
  - `waybill`: non-empty alphanumeric string.
  - `action`: `'RE-ATTEMPT' | 'DEFER_DLV' | 'EDIT_DETAILS' | 'RTO'`.
  - `deferred_date` (when `DEFER_DLV`): valid ISO date `YYYY-MM-DD` strictly >= tomorrow.

### 7.2 Mobile & Accessibility Edge Cases
- **44x44px Minimum Tap Targets:** Enforce `min-h-11 min-w-11` (`44px x 44px`) on all buttons, filter pills, table checkboxes, copy icons, dial buttons, and bottom bar controls.
- **1-Tap Copy-to-Clipboard:**
  - Copy AWB number (e.g., `84303710000066`) and full Delhivery public tracking link (`https://www.delhivery.com/track/package/<AWB>`).
  - Provide immediate haptic/visual confirmation (icon switches from `Copy` to `Check` for 2s + non-blocking toast).
- **Direct Phone Dialing:**
  - Render `<a href="tel:${normalizedPhone}" aria-label="Call ${customerName}">` with `min-h-11 min-w-11` hit area on mobile cards and detail drawers.
- **Safe Area & Virtual Keyboard Handling:**
  - Use `dvh` heights and `pb-safe` (`env(safe-area-inset-bottom)`) on the sticky bottom bar and bottom drawer so iOS Safari home indicators and Android soft keyboards never obscure primary actions.
- **Offline / Flaky Warehouse Wi-Fi Resilience:**
  - Disable duplicate submissions with optimistic loading states (`useTransition` / pending spinners); show clear retryable error banners if Delhivery times out.

---

## 8. Implementation Plan & Milestones

### Phase 1: Foundation & Delhivery Integration Layer
1. Initialize Next.js App Router + Tailwind + Shadcn UI + Zod + Supabase client.
2. Provision Supabase tables (`orders`, `shipments`), enums, indexes, and RLS policies.
3. Build server-only `lib/delhivery/client.ts` & Zod schemas for all 5 endpoints (`pin-codes`, `cmu/create`, `packing_slip`, `packages/json`, `p/update` & `p/edit`).
4. Implement Next.js Server Actions + `/api/labels` PDF proxy route with staging environment integration tests.

### Phase 2: Mobile-First Dashboard Experience
1. Implement Sticky Header + Search + Floating Quick Filter Pills (`All`, `Pending AWB`, `Out for Delivery`, `NDR / Failed`).
2. Build Mobile Card List with `44x44px` Call (`tel:`), Copy AWB, and Status Pill controls.
3. Build Bottom Sheet Order Drawer (`vaul` / Shadcn Sheet) with Serviceability badge, Manifest form (weight/dimensions), Live Tracking Timeline, and NDR Action controls.
4. Build Sticky Thumb-Zone Bottom Action Bar (`Generate AWB`, `Print Label`, `Track`).

### Phase 3: Desktop Command Center & Hardening
1. Build Desktop Sortable Data Table (`md:` / `lg:`) with multi-select checkboxes and Batch Action Toolbar.
2. Add Right-Hand Split View (`lg:`) / Slide-Over Sheet (`md:`) mirroring the Order Detail component.
3. End-to-end QA on mobile viewport (`375x812`), rugged scanner viewport (`360x640`), and desktop (`1440x900`), verifying zero client token exposure and Delhivery staging roundtrips.

---

## 9. Open Questions & Decisions Required Before Implementation

1. **Authentication & Access Model:** Will operators sign in via Supabase Auth (Email/Magic Link/PIN), or is this an internal warehouse tool behind network/VPN protection? (Affects RLS policies and session checks in Server Actions.)
2. **Order Ingestion Source:** Are orders created manually inside this dashboard (via an "Add Order" modal/CSV import) or synced externally into Supabase (e.g., Shopify/WooCommerce webhook)?
3. **Delhivery Pickup Warehouse Name:** What exact `pickup_location.name` string is registered in your Delhivery One dashboard (required by `/api/cmu/create.json`)?
4. **Packing Slip PDF Format:** Does your Delhivery One account return raw PDF binary when passing `?pdf=true&pdf_size=4R` to `/api/p/packing_slip`, or does it return JSON requiring server-side 4x6 PDF generation?
5. **Minimal Schema Extensions:** Confirm adding the recommended columns in Section 6.2 (`city`, `state`, `created_at` on `orders`; `length_cm`, `width_cm`, `height_cm`, `tracking_scans`, `ndr_upl_id`, `is_rto` on `shipments`) so cards, manifest payloads, and timelines work without external re-fetches.

