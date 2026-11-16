'use strict';
const $ = selector => document.querySelector(selector);
const state = {items: [], query: '', sort: 'newest', loading: false, summary: null, sources: [], packages: [], packageQuery: ''};
const MAX_DATA_AGE_MS = 3 * 60 * 60 * 1000;
const numeric = value => new Intl.NumberFormat('vi-VN').format(value);
const timestamp = value => value && Number.isFinite(Date.parse(value)) ? Date.parse(value) : 0;
const formatDate = value => timestamp(value) ? new Intl.DateTimeFormat('vi-VN', {dateStyle:'medium', timeZone:'Asia/Ho_Chi_Minh'}).format(new Date(value)) : 'Không rõ';

function isEligible(cert, now = Date.now()) {
  if (!cert || cert.status !== 'signed' || cert.hasP12 !== true) return false;
  if (typeof cert.name !== 'string' || typeof cert.id !== 'number') return false;
  const start = timestamp(cert.validFrom);
  const end = timestamp(cert.validTo);
  if (!start || !end || start > now || end <= now) return false;
  const links = cert.links || {};
  const base = /^https:\/\/sideloading\.net\/api\/certificates\/download\//;
  return typeof links.p12 === 'string' && base.test(links.p12)
      && typeof links.profile === 'string' && base.test(links.profile);
}

function setMessage(message, isError = false) {
  const element = $('#message');
  element.textContent = message;
  element.hidden = !message;
  element.classList.toggle('error', isError);
}

function makeLink(label, url, primary = false) {
  if (typeof url !== 'string' || !/^https:\/\/sideloading\.net\/api\/certificates\/download\//.test(url)) return null;
  const anchor = document.createElement('a');
  anchor.className = 'dl-link' + (primary ? ' primary-link' : '');
  anchor.textContent = label;
  anchor.href = url;
  anchor.target = '_blank';
  anchor.rel = 'noopener noreferrer';
  return anchor;
}

function card(cert) {
  const element = $('#certTemplate').content.firstElementChild.cloneNode(true);
  element.querySelector('.cert-name').textContent = cert.name;
  const pill = element.querySelector('.status');
  pill.className = 'status signed';
  pill.textContent = 'SIGNED · CÓ P12';
  element.querySelector('.from').textContent = formatDate(cert.validFrom);
  element.querySelector('.to').textContent = formatDate(cert.validTo);
  element.querySelector('.p12-status').textContent = '◉ Nguồn báo có bộ P12 + profile';
  const urls = cert.links || {};
  const definitions = [
    ['↓ Tải ZIP', urls.zip, true],
    ['P12', urls.p12, false],
    ['Profile', urls.profile, false],
    ['Mật khẩu', urls.password, false]
  ];
  definitions.forEach(([name, url, primary]) => {
    const link = makeLink(name, url, primary);
    if (link) element.querySelector('.links').append(link);
  });
  return element;
}

function renderPackages() {
  const parent = $('#packageList');
  const empty = $('#packageEmpty');
  const items = Array.isArray(state.packages) ? state.packages : [];
  const term = state.packageQuery.trim().toLocaleLowerCase('vi');
  const visible = items.filter(item =>
    !term || (String(item.name || '') + ' ' + String(item.source || '')).toLocaleLowerCase('vi').includes(term));
  $('#packageCount').textContent = numeric(visible.length);
  const fragment = document.createDocumentFragment();
  const allowed = new Set(['www.signhub.pro', 'github.com']);
  for (const item of visible) {
    if (!item || item.status !== 'unverified' || typeof item.name !== 'string') continue;
    let url, landing;
    try {
      url = new URL(item.downloadUrl);
      landing = new URL(item.sourceUrl);
    } catch (_) { continue; }
    if (url.protocol !== 'https:' || !allowed.has(url.hostname) ||
        landing.protocol !== 'https:' || !allowed.has(landing.hostname) ||
        !url.pathname.toLowerCase().endsWith('.zip')) continue;
    const card = document.createElement('article');
    card.className = 'package-card';
    const heading = document.createElement('div');
    heading.className = 'package-heading';
    const name = document.createElement('strong');
    name.textContent = item.name.slice(0, 180);
    const badge = document.createElement('span');
    badge.className = 'source-tag manual';
    badge.textContent = 'CHƯA XÁC MINH';
    heading.append(name, badge);
    const source = document.createElement('p');
    source.className = 'package-source';
    source.textContent = 'Nguồn: ' + String(item.source || 'Không rõ');
    const desc = document.createElement('p');
    desc.textContent = String(item.note || 'Chưa rõ nội dung và tình trạng chứng chỉ.').slice(0, 400);
    const actions = document.createElement('div');
    actions.className = 'package-actions';
    const download = document.createElement('a');
    download.className = 'dl-link primary-link';
    download.href = url.href;
    download.target = '_blank';
    download.rel = 'noopener noreferrer';
    download.textContent = '↓ Tải ZIP để kiểm tra';
    const view = document.createElement('a');
    view.className = 'dl-link';
    view.href = landing.href;
    view.target = '_blank';
    view.rel = 'noopener noreferrer';
    view.textContent = 'Xem nguồn ↗';
    actions.append(download, view);
    card.append(heading, source, desc, actions);
    fragment.append(card);
  }
  parent.replaceChildren(fragment);
  empty.hidden = parent.childElementCount > 0;
  if (!empty.hidden) {
    empty.textContent = items.length ?
      'Không tìm thấy gói ZIP phù hợp với từ khóa. Thử tìm theo tên nguồn ở phần bên dưới.' :
      'Chưa thu thập được gói ZIP công khai nào. Danh sách chứng chỉ dùng được vẫn được kiểm tra riêng bên dưới.';
  }
}

function renderSources() {
  const sources = Array.isArray(state.sources) ? state.sources : [];
  $('#sourceCount').textContent = numeric(sources.length);
  const parent = $('#sourceList');
  const fragment = document.createDocumentFragment();
  const statuses = {
    checked: 'Đã đọc dữ liệu',
    catalog: 'Danh mục tham khảo',
    archive: 'Kho lưu trữ',
    manual: 'Cần kiểm tra thủ công',
    unavailable: 'Tạm không truy cập được'
  };
  const hostAllow = new Set([
    'sideloading.net','nabzclan.vip','github.com','www.signhub.pro',
    'khoindvn.com','applejr.net','trial.larp-ipas.com',
    'cococloud-signing.vip','forum.nezushub.vip','delta.bz','t.me'
  ]);
  for (const source of sources) {
    if (!source || typeof source.name !== 'string' || typeof source.url !== 'string') continue;
    let url;
    try { url = new URL(source.url); } catch (_) { continue; }
    if (url.protocol !== 'https:' || !hostAllow.has(url.hostname)) continue;
    const card = document.createElement('article');
    card.className = 'source-card';
    const head = document.createElement('div');
    head.className = 'source-card-head';
    const name = document.createElement('strong');
    name.textContent = source.name;
    const badge = document.createElement('span');
    badge.className = 'source-tag ' + (['checked','catalog','archive','manual','unavailable'].includes(source.status)?source.status:'manual');
    badge.textContent = statuses[source.status] || statuses.manual;
    head.append(name,badge);
    const note = document.createElement('p');
    note.textContent = String(source.note || 'Không có dữ liệu xác minh.').slice(0,400);
    card.append(head,note);
    const footer = document.createElement('div');
    footer.className = 'source-card-footer';
    const number = document.createElement('span');
    number.textContent = Number.isInteger(source.count) ?
      (numeric(source.count) + ' mục đã đọc') : 'Chưa có số lượng xác minh';
    const link = document.createElement('a');
    link.href = url.href;
    link.target = '_blank';
    link.rel = 'noopener noreferrer';
    link.textContent = 'Xem nguồn ↗';
    footer.append(number,link);
    card.append(footer);
    fragment.append(card);
  }
  parent.replaceChildren(fragment);
}
function render() {
  const now = Date.now();
  // Recheck dates on every render: a static result must not stay visible after expiry.
  state.items = state.items.filter(cert => isEligible(cert, now));
  const query = state.query.trim().toLocaleLowerCase('vi');
  const items = state.items.filter(item => !query ||
      (item.name + ' ' + (item.nickname || '')).toLocaleLowerCase('vi').includes(query));
  items.sort((a, b) => {
    if (state.sort === 'name') return a.name.localeCompare(b.name, 'vi');
    if (state.sort === 'expires') return timestamp(b.validTo) - timestamp(a.validTo);
    return timestamp(b.validFrom) - timestamp(a.validFrom);
  });
  $('#visibleCount').textContent = numeric(items.length);
  $('#totalCount').textContent = numeric(state.items.length);
  const fragment = document.createDocumentFragment();
  items.forEach(item => fragment.append(card(item)));
  $('#certList').replaceChildren(fragment);
  if (!state.loading) {
    if (!state.items.length) {
      const info = state.summary;
      if (info && Number.isInteger(info.withP12Checked) && Number.isInteger(info.signedMissingP12)) {
        const revoked = Number.isInteger(info.withP12RevokedOrExpired) ? info.withP12RevokedOrExpired : 0;
        setMessage('Hiện không có chứng chỉ đủ điều kiện để ký IPA theo nguồn. Đã kiểm tra ' +
          numeric(info.withP12Checked) + ' bộ có P12 (' + numeric(revoked) +
          ' bị báo thu hồi hoặc hết hạn). Có ' + numeric(info.signedMissingP12) +
          ' chứng chỉ vẫn SIGNED nhưng thiếu P12 — không đủ file để ký bằng ESign. Website sẽ tự cập nhật khi nguồn có chứng chỉ phù hợp.');
      } else {
        setMessage('Hiện chưa có chứng chỉ nào đủ điều kiện: SIGNED, có P12 và còn hạn sử dụng.');
      }
    }
    else if (!items.length) setMessage('Không tìm thấy chứng chỉ theo tên đã nhập.');
    else setMessage('');
  }
}

async function reload() {
  if (state.loading) return;
  state.loading = true;
  $('#refreshBtn').disabled = true;
  setMessage('Đang kiểm tra dữ liệu chứng chỉ mới nhất đã xuất bản...');
  try {
    // First try periodically committed GitHub data, since Render may not redeploy on every sync.
    // If GitHub is blocked / behind a firewall / has stale data, fall back to bundled Render data.
    const endpoints = [
      'https://raw.githubusercontent.com/boyngheoanvat-ctrl/Ch-ng-ch-/main/data/certs.json',
      './data/certs.json'
    ];
    let payload = null;
    let lastError = null;
    const now = Date.now();
    for (const endpoint of endpoints) {
      try {
        const response = await fetch(endpoint + '?v=' + now, {cache: 'no-store'});
        if (!response.ok) throw new Error('HTTP ' + response.status);
        const candidate = await response.json();
        if (!Array.isArray(candidate.certificates)) throw new Error('Sai định dạng dữ liệu.');
        const at = timestamp(candidate.fetchedAt);
        if (!at || at > now + 10 * 60 * 1000 || now - at > MAX_DATA_AGE_MS)
          throw new Error('Dữ liệu quá cũ hoặc chưa rõ thời gian cập nhật.');
        payload = candidate;
        break;
      } catch (error) { lastError = error; }
    }
    if (!payload) throw lastError || new Error('Chưa lấy được nguồn dữ liệu mới.');
    const fetchedAt = timestamp(payload.fetchedAt);
    state.summary = payload.summary && typeof payload.summary === 'object' ? payload.summary : null;
    state.sources = Array.isArray(payload.sources) ? payload.sources : [];
    renderSources();
    state.packages = Array.isArray(payload.packages) ? payload.packages : [];
    renderPackages();
    state.items = payload.certificates.filter(cert => isEligible(cert, now));
    $('#checkedAt').textContent = 'Dữ liệu lúc ' +
      new Intl.DateTimeFormat('vi-VN', {dateStyle:'short', timeStyle:'short', timeZone:'Asia/Ho_Chi_Minh'}).format(new Date(fetchedAt)) + ' (GMT+7)';
    $('#sourceInfo').textContent = 'Tổng hợp ' + numeric(state.sources.length) + ' nguồn · Chỉ hiển thị SIGNED + đủ P12 + còn hạn · Chưa kiểm tra trực tiếp với Apple';
    state.loading = false;
    render();
  } catch (error) {
    state.items = [];
    state.summary = null;
    state.sources = [];
    renderSources();
    state.packages = [];
    renderPackages();
    $('#checkedAt').textContent = 'Chưa có dữ liệu tin cậy';
    $('#sourceInfo').textContent = 'Không có dữ liệu đủ mới để đánh giá tình trạng chứng chỉ.';
    state.loading = false;
    render();
    setMessage('Chưa thể hiển thị chứng chỉ: ' + error.message, true);
  } finally {
    $('#refreshBtn').disabled = false;
  }
}

$('#refreshBtn').addEventListener('click', reload);
$('#search').addEventListener('input', event => { state.query = event.target.value; render(); });
$('#packageSearch').addEventListener('input', event => { state.packageQuery = event.target.value; renderPackages(); });
$('#sort').addEventListener('change', event => { state.sort = event.target.value; render(); });
reload();
setInterval(() => { if (!document.hidden) reload(); }, 5 * 60 * 1000);
document.addEventListener('visibilitychange', () => { if (!document.hidden) reload(); });


/* ERI CSR ON-DEVICE TOOL (served inside app.js to match Render static asset build) */
'use strict';
/*
 * Apple Certificate Signing Request creator (on-device).
 * Generates a fresh RSA keypair and PKCS#10 CSR in Safari using Web Crypto.
 * It DOES NOT issue an Apple distribution certificate or provisioning profile.
 * Keys are neither uploaded nor stored by the website.
 */
(() => {
  const byId = id => document.getElementById(id);
  const button = byId('generateCsrBtn');
  if (!button) return;
  const encoder = new TextEncoder();

  function concatenate(...parts) {
    const length = parts.reduce((n, part) => n + part.byteLength, 0);
    const output = new Uint8Array(length);
    let offset = 0;
    for (const part of parts) {
      output.set(part, offset);
      offset += part.byteLength;
    }
    return output;
  }

  function derLength(size) {
    if (size < 128) return Uint8Array.of(size);
    const list = [];
    while (size > 0) {
      list.unshift(size & 255);
      size = Math.floor(size / 256);
    }
    return Uint8Array.from([0x80 | list.length, ...list]);
  }

  function asn1(tag, data) {
    return concatenate(Uint8Array.of(tag), derLength(data.length), data);
  }

  function rdn(oid, value, type = 0x0c) {
    const attr = asn1(0x30, concatenate(asn1(0x06, oid), asn1(type, encoder.encode(value))));
    return asn1(0x31, attr);
  }

  function pem(type, bytes) {
    let binary = '';
    for (const byte of bytes) binary += String.fromCharCode(byte);
    const b64 = btoa(binary).match(/.{1,64}/g).join('\n');
    return '-----BEGIN ' + type + '-----\n' + b64 + '\n-----END ' + type + '-----\n';
  }

  const crcTable = (() => {
    const values = new Uint32Array(256);
    for (let i = 0; i < 256; i++) {
      let value = i;
      for (let j = 0; j < 8; j++) value = (value & 1) ? (0xedb88320 ^ (value >>> 1)) : (value >>> 1);
      values[i] = value >>> 0;
    }
    return values;
  })();

  function crc32(bytes) {
    let crc = 0xffffffff;
    for (const byte of bytes) crc = (crc >>> 8) ^ crcTable[(crc ^ byte) & 255];
    return (crc ^ 0xffffffff) >>> 0;
  }

  function writeZipFile(files) {
    // Uncompressed ZIP (PKZIP Store). Files are kept byte-for-byte; no dependencies.
    const locals = [], central = [];
    let cursor = 0;
    for (const [filename, value] of files) {
      const name = encoder.encode(filename);
      const bytes = encoder.encode(value);
      const crc = crc32(bytes);
      const local = new Uint8Array(30);
      const lh = new DataView(local.buffer);
      lh.setUint32(0, 0x04034b50, true);
      lh.setUint16(4, 20, true);
      lh.setUint16(26, name.length, true);
      lh.setUint32(14, crc, true);
      lh.setUint32(18, bytes.length, true);
      lh.setUint32(22, bytes.length, true);
      locals.push(local, name, bytes);
      const header = new Uint8Array(46);
      const ch = new DataView(header.buffer);
      ch.setUint32(0, 0x02014b50, true);
      ch.setUint16(4, 20, true);
      ch.setUint16(6, 20, true);
      ch.setUint32(16, crc, true);
      ch.setUint32(20, bytes.length, true);
      ch.setUint32(24, bytes.length, true);
      ch.setUint16(28, name.length, true);
      ch.setUint32(42, cursor, true);
      central.push(header, name);
      cursor += local.length + name.length + bytes.length;
    }
    const localData = concatenate(...locals);
    const directory = concatenate(...central);
    const end = new Uint8Array(22);
    const view = new DataView(end.buffer);
    view.setUint32(0, 0x06054b50, true);
    view.setUint16(8, files.length, true);
    view.setUint16(10, files.length, true);
    view.setUint32(12, directory.length, true);
    view.setUint32(16, localData.length, true);
    return new Blob([localData, directory, end], {type: 'application/zip'});
  }

  function download(blob, filename) {
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = filename;
    document.body.appendChild(link);
    link.click();
    link.remove();
    window.setTimeout(() => URL.revokeObjectURL(url), 120000);
  }

  button.addEventListener('click', async () => {
    const status = byId('csrStatus');
    const name = (byId('csrCommonName').value || '').trim();
    const email = (byId('csrEmail').value || '').trim();
    const ack = byId('csrSafetyAck').checked;

    if (!name || name.length > 100 || /[\x00-\x1f]/.test(name)) {
      status.textContent = 'Nhập tên yêu cầu từ 1 đến 100 ký tự.';
      return;
    }
    if (email && (email.length > 150 || !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email))) {
      status.textContent = 'Email không đúng định dạng.';
      return;
    }
    if (!ack) {
      status.textContent = 'Hãy xác nhận rằng bạn sẽ bảo vệ khóa riêng.';
      return;
    }
    if (!globalThis.isSecureContext || !globalThis.crypto || !crypto.subtle) {
      status.textContent = 'Cần Safari với HTTPS để tạo CSR trong thiết bị.';
      return;
    }
    button.disabled = true;
    status.textContent = 'Đang tạo RSA 2048-bit trong Safari, không gửi khóa riêng lên mạng…';
    try {
      const keyPair = await crypto.subtle.generateKey(
        {name: 'RSASSA-PKCS1-v1_5', modulusLength: 2048,
          publicExponent: Uint8Array.of(1, 0, 1), hash: 'SHA-256'},
        true,
        ['sign', 'verify']
      );
      const spki = new Uint8Array(await crypto.subtle.exportKey('spki', keyPair.publicKey));
      const pkcs8 = new Uint8Array(await crypto.subtle.exportKey('pkcs8', keyPair.privateKey));

      const commonNameOid = Uint8Array.of(0x55, 0x04, 0x03);
      const emailOid = Uint8Array.of(0x2a, 0x86, 0x48, 0x86, 0xf7, 0x0d, 0x01, 0x09, 0x01);
      const rdns = [rdn(commonNameOid, name)];
      if (email) rdns.push(rdn(emailOid, email, 0x16));

      // PKCS#10 CertificationRequestInfo: version=0, subject, SPKI, empty attributes.
      const info = asn1(0x30, concatenate(
        asn1(0x02, Uint8Array.of(0)),
        asn1(0x30, concatenate(...rdns)),
        spki,
        asn1(0xa0, new Uint8Array(0))
      ));
      const signature = new Uint8Array(await crypto.subtle.sign(
        'RSASSA-PKCS1-v1_5', keyPair.privateKey, info
      ));
      const sha256WithRsaOid = Uint8Array.of(0x2a, 0x86, 0x48, 0x86, 0xf7, 0x0d, 0x01, 0x01, 0x0b);
      const algorithm = asn1(0x30, concatenate(
        asn1(0x06, sha256WithRsaOid),
        asn1(0x05, new Uint8Array(0))
      ));
      const csrDer = asn1(0x30, concatenate(
        info, algorithm, asn1(0x03, concatenate(Uint8Array.of(0), signature))
      ));
      const csr = pem('CERTIFICATE REQUEST', csrDer);
      const keyPem = pem('PRIVATE KEY', pkcs8);
      const readme =
        'ERI CERT CHECK — YÊU CẦU CHỨNG CHỈ APPLE\n\n' +
        '1. ERI_iOS.certSigningRequest: tải lên Apple Developer để yêu cầu Apple cấp chứng chỉ.\n' +
        '2. ERI_PRIVATE_KEY_SECRET.pem: KHÓA RIÊNG chưa mã hóa. Không chia sẻ hoặc tải lên web lạ.\n' +
        '3. Chỉ Apple có thể cấp .cer và .mobileprovision hợp lệ từ tài khoản có quyền.\n' +
        '4. CSR không phải chứng chỉ .p12. Tạo CSR không giúp cài IPA miễn phí ngay lập tức.\n' +
        '5. Khi đã có chứng chỉ do Apple cấp, cần kết hợp .cer với khóa riêng để xuất .p12 và tạo provisioning profile trên Apple Developer.\n';
      download(writeZipFile([
        ['ERI_iOS.certSigningRequest', csr],
        ['ERI_PRIVATE_KEY_SECRET.pem', keyPem],
        ['README_Doc_Truoc.txt', readme]
      ]), 'ERI_CSR_VA_KHOA_RIENG.zip');
      status.textContent = 'Đã tạo ZIP trong Safari. Đây là CSR và khóa riêng, CHƯA phải P12 hoặc mobileprovision hợp lệ.';
    } catch (error) {
      status.textContent = 'Không tạo được CSR: ' + (error?.message || 'Safari không hỗ trợ.');
    } finally {
      button.disabled = false;
    }
  });
})();
