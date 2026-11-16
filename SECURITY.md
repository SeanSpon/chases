# Security and purchase behavior

- Electron renderer is sandboxed with context isolation and a narrow preload API. Retailer pages run in a separate Chrome/Edge process, never the Electron renderer.
- Separate persistent browser profile. Users sign in and manage payment directly with retailers; no card-number/password capture, ordinary-browser card extraction, or arbitrary script recording.
- Setup captures selectors on explicit Pick actions only. It does not record typing. Picker clicks are intercepted, including the final order button.
- Auto-buy is opt-in per product and requires a successful pre-submit test tied to the URL, recipe, and current purchase limits.
- Sequential checkout, single app instance, one unit per product link, single-item cart, exact configured cart-name checks, unit-price cap, selected final USD total cap and global quantity cap.
- Charge reservations are written durably before submitting. Submitted, confirmed and uncertain results stay locked across restart. Uncertain charges count against the budget.
- Earlier steps reject recognizable purchase buttons and unknown navigation labels. Unexpected main-frame origins and visible challenge screens stop automation. No bypass of access controls, CAPTCHA, queues or anti-bot systems.
- Stop closes active tabs and suppresses later work. It cannot recall an already submitted order.
- Automated browser tests use a simulated retailer and never make real purchases. Live retailer compatibility has not been certified. A successful dry-run does not guarantee a future retailer charge or correct selectors.

Known limits: unsigned installer; no independent security audit; no test on Chase's computer; retailer DOM/receipt heuristics can change; saved account state is sensitive; redirects/private-network isolation for arbitrary monitor URLs is incomplete; no iframe/3DS/guest-card automation. Limits rely on selecting the correct final total with taxes/shipping; the retailer controls the actual charge. Do not publish account state, settings, or order-history files.
