# DNN Profile Module Documentation

This document explains how the DNN profile page is structured and how to maintain it.

Related document:

- [resources-documentation.md](/Users/vince/Downloads/subscriptions/resources-documentation.md)

## Files

- `dnn.html`
  DNN HTML module fragment. This is the markup you upload or paste into the DNN HTML module.
- `dnn.css`
  Shared stylesheet used by the DNN profile page and the resources page.
- `dnn.js`
  JavaScript for the DNN profile page.

## What `dnn.html` does

`dnn.html` renders a subscription profile page with:

- a left sidebar
- a page header with theme toggle
- subscriber profile image upload
- subscriber lookup form
- editable profile fields
- profile save/cancel actions

It is written as a fragment, not a full standalone document for a normal site deployment workflow.

## Required companion files

`dnn.html` depends on these local files:

- `dnn.css`
- `dnn.js`

It also loads Google Fonts:

- `Signika`
- `Outfit`
- `Space Mono`

## Worker dependency

The page talks to the Cloudflare Worker for subscriber data and profile updates.

Default worker base URL:

```text
https://dnn-subscription-portal.vvelascoao2022.workers.dev/
```

The page currently uses these worker routes:

- `GET /api/subscriber`
- `POST /api/subscriber-update`
- `POST /api/profile-image`

## Current default subscriber values

Inside `dnn.html`, the page currently starts with:

- email: `s-kinashi@bcon.co.jp`
- uid: `422`
- fp: `12`

These are set in the hidden inputs:

- `#workerEmail`
- `#workerUid`
- `#workerFingerprint`

## Sidebar links

Current important sidebar links:

- `My Profile`
  `https://bconglobal.com/Resources/download/Subscription-Testing-7769489519`
- `My Subscription`
  `https://bconglobal.com/Resources/download/Subscription-Testing-7769489519`
- `LIFO Resources`
  `https://bconglobal.com/Resources/download/Subscription-Testing-7769482345`

## Theme behavior

Theme logic lives in `dnn.js`.

Current default:

```js
const savedTheme = localStorage.getItem('theme') || 'light';
```

This means:

- first visit defaults to light mode
- later visits use the saved theme from `localStorage`

## Profile image behavior

The profile image area supports:

- previewing the current profile image
- selecting a new image file
- uploading the image to the worker
- refreshing the image after upload

Default image in `dnn.html`:

```text
https://270115.fs1.hubspotusercontent-na1.net/hubfs/270115/subscription-portal/profile-images/blank.png
```

## Editable profile fields

These fields are editable and saved back through the worker:

- first name
- last name
- email address
- phone number

The save flow only sends changed values.

## DNN layout notes

Current layout behavior:

- desktop sidebar uses `position: sticky`
- mobile hamburger is disabled
- the resources page has its own mobile sidebar overrides in `dnn.css`

Important styling note:

`dnn.css` is shared by both:

- `dnn.html`
- `resources.html`

So changes to shared sidebar, header, or card styles may affect both pages.

## JavaScript responsibilities

`dnn.js` currently handles:

- theme toggle
- mobile menu logic
- basic sidebar layout reset
- auto-loading subscriber data on page load
- fetch subscriber button
- profile image upload
- save profile changes
- cancel/reset profile edits

## Safe places to customize

### Update default worker values

Edit the hidden inputs in `dnn.html`:

- `#workerBaseUrl`
- `#workerUid`
- `#workerFingerprint`

### Update sidebar links

Edit the anchor tags in the sidebar section of `dnn.html`.

### Update default theme

Edit `dnn.js` in `initThemeToggle()`.

### Update styling

Edit `dnn.css`.

Most important areas:

- `.allwrap .dashboard`
- `.allwrap .sidebar`
- `.allwrap .main-content`
- `.allwrap .navbar`
- `.allwrap .profile-shell-card`

## Deployment checklist

When using this page in DNN:

1. Upload or paste `dnn.html` into the DNN HTML module.
2. Make sure `dnn.css` is reachable by that page.
3. Make sure `dnn.js` is reachable by that page.
4. Confirm the worker URL is correct.
5. Confirm CORS and worker deployment are working.
6. Test:
   - load subscriber
   - save profile changes
   - upload profile image
   - theme toggle
   - desktop and mobile layout

## Known coupling

The DNN profile page depends on the worker returning these fields:

- `firstname`
- `lastname`
- `email`
- `phone`
- `profileImageUrl`
- `subscription.type`
- `subscription.status`
- `subscription.startDate`
- `subscription.expiryDate`
- `subscription.accessLevel`
- `subscription.nextRenewal`

If the worker response shape changes, `dnn.js` will likely need updates.
