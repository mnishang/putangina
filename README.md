# Sable & Stem admin and local checkout update

Drop-in frontend update for the existing React/Vite coffee-shop project.

- `src/components/AdminSalesPage.jsx` — login gate and five-tab dashboard.
- `src/components/AdminSalesPage.css` — responsive Sable & Stem styling.
- `src/demo-sales.js` — clearly fictional sample orders and starting stock.
- `src/local-demo-orders.js` — browser-only order receipt storage, with no customer contact data saved.
- `src/components/OrderReceiptDialog.jsx` and `.css` — itemized Philippine-peso receipt popup.
- `apply-local-checkout.mjs` — guarded one-time patch from the order API to local checkout.
- `ADMIN_PANEL_SETUP.md` — copy steps, local Vite commands, admin sign-in details, and limitations.
- `LOCAL_CHECKOUT_INTEGRATION.md` — receipt fields and checkout patch instructions.
- `TODO_ADMIN_PANEL.md` — requested feature outcomes.

The dashboard uses no database, backend, or external service. Sign-in is client-side (`admin` / `root`) and is not production security. Sample sales are fictional; local checkout records and inventory edits stay in this browser only. The receipt explicitly says the café did not receive the order.
