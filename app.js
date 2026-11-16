'use strict';
const $ = selector => document.querySelector(selector);
const state = {items: [], filter: 'all', query: '', sort: 'newest', loading: false};
const statusLabels = {signed:'SIGNED', revoked:'REVOKED', expired:'HẾT HẠN', unknown:'CHƯA RÕ'};
const numeric = value => new Intl.NumberFormat('vi-VN').format(value);
const timestamp = value => Number.isFinite(Date.parse(value)) ? Date.parse(value) : 0;
const formatDate = value => timestamp(value) ? new Intl.DateTimeFormat('vi-VN', {dateStyle:'medium', timeZone:'Asia/Ho_Chi_Minh'}).format(new Date(value)) : 'Chưa rõ';

function setMessage(text, isError=false) {
  const box=$('#message');
  box.textContent=text;
  box.hidden=!text;
  box.classList.toggle('error',isError);
}
function makeLink(label,url,isPrimary=false) {
  const a=document.createElement('a');
  a.className='dl-link'+(isPrimary?' primary-link':'');
  a.textContent=label;
  // Only link to public NexSideloading certificate download endpoints.
  if (!/^https:\/\/sideloading\.net\/api\/certificates\/download\//.test(url)) return null;
  a.href=url;
  a.target='_blank';
  a.rel='noopener noreferrer';
  return a;
}
function card(cert) {
  const el=$('#certTemplate').content.firstElementChild.cloneNode(true);
  el.querySelector('.cert-name').textContent=cert.name || 'Không rõ tên';
  const status=['signed','revoked','expired'].includes(cert.status)?cert.status:'unknown';
  const pill=el.querySelector('.status');
  pill.className='status '+(status==='signed' && !cert.hasP12?'missing-p12':status);
  pill.textContent=status==='signed' && !cert.hasP12?'SIGNED · THIẾU P12':statusLabels[status];
  el.querySelector('.from').textContent=formatDate(cert.validFrom);
  el.querySelector('.to').textContent=formatDate(cert.validTo);
  el.querySelector('.p12-status').textContent=cert.hasP12?'◉ Nguồn có P12 + profile':'⚠ Thiếu P12 — chưa ký IPA được';
  const links=el.querySelector('.links');
  const urls=cert.links || {};
  const defs=cert.hasP12?[['↓ Tải ZIP',urls.zip,true],['P12',urls.p12,false],['Profile',urls.profile,false],['Mật khẩu',urls.password,false]]:[['↓ Profile',urls.profile,true]];
  defs.forEach(([name,url,primary])=>{if(typeof url==='string'){const a=makeLink(name,url,primary);if(a)links.append(a);}});
  return el;
}
function render() {
  const query=state.query.trim().toLocaleLowerCase('vi');
  const items=state.items.filter(item=>{
    if(state.filter==='signed' && (item.status!=='signed'||!item.hasP12))return false;
    if(state.filter==='revoked' && !['revoked','expired'].includes(item.status))return false;
    if(state.filter==='missing' && item.hasP12)return false;
    return !query || (String(item.name||'')+' '+String(item.nickname||'')).toLocaleLowerCase('vi').includes(query);
  });
  items.sort((a,b)=>{
    if(state.sort==='name')return a.name.localeCompare(b.name,'vi');
    if(state.sort==='expires')return timestamp(b.validTo)-timestamp(a.validTo);
    return timestamp(b.validFrom)-timestamp(a.validFrom);
  });
  $('#visibleCount').textContent=numeric(items.length);
  const fragment=document.createDocumentFragment();
  items.forEach(item=>fragment.append(card(item)));
  $('#certList').replaceChildren(fragment);
  if(!items.length && state.items.length && !state.loading)setMessage('Không tìm thấy chứng chỉ phù hợp với bộ lọc.');
  else if(items.length && !state.loading && !$('#message').classList.contains('error'))setMessage('');
}
function updateStats() {
  const all=state.items;
  $('#totalCount').textContent=numeric(all.length);
  $('#signedCount').textContent=numeric(all.filter(x=>x.status==='signed' && x.hasP12).length);
  $('#revokedCount').textContent=numeric(all.filter(x=>x.status==='revoked'||x.status==='expired').length);
  $('#missingCount').textContent=numeric(all.filter(x=>!x.hasP12).length);
}
async function reload() {
  if(state.loading)return;
  state.loading=true;
  $('#refreshBtn').disabled=true;
  setMessage('Đang lấy danh sách chứng chỉ từ bản cập nhật gần nhất...');
  try {
    const response=await fetch('./data/certs.json?v='+Date.now(),{cache:'no-store'});
    if(!response.ok)throw new Error('Chưa có dữ liệu đồng bộ (HTTP '+response.status+').');
    const payload=await response.json();
    if(!Array.isArray(payload.certificates))throw new Error('Dữ liệu không đúng định dạng.');
    state.items=payload.certificates.filter(x=>x && typeof x.name==='string' && typeof x.id==='number');
    const checked=timestamp(payload.fetchedAt);
    $('#checkedAt').textContent=checked?'Dữ liệu đồng bộ: '+new Intl.DateTimeFormat('vi-VN',{dateStyle:'short',timeStyle:'short',timeZone:'Asia/Ho_Chi_Minh'}).format(new Date(checked))+' (GMT+7)':'Chưa xác định thời gian đồng bộ';
    $('#sourceInfo').textContent='Nguồn: NexSideloading · Đồng bộ khi Render triển khai, lịch cập nhật khoảng 30 phút/lần · SIGNED không đồng nghĩa có P12';
    updateStats();
    setMessage(Array.isArray(payload.warnings)&&payload.warnings.length?payload.warnings.join(' '):'');
  } catch(error) {
    $('#sourceInfo').textContent='Chưa xác nhận được trạng thái mới nhất từ nguồn.';
    setMessage('Không tải được danh sách: '+error.message+' Hãy kiểm tra mục Actions trên GitHub hoặc thử lại sau.',true);
  } finally {
    state.loading=false;
    $('#refreshBtn').disabled=false;
    if(state.items.length)render();
  }
}
$('#refreshBtn').addEventListener('click',reload);
$('#search').addEventListener('input',event=>{state.query=event.target.value;render();});
$('#sort').addEventListener('change',event=>{state.sort=event.target.value;render();});
document.querySelectorAll('.tab').forEach(tab=>tab.addEventListener('click',()=>{
  state.filter=tab.dataset.filter;
  document.querySelectorAll('.tab').forEach(x=>x.classList.toggle('active',x===tab));
  render();
}));
reload();
setInterval(()=>{if(!document.hidden)reload();},5*60*1000);
