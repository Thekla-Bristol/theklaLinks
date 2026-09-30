# Thekla Links

A link-in-bio page for Thekla that updates itself. It shows the hero photo, logo, about text and socials, then **This Week**: the next 7 days of gigs and club nights. Tapping an event opens its Alt Tickets or Fatsoma page. Below that are **Coming Up** and the usual link buttons.

Live at **https://links.theklabristol.co.uk** once set up. You can also share `…/#gigs` or `…/#clubs` to open the page with that filter already on, which is handy for Stories. `…/#getting-here`, `…/#accessibility` and `…/#lost-property` open those pop-ups directly, and each event's Share button gives a link that opens straight to that event.

## How it updates

A GitHub Action runs every 3 hours, plus extra runs in the early evening. Each run:

1. **Gigs** are read from Alt Tickets (`alttickets.com/venue/bristol/thekla`). Artwork and prices come from each event's page.
2. **Club nights** are read from Thekla's Fatsoma page (`fatsoma.com/p/thekla`). Details come from Fatsoma's public API.
3. **External promoters** are read from Skiddle's official API (optional, see below). A Skiddle event is only added if it isn't already on Alt Tickets or Fatsoma. Those always win, but they can borrow the Skiddle description or artwork if they have none. It counts as a duplicate if it's on the same night and either the name matches or it's the same kind of event starting within 90 minutes.
4. **Backup** listings are read from `theklabristol.co.uk/live/` and `/club/`. These fill gaps and supply the Thekla event page for events with no ticket link (sold out, not on sale yet).
5. Everything is merged into `site/events.json`, duplicates are removed, and the site is republished to GitHub Pages.

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

### Turning on Skiddle listings

Skiddle only shares listings through its API, which needs a free key.

1. Request a key at https://www.skiddle.com/api/join.php.
2. In the repo, go to **Settings → Secrets and variables → Actions → New repository secret**. Name it `SKIDDLE_API_KEY` and paste the key.
3. Run the workflow. The collector finds Thekla's Skiddle venue on its own. If it ever picks the wrong one, add a repository **variable** `SKIDDLE_VENUE_ID`.

Until a key is added, Skiddle is skipped and everything else works as normal.

## Analytics and the weekly report

The page counts visits and taps with **its own small counter on Cloudflare's free plan** (`workers/counter`). It uses no cookies and stores no IP addresses: visitors are recognised by a one-way code that resets every Monday. No cookie banner is needed, and the data stays with Thekla.

Every Monday at 9am (UK time) a second workflow emails a report of the previous week to Phoebe and Harrison. It covers Monday to Sunday, counted from 6am to 6am so Sunday's late club night is included. The email also links to a **live "this week so far" page**.

**What the report covers, in the same order every week:** visitors, page views, ticket taps and events opened (each with the change on last week); each event's details opens and ticket taps; where visitors came from; every button and link that was clicked; and visits per day with the peak time. Anything with zero clicks is left out.

### 1. Cloudflare (about 10 minutes, free)

1. Sign up at https://dash.cloudflare.com (free plan). You don't need to move the domain to Cloudflare.
2. **Workers & Pages:** open it once and pick your free `workers.dev` subdomain when asked, e.g. `thekla`.
3. **Storage & Databases → D1 → Create database.** Name it exactly `thekla-links`. Copy its **Database ID**.
4. **My Profile → API Tokens → Create Token → "Edit Cloudflare Workers" template.** Add the permission **Account → D1 → Edit**, then create it and copy the token. Also copy your **Account ID** (on the Workers & Pages overview page).
5. Make up a long random password (32+ characters from a password generator). This is the `COUNTER_TOKEN` that keeps the stats private.
6. In GitHub, go to **Settings → Secrets and variables → Actions** and add:
   - Secret `CLOUDFLARE_API_TOKEN` = the API token
   - Secret `CLOUDFLARE_ACCOUNT_ID` = the Account ID
   - Secret `COUNTER_TOKEN` = the random password
   - Variable `D1_DATABASE_ID` = the Database ID
7. **Actions → Deploy visit counter → Run workflow.** At the end of the log it prints the counter's address, like `https://thekla-links-counter.thekla.workers.dev`.
8. Add that address as the variable `COUNTER_URL`, then run **Update events & deploy** once. The page starts counting straight away.

### 2. Microsoft 365 (about 10 minutes, needs a Microsoft 365 admin)

The report is sent through Microsoft Graph, the modern method. Microsoft is switching off the older password-based SMTP sending.

1. **Pick the sending mailbox**, for example `office@theklabristol.co.uk`. Better still, create a free shared mailbox such as `reports@theklabristol.co.uk`.
2. Go to **entra.microsoft.com → App registrations → New registration**. Name it `Thekla Links reports`, choose "Single tenant", then Register.
3. **API permissions → Add → Microsoft Graph → Application permissions → Mail.Send → Add**, then **Grant admin consent**.
4. **Certificates & secrets → New client secret** (24 months). Copy the **Value** straight away. Set a calendar reminder to renew it before it expires.
5. Recommended: limit the app so it can only send as that one mailbox. In Exchange Online, use an *application access policy* or *RBAC for Applications*.
6. In GitHub, add:
   - Secret `MS_TENANT_ID` = Directory (tenant) ID (on the app's Overview page)
   - Secret `MS_CLIENT_ID` = Application (client) ID
   - Secret `MS_CLIENT_SECRET` = the secret value
   - Variable `MS_SENDER` = the sending mailbox address
   - Variable `REPORT_TO` = recipients, comma-separated (optional; defaults to phoebe@ and harrison@)

### 3. Test it

Go to **Actions → Weekly analytics report → Run workflow**. Untick "Send" to just build it; the email is attached to the run as `weekly-report`. Leave it ticked to send now. You can also type your own address in "Send to" for a test.

### Tracking where people came from

Instagram's in-app browser usually hides where visitors came from. Tag each link you post, and the report lists them under "Tagged links":

- Instagram bio: `https://links.theklabristol.co.uk/?src=ig-bio`
- Stories: `…/?src=ig-story`
- Posters or QR codes: `…/?src=qr-poster`, `…/?src=qr-bar`, and so on

## Featured

Four big cards under This Week show the best events coming up **after this week and within the next 6 weeks**. They pick themselves:

- **2 gigs and 2 club nights**, scored separately so gigs only compete with gigs.
- **Gigs** score for "Few tickets left" (+3), being in Alt Tickets' "Recently announced" list (+3) and falling on a Friday or Saturday (+1).
- **Club nights** score for how many people are going on Fatsoma compared with the busiest club night (up to +4), being a one-off rather than a weekly regular (+2), and having a description (+0.5).
- Events must have artwork and must not be sold out. No weekly series appears twice.
- **Pins:** anything listed in `site/featured.txt` always takes a slot first, even beyond 6 weeks. Edit the file on GitHub and it applies at the next update, within 3 hours.

## Seasonal effects

Like Google's holiday doodles, the page decorates itself around key dates (UK time). Everything sits behind or around the listings, never over the buttons, and switches off for anyone with "reduce motion" on.

| Season | When | What appears |
|---|---|---|
| Halloween | 24 Oct – 1 Nov | Chain garland, cobwebs, dangling spider and skeleton, pumpkins, bats, witch hat on the logo |
| Bonfire Night | 3 – 6 Nov | Orange and red fireworks |
| Christmas | 1 – 30 Dec | Tinsel, hanging baubles, trees, snowfall, Santa hat |
| New Year | 31 Dec (from midday) – 1 Jan | Gold fireworks, confetti, party hat, a countdown on the day then "Happy New Year" |
| Valentine's | 10 – 14 Feb | Heart garland, rising hearts |
| Easter | Thursday before Easter – Easter Monday (worked out each year) | Pastel bunting and eggs, bunny ears, a bunny peeking in |
| Pride | All of June | Rainbow stripe, rainbow ring on the logo, light confetti |
| Harbour Festival | Friday–Sunday around the third Saturday of July | Bunting and boats bobbing on the harbour |

**Preview any season** on the live site: add `?season=halloween` to the address (or `christmas`, `nye`, `bonfire`, `valentines`, `easter`, `pride`, `harbour`). Use `?season=preview` for a drop-down switcher, or `?season=off` to see the page without effects.

**Change dates or switch one off:** edit the `SEASONS` list at the top of `site/seasons.js` (set `enabled: false`). If the Harbour Festival dates are announced and differ, change its line there.

## Editing

| What | Where |
|---|---|
| About text, socials, link buttons | `site/index.html` (look for `EDIT ME`) |
| Getting to Thekla / Accessibility / Lost property pop-ups | `site/index.html`, the `<dialog>` blocks under `EDIT ME: pop-up sheets` |
| Featured events | `site/featured.txt`: add a ticket link or part of an event name to pin it (see below) |
| FAQs pop-up | `site/index.html`, the `<dialog id="faq">` block |
| Hero photo | Add `site/assets/hero.jpg` (landscape, ~1600px wide). Until then the Action uses the photo from the Thekla site. |
| Logo | Add `site/assets/logo.jpg` (square). Until then the Action uses Thekla's Fatsoma logo. |
| Colours and fonts | Top of `site/styles.css` (`--gig` brass, `--club` pink) |
| How far ahead Coming Up goes | `DAYS_AHEAD` (default 300 days) in `scripts/collect.mjs` or the workflow |

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
