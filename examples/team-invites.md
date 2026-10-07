# Team Invites

> SYNTHETIC sample PRD written for prd-to-backlog demos and evals. It does not describe a real
> product or company.

## Problem

New workspaces stall after sign-up because the creator cannot easily bring teammates in.
Today invites are sent manually by support, which takes up to two business days.

## Goals

- Let workspace owners add their team without contacting support.
- Reduce time from workspace creation to first collaborator joining to under 1 day.
- Keep workspace membership auditable for security reviews.

## Users

- **Workspace admin**: owns the workspace, manages members and billing seats.
- **Invitee**: a teammate who receives an invite and may not have an account yet.
- **Security reviewer**: audits who was granted access and when.

## Requirements

### Sending invites

- Workspace admins can invite teammates by entering one or more email addresses.
  - When an admin submits up to 20 valid addresses, then each address receives an invite email within 2 minutes.
  - If an address is malformed, then the form shows an inline error and no invite is sent for it.
  - If the address already belongs to a member, then the admin sees "already a member".
- Workspace admins can set the role (Admin or Member) for each invite.
  - Given a role is selected, when the invite is accepted, then the new member has that role.
- Workspace admins can resend a pending invite.
  - Resending generates a new link and invalidates the previous one.

### Accepting invites

- Invitees can accept an invite from the email link and join the workspace.
  - When an invitee with an existing account opens a valid link, then they join the workspace after one confirmation click.
  - When an invitee without an account opens a valid link, then they are taken to sign-up with the email prefilled.
- Invite links must expire after 7 days.
  - If an invitee opens an expired link, then they see an expiry message and a button to request a new invite.
- The invite flow should be fast and easy for invitees.

### Managing invites

- Workspace admins can view all pending invites with sender, role and sent date.
- Workspace admins can revoke a pending invite.
  - When an admin revokes an invite, then its link stops working immediately.
- The system must record an audit log entry for every invite sent, accepted, resent or revoked.
  - Each entry includes actor, target email, action and timestamp in UTC.

## Non-functional requirements

- Invite emails must be sent through the existing transactional email provider.
- The system must rate-limit invites to 200 per workspace per day.
- Invite tokens must be single-use and at least 128 bits of entropy.

## Out of scope

- Inviting users via SCIM or directory sync.
- Bulk CSV upload of invitees.
- Custom invite email branding.

## Risks

- Invite emails may land in spam folders, lowering acceptance rate.
- Rate limits that are too strict could block legitimate onboarding for large teams.

## Open questions

- Should Members (not only Admins) be allowed to send invites?
