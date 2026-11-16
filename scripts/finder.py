#!/usr/bin/env python3
"""Build a searchable, provenance-labelled index of publicly listed iOS certificate ZIPs.

An advertised ZIP is never classified as signed or as a verified P12/profile pair.
No third-party secrets or private uploads are handled.
"""
import hashlib
import html
import json
import re
from datetime import datetime, timezone
from pathlib import PurePosixPath
from urllib.parse import urljoin, urlparse, unquote
from urllib.request import Request, urlopen

SIGNHUB = "https://www.signhub.pro/"
LOYAH_RELEASES = "https://api.github.com/repos/loyahdev/certificates/releases?per_page=100"
HEADERS = {"User-Agent": "ERI-Cert-Check-Finder/1.0", "Accept": "application/json,text/html"}
FALLBACK_SIGNHUB = (
    "https://www.signhub.pro/Public/freecerts/%5B2026.06.18%5DVIETNAMAIRLINES.zip",
    "https://www.signhub.pro/Public/freecerts/%5B2026.06.16%5DTelecomCorporationLimited.zip",
    "https://www.signhub.pro/Public/freecerts/%5B2026.05.07%5DAramcoServicesCompany.zip",
)


def get_text(url, timeout=10):
    with urlopen(Request(url, headers=HEADERS), timeout=timeout) as response:
        if response.status != 200:
            raise ValueError("HTTP " + str(response.status))
        return response.read(1_700_000).decode("utf-8", "replace")


def parse_time(value):
    if not isinstance(value, str) or not value.strip():
        return None
    try:
        return datetime.fromisoformat(value.strip().replace("Z", "+00:00")).replace(
            tzinfo=timezone.utc
        ) if datetime.fromisoformat(value.strip().replace("Z", "+00:00")).tzinfo is None else datetime.fromisoformat(
            value.strip().replace("Z", "+00:00")
        ).astimezone(timezone.utc)
    except (ValueError, OverflowError):
        return None


def candidate(name, source, url, landing_page, now):
    parsed = urlparse(url)
    if parsed.scheme != "https" or parsed.hostname not in ("www.signhub.pro", "github.com"):
        return None
    if not parsed.path.lower().endswith(".zip"):
        return None
    label = html.unescape(str(name)).strip()[:180]
    if not label:
        return None
    return {
        "id": hashlib.sha256(url.encode("utf-8")).hexdigest()[:16],
        "name": label,
        "source": source,
        "format": "zip",
        "status": "unverified",
        "filesConfirmed": False,
        "downloadUrl": url,
        "sourceUrl": landing_page,
        "checkedAt": now.isoformat().replace("+00:00", "Z"),
        "note": "Có liên kết gói ZIP; chưa xác minh bên trong đủ P12 + mobileprovision hoặc được Apple chấp nhận.",
    }


def signhub_packages(now):
    entries = []
    html_text = get_text(SIGNHUB)
    # Accept relative links and URL-encoded brackets, but only the official SignHub ZIP directory.
    for url_part in re.findall(r'href\s*=\s*["\x27]([^"\x27>]*?\.zip(?:\?[^"\x27>]*)?)["\x27]', html_text, re.I):
        url = urljoin(SIGNHUB, html.unescape(url_part))
        parsed = urlparse(url)
        if parsed.hostname != "www.signhub.pro" or not parsed.path.startswith("/Public/freecerts/"):
            continue
        title = unquote(PurePosixPath(parsed.path).name)
        rec = candidate(title, "SignHub", url, SIGNHUB, now)
        if rec:
            entries.append(rec)

    # These exact public ZIP paths were previously visible on the official source site.
    # When HTML omits their hrefs, keep as unverified historical links (not usable certificates).
    if not entries:
        for url in FALLBACK_SIGNHUB:
            title = unquote(PurePosixPath(urlparse(url).path).name)
            rec = candidate(title, "SignHub", url, SIGNHUB, now)
            if rec:
                rec["note"] = "Gói ZIP từng được nguồn công bố; chưa xác minh nội dung, tải được hay tình trạng thu hồi hiện tại."
                entries.append(rec)
    return entries


def loyah_packages(now):
    releases = json.loads(get_text(LOYAH_RELEASES))
    if not isinstance(releases, list):
        return []
    entries = []
    for rel in releases:
        if not isinstance(rel, dict):
            continue
        body = str(rel.get("body") or "")
        revoked = re.search(r"\bRevoked:\s*(true|false)\b", body, re.I)
        valid = re.search(r"\bValid Until:\s*([0-9:\- ]+)", body, re.I)
        # Missing/old/revoked metadata is not a usable candidate.
        if not revoked or revoked.group(1).lower() != "false" or not valid:
            continue
        until = parse_time(valid.group(1))
        if until is None or until <= now:
            continue
        for asset in rel.get("assets") or []:
            if not isinstance(asset, dict):
                continue
            url = asset.get("browser_download_url") or ""
            rec = candidate(rel.get("name") or asset.get("name"), "Loyahdev", url, rel.get("html_url") or "https://github.com/loyahdev/certificates/releases", now)
            if rec:
                rec["note"] = "Metadata bản phát hành ghi chưa thu hồi và còn hạn; vẫn cần xác minh lại hiện tại và kiểm tra P12."
                entries.append(rec)
    return entries


def discover_packages(now=None):
    now = now or datetime.now(timezone.utc)
    records = []
    for fn in (signhub_packages, loyah_packages):
        try:
            records.extend(fn(now))
        except Exception as exc:
            print("Candidate discovery failed:", fn.__name__, type(exc).__name__, str(exc)[:150])
    out, seen = [], set()
    for item in records:
        if item["id"] not in seen:
            seen.add(item["id"])
            out.append(item)
    return out[:80]
