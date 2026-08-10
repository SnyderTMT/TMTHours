# Hours Scheduler — Two Men and a Truck

Hours tracker for crew job estimates, LD moves, and non-billable time.

Live site: https://snydertmt.github.io/TMTHours/

## How employees see the same hours

The live website reads a file called **`data.json`**. Your browser edits stay on your computer until you publish that file.

1. Log in as a manager (local `index.html` or the live site).
2. Add crew / log jobs as usual.
3. Open **Crew** → **Download data.json**.
4. In your GitHub **TMTHours** repo, replace the old `data.json` with the new one (and upload any code files you changed).
5. Wait about a minute. Employees open/refresh https://snydertmt.github.io/TMTHours/ and log in with their passwords.

**Import data.json** on Crew loads a file back into this browser (useful if you switched computers).

## Login

**Managers** (change on the Crew tab):

- `manager1`
- `Maple!1997DS` (Manager 2 — only this login can clear a whole week / delete all jobs)

**Employees:** each person gets a password on the Crew roster. They only see Weekly Totals and My Hours for themselves.

## Daily manager flow

1. Log hours / fix names on your PC.
2. Download `data.json`.
3. Upload it to GitHub.
4. Tell the crew to refresh the live link.
