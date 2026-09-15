# صفحة الحجز العامة — موعد (Maw3ed)

**Role:** 24/7 digital receptionist · white-label per tenant.  
**Brand:** موعد / Maw3ed · UpNexa-eg.com. SetTime = UX reference only.

## Goals

1. Zero-friction booking (<1 min), even outside business hours for *requesting* a slot on open days  
2. Only show **actually free** slots (hours − breaks − buffers − existing appointments)  
3. CRM intake: upsert customer into admin DB on confirm  
4. Cut phone/WhatsApp back-and-forth for “when are you free?”

## Customer journey (6 steps)

1. Open unique link `/book.html?slug={tenant}` → branding header  
2. Pick **category → service** (duration + price)  
3. Pick **staff** or **أي متاح**  
4. Pick **date** → server returns free **time chips**  
5. Enter name / phone / email / notes (+ deposit later)  
6. Confirm → notification hooks + appointment on admin calendar  

## Slot algorithm

`blockMinutes = service.durationMinutes + service.bufferMinutes`

For chosen date + staff (or each candidate if “any”):

1. Load weekday working hours (`opensAt`–`closesAt`)  
2. Subtract break window if enabled  
3. Subtract existing appointments expanded by their block  
4. Walk timeline in `blockMinutes` steps; emit starts that fully fit  

Concurrency (MVP): reject double-book on create (`409`); soft in-memory hold ~3 minutes optional. Later: DB/Redis lock.

## CRM upsert

On confirm: match by **phone** (preferred) else name → update; else create with segment **جديد**.

## Out of this slice / later

- Stripe deposit checkout  
- SMS/WhatsApp reminders  
- Google Calendar sync for staff  
- Optimistic multi-node locks  

## Related

- [`build-plan.md`](build-plan.md) · [`platform-capabilities.md`](platform-capabilities.md) · [`architecture-spec.md`](architecture-spec.md)
