#!/usr/bin/env python3
"""Publish a simple, sourced two-status ZIP catalog for ERI CERT CHECK.

Tab A: source-reported SIGNED, valid dates, and P12-backed collection.
Tab B: source-reported REVOKED or expired P12-backed collection.
The generated ZIP URLs point to the upstream provider and are not falsely
represented as Apple-confirmed or guaranteed-to-download assets.
"""
import json
import os
import re
import time
from datetime import datetime, timezone
from email.utils import parsedate_to_datetime
from pathlib import Path
from urllib.request import Request, urlopen

ROOT = Path(__file__).resolve().parents[1]
OUTPUT = ROOT / "site" / "data" / "certs.json"
BASE = "https://sideloading.net/api/certificates/"
DOWNLOAD = BASE + "download/"
UA = {"User-Agent": "ERI-Cert-Check/2.0", "Accept": "application/json"}


def fetch_list(route):
    last_error = None
    for attempt in range(3):
        try:
            with urlopen(Request(BASE + "list/" + route, headers=UA), timeout=18) as response:
                data = json.load(response)
            if isinstance(data, dict):
                data = data.get("certificates", data.get("data"))
            if not isinstance(data, list):
                raise ValueError("Invalid certificate API response: " + route)
            return data
        except Exception as error:
            last_error = error
            if attempt < 2:
                time.sleep(attempt + 1)
    raise RuntimeError(f"Could not read {route} certificate list: {last_error}")


def date_utc(raw):
    if not isinstance(raw, str) or not raw.strip():
        return None
    try:
        parsed = parsedate_to_datetime(raw)
    except (TypeError, ValueError, IndexError, OverflowError):
        try:
            parsed = datetime.fromisoformat(raw.replace("Z", "+00:00"))
        except (ValueError, OverflowError):
            return None
    if parsed.tzinfo is None:
        parsed = parsed.replace(tzinfo=timezone.utc)
    return parsed.astimezone(timezone.utc)


def iso(date):
    return date.isoformat().replace("+00:00", "Z") if date else None


def clean_name(obj):
    return str(obj.get("name") or obj.get("nickname") or "").strip()[:240]


def normalize(obj, now, p12_missing):
    if not isinstance(obj, dict):
        return None
    try:
        ident = int(obj["id"])
        if not (0 < ident < 1_000_000_000):
            return None
    except (KeyError, TypeError, ValueError):
        return None

    name = clean_name(obj)
    if not name or name.casefold() in p12_missing:
        return None
    if obj.get("hasP12") is False or obj.get("has_p12") is False:
        return None

    status_text = str(obj.get("status") or "").strip()
    start = date_utc(obj.get("valid_from", obj.get("validFrom")))
    end = date_utc(obj.get("valid_to", obj.get("validTo")))
    revoked = bool(re.search(r"revoked|❌", status_text, re.I))
    expired = bool(re.search(r"expired", status_text, re.I))
    signed = bool(re.search(r"\b(signed|active)\b|✅", status_text, re.I))

    # Revoked stays revoked even if its calendar expiry is in the future.
    if revoked:
        category = "revoked"
    elif expired or (end is not None and end <= now):
        category = "expired"
    elif signed and start is not None and end is not None and start <= now < end:
        category = "signed"
    else:
        return None

    return {
        "id": ident,
        "name": name,
        "status": category,
        "validFrom": iso(start),
        "validTo": iso(end),
        "hasP12": True,
        "source": "NexSideloading",
        "zipUrl": f"{DOWNLOAD}{ident}/cert.zip",
    }


def main():
    now = datetime.now(timezone.utc)
    # 'all' is the publicly listed P12-backed collection.
    full_p12 = fetch_list("all")
    missing = fetch_list("missingP12")
    missing_names = {clean_name(x).casefold() for x in missing if isinstance(x, dict) and clean_name(x)}

    signed = []
    unavailable = []
    seen = set()
    for item in full_p12:
        cert = normalize(item, now, missing_names)
        if not cert:
            continue
        key = (cert["id"], cert["name"].casefold())
        if key in seen:
            continue
        seen.add(key)
        if cert["status"] == "signed":
            signed.append(cert)
        else:
            unavailable.append(cert)
    signed.sort(key=lambda x: x["validTo"] or "", reverse=True)
    unavailable.sort(key=lambda x: x["validTo"] or "", reverse=True)

    payload = {
        "version": 2,
        "source": "NexSideloading public certificate API",
        "sourceUrl": "https://sideloading.net/certificates/",
        "fetchedAt": iso(now),
        "summary": {
            "active": len(signed),
            "revokedOrExpired": len(unavailable),
        },
        "certificates": signed,
        "revokedCertificates": unavailable,
        "notice": (
            "SIGNED is a third-party status, not direct Apple verification. "
            "Revoked or expired certificates cannot repair iOS installation integrity errors. "
            "ZIP links are supplied by an external website and may become unavailable."
        ),
    }
    OUTPUT.parent.mkdir(parents=True, exist_ok=True)
    temp = OUTPUT.with_suffix(".tmp")
    temp.write_text(json.dumps(payload, ensure_ascii=False, separators=(",", ":")), encoding="utf-8")
    os.replace(temp, OUTPUT)
    print(f"ERI CERT CHECK: active={len(signed)}, revoked/expired={len(unavailable)}")


if __name__ == "__main__":
    main()
