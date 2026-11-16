'use strict';

// Only two public lists: currently signed + P12, and revoked/expired + P12.
const $ = id => document.getElementById(id);
const MAX_AGE = 3 * 60 * 60 * 1000;
const state = {signed: [], revoked: [], tab: 'signed', loading: false, updated: null};
const numeric = n => new Intl.NumberFormat('vi-VN').format(n);

function parsedDate(raw) {
  const ms = Date.parse(raw);
  return Number.isFinite(ms) ? ms : null;
}

function dateText(raw) {
  const ms = parsedDate(raw);
  if (ms === null) return 'Chưa rõ';
  return new Intl.DateTimeFormat('vi-VN', {
    day: '2-digit', month: '2-digit', year: 'numeric',
    timeZone: 'Asia/Ho_Chi_Minh'
  }).format(new Date(ms));
}

function safeZip(item) {
  if (!item || !Number.isInteger(item.id) || item.id <= 0) return null;
  if (typeof item.zipUrl !== 'string') return null;
  const match = item.zipUrl.match(/^https:\/\/sideloading\.net\/api\/certificates\/download\/([0-9]+)\/cert\.zip$/);
  return match && Number(match[1]) === item.id ? item.zipUrl : null;
}

function eligible(item, now = Date.now()) {
  return item && item.status === 'signed' && item.hasP12 === true &&
    typeof item.name === 'string' && safeZip(item) &&
    parsedDate(item.validFrom) !== null && parsedDate(item.validTo) !== null &&
    parsedDate(item.validFrom) <= now && now < parsedDate(item.validTo);
}

function noLongerActive(item) {
  return item && (item.status === 'revoked' || item.status === 'expired') &&
    item.hasP12 === true && typeof item.name === 'string' && safeZip(item);
}

function message(text, error = false) {
  const el = $('message');
  el.textContent = text;
  el.hidden = !text;
  el.style.borderColor = error ? '#a4576b' : '';
}

function makeCertificate(item) {
  const article = document.createElement('article');
  article.className = 'cert';

  const top = document.createElement('div');
  top.className = 'cert-title-row';

  const name = document.createElement('h3');
  name.className = 'cert-name';
  name.textContent = item.name;

  const badge = document.createElement('span');
  badge.className = 'status ' + item.status;
  badge.textContent = item.status === 'signed' ? 'SIGNED' :
    item.status === 'expired' ? 'HẾT HẠN' : 'REVOKED';
  top.append(name, badge);

  const dates = document.createElement('div');
  dates.className = 'meta';
  const start = document.createElement('span');
  const end = document.createElement('span');
  const startLabel = document.createElement('b');
  const endLabel = document.createElement('b');
  startLabel.textContent = 'Ngày cấp: ';
  endLabel.textContent = 'Hạn đến: ';
  start.append(startLabel, dateText(item.validFrom));
  end.append(endLabel, dateText(item.validTo));
  dates.append(start, end);

  const actions = document.createElement('div');
  actions.className = 'cert-actions';
  const label = document.createElement('span');
  label.className = 'file-label';
  label.textContent = item.status === 'signed' ?
    'ZIP từ nguồn · trạng thái theo bên thứ ba' :
    'ZIP lưu trữ · không dùng để ký IPA';

  const download = document.createElement('a');
  download.className = 'download';
  download.href = safeZip(item);
  download.target = '_blank';
  download.rel = 'noopener noreferrer';
  download.textContent = '↓ Tải ZIP';

  actions.append(label, download);
  article.append(top, dates, actions);
  return article;
}

function render() {
  const now = Date.now();
  const signed = state.signed.filter(cert => eligible(cert, now));
  const revoked = state.revoked.filter(noLongerActive);
  const isSigned = state.tab === 'signed';

  $('signedCount').textContent = numeric(signed.length);
  $('revokedCount').textContent = numeric(revoked.length);

  $('tabSigned').classList.toggle('active', isSigned);
  $('tabRevoked').classList.toggle('active', !isSigned);
  $('tabSigned').setAttribute('aria-pressed', String(isSigned));
  $('tabRevoked').setAttribute('aria-pressed', String(!isSigned));

  $('listTitle').textContent = isSigned ? 'Chứng chỉ còn hiệu lực' : 'Chứng chỉ đã thu hồi / hết hạn';
  $('listDescription').textContent = isSigned ?
    'SIGNED + còn hạn + nguồn có P12' :
    'REVOKED hoặc hết hạn · ZIP chỉ dùng lưu trữ';

  const items = isSigned ? signed : revoked;
  const fragment = document.createDocumentFragment();
  for (const item of items) fragment.append(makeCertificate(item));
  $('certList').replaceChildren(fragment);
  if (!state.loading) {
    if (!items.length) message(isSigned ?
      'Hiện chưa có chứng chỉ SIGNED có P12 và còn hạn từ nguồn đang kiểm tra.' :
      'Hiện không có chứng chỉ thu hồi / hết hạn có bộ ZIP từ nguồn.');
    else message('');
  }
}

async function refresh() {
  if (state.loading) return;
  state.loading = true;
  $('refreshBtn').disabled = true;
  message('Đang cập nhật hai danh sách chứng chỉ...');

  const endpoints = [
    'https://raw.githubusercontent.com/boyngheoanvat-ctrl/Ch-ng-ch-/main/data/certs.json',
    './data/certs.json'
  ];
  let data = null;
  let reason = 'Chưa lấy được dữ liệu.';
  const now = Date.now();

  for (const endpoint of endpoints) {
    try {
      const res = await fetch(endpoint + '?v=' + now, {cache: 'no-store'});
      if (!res.ok) throw new Error('HTTP ' + res.status);
      const candidate = await res.json();
      const timestamp = parsedDate(candidate.fetchedAt);
      if (candidate.version !== 2 ||
          !Array.isArray(candidate.certificates) ||
          !Array.isArray(candidate.revokedCertificates)) {
        throw new Error('Dữ liệu chưa có hai danh sách.');
      }
      if (timestamp === null || timestamp > now + 600000 || now - timestamp > MAX_AGE) {
        throw new Error('Bản cập nhật quá cũ.');
      }
      data = candidate;
      break;
    } catch (error) {
      reason = error && error.message ? error.message : 'Lỗi nguồn.';
    }
  }
  if (data) {
    state.signed = data.certificates.filter(cert => eligible(cert, now));
    state.revoked = data.revokedCertificates.filter(noLongerActive);
    state.updated = data.fetchedAt;
    $('updatedAt').textContent = 'Cập nhật: ' +
      new Intl.DateTimeFormat('vi-VN', {dateStyle: 'short', timeStyle: 'short',
        timeZone: 'Asia/Ho_Chi_Minh'}).format(new Date(data.fetchedAt)) + ' (GMT+7)';
  } else {
    state.signed = [];
    state.revoked = [];
    state.updated = null;
    $('updatedAt').textContent = 'Không có dữ liệu mới';
  }

  state.loading = false;
  $('refreshBtn').disabled = false;
  render();
  if (!data) message('Không thể lấy danh sách mới nhất: ' + reason, true);
}

$('tabSigned').addEventListener('click', () => {state.tab = 'signed'; render();});
$('tabRevoked').addEventListener('click', () => {state.tab = 'revoked'; render();});
$('refreshBtn').addEventListener('click', refresh);
refresh();
setInterval(() => { if (!document.hidden) refresh(); }, 5 * 60 * 1000);
document.addEventListener('visibilitychange', () => { if (!document.hidden) refresh(); });
