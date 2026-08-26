# APEX — English mirror on Vercel

The same translation layer as the local preview, packaged as a Vercel app.
Every request is fetched from the live Tilda site, the Russian strings are
replaced with English in the browser, and Tilda's store API is proxied so the
product cards load.

## Deploy

```
npm i -g vercel          # once
cd apex-en-vercel
vercel                   # preview deploy — asks a few questions, defaults are fine
vercel --prod            # production deploy
```

The CLI prints the URL, e.g. `https://apex-en.vercel.app`.

## Custom domain

```
vercel domains add apexhooka.com
```

or in the dashboard: Project → Settings → Domains → Add. Vercel shows the DNS
records to create at your registrar (an A record for the apex domain and a
CNAME for `www`), then issues the certificate automatically.

## Files

| File | What it is |
|---|---|
| `app.py` | the proxy + translation injector (Flask) |
| `translate.js` | in-page translation layer |
| `translations.json` | UI, marketing, product, FAQ strings |
| `translations_legal.json` | cookie policy, privacy policy, consent, warranty |
| `requirements.txt`, `vercel.json`, `.python-version` | Vercel configuration |

Editing a translation: change the English side of a pair in the JSON, then
`vercel --prod` again.

## Run it locally

```
pip install flask
python3 app.py      # http://localhost:8000
```

## Things to know

* Responses carry `X-Robots-Tag: noindex, nofollow` — a mirror must not compete
  with apexhooka.ru in search results. Remove it only when the English site
  becomes the real thing (built in Tilda), not a mirror.
* Forms and the store catalogue work because the proxy presents the original
  site as the referer. If Tilda changes that check, they stop working — the
  durable solution is a separate Tilda project on apexhooka.com.
* Every page view goes through the live site, so the mirror is slower than
  Tilda's own CDN and depends on apexhooka.ru being up.
* The page HTML stays Russian and is translated in the browser, so this setup
  is for demos and partner review, not for SEO.
