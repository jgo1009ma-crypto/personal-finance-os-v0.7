# Upgrade the existing GitHub/Vercel deployment to v0.8

This procedure assumes the working v0.7 repository is in one Windows folder and the downloaded v0.8 ZIP is extracted into a **different** folder.

The safest approach is to reuse the existing repository's `.git` directory. This preserves Git history and the Vercel Git integration without another unrelated-history merge.

## 1. Find the folder that currently owns the working Git repository

Open the **current working v0.7 folder** in VS Code and run:

```powershell
git rev-parse --show-toplevel
git status --short
git remote -v
```

The first command prints the exact old repository path. Keep it. The working tree should ideally be clean before the upgrade.

For the commands below we call it:

```text
OLD_REPO
```

Example only:

```text
C:\Users\amaya\Downloads\personal-finance-os-v0.7.4
```

## 2. Extract v0.8

Extract the new ZIP. The new folder should directly contain:

```text
api
core
server
production
public
package.json
vercel.json
```

For the commands below we call it:

```text
NEW_REPO
```

Example:

```text
C:\Users\amaya\Downloads\personal-finance-os-v0.8
```

## 3. Copy only Git metadata from the old folder

Close VS Code windows that are actively running Git operations. Then in PowerShell:

```powershell
Copy-Item "OLD_REPO\.git" "NEW_REPO\.git" -Recurse -Force
```

Do **not** copy `.env` or `data\user-data.json` into Git.

Now open `NEW_REPO` in VS Code and verify:

```powershell
git status
git remote -v
git branch --show-current
```

You should see the existing GitHub remote and the same branch, normally `master`.

## 4. Verify the production bundle before committing

From `NEW_REPO`:

```powershell
node -v
git ls-files server/dist/server/src/index.js
Get-ChildItem api -Recurse -File
```

`api` must contain only the single Vercel Function entrypoint:

```text
api\index.js
```

The compiled server bundle should exist under:

```text
server\dist\server\src\
server\dist\core\src\
```

## 5. Install/build/test locally

Recommended with Node 24:

```powershell
npm install
npm run build
```

If Git shows rebuilt `server/dist` files, include them in the commit because Vercel's function loads that production bundle.

Run the test suite in Git Bash/WSL if available:

```bash
./test-all.sh
```

On plain PowerShell, at minimum run:

```powershell
node --check api\index.js
node --check public\app.js
node --check public\login.js
node --check production\state-store.js
```

## 6. Commit v0.8

```powershell
git add -A
git status
git commit -m "Upgrade Personal Finance OS to v0.8"
git push origin master
```

Do not run another `git init` and do not run `git pull --allow-unrelated-histories`. The copied `.git` folder already carries the correct history.

## 7. Vercel deployment

Vercel should create a deployment automatically from the push.

No new environment variables and no new Neon SQL migration are required for v0.8.

After Vercel finishes, check:

```text
https://YOUR-DOMAIN/api/v1/health
```

Expected version:

```json
{"ok":true,"version":"0.8.0", ...}
```

Then sign in and verify:

- Overview
- Cuentas
- Metas
- dark mode button
- dashboard personalization
- Alerts
- Cash flow
- Copilot

## 8. iPhone/iPad

After production is confirmed, open the site in Safari and use **Share → Add to Home Screen**. If an older home-screen installation exists, remove it and add it again after the v0.8 deployment so the icon/manifest metadata is refreshed.

## Rollback

If production has an unexpected problem, use Vercel **Deployments** to promote the last known-good v0.7 deployment. The v0.8 state additions are additive and do not delete v0.7 fields.
