# Calendar Sync Bridge

A work-in-progress Google Apps Script calendar sync bridge that uses Google Sheets as an inspectable configuration layer.

This project was built to solve a practical workflow problem: syncing or copying selected calendar events between calendars while keeping the configuration, rules, and sync behaviour visible to the user.

It is shared as a sanitized proof-of-work example, not as a production-ready package.

## What it does

- Uses a Google Sheet as the control/configuration layer
- Reads source calendar configuration from the sheet
- Applies sync policies such as full copy or placeholder events
- Supports keyword-based filtering
- Writes managed sync metadata to target events for traceability and deduplication
- Includes development/testing helpers for validation

## Why this exists

Calendar integrations are often opaque. This project takes a more transparent approach: the user can inspect the calendars, target mappings, policies, and sync behaviour before automation runs.

## How AI was used

AI was used as a development accelerator for architecture brainstorming, function structure, edge-case review, documentation, and privacy/security review.

AI did not own the design. Security-sensitive decisions, data-handling choices, and final implementation decisions were reviewed manually.

## Repository status

This is a work-in-progress public snapshot.

Before using it with real calendars, review:

- configuration values
- logging behaviour
- sync metadata written to event descriptions
- access permissions
- event privacy requirements

## Template sheet

The project expects a Google Sheet with these tabs:

### Calendars

| Name | ID | Display Name | Copy | Anonymize |
|---|---|---|---|---|

### Source

| Enabled | Source Calendar ID | Source Calendar Name | Target Calendar ID | Target Calendar Name | Policy | Target Title | Skip Keywords | Allow Title Keywords | Lookahead Days |
|---|---|---|---|---|---|---|---|---|---|

### Targets

| Name | ID | Display Name |
|---|---|---|

### Template sheet

A sanitized Google Sheets template is available here:

[Template - Calendar Sync Config](https://docs.google.com/spreadsheets/d/1aZfAvwO5Va7r0BOhZYjJEhX-2lhocIkROjNP4JzJkTs)

Make a copy before using it:

**File → Make a copy**

The template contains three tabs:

- `Calendars` — calendar inventory and copy/anonymize settings
- `Source` — source-to-target sync rules and policies
- `Targets` — target calendar definitions

Do not add real calendar IDs, private event names, or personal data to a public copy of the sheet.

## Security and privacy notes

Do not commit real calendar IDs, personal email addresses, event titles, event descriptions, spreadsheet IDs, script deployment URLs, API keys, OAuth secrets, or logs containing private calendar data.

Testing/debug functions may log calendar and event details. Review them before running against sensitive calendars.

## License

This project is licensed under the Apache License 2.0.
