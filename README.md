# whatsplayingtonight.com
1. Create a GitHub repo, push these files to `main`.
2. Settings → Pages → Deploy from branch → `main` / root. The `CNAME` file sets your domain.
3. At your registrar, point the domain to GitHub Pages (A records 185.199.108.153, .109.153, .110.153, .111.153, or CNAME `www` to `<user>.github.io`).
4. Actions tab → "Nightly update" → Run workflow once to fill `events.json`. It then runs every night at midnight New York time.
Test locally: `node scripts/update.js` (Node 18+).
Add sources: edit SOURCES in scripts/update.js (any Localist calendar works).
