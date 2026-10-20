# ReVampLEX interactive release

## Changes

The approved redesign adds a branded homepage and inspiration feed, consistent navigation, map/list browsing, clearer project posting, organized Project Rooms, all 16 existing trade calculators, editable quantities and saved estimate drafts, and improved takeoff and AI request handling. Existing services and billing plans are retained. Project images are optimized.

This release contains production source. Isolated review data, review adapters, and the Sites hosting manifest are excluded.

## Verification

`npm run verify` checks 14 HTML pages, 29 classic scripts, and 110 local links, then runs 16 calculator/AI/account-link checks, 13 notification checks, and 17 billing and configuration checks.

Billing tests verify signed payloads, successful and pending payments, current subscription status, cancellation, duplicate and delayed delivery, replacement subscriptions, unknown prices, and failed database writes. Tests use local fixtures and mocked external requests; they do not charge customers, send emails, or change live profiles.

Both included database migrations have been applied to the existing database. Rolled-back permission tests cover owner-controlled sharing, comments and reactions, anonymous write rejection, room creation, and participant identity protection. Existing projects remain unshared by default, existing rooms were retained, and no fixture records remain.

The Vercel connection now has access to the existing project. The preview homepage returns HTTP 200. A live HTTP check verified that the notification API rejects unauthenticated requests. The estimator returned a response, and takeoff returned 200 square feet with source page 7 for a synthetic drawing labeled 20 by 10 feet. No customer files were used. Browser end-to-end testing remains unavailable in this environment; HTTP and server checks do not establish every interactive workflow.

## Billing repair

The existing payment webhook crashed during module loading and placed subscription updates outside its request handler. Event processing now runs after signature verification, reads current subscription state, maps configured prices consistently, handles delayed payments, and reports failed database writes for retry. An old cancellation cannot change a replacement subscription.

The Stripe SDK is pinned to 23.0.0 with a lockfile. Checkout retains the existing plans and adds the supported integration identifier. Deployment validation and the webhook share one signing-secret selector: a valid primary setting takes precedence, a valid legacy setting is supported, and malformed values are rejected. No real checkout, payment, refund, or subscription change was performed during release preparation.

## Notification configuration

Project notifications use the authenticated server endpoint `/api/project-notification`. The caller's account and room membership are checked before looking up the partner's confirmed account email. User-editable contact fields are not notification destinations.

The private notification webhook setting has been added to the hosting project. The deployment gate validates the required settings without logging credentials or sending notifications. The email workflow must use the `recipient_email` field. Live notification delivery remains unverified.

## Preview and publication

Release review: [PR #5](https://github.com/revamplex/revamplex-landing/pull/5).

Preview: https://revamplex-landing-git-codex-interact-3e5ad8-revamplexs-projects.vercel.app

The preview uses Vercel sign-in or an owner-issued temporary share link.

After configuration validation and release checks pass, merge the release into `main` using the existing GitHub/Vercel integration. Confirm that the production deployment is ready and revamplex.com serves the approved homepage.

If a regression appears, restore the previous working deployment or revert the release commit. Keep user-created community data during a frontend rollback.
