# Update the existing working v0.8 GitHub/Vercel repo to v0.8.1

This procedure is intentionally different from the earlier folder migration. Your current v0.8 folder is already the working Git repository connected to GitHub and Vercel, so **keep that `.git` exactly where it is** and copy the new release files into it.

Assumed current working repo (adjust if yours differs):

```text
C:\Users\amaya\Downloads\personal-finance-os-v0.8
```

## 1. Verify the current repo is clean

Open the existing working v0.8 folder in VS Code and run:

```powershell
git rev-parse --show-toplevel
git status --short
git remote -v
```

The first command must point to the folder that currently deploys successfully. Commit or intentionally discard any unrelated local changes before continuing.

## 2. Extract v0.8.1 somewhere else

For example:

```text
C:\Users\amaya\Downloads\personal-finance-os-v0.8.1
```

The extracted release folder should directly contain `api`, `core`, `server`, `public`, `package.json` and `vercel.json`. Do **not** run `git init` in the new folder.

## 3. Copy release contents into the existing repo root

From PowerShell, adjust the two paths if necessary:

```powershell
$NEW = "C:\Users\amaya\Downloads\personal-finance-os-v0.8.1"
$REPO = "C:\Users\amaya\Downloads\personal-finance-os-v0.8"

Get-ChildItem $NEW -Force |
  Where-Object { $_.Name -ne ".git" -and $_.Name -ne "node_modules" -and $_.Name -ne "data" } |
  Copy-Item -Destination $REPO -Recurse -Force
```

This preserves your existing `.git`, local `.env`, local data and Vercel/GitHub history.

## 4. Build from the existing repo

```powershell
cd "C:\Users\amaya\Downloads\personal-finance-os-v0.8"
npm ci
npm run build
```

Verify:

```powershell
node --check .\public\app.js
node --check .\api\index.js
Get-ChildItem .\api -Recurse -File
```

`api` must still contain only `api\index.js`.

## 5. Review and push

```powershell
git status
git add -A
git commit -m "Integrate legacy finance tracker v0.8.1"
git push origin master
```

Vercel should deploy automatically using the settings that already work for v0.8. Do not change Root Directory, Neon variables or authentication settings.

## 6. Verify production

Check:

```text
https://YOUR-DOMAIN/api/v1/health
```

Expected version: `0.8.1`. Then open **Reportes** and verify that the legacy tracker panel loads.

No Neon schema migration and no new environment variables are required.
