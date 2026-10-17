"""One-off: clean job descriptions stored as escaped HTML.

From 2026-10-03 the TypeScript scraper's entity decoding was a no-op, so Greenhouse jobs were
saved with their HTML still entity-escaped. Job upserts ignore duplicates, so those rows never
get rewritten by a normal sync. This rewrites them in place.

    python -m app.jobs.backfill_descriptions            # dry run: counts only
    python -m app.jobs.backfill_descriptions --apply
"""

import asyncio
import sys

from app.agents.text import strip_html
from app.db import get_db, select_all


async def main(apply: bool) -> None:
    db = await get_db()
    rows = await select_all(lambda: db.table("jobs").select("id, description")
                            .or_("description.like.*&lt;*,description.like.*&amp;*,description.like.*<*")
                            .order("id"))
    changed = [(r["id"], strip_html(r["description"])) for r in rows]
    changed = [(i, d) for (i, d), r in zip(changed, rows, strict=True) if d != r["description"]]
    print(f"{len(rows)} candidate rows, {len(changed)} need cleaning")
    if not apply:
        print("Dry run. Re-run with --apply to write.")
        return
    for n, (job_id, description) in enumerate(changed, 1):
        await db.table("jobs").update({"description": description}).eq("id", job_id).execute()
        if n % 200 == 0:
            print(f"  {n}/{len(changed)}")
    print("Done.")


if __name__ == "__main__":
    asyncio.run(main("--apply" in sys.argv))
