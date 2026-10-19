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
3. Go to **Actions → Update events & deploy → Run workflow**. This is the same workflow as everything else; there isn't a separate one for Skiddle. It uses Thekla's Skiddle venue (`skiddle.com/venues/1480`). To use a different venue, add a repository **variable** `SKIDDLE_VENUE_ID`.
4. In the run's log, open the **Collect events** step. It lists what Skiddle returned and which events were skipped as duplicates of Alt Tickets or Fatsoma listings.

Until a key is added, Skiddle is skipped and everything else works as normal.

## Analytics and the weekly report

The page counts visits and taps with **its own small counter on Cloudflare's free plan** (`workers/counter`). It uses no cookies and stores no IP addresses: visitors are recognised by a one-way code that resets every Monday. It needs no cookie consent, and the data stays with Thekla. (Google Analytics, below, is the only thing the cookie bar controls.)

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

### Google Analytics (G-VX16WT108K)

The Google tag is in `site/index.html` between `<!-- GA:start -->` and `<!-- GA:end -->`. Google Analytics sets cookies, so UK law needs the visitor's OK first. It runs in **Consent Mode**: until someone taps **Allow** on the cookie bar, Google gets only cookieless pings (which it uses to estimate totals). "Cookie settings" in the footer reopens the bar. The Umami and Cloudflare counters need no consent and count everyone.

Every ticket link carries tags, so a purchase on Fatsoma (which has the same Google tag) is credited to this page:

- `utm_source=thekla_links`, `utm_medium=referral`
- `utm_campaign` = the event (e.g. `2026-10-16-alabama-3-acoustic`)
- `utm_content` = where the tap came from: `this-week`, `coming-up` or `details`

Events sent to GA: `ticket_click`, `view_event`, `share` (with event title, date, type, ticket site and page section) and `page_click` for the other buttons.

**In GA4, once:**

1. **Admin → Data streams → (the stream) → Configure tag settings → Configure your domains.** Add `links.theklabristol.co.uk` and `fatsoma.com`. This keeps one visitor as one visitor across both sites.
2. **Admin → Events:** when Fatsoma's `purchase` event appears, mark it as a **key event**.
3. To see sales from this page: **Reports → Acquisition → Traffic acquisition**, filter *Session source = thekla_links*, and add *Session campaign* to see the event.

## Admin portal (links.theklabristol.co.uk/admin)

Staff can sign in and change the page without touching GitHub. Changes show on the page straight away.

- **Tonight:** add tonight’s times (doors, support, headliner, curfew or last entry) and mark tonight’s show sold out or last few in one tap. Times show under tonight’s listing and in the event details.
- **Events:** for any event: sold out, last few, cancelled, postponed, new date or moved (with a note); your own bio, title, support, image or ticket link; always or never feature it; or hide it. **Add event** puts on an event that isn’t on any ticket site.
- **Notice:** a banner at the top of the page (normal or urgent red), with an optional link and an end time.
- **Info pages:** edit the About line, Getting here, Accessibility, Lost property and FAQ text.
- **Admins:** add or remove admins. Harrison and Phoebe are owners and can’t be removed.
- **Activity:** whether each ticket site was read OK, a “Refresh listings now” button, and a log of who changed what.

**Logging in:** new admins go to `/admin`, tap **First time here? Set your password**, choose a password, then click the confirmation link that’s emailed to them. The email comes from `noreply@…firebaseapp.com`, so check junk. **Forgot password?** emails a reset link. Anyone can create a login, but only people on the admin list can see or change anything.

It runs on Firebase’s free plan (no card needed). The page reads one small document each time it loads. The free plan allows 50,000 a day. If that’s ever exceeded, the page carries on using the copy saved at the last update.

### Setting up Firebase (about 15 minutes, once)

1. Go to https://console.firebase.google.com and sign in with a Google account Thekla controls. Click **Create a project** and name it `thekla-links`. Google Analytics for the project isn’t needed, so you can switch it off.
2. **Build → Authentication → Get started → Sign-in method → Email/Password → Enable** (leave “Email link” off) **→ Save**.
3. **Authentication → Settings → Authorized domains → Add domain:** `links.theklabristol.co.uk`.
4. Optional: **Authentication → Templates**. Set the sender name to “Thekla” on the email-verification and password-reset emails.
5. **Build → Firestore Database → Create database.** If asked, choose **Standard edition** and leave the database ID as **(default)**. Choose location **europe-west2 (London)** and **production mode**.
6. In Firestore, open the **Rules** tab. Replace everything with the contents of `firestore.rules` from this repo, then click **Publish**.
7. **Project settings** (gear icon) **→ General → Your apps →** the web icon `</>`. Name it `Thekla Links`, leave Hosting unticked, and click **Register app**. You’ll see a `firebaseConfig` block.
8. In GitHub, edit `site/config.js`. Copy `apiKey`, `authDomain`, `projectId` and `appId` from that block into the matching lines, keeping the quotes. Also fill in `githubRepo` (e.g. `theklabristol/thekla-links`). Commit.
9. Wait about 2 minutes for the deploy, then go to `links.theklabristol.co.uk/admin` and set your password.

The Firebase values in `config.js` are meant to be public. What protects the data is `firestore.rules`. To change the owners, edit the list in **both** `site/config.js` and `firestore.rules`, then publish the rules again (step 6).

## Featured

Four big cards under This Week show the best events coming up **after this week and within the next 6 weeks**. They pick themselves:

- **2 gigs and 2 club nights**, scored separately so gigs only compete with gigs.
- **Gigs** score for "Few tickets left" (+3), being in Alt Tickets' "Recently announced" list (+3) and falling on a Friday or Saturday (+1).
- **Club nights** score for how many people are going on Fatsoma compared with the busiest club night (up to +4), being a one-off rather than a weekly regular (+2), and having a description (+0.5).
- Events must have artwork and must not be sold out. No weekly series appears twice.
- **Pins:** set **Always feature** on an event in the admin portal (applies straight away), or list it in `site/featured.txt` (applies at the next update). Pinned events take a slot first, even beyond 6 weeks. **Never feature** keeps an event out.

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

## Layout

- **Phones and tablets:** one column, in this order: about, socials, filter, This Week, Featured, Coming Up, link buttons.
- **Desktop (980px and wider):** a wide photo banner with the logo and title across the bottom-left. Below it, a sidebar holds the about text, socials and link buttons, and stays in place as you scroll. Featured shows 4 across, and Coming Up shows 2 columns on large screens.
- **Pop-up cards:** these slide up from the bottom on phones and open as centred panels on desktop.

## Reliability

- **Saved listings:** the page keeps the last listings it loaded on each visitor's device, so a dropped connection still shows events. It retries loading 3 times before giving up.
- **If listings can't be shown:** visitors are pointed to Alt Tickets and Fatsoma.
- **Events with no ticket link:** these open the Alt Tickets or Fatsoma venue page rather than the Thekla website.
- **Older phones:** pop-up cards still open on older phones that lack built-in pop-up support.
- **Search engines:** upcoming events are published in Google's event format, which can show them in search. `404.html` and `robots.txt` are included.

## Editing

| What | Where |
|---|---|
| About text, socials, link buttons | `site/index.html` (look for `EDIT ME`) |
| Getting to Thekla / Accessibility / Lost property pop-ups | `site/index.html`, the `<dialog>` blocks under `EDIT ME: pop-up sheets` |
| Featured events | `site/featured.txt`: add a ticket link or part of an event name to pin it (see below) |
| FAQs pop-up | `site/index.html`, the `<dialog id="faq">` block |
| Hero photo | **Recommended:** add your own `site/assets/hero.jpg` to the repo (landscape, 2000px wide or more). Without it, each update downloads the photo from the Thekla website, falling back to the last deployed copy. If neither works, a drawn ship silhouette shows instead of a blank space. |
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
