"""The newest calendar day that has begun anywhere on Earth.

People record the day they checked something in their own calendar. While CI's
clock (UTC) still shows the 21st, it is already the 22nd in Türkiye, so a check
made that evening must not count as "in the future". A day is in the future only
when no time zone has reached it yet; UTC+14 is the first to start each day.
"""
from __future__ import annotations

from datetime import date, datetime, timedelta, timezone

EARLIEST_ZONE = timedelta(hours=14)


def newest_day(now: datetime | None = None) -> date:
    return ((now or datetime.now(timezone.utc)).astimezone(timezone.utc) + EARLIEST_ZONE).date()
