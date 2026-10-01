# Incomplete logic — closed pricing circle (2026-10-01)

## Closed
- **range pricing:** final amount within `[priceMin, priceMax]` set in Department Desk (live line PATCH or complete report) → `range_final`.
- **on_request pricing:** quote amount set in Department Desk → `quoted`.
- Not at public booking request/confirm; by design finalized after check-in / at session end.
- Auto-end: when sum of line `durationMinutes` from `checkedInAt` elapses, UI opens pricing report (`autoEnded`); complete API still requires all pending prices.

## APIs
- `PATCH /api/ops/desk/appointments/:id/lines/:lineId/pricing`
- `POST /api/ops/desk/appointments/:id/complete` + `linePrices[]`
- Still: `PATCH /api/ops/appointments/:id/pricing` (syncs primary line)

## Still open (non-pricing)
- Stripe capture, customer quote/pay link, WhatsApp/SMS QR pass, strict desk RBAC.
