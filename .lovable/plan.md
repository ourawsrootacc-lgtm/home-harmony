## Remove "Cash" option from Upload payment proof dialog

The "Upload rent payment" dialog (shown in the screenshot) uses the `SubmitPaymentDialog` component. Its Method dropdown is generated from `METHOD_LABEL` in `src/lib/payments.ts`, which includes `cash`.

Note: the same `METHOD_LABEL` is also used by `PaymentMethodPicker` (landlord payout methods). To avoid affecting that, I'll filter out `cash` locally in `SubmitPaymentDialog` rather than deleting it from the shared map.

### Change
- `src/components/payments/SubmitPaymentDialog.tsx`: when rendering the Method `<Select>` options, filter out `cash` from the `METHOD_LABEL` keys. Default `method` state stays `easypaisa`. The existing `method === "cash"` conditionals can remain as harmless dead code (or be removed — I'll remove them for cleanliness).

### Acceptance
- Dropdown shows only: Bank transfer, EasyPaisa, JazzCash.
- Reference number field is always shown (since cash is no longer selectable).
- No DB / schema changes.