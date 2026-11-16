'use strict';
const $ = selector => document.querySelector(selector);
const state = {items: [], query: '', sort: 'newest', loading: false, summary: null, sources: []};
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
    const response = await fetch('./data/certs.json?v=' + Date.now(), {cache: 'no-store'});
    if (!response.ok) throw new Error('Không có dữ liệu (HTTP ' + response.status + ').');
    const payload = await response.json();
    if (!Array.isArray(payload.certificates)) throw new Error('Sai định dạng dữ liệu.');
    const fetchedAt = timestamp(payload.fetchedAt);
    const now = Date.now();
    if (!fetchedAt || fetchedAt > now + 10 * 60 * 1000 || now - fetchedAt > MAX_DATA_AGE_MS) {
      throw new Error('Dữ liệu quá cũ hoặc chưa rõ thời gian cập nhật; tạm ẩn tất cả để tránh báo sai.');
    }
    state.summary = payload.summary && typeof payload.summary === 'object' ? payload.summary : null;
    state.sources = Array.isArray(payload.sources) ? payload.sources : [];
    renderSources();
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
$('#sort').addEventListener('change', event => { state.sort = event.target.value; render(); });
reload();
setInterval(() => { if (!document.hidden) reload(); }, 5 * 60 * 1000);
document.addEventListener('visibilitychange', () => { if (!document.hidden) reload(); });
