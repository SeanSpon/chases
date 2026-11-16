# AutoCart for Chase

## [Download the latest Windows installer](https://github.com/SeanSpon/chases/releases/latest)

Under **Assets**, download **AutoCart-Setup-0.2.0.exe**. Run it; no source ZIP or developer tools are needed.
Requires Windows x64, Chrome or Edge, internet, and an awake computer. This repository is private: Chase needs access, or Sean can send her the installer.

## Two modes

| Mode | What happens | Payment |
| --- | --- | --- |
| Watch-only (default) | Checks the links and sends notifications | Spends $0 |
| Configured auto-buy | Replays the configured checkout, verifies cart and selected final USD total, submits the final order button, looks for a receipt | Can charge the payment method saved in the store account |

Paste up to 100 product links, one per line. Choose **How to use this** in the app for the full directions.

## Set up automatic checkout

1. Save item-price, total-budget and total-item limits.
2. Beside a product, click **Set up auto-buy**, then **Open store setup / sign in**.
3. Sign into the retailer in the separate setup browser. Save payment and shipping directly with the retailer. AutoCart does not read cards from your everyday browser or ask for card numbers.
4. On the product page, use the Pick buttons for the price and Add to cart. Picking intercepts the click without activating the store button. Click the real Add button yourself afterward.
5. Record each next checkout button, clicking the real one yourself to advance. Do NOT record the final payment button as a navigation step.
6. At final checkout pick the exact product name, its quantity, TOTAL cart-item count, FINAL total including tax/shipping, and the final order button. The cart must contain exactly one unit of the configured product.
7. Save setup and run **Test without buying**. This replays the real cart/checkout but never clicks the final order button. It can leave an item in the retailer cart: empty it afterward.
8. Close setup, switch on **Auto-buy**, and confirm the authorization. Press Start. Close the window to keep running in the tray.

Each product link buys **one unit once**. There is no automatic retry after a submitted or uncertain payment, including after restart or removing/re-adding the link. Budget and quantity reservations survive restarts. Changing price/budget/quantity limits requires another test.

## Compatibility and limits

This is a configurable checkout engine, **not a certified universal retailer bot**. No live NeeDoh retailer or real payment has been tested because no retailer links/accounts have been supplied. A setup test proves the configured pre-submit flow at that time, not that the retailer will accept an unattended future order.

- Supports ordinary saved-account checkout buttons, top-level DOM elements, and USD totals. Complex frames, popups, guest-card forms, subscriptions and installment plans are unsupported.
- CAPTCHA, MFA, bank approval, CVV prompts, anti-bot blocks, unexpected domains, ambiguous selectors, incorrect items/counts or over-budget totals stop the flow. No stealth, proxy rotation, queue or CAPTCHA bypass.
- The user must select the correct FINAL total including taxes and shipping. Limits are checked against the selected DOM values; the retailer controls the actual charge. Incorrect selectors or later retailer changes can make automation stop or misread a page. Keep limits conservative and inspect setup.
- Confirmation uses success text plus a detected order identifier. **Uncertain/submitting** means the store may have charged: inspect retailer order history. These entries remain locked. An **attention** entry means submission was not attempted; after fixing its cause, the user can explicitly allow another attempt.
- Stop closes active automation tabs. It cannot cancel an order already sent to a retailer.
- The dedicated Chrome/Edge session is local under the app's user-data directory. Treat it as sensitive account access. No raw card numbers or passwords are collected by AutoCart.
- Installer is unsigned. The packaged app has not been independently exercised on Chase's computer.

## Verification

`npm run check` checks all application JavaScript. `npm test` runs unit/lifecycle tests and real Playwright browser integration tests against an intercepted simulated retailer. Those tests cover dry-run, one actual simulated submission, duplicate prevention across restart, limits including reservations, quantity, wrong cart item, currency, blocks, stop, domain changes, uncertain receipts, picker interception, and the app UI. They make **no real payments**. Windows CI gates release publication on all checks and the installer build.

Implementation references: [Playwright persistent profiles](https://playwright.dev/docs/api/class-browsertype#browser-type-launch-persistent-context), [authentication](https://playwright.dev/docs/auth), [locators](https://playwright.dev/docs/locators).
