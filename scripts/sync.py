#!/usr/bin/env python3
"""Fetch public NexCerts entries for a static GitHub Pages site. No secrets."""
import json
import os
import re
import time
from datetime import datetime, timezone
from email.utils import parsedate_to_datetime
from pathlib import Path
from urllib.request import Request, urlopen

ROOT = Path(__file__).resolve().parents[1]
OUT = ROOT / 'site' / 'data' / 'certs.json'
API = 'https://sideloading.net/api/certificates/list/'


def get_list(name):
    error = None
    for attempt in range(3):
        try:
            req = Request(API + name, headers={'User-Agent': 'ERI-Cert-Check/1.1', 'Accept':'application/json'})
            with urlopen(req, timeout=18) as response:
                data = json.load(response)
            if isinstance(data, dict):
                data = data.get('certificates', data.get('data'))
            if not isinstance(data, list):
                raise ValueError('Unexpected API format')
            return data
        except Exception as exc:
            error = exc
            time.sleep(2 * (attempt + 1))
    raise RuntimeError(f'Cannot fetch {name}: {error}')


def as_iso(value):
    if not isinstance(value, str) or not value.strip():
        return None
    try:
        return parsedate_to_datetime(value).astimezone(timezone.utc).isoformat().replace('+00:00', 'Z')
    except (TypeError, ValueError, IndexError, OverflowError):
        try:
            return datetime.fromisoformat(value.replace('Z', '+00:00')).astimezone(timezone.utc).isoformat().replace('+00:00', 'Z')
        except ValueError:
            return None


def normalize(item, collection, now):
    if not isinstance(item, dict):
        return None
    try:
        ident = int(item['id'])
        if ident < 1 or ident > 1_000_000_000:
            return None
    except (KeyError, ValueError, TypeError):
        return None
    raw = str(item.get('status', '')).strip()
    if re.search(r'revoked|❌', raw, re.I):
        status = 'revoked'
    elif re.search(r'expired', raw, re.I):
        status = 'expired'
    elif re.search(r'signed|active|✅', raw, re.I):
        status = 'signed'
    else:
        status = 'unknown'
    start = as_iso(item.get('valid_from', item.get('validFrom')))
    end = as_iso(item.get('valid_to', item.get('validTo')))
    if end and datetime.fromisoformat(end.replace('Z','+00:00')) < now:
        status = 'expired'
    name = str(item.get('name') or item.get('nickname') or 'Không rõ tên')[:240]
    missing = collection == 'missingP12'
    url = 'https://sideloading.net/api/certificates/download/'
    links = {'profile': f'{url}missingP12/{ident}/cert.mobileprovision'} if missing else {
        'zip': f'{url}{ident}/cert.zip',
        'p12': f'{url}{ident}/cert.p12',
        'profile': f'{url}{ident}/cert.mobileprovision',
        'password': f'{url}{ident}/password.txt'
    }
    return {'id':ident, 'key': f'{collection}-{ident}', 'name':name,
            'nickname':str(item.get('nickname') or '')[:120], 'status':status,
            'validFrom':start, 'validTo':end, 'hasP12':not missing,
            'links':links}


def main():
    now = datetime.now(timezone.utc)
    all_data = get_list('all')
    warnings = []
    try:
        missing_data = get_list('missingP12')
    except Exception as exc:
        missing_data = []
        warnings.append('Chưa tải được danh sách chứng chỉ thiếu P12.')
        print('Warning:', exc)
    primary = [x for obj in all_data if (x:=normalize(obj,'all',now))]
    no_p12 = [x for obj in missing_data if (x:=normalize(obj,'missingP12',now))]
    names = {x['name'].casefold().strip() for x in primary}
    certs = primary + [x for x in no_p12 if x['name'].casefold().strip() not in names]
    certs.sort(key=lambda x: (x['status']=='signed', x['validFrom'] or ''), reverse=True)
    payload = {'source':'NexSideloading NexCerts', 'sourceUrl':'https://sideloading.net/api/',
               'fetchedAt':now.isoformat().replace('+00:00','Z'),
               'sourceUpdateNote':'Dữ liệu nguồn đồng bộ khoảng 30 phút/lần',
               'verificationNote':'Theo dữ liệu bên thứ ba, không xác minh trực tiếp với Apple',
               'warnings':warnings, 'certificates':certs}
    OUT.parent.mkdir(parents=True, exist_ok=True)
    temp = OUT.with_suffix('.tmp')
    temp.write_text(json.dumps(payload,ensure_ascii=False,separators=(',',':')),encoding='utf-8')
    os.replace(temp,OUT)
    print(f'Wrote {len(certs)} certificates to {OUT}')


if __name__ == '__main__':
    main()
