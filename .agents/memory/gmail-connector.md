---
name: Gmail connector delivery
description: Durable guidance for sending application email through the attached Replit Gmail connector.
---

Use `@replit/connectors-sdk` with `ReplitConnectors().proxy("google-mail", ...)` in the application server. The attached connector provides Gmail API access through the authenticated proxy, including send scopes; do not put OAuth credentials in source files or environment files.

**Why:** The conversation-only `connectorFetch` helper may not be available in every runtime, while the SDK proxy is the supported application integration path and handles token refresh.

**How to apply:** Build RFC 2822 messages and base64url-encode them for `/gmail/v1/users/me/messages/send`; check the HTTP response and fail explicitly rather than silently falling back to a different provider.