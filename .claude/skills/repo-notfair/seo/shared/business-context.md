# SEO Business Context

Business context captures stable facts about a business that don't change run-to-run — name, goals, competitors, audience, brand terms. Caching these avoids repeating the same questions on every audit and lets the analysis skip generic observations in favor of recommendations grounded in what this specific business is trying to do.

This is shared logic. Any SEO skill can reference it. The invoking skill controls when it runs. Assumes `preamble.md` has already run (GSC auth and `$SKILL_SCRIPTS` are set). Requires `$TARGET_URL` from Step 0.

---

## Cache location

```bash
DOMAIN=$(python3 -c "import sys; from urllib.parse import urlparse; print(urlparse(sys.argv[1]).netloc.lstrip('www.'))" "$TARGET_URL")
BC_FILE="$HOME/.toprank/business-context/$DOMAIN.json"
```

---

## Loading

Check whether a fresh cache exists and emit a status tag the invoking skill can branch on:

```bash
mkdir -p "$HOME/.toprank/business-context"
if [ -f "$BC_FILE" ]; then
  AGE_DAYS=$(python3 -c "
import json, sys
from datetime import datetime, timezone
data = json.load(open(sys.argv[1]))
gen = datetime.fromisoformat(data.get('generated_at', '1970-01-01T00:00:00+00:00'))
print((datetime.now(timezone.utc) - gen.astimezone(timezone.utc)).days)
" "$BC_FILE")
  cat "$BC_FILE"
  [ "$AGE_DAYS" -lt 90 ] && echo "CACHE_STATUS=fresh_loaded" || echo "CACHE_STATUS=stale"
else
  echo "CACHE_STATUS=not_found"
fi
```

**`CACHE_STATUS=fresh_loaded`**: profile is current. Extract `brand_terms` as a comma-joined string → `$BC_BRAND_TERMS`. Tell the user:
> "Using cached business profile for **$DOMAIN** (saved $AGE_DAYS days ago) — say *'refresh business context'* to update it."

Skip the brand-terms question in Phase 2.

**`CACHE_STATUS=stale`**: cache exists but is over 90 days old. Load the stale data as a pre-fill for questions in Generation below. Tell the user:
> "Your business profile for **$DOMAIN** is over 90 days old — I'll refresh it after collecting your GSC data."

**`CACHE_STATUS=not_found`**: no cache. Proceed to Generation after Phase 3.

---

## Generation (after Phase 3 GSC data is available)

At this point you have GSC data and homepage content. Infer as much as possible first so questions are as few as possible.

### Step 1 — Infer from data you already have

From GSC + homepage, extract:
- **Candidate brand terms**: queries that appear frequently but don't cluster with topical keywords
- **Key topics**: the top 5-8 query clusters by impression volume
- **Primary geographies**: the top 3-5 countries from the country split
- **Business type signals**: presence of `/pricing/`, `/checkout/`, `/shop/`, `/blog/`, `/locations/` in top page paths
- **Business summary clues**: the homepage `<title>` and `<meta description>`

### Step 2 — Ask minimal targeted questions

Ask the short base profile questions first. Questions 1 and 2 are optional — if the user skips them, fall back to your inferences from Step 1 (note this in the saved `notes` field).

> I'm building a business profile for **$DOMAIN** to make future audit recommendations more specific. Three quick questions — press Enter to skip any and I'll infer from your data:
>
> 1. **Business name and what you do** — one or two sentences. *(e.g., "Acme — project management software for remote engineering teams")*
> 2. **Primary goal of this website** — pick the closest or describe your own:
>    `lead generation` · `ecommerce` · `SaaS / subscription` · `local business` · `content / media` · `other`
> 3. **Main competitors** — 2–5 URLs or names *(optional)*

Then ask the business-impact profile questions when the operator needs to rank by value, not just traffic. Ask them as one compact checklist and let the user answer roughly; partial answers are better than no context:

> To rank SEO work by business impact instead of clicks, I also need these if you know them:
>
> 1. **Service value / margin ranking** — e.g. emergency service > recurring service > one-time consultation.
> 2. **Priority customers** — local buyers, high-margin segments, urgent-need customers, recurring customers, enterprise accounts, etc.
> 3. **Location priorities / capacity** — priority markets, service areas, or regions; note any capacity constraints.
> 4. **Conversion events** — form starts, completed purchases/bookings, calls, quote requests, CRM events, GA4 events.
> 5. **Booking-intent hierarchy** — e.g. `emergency service near me` > `service in city` > `service cost`.
> 6. **Local proof points** — hours, certifications, response time, warranty, reviews, local coverage, pickup/dropoff flexibility.
> 7. **Transactional vs informational pages** — which pages are meant to book customers vs support research.

If `CACHE_STATUS=stale`, pre-fill the question with the cached values so the user can confirm or correct rather than re-enter from scratch.

Wait for the user's response before continuing.

### Step 3 — Synthesize and save

Normalize `primary_goal` to a consistent machine-readable form before saving:
```python
# e.g., "SaaS / subscription" → "saas_subscription", "lead generation" → "lead_generation"
raw_goal = user_answer_2.lower().strip()
primary_goal = raw_goal.replace(' / ', '_').replace('/', '_').replace(' ', '_') or "unknown"
```

Then write to cache:

```python
import json, os
from datetime import datetime, timezone

# --- fill from user answers + inferred data ---
domain           = "$DOMAIN"
target_url       = "$TARGET_URL"
business_name    = "<user answer 1, or inferred from homepage title>"
business_summary = "<1-2 sentence distillation>"
industry         = "<inferred from homepage + GSC topics>"
primary_goal     = "<normalized from user answer 2, or inferred from URL structure>"
target_audience  = "<inferred from GSC query patterns + homepage copy>"
target_locations = ["<top countries from GSC country split>"]
brand_terms      = ["<name variations from user answer 1 + GSC brand signal queries>"]
competitors      = ["<from user answer 3, or []>"]
key_topics       = ["<top 5-8 query clusters from GSC>"]
service_value_weights = {"<service>": "<relative value/margin/priority>"}
target_customer_priority = {
    "primary": ["<highest-value customer segments>"],
    "deprioritized": ["<segments that should not drive SEO prioritization>"],
}
location_priorities = {"<location>": {"priority": "high|medium|low", "notes": "<capacity/margin/strategic context>"}}
conversion_events = ["<events that indicate organic business value>"]
booking_intent_hierarchy = {
    "highest_priority": ["<highest-intent query patterns>"],
    "supporting_only": ["<research/support queries that need routing, not direct CTR optimization>"],
}
local_proof_points = ["<differentiators to use in snippets/content>"]
serp_competitor_positioning = {"<priority query>": ["<competitors or SERP features to beat>"]}
page_role_map = {"<url or path>": "transactional|informational|supporting|unknown"}
notes            = "<note if answers were inferred rather than user-provided>"
# ---------------------------------------------

data = {
    "domain":           domain,
    "target_url":       target_url,
    "generated_at":     datetime.now(timezone.utc).isoformat(),
    "business_name":    business_name,
    "business_summary": business_summary,
    "industry":         industry,
    "primary_goal":     primary_goal,
    "target_audience":  target_audience,
    "target_locations": target_locations,
    "brand_terms":      brand_terms,
    "competitors":      competitors,
    "key_topics":       key_topics,
    "service_value_weights": service_value_weights,
    "target_customer_priority": target_customer_priority,
    "location_priorities": location_priorities,
    "conversion_events": conversion_events,
    "booking_intent_hierarchy": booking_intent_hierarchy,
    "local_proof_points": local_proof_points,
    "serp_competitor_positioning": serp_competitor_positioning,
    "page_role_map": page_role_map,
    "notes":            notes,
}

bc_file = os.path.expanduser(f"~/.toprank/business-context/{domain}.json")
os.makedirs(os.path.dirname(bc_file), exist_ok=True)
with open(bc_file, "w") as f:
    json.dump(data, f, indent=2)
print(f"Business context saved to {bc_file}")
```

Output `CACHE_STATUS=fresh_loaded` after saving so downstream phases know context is ready.

Confirm to the user: "Business profile saved for **$DOMAIN** — I'll use this automatically in all future SEO audits."

### Compatibility examples

Preferred schema with explicit prioritization:

```json
{
  "target_customer_priority": {
    "primary": ["local buyers", "urgent-need customers"],
    "deprioritized": ["national informational readers outside service area"]
  },
  "booking_intent_hierarchy": {
    "highest_priority": ["emergency roof repair near me", "roof repair company"],
    "supporting_only": ["how much does roof repair cost", "roof repair price guide"]
  },
  "page_role_map": {
    "/roof-repair": "transactional local landing page",
    "/blog/roof-repair-cost": "supporting informational page"
  }
}
```

Legacy list schema remains accepted, but list values are treated as positive/ordered priorities only:

```json
{
  "target_customer_priority": ["local buyers", "recurring customers"],
  "booking_intent_hierarchy": ["roof repair near me", "roof repair cost"],
  "page_role_map": [
    {"path": "/roof-repair", "role": "transactional local landing page"},
    {"path": "/blog/roof-repair-cost", "role": "supporting informational page"}
  ]
}
```

---

## Using business context in analysis

Once loaded or generated, these values inform every phase that follows:

| Field | Use |
|-------|-----|
| `brand_terms` | Pass to `analyze_gsc.py --brand-terms`; skip the Phase 2 brand-terms question |
| `competitors` | Drive Phase 4.5 keyword gap analysis — compare their rankings to yours |
| `primary_goal` | Focus Phase 6 recommendations — `lead_generation` → landing pages; `ecommerce` → product/category pages; `content_media` → topical authority and freshness |
| `target_audience` | Cross-reference with Phase 3.7 personas — flag tension if personas don't match the stated audience |
| `key_topics` | Anchor content gap recommendations to confirmed topics, not speculative ones |
| `business_summary` | Open Phase 6 report with a one-liner so all recommendations read as contextual, not generic |
| `service_value_weights` | Convert SEO opportunity into business-impact priority instead of click priority |
| `target_customer_priority` | Penalize low-value segments and promote strategic customer journeys. Preferred shape: `{primary: [...], deprioritized: [...]}`; legacy list shape is treated as priority-only, never as deprioritized. |
| `location_priorities` | Avoid pushing demand to locations that are capacity-constrained or lower priority |
| `conversion_events` | Define what success means after a proposed SEO action is approved |
| `booking_intent_hierarchy` | Score query opportunities by booking likelihood, not just impression volume. Preferred shape: `{highest_priority: [...], supporting_only: [...]}`; legacy list shape is interpreted in order with likely research terms treated as supporting. |
| `local_proof_points` | Ground titles/snippets/content packaging in real differentiators |
| `serp_competitor_positioning` | Decide whether CTR gaps are metadata, SERP feature, competitor, or zero-click problems |
| `page_role_map` | Avoid treating informational blog pages like transactional landing pages |

---

## Refreshing

If the user says "refresh business context", "update my business profile", or similar:

```bash
rm -f "$BC_FILE"
```

Then re-run Generation. No need to re-run any other phase.

---

## No-GSC fallback

If GSC was unavailable and the audit is technical-only (Phase 5):

- Skip Step 1 (no GSC data to infer from)
- Still ask the three questions in Step 2
- Infer what you can from homepage content alone
- Save the cache with `"notes": "Generated without GSC data — re-run with GSC access for better accuracy"`

---

## Schema reference

```json
{
  "domain":           "example.com",
  "target_url":       "https://example.com",
  "generated_at":     "2026-04-07T12:00:00+00:00",
  "business_name":    "Acme Corp",
  "business_summary": "Project management software for remote engineering teams.",
  "industry":         "SaaS / Developer Tools",
  "primary_goal":     "lead_generation",
  "target_audience":  "Engineering managers at companies with 20-500 employees",
  "target_locations": ["US", "UK", "CA"],
  "brand_terms":      ["Acme", "AcmeCorp", "acme.io"],
  "competitors":      ["linear.app", "asana.com", "monday.com"],
  "key_topics":       ["project management", "sprint planning", "engineering velocity"],
  "notes":            ""
}
```
