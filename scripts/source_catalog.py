#!/usr/bin/env python3
"""Audited metadata collectors for other public ESign certificate sources.

Important: a downloadable ZIP is NOT proof of an unrevoked Apple certificate.
These catalogs never generate SIGNED + P12 candidates by themselves.
"""
import html
import json
import re
from concurrent.futures import ThreadPoolExecutor, as_completed
from datetime import datetime, timezone
from urllib.request import Request, urlopen

HEADERS = {
    'User-Agent': 'ERI-Cert-Check/1.3 (+public certificate index)',
    'Accept': 'application/json,text/html;q=0.9,*/*;q=0.5',
}

DEFINITIONS = [
    ('NabzClan', 'https://nabzclan.vip/certificates/', 'public_status'),
    ('Loyahdev', 'https://github.com/loyahdev/certificates/releases', 'releases'),
    ('SignHub', 'https://www.signhub.pro/', 'packages'),
    ('Eojoo', 'https://github.com/eojoo/free-ios-certificates', 'archive'),
    ('Khoindvn', 'https://khoindvn.com/', 'catalog'),
    ('AppleJR', 'https://www.applejr.cloud/', 'catalog'),
    ('LARP IPAs', 'https://trial.larp-ipas.com/', 'public_status'),
    ('CocoCloud', 'https://cococloud-signing.vip/', 'catalog'),
    ('NezusHub', 'https://forum.nezushub.vip/forums/public-certificates.7/', 'manual'),
    ('Delta Executor', 'https://delta.bz/', 'manual'),
]


def fetch_text(url, timeout=7):
    request = Request(url, headers=HEADERS)
    with urlopen(request, timeout=timeout) as response:
        if response.status != 200:
            raise ValueError('HTTP ' + str(response.status))
        return response.read(950_000).decode('utf-8', 'replace')


def clean_text(raw):
    raw = re.sub(r'<(script|style)\b[^>]*>.*?</\1>', ' ', raw, flags=re.I | re.S)
    return re.sub(r'\s+', ' ', html.unescape(re.sub(r'<[^>]+>', ' ', raw)))


def collect_one(entry):
    name, url, kind = entry
    item = {
        'name': name, 'url': url, 'kind': kind, 'status': 'manual',
        'count': None, 'signed': None, 'note': 'Không có API trạng thái công khai được xác minh.',
    }
    if kind == 'manual':
        return item
    lookup = {
        'Loyahdev': 'https://api.github.com/repos/loyahdev/certificates/releases?per_page=30',
        'Eojoo': 'https://api.github.com/repos/eojoo/free-ios-certificates/contents',
    }
    try:
        raw = fetch_text(lookup.get(name, url))
        text = clean_text(raw) if name not in ('Loyahdev', 'Eojoo') else ''
        if name == 'NabzClan':
            active = re.search(r'(\d+)\s+Signed\s+now', text, re.I)
            revoked = re.search(r'(\d+)\s+Revoked\s+or\s+expired', text, re.I)
            if not (active and revoked):
                raise ValueError('Public status counts not found')
            item.update(status='checked', count=int(active[1])+int(revoked[1]),
                        signed=int(active[1]),
                        note='Theo trang công khai; yêu cầu đăng nhập để tải gói, API kiểm tra tệp cần token.')
        elif name == 'Loyahdev':
            releases = json.loads(raw)
            if not isinstance(releases, list):
                raise ValueError('Invalid releases JSON')
            signed = 0
            revoked = 0
            for release in releases:
                body = str(release.get('body') or '')
                match = re.search(r'Revoked:\s*(true|false)', body, re.I)
                if not match:
                    continue
                if match[1].lower() == 'true':
                    revoked += 1
                else:
                    signed += 1
            item.update(status='checked', count=len(releases), signed=None,
                        note=f'{revoked} bản ghi bị đánh dấu revoked; {signed} bản ghi khác cần xác minh lại (metadata bản phát hành không đủ chứng minh còn sử dụng được).')
        elif name == 'SignHub':
            packages = {x for x in re.findall(r'\[[0-9.]+\][^\s<>]+?\.zip', text, re.I)}
            item.update(status='catalog', count=len(packages), signed=None,
                        note='Có danh mục ZIP công khai; không công bố trạng thái thu hồi từng gói.')
        elif name == 'Eojoo':
            entries = json.loads(raw)
            if not isinstance(entries, list):
                raise ValueError('Invalid repository catalog')
            item.update(status='archive', count=max(0, len(entries)-1), signed=None,
                        note='Kho chứng chỉ lưu trữ; không có trạng thái chứng chỉ theo thời gian thực.')
        elif name == 'LARP IPAs':
            inactive = len(re.findall(r'\bInactive\b', text, re.I))
            item.update(status='catalog', count=inactive, signed=None,
                        note='Danh mục cài ESign có đánh dấu Inactive; thiếu API xác thực từng bộ P12.')
        else:
            item.update(status='catalog', note='Đã truy cập danh mục; chưa có API Signed + P12 xác minh được.')
        item['checkedAt'] = datetime.now(timezone.utc).isoformat().replace('+00:00','Z')
    except Exception as exc:
        item.update(status='unavailable', note='Không lấy được dữ liệu tự động; mở nguồn để kiểm tra trực tiếp.')
        print(f'Source {name}: {type(exc).__name__}: {str(exc)[:140]}')
    return item


def collect_sources():
    items = [None] * len(DEFINITIONS)
    with ThreadPoolExecutor(max_workers=8) as executor:
        futures = {executor.submit(collect_one, item): index for index, item in enumerate(DEFINITIONS)}
        for future in as_completed(futures):
            items[futures[future]] = future.result()
    return items
