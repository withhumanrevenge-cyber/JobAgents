"""Normalisation helpers shared by the job sources."""

import html
import re

_BLOCK_BREAKS = re.compile(r"<br\s*/?>|</p>|</div>|</h[1-6]>|</li>|</ul>|</ol>", re.IGNORECASE)
_LIST_ITEM = re.compile(r"<li[^>]*>", re.IGNORECASE)
_SCRIPT_STYLE = re.compile(r"<(script|style)\b[\s\S]*?</\1>", re.IGNORECASE)
_TAG = re.compile(r"<[^>]+>")


def strip_html(raw: str | None) -> str:
    """HTML (possibly entity-escaped, possibly twice, as Greenhouse sends it) to plain text that
    keeps paragraph and list breaks."""
    if not raw:
        return ""
    text = raw
    for _ in range(3):  # Greenhouse double-encodes; three passes covers it without looping forever
        decoded = html.unescape(text)
        if decoded == text:
            break
        text = decoded
    text = _SCRIPT_STYLE.sub(" ", text)
    text = _BLOCK_BREAKS.sub("\n", text)
    text = _LIST_ITEM.sub("\n• ", text)
    text = _TAG.sub(" ", text)
    text = re.sub(r"<[^>]*$", "", text)  # a tag cut off by truncation
    text = text.replace("\xa0", " ")
    text = re.sub(r"[ \t\r\f\v]+", " ", text)
    text = re.sub(r" *\n *", "\n", text)
    text = re.sub(r"\n{3,}", "\n\n", text)
    return text.strip()


US_STATES = {
    "AL", "AK", "AZ", "AR", "CA", "CO", "CT", "DE", "FL", "GA", "HI", "ID", "IL", "IN", "IA",
    "KS", "KY", "LA", "ME", "MD", "MA", "MI", "MN", "MS", "MO", "MT", "NE", "NV", "NH", "NJ",
    "NM", "NY", "NC", "ND", "OH", "OK", "OR", "PA", "RI", "SC", "SD", "TN", "TX", "UT", "VT",
    "VA", "WA", "WV", "WI", "WY", "DC",
}


def _words(*terms: str) -> re.Pattern[str]:
    # Whole-word match, so "indianapolis" isn't India and "lausanne" isn't the USA.
    return re.compile(r"(?<![\w])(?:" + "|".join(re.escape(t) for t in terms) + r")(?![\w])")


# Checked in order; the first match wins.
_COUNTRY_RULES: list[tuple[str, re.Pattern[str]]] = [
    ("India", _words(
        "india", "bangalore", "bengaluru", "hyderabad", "chennai", "mumbai", "pune", "gurgaon",
        "gurugram", "noida", "delhi", "new delhi", "kolkata", "ahmedabad", "kochi", "cochin",
        "jaipur", "chandigarh", "indore", "trivandrum", "thiruvananthapuram",
    )),
    ("United States", _words("united states", "usa", "u.s.", "u.s.a.", "us")),
    ("United Kingdom", _words(
        "united kingdom", "uk", "england", "scotland", "london", "manchester", "edinburgh",
        "birmingham", "bristol", "leeds", "glasgow",
    )),
    ("Canada", _words("canada", "toronto", "vancouver", "montreal", "ottawa", "calgary", "edmonton")),
    ("Germany", _words("germany", "deutschland", "berlin", "munich", "münchen", "hamburg", "frankfurt", "cologne", "köln")),
    ("France", _words("france", "paris")),
    ("Australia", _words("australia", "sydney", "melbourne", "brisbane", "perth", "adelaide")),
    ("Singapore", _words("singapore")),
    ("Ireland", _words("ireland", "dublin")),
    ("Netherlands", _words("netherlands", "amsterdam")),
    ("Spain", _words("spain", "madrid", "barcelona")),
    ("Brazil", _words("brazil", "brasil", "são paulo", "sao paulo")),
    ("Mexico", _words("mexico", "méxico")),
    ("Japan", _words("japan", "tokyo")),
]
_WORLDWIDE = _words("worldwide", "anywhere", "global", "remote")
_EUROPE = _words("europe", "emea")


def detect_country(location: str | None) -> str:
    if not location:
        return "Unknown"
    loc = location.lower()
    for country, pattern in _COUNTRY_RULES:
        if pattern.search(loc):
            return country
    # "City, ST" with a US state code. Checked before the remote rule so "Remote - Austin, TX"
    # stays in the US.
    tail = location.split(",")[-1].strip().upper()
    if tail in US_STATES:
        return "United States"
    if _EUROPE.search(loc):
        return "Europe"
    if _WORLDWIDE.search(loc):
        return "Worldwide"
    return "Unknown"


def detect_job_type(location: str | None, description: str | None, remote_flag: bool = False) -> str:
    haystack = f"{location or ''} {(description or '')[:500]}".lower()
    if "hybrid" in haystack:
        return "hybrid"
    if remote_flag or any(w in haystack for w in ("remote", "worldwide", "anywhere", "work from home")):
        return "remote"
    if any(w in haystack for w in ("on-site", "onsite", "in-office", "in office")):
        return "onsite"
    return "unknown"


_LEAD = re.compile(r"\b(staff|principal|architect|distinguished|director|vp|head of|tech lead|engineering manager|founding)\b")
_SENIOR = re.compile(r"\b(senior|sr\.?)(?!\w)")
_ENTRY = re.compile(r"\b(junior|jr\.?|entry[- ]?level|intern|internship|associate|graduate|new grad)(?!\w)")


def detect_experience_level(title: str | None) -> str:
    t = (title or "").lower()
    if _LEAD.search(t):
        return "lead"
    if _SENIOR.search(t):
        return "senior"
    if _ENTRY.search(t) or re.search(r"\bengineer\s+i\b", t):
        return "entry"
    if re.search(r"\bengineer\s+(iii|iv)\b", t):
        return "senior"
    return "mid"
