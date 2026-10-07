---
title: Usage-Based Billing
status: draft
---

# Usage-Based Billing

> SYNTHETIC sample PRD written for prd-to-backlog demos and evals. It does not describe a real
> product or company.

## Overview

We currently bill a flat monthly price per seat. Customers running large API workloads pay the
same as light users, and finance cannot price heavy usage. This PRD introduces metered billing
for API calls on top of the seat price.

## Goals

- Charge customers in proportion to API usage.
- Give customers a clear, near-real-time view of what they will be billed.
- Close the monthly books without manual usage reconciliation.

## Personas

- **Billing admin**: manages the subscription, payment method and invoices for a customer account.
- **Developer**: integrates with the API and watches usage against limits.
- **Finance analyst**: internal user who reconciles revenue each month.

## Functional requirements

| ID   | Requirement                                                                                         | Priority |
| ---- | --------------------------------------------------------------------------------------------------- | -------- |
| FR-1 | The system must meter every billable API call per customer account with an idempotency key.        | P0       |
| FR-2 | The system must aggregate metered usage into hourly totals per account and price dimension.        | P0       |
| FR-3 | Billing admins can view current-period usage and projected charges on the billing page. Depends on FR-2. | P0 |
| FR-4 | The system must generate a monthly invoice that itemises seat charges and usage charges. Depends on FR-2. | P0 |
| FR-5 | Billing admins can set a monthly spend alert threshold and receive an email when 80% and 100% are reached. | P1 |
| FR-6 | Developers can query usage for their account through a usage API endpoint.                          | P1       |
| FR-7 | Finance analysts can export monthly usage and invoice lines as CSV for reconciliation. Depends on FR-4. | P1 |
| FR-8 | Billing admins can download past invoices as PDF.                                                    | P2       |

## Acceptance notes

- FR-1: If the same idempotency key is received twice, then usage is counted once.
- FR-2: When an hour closes, then its totals are final within 15 minutes.
- FR-3: Projected charges use the trailing 7-day average and are labelled as an estimate.
- FR-5: When usage crosses a threshold, then exactly one alert email is sent per threshold per period.

## Non-functional requirements

- Usage ingestion must sustain 5,000 events per second with p99 write latency under 50 ms.
- Invoices must reconcile to metered usage with zero unexplained difference at month close.
- Pricing changes must be versioned so past invoices can be regenerated exactly.

## Out of scope

- Prepaid credits and committed-use discounts.
- Multi-currency invoicing.
- Tax calculation changes.

## Dependencies

- The payments provider integration must support adding usage line items to invoices.

## Risks

- High: metering bugs directly cause over- or under-billing and erode customer trust.
- Medium: customers may react badly to bill increases without warning.

## Open questions

- Do we offer a free usage tier per plan, and how large?
