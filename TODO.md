# TODO

## MVP Follow-ups

- Publish: validate `imageUrl` is publicly fetchable by Telegram (direct URL, no hotlink/cookie, `Content-Type` starts with `image/`) and return a clear 400 error when it is not.
  - Current symptom: Telegram API fails to fetch some URLs (e.g., certain image proxy links) and users see a generic failure.
- Publish: add a short HTTP timeout + clearer error mapping for Telegram API failures (network vs. API error), so users get actionable messages.
- Publish: consider limiting image size/type or preflighting with `HEAD` to reduce Telegram rejections.
- Publish: guard against accidental double-submit from miniapp UI (debounce/retry safety on backend).
- Offer clicks: consider adding basic rate-limiting or idempotency for click endpoints to avoid spam/accidental loops.
- Offer stats: add pagination or date filters once stats volume grows (current queries scan all events).
- CORS: make `CORS_ORIGIN` strict per env (dev allows any; prod should be single host).
- Miniapp: surface backend URL + health status only in dev mode; hide in production UI.
- Miniapp: add client-side URL validation for `checkoutUrl` and `imageUrl` (ensure `https://`).
- Miniapp: dev fallback for Telegram user should be clearly disabled in production builds.
- Miniapp: show explicit step-level progress (ensure user → product → image → offer → publish).
- Miniapp: handle `offer.text` and `product.description` trimming on backend consistently (currently done only client-side).
- Bot: web_app buttons require HTTPS; consider showing a clear warning if `MINI_APP_PUBLIC_URL` is not HTTPS in dev.
- Backend: add a minimal health check for Telegram publish config (token, channel id, public URLs) to help diagnose publish errors.
- Backend: create-product image endpoint should validate URL scheme and length (to avoid bad URLs in DB).
- Encoding: fix mojibake in UI and bot strings (ensure UTF-8 source files and proper tooling).
