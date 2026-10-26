---
id: F-REST-010
title: "Property photos"
module: "Real Estate"
status: Live
roles: "as F-REST-001"
settings: []
related: [F-RENT-001, F-REST-001, F-REST-009]
---

[← Real Estate](../modules/real-estate.md) · [Index](../INDEX.md)

# Property photos

`F-REST-010` · Live · Roles: as [F-REST-001](F-REST-001.md)

**What it does:** Lets you add up to 20 photos per property, shows them as a mosaic (first five), opens a full-screen viewer, sets the cover photo used on list cards, and deletes photos. Works on both Real Estate and Rental property pages.

**Why it exists:** Code comment: "A property's photos: a catalogue-style mosaic, a full-screen viewer, and uploads (shrunk in the browser first)".

**Where to find it:** **Photos** section of a property page (`/real-estate/:id` or `/rental/:id`).

**Who can use it:** All plans, own properties.

**Steps**
1. With no photos, click "Add photos of this property" (or drag photos onto the section). With photos, click **Add photos**.
2. Progress shows "Adding N of M…"; then "Photo added" / "N photos added".
3. Click a tile or **Show all N photos** to open the viewer; use the arrows or ← / → keys.
4. In the viewer click **Make cover** to set the cover, or the delete icon → "Delete this photo?" → **Yes, delete**.

**Controls**
| Control (exact label) | Type | What it does | Disabled / hidden when |
|---|---|---|---|
| **Add photos** | Button | File picker (images, multiple) | Disabled at 20 photos ("Up to 20 photos per property") or while uploading |
| **Show all N photos** | Button | Opens viewer | Shown with 2+ photos |
| **Make cover** / "Cover" | Button | Makes this the cover | Shows "Cover" when already cover |
| Delete photo (icon), **Yes, delete**, **Cancel** | Buttons | Delete with confirm | While busy |
| Previous / Next photo | Buttons | Navigate | — |
| Close | Button | Close viewer | — |

**Fields and rules**
| Field | Type | Required | Format / limits | Default | Error shown (exact) |
|---|---|---|---|---|---|
| Photo file | Image | — | JPEG, PNG or WebP; resized in the browser to ≤1600 px (thumbnail ≤480 px); server limits 4 MB full, 512 KB thumbnail; 20 per property | — | "Skipped N file(s) that isn't/aren't a photo", "A property can have up to 20 photos", "<file>: Photos must be JPEG, PNG or WebP images", "<file>: That photo is too large — try a smaller one" |

**Settings and toggles here:** None.

**Results:** Photos are stored in the database, private to you; the first photo in order is the cover and drives list-card slideshows. "Cover photo set" / "Photo deleted" confirm actions.

**Errors and troubleshooting**
| Message / symptom | Cause | Fix |
|---|---|---|
| "<file>: couldn't be added — try a JPEG or PNG" | Upload failed | Try a JPEG or PNG |
| "Could not set the cover photo" / "Could not delete the photo" | Server error | Retry |

**Limitations:** 20 photos per property; a Real Estate property linked to a Rental record shares one gallery (and one 20-photo limit) with it. No captions can be typed in the UI.

**How it works:** Upload sends the resized full image and thumbnail via `POST /api/property-photos` (multipart, ≤5 MB per part); the server sniffs the real image type, checks sizes and count, and appends it last. Photos are served from `GET /api/property-photos/:id/full|thumb` with a private one-year cache. **Make cover** moves the photo to the front of the order.

**Related features:** [F-REST-001](F-REST-001.md), [F-RENT-001](F-RENT-001.md), [F-REST-009](F-REST-009.md).

**Sources:** `apps/web/src/components/property/PropertyGallery.tsx:12`, `apps/web/src/components/property/PropertyGallery.tsx:86`, `apps/web/src/components/property/PhotoLightbox.tsx:154`, `apps/web/src/components/property/PhotoLightbox.tsx:176`, `apps/web/src/lib/imageResize.ts:9`, `packages/api/src/services/realEstate/propertyPhotos.service.ts:18`, `packages/api/src/services/realEstate/propertyPhotos.service.ts:78`, `packages/api/src/services/realEstate/propertyPhotos.service.ts:120`, `packages/api/src/controllers/propertyMedia.controller.ts:30`
