import pytest

from app.agents.job_fetcher import format_salary
from app.agents.text import detect_country, detect_experience_level, strip_html
from app.services.llm import parse_json


def test_strip_html_decodes_escaped_greenhouse_content():
    # Greenhouse returns HTML with its tags entity-escaped.
    raw = "&lt;p&gt;&lt;strong&gt;About&lt;/strong&gt; us &amp;amp; you&lt;/p&gt;&lt;ul&gt;&lt;li&gt;Python&lt;/li&gt;&lt;li&gt;SQL&lt;/li&gt;&lt;/ul&gt;"
    text = strip_html(raw)
    assert "<" not in text and "&lt;" not in text
    assert text.startswith("About us & you")
    assert "• Python" in text and "• SQL" in text


def test_strip_html_drops_scripts_and_truncated_tags():
    assert strip_html("<p>Hi</p><script>alert(1)</script><a href='x") == "Hi"


def test_strip_html_empty():
    assert strip_html(None) == "" and strip_html("") == ""


@pytest.mark.parametrize("location,country", [
    ("Bengaluru, Karnataka", "India"),
    ("Indianapolis, IN", "United States"),   # was India (substring "india")
    ("Lausanne, Switzerland", "Unknown"),     # was United States (substring "usa")
    ("Remote - US", "United States"),         # was Worldwide
    ("Remote - Austin, TX", "United States"),
    ("San Francisco, CA", "United States"),
    ("London, UK", "United Kingdom"),
    ("Remote", "Worldwide"),
    ("EMEA", "Europe"),
    ("", "Unknown"),
])
def test_detect_country(location, country):
    assert detect_country(location) == country


@pytest.mark.parametrize("title,level", [
    ("Staff Software Engineer", "lead"),
    ("Sr. Backend Engineer", "senior"),
    ("Software Engineer I", "entry"),
    ("Software Engineer III", "senior"),
    ("Software Engineer", "mid"),
])
def test_experience_level(title, level):
    assert detect_experience_level(title) == level


def test_salary_uses_country_currency():
    assert format_salary(600000, 900000, "IN") == "₹600k - ₹900k"
    assert format_salary(50000, None, "GB") == "£50k"
    assert format_salary(None, None, "US") is None


def test_parse_json_tolerates_fences_and_prose():
    assert parse_json('```json\n{"score": 80}\n```') == {"score": 80}
    assert parse_json('Here you go: [{"q": 1}] thanks') == [{"q": 1}]
    assert parse_json("no json here") is None
