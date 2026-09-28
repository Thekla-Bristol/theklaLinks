# Thekla Links

A link-in-bio page for Thekla that updates itself. It shows the hero photo, logo, about text and socials, then **This Week**: the next 7 days of gigs and club nights. Tapping an event opens its Alt Tickets or Fatsoma page. Below that are **Coming Up** and the usual link buttons.

Live at **https://links.theklabristol.co.uk** once set up. You can also share `…/#gigs` or `…/#clubs` to open the page with that filter already on, which is handy for Stories. `…/#getting-here` and `…/#accessibility` open those pop-ups directly, and each event's Share button gives a link that opens straight to that event.

## How it updates

A GitHub Action runs every 3 hours, plus extra runs in the early evening. Each run:

1. **Gigs** are read from Alt Tickets (`alttickets.com/venue/bristol/thekla`). Artwork and prices come from each event's page.
2. **Club nights** are read from Thekla's Fatsoma page (`fatsoma.com/p/thekla`). Details come from Fatsoma's public API.
3. **Backup** listings are read from `theklabristol.co.uk/live/` and `/club/`. These fill gaps and supply the Thekla event page for events with no ticket link (sold out, not on sale yet).
4. Everything is merged into `site/events.json`, duplicates are removed, and the site is republished to GitHub Pages.

If a source fails or changes its layout, the page keeps showing that source's events from the last good run. The Action only fails if every source is empty. The raw pages it downloaded are saved under **Actions → the run → Artifacts → debug-html**, so layout changes can be fixed quickly.

The page itself works out This Week and "On now" from the viewer's clock (always in UK time). Late-night club events stay under the right night, and events drop off once they've finished.

## Setup (about 10 minutes)

1. Create a repo in the Thekla Bristol GitHub organisation, e.g. `thekla-links`, and push this folder to `main`.
2. **Settings → Pages → Build and deployment → Source: GitHub Actions.**
3. **Actions tab → "Update events & deploy" → Run workflow.** When it finishes, the page is live at `https://<org>.github.io/thekla-links/`.
4. Custom domain:
   - In the DNS for `theklabristol.co.uk`, add a **CNAME** record: `links` → `<org>.github.io`.
   - In **Settings → Pages → Custom domain**, enter `links.theklabristol.co.uk`, then tick **Enforce HTTPS** once it's available.
   - If you use a different domain, change `site/CNAME` and add a repository variable `SITE_DOMAIN` under **Settings → Secrets and variables → Actions → Variables**.

## Editing

| What | Where |
|---|---|
| About text, socials, link buttons | `site/index.html` (look for `EDIT ME`) |
| Getting to Thekla / Accessibility pop-ups | `site/index.html`, the `<dialog>` blocks under `EDIT ME: pop-up sheets` |
| Hero photo | Add `site/assets/hero.jpg` (landscape, ~1600px wide). Until then the Action uses the photo from the Thekla site. |
| Logo | Add `site/assets/logo.jpg` (square). Until then the Action uses Thekla's Fatsoma logo. |
| Colours and fonts | Top of `site/styles.css` (`--gig` brass, `--club` pink) |
| How far ahead / how many in Coming Up | `DAYS_AHEAD` in the workflow; `COMING_UP_MAX` in `site/app.js` |

Any push to `main` redeploys straight away.

## Running locally

```bash
npm install
npm test                 # parser tests against saved example pages
npm run collect          # real run: fetches live data into site/events.json
npm run serve            # open the site at http://localhost:3000
npm run collect:offline  # fake network, for working on the code without hitting the sites
```

## Notes

- Scheduled Actions can run a few minutes late when GitHub is busy. That's fine for listings.
- GitHub pauses schedules after 60 days without repo activity. The workflow re-enables itself on each run to prevent this.
- The collector makes roughly 60 requests per run, spaced 4 at a time.
