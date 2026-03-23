# Resources Page Documentation

This document explains how the resources page is structured and how to maintain it.

Related document:

- [dnn-documentation.md](/Users/vince/Downloads/subscriptions/dnn-documentation.md)

## Files

- `resources.html`
  Main page markup for the resources experience.
- `resources.js`
  Lean resources-page script used for theme, sidebar reset, resource loading, pagination, and downloads.
- `dnn.css`
  Shared stylesheet used by both the DNN profile page and the resources page.

## What `resources.html` does

`resources.html` renders a resources page with:

- a shared sidebar
- a page header with theme toggle
- an Additional Resources section
- a grid of downloadable HubSpot PDF cards
- pagination controls

The page uses the shared `allwrap` layout system and adds the `resources-page` class for page-specific overrides:

```html
<section class="allwrap resources-page">
```

That class is important because `dnn.css` uses it to give the resources page its own mobile/sidebar behavior.

## Required companion files

The page depends on:

- `dnn.css`
- `resources.js`

It also loads Google Fonts:

- `Signika`
- `Outfit`
- `Space Mono`

## Current page structure

Main UI sections in `resources.html`:

- sidebar
- top navbar
- page header
- Additional Resources card section
- pagination controls
- footer

Important DOM IDs used by `resources.js`:

- `#sidebar`
- `#theme-toggle`
- `#cards-secondary`
- `#resourceSecondaryStatus`
- `#resourcePagination`
- `#resourcePageSize`
- `#resourcePrevPage`
- `#resourceNextPage`
- `#resourcePageInfo`

## Sidebar links

Current important sidebar links:

- `My Profile`
  `https://bconglobal.com/Resources/download/Subscription-Testing-7769489519`
- `My Subscription`
  `https://bconglobal.com/Resources/download/Subscription-Testing-7769489519`
- `LIFO Resources`
  `https://bconglobal.com/Resources/download/Subscription-Testing-7769482345`

## Theme behavior

Theme logic lives in `resources.js`.

Current default:

```js
const savedTheme = localStorage.getItem("theme") || "light";
```

This means:

- first-time visitors get light mode
- later visits use the saved theme from `localStorage`

## Worker dependency

The resources page loads document metadata from the Cloudflare Worker.

Default worker base URL:

```text
https://dnn-subscription-portal.vvelascoao2022.workers.dev/
```

The page currently uses:

- `GET /api/pdfs-by-folder?id=209745447557`
- `GET /api/pdf-download?id=FILEID&name=FILENAME`

Folder ID currently used:

```text
209745447557
```

## Resource card behavior

Each resource card currently shows:

- label: `Subscription Files`
- code extracted from the file name, such as `L301`
- document title
- thumbnail image
- `Download` button

When a user clicks `Download`, `resources.js` builds a worker download URL and triggers a browser download.

## Thumbnail behavior

`resources.js` currently uses a fallback static HubSpot image:

```text
https://270115.fs1.hubspotusercontent-na1.net/hubfs/270115/subscription-portal/profile-images/press1.png
```

It also strips any accidental `/portals/0/` prefix before using an image URL.

## Pagination behavior

Pagination is handled entirely in `resources.js`.

Current page size options:

- `10`
- `20`

The selected page size is stored in `sessionStorage`.

The loaded file list is also cached temporarily in `sessionStorage` to reduce repeated worker fetches.

## Shared CSS behavior

`resources.html` uses `dnn.css`, which is also used by `dnn.html`.

That means changes in these shared areas can affect both pages:

- sidebar
- page header
- navbar
- glass cards
- responsive breakpoints

## Resources-page-specific layout behavior

`dnn.css` uses `.allwrap.resources-page` to apply resources-only behavior.

Important current behavior:

- desktop sidebar is sticky
- mobile resources page hides the sidebar
- mobile resources page also hides the hamburger button

This is separate from the profile page behavior.

## JavaScript responsibilities in `resources.js`

`resources.js` currently handles:

- theme toggle
- mobile menu logic
- clearing legacy sidebar offset behavior
- loading additional resources from the worker
- caching results
- rendering resource cards
- thumbnail URL cleanup
- pagination
- download button handling

## Safe customization points

### Change the default theme

Edit `resources.js` in `initThemeToggle()`.

### Change the HubSpot folder

Edit this constant in `resources.js`:

```js
const additionalFolderId = "209745447557";
```

### Change the fallback card thumbnail

Edit this constant in `resources.js`:

```js
const STATIC_RESOURCE_THUMBNAIL_URL = "...";
```

### Change pagination sizes

Edit the `<option>` values in `resources.html` and, if needed, adjust logic in `resources.js`.

### Change sidebar behavior

Edit the `.allwrap.resources-page` rules in `dnn.css`.

## Deployment checklist

When deploying the resources page:

1. Make sure `resources.html` is reachable.
2. Make sure `dnn.css` is reachable.
3. Make sure `resources.js` is reachable.
4. Confirm the worker is deployed and the PDF routes are working.
5. Test:
   - page load
   - theme toggle
   - resource list load
   - pagination
   - downloads
   - desktop layout
   - mobile layout

## Known dependencies and assumptions

The resources page assumes the worker returns files in a shape like:

- `id`
- `name`
- `thumbnail`

If the worker response changes, `resources.js` will likely need to be updated.

It also assumes the resources page can reach the worker from the current origin.
