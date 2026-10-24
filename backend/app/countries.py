"""Countries we search. Mirrors lib/countries.ts (the frontend's picker)."""

COUNTRIES: list[tuple[str, str]] = [
    ("US", "United States"),
    ("IN", "India"),
    ("GB", "United Kingdom"),
    ("CA", "Canada"),
    ("AU", "Australia"),
    ("DE", "Germany"),
    ("FR", "France"),
    ("NL", "Netherlands"),
    ("SG", "Singapore"),
    ("ES", "Spain"),
    ("IT", "Italy"),
    ("BR", "Brazil"),
    ("MX", "Mexico"),
    ("NZ", "New Zealand"),
    ("PL", "Poland"),
    ("ZA", "South Africa"),
    ("CH", "Switzerland"),
    ("BE", "Belgium"),
    ("AT", "Austria"),
]

COUNTRY_NAME: dict[str, str] = dict(COUNTRIES)
DEFAULT_COUNTRY = "US"
ADZUNA_SUPPORTED = set(COUNTRY_NAME)

# ISO 4217 currency for Adzuna salaries, which are reported in the searched country's currency.
COUNTRY_CURRENCY: dict[str, str] = {
    "US": "USD", "IN": "INR", "GB": "GBP", "CA": "CAD", "AU": "AUD", "DE": "EUR", "FR": "EUR",
    "NL": "EUR", "SG": "SGD", "ES": "EUR", "IT": "EUR", "BR": "BRL", "MX": "MXN", "NZ": "NZD",
    "PL": "PLN", "ZA": "ZAR", "CH": "CHF", "BE": "EUR", "AT": "EUR",
}
