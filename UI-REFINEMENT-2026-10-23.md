# ReactorPlan UI refinement — 23 Oct 2026

## Updates
- Removed pill/circle styling from site names so site values read as clean table labels.
- Corrected the refresh button outline and interaction styling.
- Removed the capacity reconciliation note from the dashboard.
- Moved Total Capacity Overview above Capacity Utilization By Site.
- Replaced the Planning Confidence paragraph with a compact color legend and gave all confidence cards consistent status-colored borders, including No Scheduled Confidence.
- Retained the interactive Product Information play cards and detail modal.
- Removed the sort-field and sort-direction controls from the main reactor inventory and site inventory views; inventory remains sorted by reactor ID by default.
- Replaced the reactor Delete text action with a dustbin icon and added a confirmation dialog.
- Improved the spacing, field alignment, borders and responsive layout in Check Reactor Availability.
- Made Product Name clickable in the Planning Calendar's fixed row and Selected week details table, opening the existing assignment-details modal.

## Validation
- `node validate-ui.mjs`: PASS — 25 UI contract checks.
- A full Vite production build could not be run in this packaging environment because `npm ci` did not complete and the local `node_modules` installation remained incomplete. Run `npm ci` followed by `npm run build` in an environment with package-registry access to perform the production build.


## Professional UI pass — 23 October 2026
- Added a four-card Planning Confidence summary to Product Information, using the Dashboard's existing exclusive confidence counts.
- Removed colored site chips from site cells so CTO-2, CTO-3, CTO-5, CTO-6, CTO-SEZ, Mexico, and Mirfield render as plain labels.
- Replaced the Reactor Master delete button's red block with a neutral trash icon treatment; mapped-reactor delete actions use the same icon-only visual language while retaining accessible button text.
- Refined Check Reactor Availability filters, field sizing, card spacing, result count typography, and action alignment.
- Removed the calendar fixed-column blue pill appearance; reactor ID and Product Name are now clear, individually clickable controls that open assignment details.
- Validation: frontend UI contract checks and backend source-data validation passed. Production Vite build could not be run because frontend dependencies could not be installed in this environment (`vite: not found`); browser visual regression testing remains unverified.
