#!/usr/bin/env python3
"""Only publish source-reported SIGNED ESign certificates with P12 and a current validity window."""
import json
import os
import re
import time
from datetime import datetime, timezone
from email.utils import parsedate_to_datetime
from pathlib import Path
from urllib.request import Request, urlopen
from source_catalog import collect_sources

ROOT = Path(__file__).resolve().parents[1]
OUT = ROOT / 'site' / 'data' / 'certs.json'
API = 'https://sideloading.net/api/certificates/list/'


def get_list(name):
    error = None
    for attempt in range(3):
        try:
            request = Request(API + name, headers={
                'User-Agent': 'ERI-Cert-Check/1.2',
                'Accept': 'application/json'
            })
            with urlopen(request, timeout=18) as response:
                data = json.load(response)
            if isinstance(data, dict):
                data = data.get('certificates', data.get('data'))
            if not isinstance(data, list):
                raise ValueError('Unexpected API format for ' + name)
            return data
        except Exception as exc:
            error = exc
            time.sleep(2 * (attempt + 1))
    raise RuntimeError(f'Cannot fetch {name}: {error}')


def as_datetime(value):
    if not isinstance(value, str) or not value.strip():
        return None
    try:
        result = parsedate_to_datetime(value)
    except (TypeError, ValueError, IndexError, OverflowError):
        try:
            result = datetime.fromisoformat(value.replace('Z', '+00:00'))
        except ValueError:
            return None
    if result.tzinfo is None:
        result = result.replace(tzinfo=timezone.utc)
    return result.astimezone(timezone.utc)


def normalize(item, now):
    if not isinstance(item, dict):
        return None
    try:
        ident = int(item['id'])
        if not (1 <= ident <= 1_000_000_000):
            return None
    except (KeyError, ValueError, TypeError):
        return None

    raw = str(item.get('status', '')).strip()
    if not re.search(r'\b(signed|active)\b|✅', raw, re.I) or re.search(r'revoked|expired|❌', raw, re.I):
        return None

    valid_from = as_datetime(item.get('valid_from', item.get('validFrom')))
    valid_to = as_datetime(item.get('valid_to', item.get('validTo')))
    # Unknown dates are not enough to claim the certificate is usable now.
    if valid_from is None or valid_to is None or not (valid_from <= now < valid_to):
        return None

    # Do not treat an explicit missing-P12 marker as a complete signing bundle.
    if item.get('has_p12') is False or item.get('hasP12') is False:
        return None

    name = str(item.get('name') or item.get('nickname') or 'Không rõ tên').strip()[:240]
    url = 'https://sideloading.net/api/certificates/download/'
    return {
        'id': ident, 'key': f'all-{ident}', 'name': name,
        'nickname': str(item.get('nickname') or '')[:120],
        'status': 'signed',
        'validFrom': valid_from.isoformat().replace('+00:00', 'Z'),
        'validTo': valid_to.isoformat().replace('+00:00', 'Z'),
        'hasP12': True,
        'links': {
            'zip': f'{url}{ident}/cert.zip',
            'p12': f'{url}{ident}/cert.p12',
            'profile': f'{url}{ident}/cert.mobileprovision',
            'password': f'{url}{ident}/password.txt'
        }
    }


def main():
    now = datetime.now(timezone.utc)
    all_data = get_list('all')
    # Fail closed if the missing-P12 list cannot be checked.
    missing_data = get_list('missingP12')
    missing_names = set()
    for item in missing_data:
        if not isinstance(item, dict):
            continue
        name = str(item.get('name') or item.get('nickname') or '').strip().casefold()
        if name:
            missing_names.add(name)

    candidates = [cert for item in all_data if (cert := normalize(item, now))]
    certs = [
        cert for cert in candidates
        if cert['name'].casefold() not in missing_names
    ]
    certs.sort(key=lambda cert: cert['validFrom'], reverse=True)
    def is_signed(item):
        if not isinstance(item, dict):
            return False
        status = str(item.get('status') or '').strip()
        return bool(re.search(r'\b(signed|active)\b|✅', status, re.I)) and not bool(
            re.search(r'revoked|expired|❌', status, re.I)
        )

    signed_missing_p12 = sum(
        1 for item in missing_data
        if is_signed(item) and (end := as_datetime(item.get('valid_to', item.get('validTo'))))
        and end > now
    )
    unavailable_with_p12 = sum(
        1 for item in all_data
        if isinstance(item, dict) and (
            re.search(r'revoked|expired|❌', str(item.get('status') or ''), re.I)
            or (end := as_datetime(item.get('valid_to', item.get('validTo')))) is not None and end <= now
        )
    )
    additional_sources = collect_sources()
    sources = [{
        'name': 'NexSideloading',
        'url': 'https://sideloading.net/certificates/',
        'kind': 'public_api',
        'status': 'checked',
        'count': len(all_data) + len(missing_data),
        'signed': len(certs),
        'note': 'API Signed/Revoked và danh sách thiếu P12; chỉ nguồn đủ trường trạng thái + thời hạn + liên kết tệp mới có thể vào danh sách ký.',
        'checkedAt': now.isoformat().replace('+00:00','Z')
    }] + additional_sources
    payload = {
        'source': 'NexSideloading NexCerts',
        'sourceUrl': 'https://sideloading.net/api/',
        'fetchedAt': now.isoformat().replace('+00:00', 'Z'),
        'sourceUpdateNote': 'Dữ liệu nguồn công khai được đồng bộ định kỳ',
        'verificationNote': 'Chỉ lọc SIGNED, còn hạn và có danh mục P12 theo bên thứ ba; không xác minh trực tiếp với Apple hoặc kiểm thử cài IPA.',
        'summary': {
            'withP12Checked': len(all_data),
            'withP12RevokedOrExpired': unavailable_with_p12,
            'signedMissingP12': signed_missing_p12,
            'eligible': len(certs)
        },
        'sources': sources,
        'certificates': certs
    }
    OUT.parent.mkdir(parents=True, exist_ok=True)
    temp = OUT.with_suffix('.tmp')
    temp.write_text(json.dumps(payload, ensure_ascii=False, separators=(',', ':')), encoding='utf-8')
    os.replace(temp, OUT)
    print(f'Eligible: {len(certs)} of {len(all_data)} from NexSideloading')
    print('Source status:', ', '.join(s['name'] + '=' + s['status'] for s in sources))



if __name__ == '__main__':
    main()
