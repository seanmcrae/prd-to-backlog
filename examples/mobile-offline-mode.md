# Offline Mode for the Field Inspections App

> SYNTHETIC sample PRD written for prd-to-backlog demos and evals. It does not describe a real
> product or company.

## Background

Field inspectors use the mobile app at construction sites and rural facilities where signal is
unreliable. When the connection drops, the app shows a spinner and inspectors lose notes and
photos. Inspectors fall back to paper and re-type reports later.

## Goals

- Inspectors can complete a full inspection with no connectivity.
- No inspection data is lost because of connectivity.
- Reduce re-typed paper reports to near zero.

## Target users

- **Field inspector**: completes inspection checklists, notes and photos on a phone or tablet.
- **Operations manager**: reviews submitted inspections from the web dashboard.

## Scope

### Must have

Inspectors must be able to download assigned inspections for offline use before leaving
coverage. The download includes checklists, prior findings and site documents.

The app must let inspectors fill in checklists, add notes and capture photos while offline.
All offline changes are stored locally and encrypted at rest.

When connectivity returns, the app must sync queued changes to the server automatically in the
background. Sync must resume after interruption without duplicating photos.

If the same inspection was edited on the server while the inspector was offline, the app
must detect the conflict and let the inspector choose which version of each conflicting field to keep.

The app should show a clear offline indicator and the number of changes waiting to sync.

### Nice to have

Inspectors could pre-fetch map tiles for assigned sites so directions work offline.

## Non-functional requirements

- Offline storage must support at least 50 inspections and 2 GB of photos per device.
- Local data must be encrypted with a key stored in the platform keystore.
- Sync of a 20-photo inspection should complete within 3 minutes on a 3G connection.

## Out of scope

- Offline creation of new sites or new inspection templates.
- Real-time collaboration between inspectors on the same inspection.

## Risks

- Conflict resolution UX may confuse inspectors and lead to the wrong version being kept.
- Low-end Android devices may run out of storage with large photo sets.
- Background sync is restricted by iOS and Android battery policies.

## Open questions

- How long should synced inspections remain cached on the device?
