/* =====================================================================
   app.js — LUỒNG BẤM + MỨC TỰ CHỦ (chủ file: C)
   Mức trong TOOLS phải khớp spec.md §4. Không có nút nào cho AI
   gọi soan_hoan_tien / tu_choi_khieu_nai / phat_shop.
   ===================================================================== */

const TOOLS = [
  { id: 'doc_don_hang', muc: 'auto', note: 'chỉ đọc' },
  { id: 'doc_mo_ta_luc_dat', muc: 'auto', note: 'chỉ đọc snapshot lúc đặt (có ngày)' },
  { id: 'soan_yeu_cau_tra_hang', muc: 'auto', note: 'AI soạn · người mua bấm Gửi' },
  { id: 'yeu_cau_bang_chung', muc: 'auto', note: 'chỉ khi đã rõ đơn · nêu đúng thứ thiếu · không SĐT/địa chỉ' },
  { id: 'chuyen_truong_nhom', muc: 'auto', note: 'có Hoàn tác 5 phút' },
  { id: 'soan_hoan_tien', muc: 'ask', note: 'người bán bấm Chấp nhận, hoặc nhân viên duyệt' },
  { id: 'tu_choi_khieu_nai', muc: 'ban', note: 'chỉ nhân viên, ngoài chat' },
  { id: 'phat_shop', muc: 'ban', note: 'bộ phận chuyên trách' },
];

const MUC = {
  auto: ['p-auto', 'tự làm'], ask: ['p-ask', 'cần người duyệt'], ban: ['p-ban', 'cấm với AI'],
  user: ['p-user', 'người dùng bấm'], human: ['p-human', 'người quyết'], none: ['p-none', 'không gọi'], sys: ['p-sys', 'hệ thống'],
};

const $ = (s) => document.querySelector(s);
const strip = (h) => h.replace(/<[^>]+>/g, '');
const pill = (m) => `<span class="pill ${MUC[m][0]}">${MUC[m][1]}</span>`;

let S;          // trạng thái của ca đang mở
let clock = 30; // đồng hồ giả: 10:30 rồi +1 phút mỗi sự kiện

function now() {
  clock += 1;
  const h = 10 + Math.floor(clock / 60), m = clock % 60;
  return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`;
}

/* ---------- khung chung ---------- */

function reset(caseId) {
  if (S) S.ivs.forEach(clearInterval);
  const c0 = CASES[caseId];
  S = { caseId, c: c0, log: [], seller: null, staff: [], ivs: [], picks: {}, order: null, mt: null, aiNote: '', seq: 0,
    att: [...(c0.daCo || [])],                        // bằng chứng người mua đã đính kèm
    need: c0.canThem ? { ...c0.canThem } : null };   // bằng chứng còn thiếu (có nút 📎)
  clock = 30;
  $('#chat').innerHTML = '';
  document.querySelectorAll('#cases button').forEach((b) => b.classList.toggle('on', b.dataset.id === caseId));
  setOrder(null);
  renderSeller(); renderStaff(); renderLog();
  FLOWS[S.c.kieu].start(S.c);
}

function setOrder(id) {
  S.order = id;
  const o = id && ORDERS[id];
  $('#order').innerHTML = o
    ? `Đơn <b>${o.ma}</b> · ${o.ten} · shop ${o.shop} · ${o.gia}<br>Giao ${o.giao} · hạn trả hàng ${POLICY.hanTraHangNgay} ngày từ ngày giao → <b>đến ${o.hanDen}</b> · hôm nay ${TODAY.slice(0, 5)}: <b>còn ${o.conNgay} ngày</b>`
    : '';
}

function msg(role, html) {
  const d = document.createElement('div');
  d.className = role;
  d.innerHTML = role === 'ai' ? `<div class="who">Trợ lý AI · Shopee</div>${html}` : html;
  $('#chat').appendChild(d);
  $('#chat').scrollTop = d.offsetTop - 6; // cuộn tới đầu tin mới, không phải cuối
  return d;
}

function log(tool, muc, text) {
  S.log.push({ t: now(), tool, muc, text });
  renderLog();
}

function renderLog() {
  $('#log').innerHTML = S.log.length
    ? S.log.map((l) => `<div class="log-r"><span class="t">${l.t}</span><span>${pill(l.muc)} ${l.tool ? `<code>${l.tool}</code> ` : ''}${l.text}</span></div>`).join('')
    : '<div class="empty">Chưa có sự kiện.</div>';
  $('#log').scrollTop = $('#log').scrollHeight;
}

function renderTools() {
  let firstBan = true;
  $('#tools').innerHTML = `<table>${TOOLS.map((t) => {
    const n = t.muc === 'ban' && firstBan ? '<span class="n">8</span>' : '';
    if (t.muc === 'ban') firstBan = false;
    return `<tr><td><code>${t.id}</code></td><td>${n}${pill(t.muc)}</td><td>${t.note}</td></tr>`;
  }).join('')}</table>`;
}

/* ---------- thành phần dùng lại ---------- */

function compareBlock(mt) {
  return `<div class="cmp">
    <div class="cmp-h"><span class="n">2</span>So với mô tả <b>lúc bạn đặt (${mt.ngayDat})</b></div>
    <div class="cmp-g">
      <div class="cmp-c used"><small>Lúc đặt ${mt.ngayDat} · <b>dùng để so</b></small>${mt.lucDat}</div>
      <div class="cmp-c"><small>${mt.ngaySua ? `Hiện tại · shop sửa ${mt.ngaySua}` : 'Hiện tại · không đổi'}</small>${mt.hienTai}</div>
    </div>
    ${mt.ngaySua ? '<div class="flag">⚑ Mô tả đã sửa sau khi bạn đặt. Mình chỉ so với bản lúc đặt.</div>' : ''}
  </div>`;
}

const esc = (s) => String(s).replace(/[&<>"]/g, (ch) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[ch]));

/* Nút gọi AI thật (bonus). Chỉ so sánh, không gọi tool nào. */
const aiRealBtn = () => `<div class="btns"><button class="btn ai-real" data-act="ai-that">✦ So bằng AI thật</button></div>`;

/* Chú thích ký tự trong bảng căn cứ: mỗi dòng ủng hộ khiếu nại tới đâu (G2) */
const EV_LEGEND = `<div class="ev-legend"><span class="ok">✓ ủng hộ khiếu nại</span><span class="warn">⚠ có nhưng chưa chắc</span><span class="wait">○ đang chờ</span><span class="no">✗ không ủng hộ</span><span>– trung lập</span></div>`;

function evidence(list) {
  const ic = { ok: '✓', warn: '⚠', wait: '○', no: '✗', na: '–' };
  return `<div class="ev"><div class="ev-h"><span class="n">3</span>Căn cứ mình đang có</div>
    ${list.map((e) => `<div class="ev-r ${e.s}"><span class="ic">${ic[e.s]}</span><span>${e.t}</span></div>`).join('')}${EV_LEGEND}</div>`;
}

/* ---------- bằng chứng: ảnh nhỏ, nút tải lên, xem lớn ---------- */

const evSrc = (id) => EVIDENCE[id].src || `evidence/${id}.png`;

function thumbs(ids) {
  if (!ids || !ids.length) return '';
  return `<div class="att">${ids.map((id) => {
    const e = EVIDENCE[id];
    return `<button class="thumb" data-act="xem" data-ev="${id}" title="${esc(e.ten)} · bấm để xem">
      <img src="${evSrc(id)}" alt="${esc(e.ten)}">${e.loai === 'video' ? '<span class="vid">▶</span>' : ''}${e.ben === 'shop' ? '<span class="tag">Shop</span>' : ''}</button>`;
  }).join('')}</div>`;
}

function upBtn(need) {
  if (!need || need.done) return '';
  return `<div class="up-row"><button class="btn up" data-act="up" data-ev="${need.ev}">📎 ${need.nut}</button>
    <label class="up-other">hoặc chọn ảnh từ máy<input type="file" accept="image/*" class="up-file" hidden></label></div>`;
}

// Ô "Bằng chứng" trong bản nháp: ảnh đã có + thứ còn thiếu (kèm nút 📎)
function retEv() {
  const miss = S.need && !S.need.done ? `<div class="miss"><b>còn thiếu:</b> ${S.need.thieu}</div>${upBtn(S.need)}` : '';
  return (thumbs(S.att) || (miss ? '' : 'chưa có')) + miss;
}

function attach(id) {
  if (S.att.includes(id)) return;
  const e = EVIDENCE[id], need = S.need;
  S.att.push(id);
  if (need) need.done = true;
  document.querySelectorAll('.up-row').forEach((x) => { x.innerHTML = '<span class="up-ok">✓ Đã đính kèm</span>'; });
  msg('me', `Gửi ${e.loai}: ${esc(e.ten)}${thumbs([id])}`);
  log(null, 'user', `Người mua tải lên ${e.loai}: ${esc(e.ten)}`);
  document.querySelectorAll('.card.ret:not(.sent) .ret-ev').forEach((x) => { x.innerHTML = retEv(); });
  // hồ sơ đã chuyển đi (shop / nhân viên) cũng nhận bằng chứng mới
  S.staff.filter((x) => x.active).forEach((x) => {
    if (x.ev && !x.ev.includes(id)) x.ev.push(id);
    if (need && need.flagCu && x.flags) x.flags = x.flags.map((f) => (f.startsWith(need.flagCu) ? need.flagMoi : f));
  });
  renderStaff();
  if (S.seller) renderSeller();
  if (need && need.aiSau) {
    const cc = need.canCuSau || S.c.canCuSauVideo;
    msg('ai', need.aiSau + (cc ? evidence(cc) : ''));
  } else {
    msg('ai', `<p>Mình đã đính kèm ${e.loai} vào ${S.seller ? 'hồ sơ' : 'bản nháp yêu cầu'}.${S.seller ? '' : ' Bạn xem lại rồi bấm <b>Gửi yêu cầu</b> nhé.'}</p>`);
  }
}

function openLightbox(id) {
  const e = EVIDENCE[id];
  $('#lb img').src = evSrc(id);
  $('#lb .lb-cap').innerHTML = `<b>${esc(e.ten)}</b><br>${e.ben === 'shop' ? 'Shop gửi' : 'Người mua gửi'} · ${e.loai}${e.loai === 'video' ? ' (khung hình dựng, prototype không phát video)' : ''}`;
  $('#lb').hidden = false;
}

function returnCard(id, reason) {
  const o = ORDERS[id];
  const opts = REASONS.map((r) => `<option${r === reason ? ' selected' : ''}>${r}</option>`).join('');
  return `<div class="card ret" id="ret">
    <div class="card-h"><span class="n">4</span>Yêu cầu trả hàng hoàn tiền · <b>bản nháp AI soạn, chưa gửi</b></div>
    <dl>
      <dt>Đơn</dt><dd>${o.ma} · ${o.ten}</dd>
      <dt>Lý do</dt><dd><select id="reason">${opts}</select> <small>(sửa được trước khi gửi)</small></dd>
      <dt>Bằng chứng</dt><dd class="ret-ev">${retEv()}</dd>
      <dt>Hoàn</dt><dd>${o.gia}, sau khi shop nhận lại hàng</dd>
      <dt>Hạn gửi</dt><dd>còn ${o.conNgay} ngày (đến ${o.hanDen})</dd>
    </dl>
    <div class="btns">
      <button class="btn pri" data-act="gui">Gửi yêu cầu</button>
      <button class="btn" data-act="khong-dung">Không đúng ý mình</button>
      <button class="btn out" data-act="nhan-vien">Gặp nhân viên</button>
    </div>
    <div class="status" id="ret-status"></div>
  </div>`;
}

function picker(question) {
  S.picks = {};
  const orders = RECENT_ORDERS.map((id) => `<button class="chip" data-act="pick" data-g="o" data-v="${id}">${ORDERS[id].ten} · giao ${ORDERS[id].giao}</button>`).join('');
  const reasons = REASONS.map((r) => `<button class="chip" data-act="pick" data-g="r" data-v="${r}">${r}</button>`).join('');
  return `<p><span class="n">6</span>${question}</p>
    <div class="chips" data-group="o">${orders}</div>
    <div class="chips" data-group="r">${reasons}</div>
    <div class="btns"><button class="btn pri" data-act="pick-ok" disabled>Xong</button>
    <button class="btn out" data-act="nhan-vien">Gặp nhân viên</button></div>`;
}

/* Chuyển hồ sơ: tool tự làm, kèm Hoàn tác 5 phút */
function transfer({ label, sla, summary, flags, decide, ev }) {
  const id = String(2611100 + (++S.seq));
  const item = { id, label, summary, flags, decide, ev: ev || [...S.att], active: true };
  S.staff.push(item);
  log('chuyen_truong_nhom', 'auto', `Chuyển HS-${id} → ${label}`);
  renderStaff();

  let left = 300;
  const iv = setInterval(() => {
    left -= 1;
    const cd = document.querySelector(`#tf-${id} .cd`);
    if (cd) cd.textContent = `${Math.floor(left / 60)}:${String(left % 60).padStart(2, '0')}`;
    if (left <= 0) {
      clearInterval(iv);
      const b = document.querySelector(`#tf-${id} [data-act="undo"]`);
      if (b) { b.disabled = true; b.textContent = 'Đã chốt chuyển'; }
    }
  }, 1000);
  S.ivs.push(iv);

  return `<div class="card tf" id="tf-${id}">
    <div class="card-h"><span class="n">5</span>Đã chuyển: <b>${label}</b></div>
    <div>Mã hồ sơ HS-${id} · ${sla}</div>
    <div class="btns"><button class="btn" data-act="undo" data-id="${id}">Hoàn tác (<span class="cd">5:00</span>)</button></div>
    <div class="status"></div>
  </div>`;
}

/* ---------- màn người bán ---------- */

function renderSeller() {
  const el = $('#seller');
  const sl = S && S.seller;
  if (!sl) { el.innerHTML = '<div class="empty">Chưa có khiếu nại nào cần shop xử lý.</div>'; return; }
  const o = ORDERS[sl.order];

  if (sl.kind === 'hangGia') {
    el.innerHTML = `<div class="case">
      <h3>Thông báo · Đơn ${o.ma} · ${o.ten}</h3>
      <p>Có khiếu nại <b>nghi hàng giả</b> đang được bộ phận chuyên trách kiểm tra.
      <b>Chưa có quyết định nào ảnh hưởng tới shop.</b></p>
      ${sl.ketQua ? `<div class="done">${sl.ketQua}</div>`
        : '<p><span class="n">7</span>Shop có thể gửi hoá đơn nhập / giấy phân phối · hạn <span class="timer" id="sl-cd"></span></p>'}
      ${S.att.length ? `<div class="ev-sec"><small>Ảnh người mua gửi (bấm để xem)</small>${thumbs(S.att)}</div>` : ''}
      <div class="meta">Liên hệ người mua: ẩn. Liên lạc qua chat trong app.</div>
      ${sl.docs ? `<div class="done">✓ Đã gửi giấy phân phối, đính kèm vào hồ sơ</div>${thumbs([SHOP_EVIDENCE[sl.order]])}`
        : sl.ketQua ? '' : '<div class="btns"><button class="btn ok" data-act="sl-docs">Gửi giấy phân phối</button></div>'}
    </div>`;
    tickSeller();
    return;
  }

  const mt = sl.mt;
  const st = {
    cho: '', ok: '<div class="done">✓ Shop đã chấp nhận trả hàng. Hoàn tiền khi shop nhận lại hàng.</div>',
    no: '<div class="done">Đã gửi bằng chứng phản hồi · chờ nhân viên Shopee quyết</div>',
    timeout: '<div class="done">Quá 48h · hồ sơ đã chuyển nhân viên Shopee (không tự hoàn)</div>',
    final: `<div class="done">${sl.finalText || ''}</div>`,
  }[sl.status];

  el.innerHTML = `<div class="case">
    <h3>Khiếu nại mới · Đơn ${o.ma}</h3>
    <div class="meta">${o.ten} · ${o.gia} · lý do người mua chọn: <b>${sl.reason}</b></div>
    ${mt ? `<div class="cmp-g" style="margin-top:6px">
      <div class="cmp-c used"><small>Mô tả lúc khách đặt ${mt.ngayDat} · căn cứ xét</small>${mt.lucDat}</div>
      <div class="cmp-c"><small>${mt.ngaySua ? `Mô tả hiện tại · sửa ${mt.ngaySua}` : 'Mô tả hiện tại · không đổi'}</small>${mt.hienTai}</div></div>
      ${mt.ngaySua ? `<div class="flag">⚑ Mô tả sửa sau khi bán (${mt.ngaySua}). Khiếu nại được xét theo bản lúc khách đặt.</div>` : ''}` : ''}
    ${sl.note ? `<p class="meta">${sl.note}</p>` : ''}
    ${S.att.length ? `<div class="ev-sec"><small>Bằng chứng người mua (bấm để xem)</small>${thumbs(S.att)}</div>` : '<div class="meta">Người mua chưa gửi ảnh.</div>'}
    ${sl.shopAtt ? `<div class="ev-sec"><small>Bằng chứng shop đã gửi</small>${thumbs(sl.shopAtt)}</div>` : ''}
    <div class="meta">Liên hệ người mua: ẩn. Liên lạc qua chat trong app.</div>
    ${sl.status === 'cho' ? `
      <p><span class="n">7</span>Hạn phản hồi: <span class="timer" id="sl-cd"></span></p>
      <span class="who-decides">Shop quyết bước này, không phải AI</span>
      <div class="btns">
        <button class="btn ok" data-act="sl-ok">Chấp nhận trả hàng</button>
        <button class="btn out" data-act="sl-no">Không đồng ý · gửi bằng chứng</button>
        <button class="btn ghost" data-act="sl-timeout">⏩ Giả lập: hết 48h</button>
      </div>` : st}
  </div>`;
  tickSeller();
}

function tickSeller() {
  const upd = () => {
    const cd = $('#sl-cd');
    if (!cd || !S.seller) return;
    const ms = Math.max(0, S.seller.deadline - Date.now());
    const h = Math.floor(ms / 3.6e6), m = Math.floor(ms / 6e4) % 60, s = Math.floor(ms / 1e3) % 60;
    cd.textContent = `${h}:${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
  };
  upd();
  if (!S.sellerIv) { S.sellerIv = setInterval(upd, 1000); S.ivs.push(S.sellerIv); }
}

/* ---------- hàng chờ nhân viên ---------- */

function renderStaff() {
  const el = $('#staff');
  const items = S ? S.staff.filter((x) => x.active) : [];
  if (!items.length) { el.innerHTML = '<div class="empty">Không có hồ sơ chờ.</div>'; return; }
  el.innerHTML = items.map((x) => `<div class="case">
    <h3>HS-${x.id} · ${x.label}</h3>
    <div class="meta">${x.summary}</div>
    ${x.flags && x.flags.length ? `<ul>${x.flags.map((f) => `<li>${f}</li>`).join('')}</ul>` : ''}
    ${x.ev && x.ev.length ? `<div class="ev-sec"><small>Bằng chứng trong hồ sơ (bấm để xem)</small>${thumbs(x.ev)}</div>` : ''}
    ${x.done ? `<div class="done">${x.done}</div>` : x.decide ? `
      <span class="who-decides">Nhân viên quyết, không phải AI</span>
      ${x.confirm ? `<div class="confirm">${x.confirm === 'hoan'
        ? `Xác nhận <b>hoàn ${ORDERS[S.seller.order].gia}</b> cho người mua? Tiền đã về thì khó đòi lại.`
        : 'Xác nhận <b>đóng khiếu nại</b>, tiền về người bán? Người mua giữ hàng.'}
        <div class="btns"><button class="btn danger" data-act="nv-yes" data-id="${x.id}">Xác nhận</button>
        <button class="btn" data-act="nv-cancel" data-id="${x.id}">Huỷ</button></div></div>`
      : `<div class="btns"><button class="btn ok" data-act="nv-hoan" data-id="${x.id}">Duyệt hoàn tiền</button>
        <button class="btn out" data-act="nv-tuchoi" data-id="${x.id}">Từ chối khiếu nại</button></div>`}`
    : x.label === 'Kiểm tra hàng giả' ? `
      <div class="who-decides">Bộ phận kiểm tra hàng giả quyết, không phải AI, không phải nhân viên khiếu nại</div>
      <p class="meta" style="margin-top:6px">Hồ sơ này <b>không</b> do nhân viên khiếu nại quyết. Bộ phận kiểm tra hàng giả xem tem, serial, video và giấy phân phối, rồi trả lời trong 24 giờ. Không ai có nút khoá shop hay hoàn tiền ở bước này.</p>
      ${S.c.kieu === 'hangGia' ? `<div class="btns"><button class="btn ghost" data-act="kt-ketqua" data-id="${x.id}">⏩ Giả lập: bộ phận kiểm tra trả kết quả</button></div>` : ''}`
    : '<div class="meta" style="margin-top:6px">Bộ phận chuyên trách xử lý ngoài luồng này.</div>'}
  </div>`).join('');
}

/* ---------- luồng theo từng kiểu ca ---------- */

function readOrder(c) {
  const o = ORDERS[c.order];
  setOrder(c.order);
  log('doc_don_hang', 'auto', `Đọc đơn ${o.ma}: giao ${o.giao}, hạn trả hàng đến ${o.hanDen}`);
  if (c.moTa) {
    S.mt = c.moTa;
    log('doc_mo_ta_luc_dat', 'auto', `Snapshot ${c.moTa.ngayDat}: "${strip(c.moTa.lucDat)}"${c.moTa.ngaySua ? ` · cờ: mô tả sửa ${c.moTa.ngaySua}` : ''}`);
  }
}

const FLOWS = {
  traHang: {
    start(c) {
      msg('me', c.buyer + thumbs(S.att));
      readOrder(c);
      log('soan_yeu_cau_tra_hang', 'auto', 'Soạn bản nháp, chờ người mua bấm Gửi');
      if (S.need) log('yeu_cau_bang_chung', 'auto', `Xin người mua: ${S.need.thieu}`);
      msg('ai', c.ai + compareBlock(c.moTa) + aiRealBtn() + evidence(c.canCu) + returnCard(c.order, c.lyDo));
    },
  },

  chuaDuCanCu: {
    start(c) {
      msg('me', c.buyer + thumbs(S.att));
      readOrder(c);
      S.aiNote = c.aiNote;
      log('soan_yeu_cau_tra_hang', 'none', 'Không soạn sẵn: chưa đủ căn cứ. Người mua vẫn có quyền tự gửi');
      msg('ai', c.ai + compareBlock(c.moTa) + aiRealBtn() + evidence(c.canCu) + `<div class="btns">
        <button class="btn out" data-act="van-gui">Mình vẫn muốn gửi yêu cầu</button>
        <button class="btn out" data-act="nhan-vien">Gặp nhân viên</button>
        <button class="btn" data-act="hieu">Mình hiểu rồi</button></div>`);
    },
  },

  hangGia: {
    start(c) {
      const o = ORDERS[c.order];
      msg('me', c.buyer + thumbs(S.att));
      readOrder(c);
      log(null, 'sys', 'Lời doạ "bóc phốt": ghi nhận cho nhân viên, <b>không</b> tính là căn cứ');
      log('phat_shop', 'ban', 'Người mua đòi khoá shop → AI không gọi (cấm), ghi nhận cho bộ phận chuyên trách');
      log('soan_hoan_tien', 'none', 'Không gọi: lời doạ không phải căn cứ; tool cần người duyệt');
      const card = transfer({
        label: 'Kiểm tra hàng giả', sla: 'trả lời trong 24 giờ tại đây',
        summary: `Đơn ${o.ma} · ${o.ten} · shop ${o.shop}`,
        flags: ['Tem + serial trong ảnh khớp mô tả lúc đặt',
          'Lời doạ bóc phốt: ghi nhận, <b>không phải căn cứ</b>',
          'Người mua đòi khoá shop: <code>phat_shop</code> cấm với AI, bộ phận này quyết',
          'Tiếng rè: có thể là lỗi kỹ thuật, chờ video'],
        decide: false,
      });
      log('yeu_cau_bang_chung', 'auto', 'Xin người mua: 1 video 10–15s có tiếng rè');
      log('yeu_cau_bang_chung', 'auto', 'Xin người bán: hoá đơn nhập / giấy phân phối, hạn 48h (mẫu không có SĐT/địa chỉ)');
      S.seller = { kind: 'hangGia', order: c.order, deadline: Date.now() + 48 * 3.6e6 };
      renderSeller();
      msg('ai', c.ai + evidence(c.canCu) + card + upBtn(S.need) + `<div class="btns">
        <button class="btn out" data-act="nhan-vien">Gặp nhân viên</button></div>`);
    },
  },

  mapMo: {
    start(c) {
      msg('me', c.buyer);
      log(null, 'none', 'Chưa gọi tool nào: thiếu đơn nào và sai ở đâu (không đoán đơn mới nhất)');
      msg('ai', picker(c.hoiLai));
    },
  },

  pii: {
    start(c) {
      setOrder(c.order);
      msg('me', c.buyer);
      piiReply(c.ai);
    },
  },

  caLa: {
    start(c) {
      msg('ai', `<p>${c.chao}</p>`);
      $('#free').focus();
    },
  },
};

function piiReply(html) {
  log(null, 'ban', 'Yêu cầu SĐT/địa chỉ bên kia: không tool nào trả thông tin này, từ chối');
  msg('ai', html + '<div class="btns"><button class="btn out" data-act="chat-shop">Chat với shop trong app</button></div>');
}

/* ---------- ca lạ: gõ tự do ---------- */

function routeFree(text) {
  msg('me', text.replace(/</g, '&lt;'));
  const t = text.toLowerCase();
  if (/(sđt|sdt|số điện thoại|so dien thoai|địa chỉ|dia chi|zalo|số đt)/.test(t)) {
    piiReply(CALA_TEXT.pii);
  } else if (/(fake|hàng giả|hang gia|lừa đảo|lua dao|khoá shop|khóa shop|khoa shop|bóc phốt|boc phot|phạt shop)/.test(t)) {
    log('phat_shop', 'ban', 'Yêu cầu khoá/phạt shop → AI không gọi, chuyển chuyên trách');
    const card = transfer({ label: 'Kiểm tra hàng giả', sla: 'trả lời trong 24 giờ tại đây', summary: `Tin người mua: "${text.replace(/</g, '&lt;')}"`, flags: ['Chưa xác định đơn: chuyên trách hỏi lại'], decide: false });
    msg('ai', CALA_TEXT.hangGia + card);
  } else if (/(hoàn tiền ngay|hoàn luôn|hoan luon|refund|trả tiền ngay|hoàn ngay)/.test(t)) {
    log('soan_hoan_tien', 'none', 'Không gọi: cần người bán chấp nhận hoặc nhân viên duyệt');
    msg('ai', CALA_TEXT.hoanNgay + picker('Đơn nào, và sai ở chỗ nào?'));
  } else {
    log(null, 'none', 'Chưa đủ thông tin: hỏi 1 câu, không gọi tool');
    msg('ai', CALA_TEXT.khongRo + picker('Bạn đang nói về <b>đơn nào</b>, và <b>sai ở chỗ nào</b>?'));
  }
}

/* ---------- hành động khi bấm ---------- */

function sendToStaff(reason) {
  const o = ORDERS[S.seller.order];
  const flags = [];
  if (S.seller.mt && S.seller.mt.ngaySua) flags.push(`⚑ Mô tả sửa sau khi bán (${S.seller.mt.ngaySua}). Xét theo bản lúc đặt: "${strip(S.seller.mt.lucDat)}"`);
  if (S.seller.note) flags.push(strip(S.seller.note));
  flags.push(`Lý do người mua: ${S.seller.reason}`);
  transfer({ label: 'Trưởng nhóm khiếu nại', sla: 'nhân viên quyết trong 48h (dựng)', summary: `Đơn ${o.ma} · ${o.ten} · ${reason}`, flags, decide: true,
    ev: [...S.att, ...(S.seller.shopAtt || [])] });
}

const KET_LUAN = {
  khong_dung_mo_ta: 'Không đúng mô tả',
  chua_du_can_cu: 'Chưa đủ căn cứ',
  can_hoi_them: 'Cần hỏi thêm',
};

const ACT = {
  async 'ai-that'(b) {
    const c = S.c;
    const caseAtStart = S.caseId;
    if (location.protocol === 'file:') {
      msg('sys', 'Muốn gọi AI thật: mở terminal trong thư mục prototype, chạy "npm start", sau đó mở http://localhost:3000');
      return;
    }
    b.disabled = true;
    b.textContent = '… Đang gọi AI';
    log(null, 'sys', 'Gọi AI thật: so khiếu nại với mô tả lúc đặt (chỉ so sánh, không gọi tool)');
    try {
      const r = await fetch('/api/so-mo-ta', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          caseId: S.caseId, tenDon: ORDERS[c.order].ten, buyer: c.buyer,
          lucDat: strip(c.moTa.lucDat), hienTai: strip(c.moTa.hienTai), ngayDat: c.moTa.ngayDat, ngaySua: c.moTa.ngaySua,
          // dữ kiện hệ thống + những gì người mua vừa tải lên trong buổi demo
          boiCanh: (c.boiCanh || '') + (S.att.length > (c.daCo || []).length
            ? ` Người mua vừa tải thêm: ${S.att.slice((c.daCo || []).length).map((id) => EVIDENCE[id].ten).join('; ')}.` : ''),
        }),
      });
      const data = await r.json();
      if (S.caseId !== caseAtStart) return; // người dùng đã chuyển ca khác
      if (!r.ok) throw new Error(data.error || `HTTP ${r.status}`);
      const k = data.ketQua;
      const s = (t) => (['ok', 'warn', 'wait', 'no', 'na'].includes(t) ? t : 'wait');
      log(null, 'sys', `AI kết luận: <b>${KET_LUAN[k.ket_luan] || esc(k.ket_luan)}</b> · ${data.ms} ms · log: ai-log/${esc(data.logFile)}`);
      msg('ai', `<div class="real">✦ Kết quả gọi thật · ${esc(data.model)} · ${(data.ms / 1000).toFixed(1)} giây</div>
        <p><b>Kết luận của AI:</b> <span class="kl kl-${esc(k.ket_luan)}">${KET_LUAN[k.ket_luan] || esc(k.ket_luan)}</span></p>
        <p>${esc(k.cau_tra_loi)}</p>
        ${k.can_cu.length ? `<div class="ev"><div class="ev-h">Căn cứ AI tìm thấy</div>
          ${k.can_cu.map((e) => { const st = s(e.trang_thai); return `<div class="ev-r ${st}"><span class="ic">${{ ok: '✓', warn: '⚠', wait: '○', no: '✗', na: '–' }[st]}</span><span>${esc(e.noi_dung)}</span></div>`; }).join('')}${EV_LEGEND}</div>` : ''}
        ${k.con_thieu.length ? `<p><b>Còn thiếu:</b></p><ul>${k.con_thieu.map((x) => `<li>${esc(x)}</li>`).join('')}</ul>${upBtn(S.need)}` : ''}
        <p class="meta">Đây chỉ là bản so sánh của AI. AI không gọi tool nào; người bán hoặc nhân viên Shopee mới là người quyết.</p>`);
      b.textContent = '✓ Đã gọi AI thật';
    } catch (e) {
      if (S.caseId !== caseAtStart) return;
      log(null, 'sys', `Gọi AI thật thất bại: ${esc(e.message)}`);
      msg('sys', `Không gọi được AI thật: ${esc(e.message)}`);
      b.disabled = false;
      b.textContent = '✦ So bằng AI thật';
    }
  },

  gui(b) {
    const card = b.closest('.card');
    const reason = card.querySelector('select').value;
    card.classList.add('sent');
    card.querySelectorAll('.btns button, select').forEach((x) => { x.disabled = true; });
    const o = ORDERS[S.order];
    const t = now();
    card.querySelector('.status').textContent = `✓ Đã gửi lúc ${t}`;
    log('soan_yeu_cau_tra_hang', 'user', `Người mua bấm Gửi · lý do: ${reason}`);
    S.seller = { kind: 'traHang', order: S.order, reason, mt: S.mt, note: S.aiNote, deadline: Date.now() + 48 * 3.6e6, status: 'cho' };
    log(null, 'sys', `Thông báo shop ${o.shop} · hạn phản hồi 48h`);
    renderSeller();
    msg('ai', `<p>Đã gửi yêu cầu lúc ${t}. Shop <b>${o.shop}</b> đã nhận thông báo và có <b>48 giờ</b> để phản hồi.</p>
      <p>Nếu shop chấp nhận, bạn gửi hàng về và được hoàn ${o.gia}. Nếu shop không đồng ý hoặc không trả lời, nhân viên Shopee sẽ xem hồ sơ và quyết. Mình sẽ báo bạn ở đây.</p>`);
  },

  'khong-dung'() {
    msg('ai', `<p>Cảm ơn bạn. Mình sai ở chỗ nào?</p><div class="chips">
      ${['Sai đơn', 'Sai lý do', 'Mình muốn đổi hàng, không hoàn tiền', 'Khác'].map((v) => `<button class="chip" data-act="fb" data-v="${v}">${v}</button>`).join('')}</div>`);
  },

  fb(b) {
    const v = b.dataset.v;
    b.parentElement.querySelectorAll('button').forEach((x) => { x.disabled = true; });
    b.classList.add('sel');
    log(null, 'user', `Người mua chỉ chỗ AI sai: "${v}"`);
    if (v === 'Sai đơn') msg('ai', picker('Xin lỗi bạn. Bạn chọn lại <b>đơn</b> và <b>chỗ sai</b> giúp mình nhé:'));
    else if (v === 'Sai lý do') msg('ai', '<p>Bạn đổi ở ô <b>Lý do</b> trong bản nháp rồi bấm Gửi nhé. Mình chưa gửi gì cả.</p>');
    else if (v.startsWith('Mình muốn đổi')) msg('ai', '<p>Luồng này chỉ hỗ trợ trả hàng hoàn tiền. Đổi hàng cần shop đồng ý: bạn chat với shop, hoặc mình chuyển nhân viên.</p><div class="btns"><button class="btn out" data-act="chat-shop">Chat với shop</button><button class="btn out" data-act="nhan-vien">Gặp nhân viên</button></div>');
    else msg('ai', '<p>Mình chuyển bạn sang nhân viên để xem kỹ hơn nhé.</p><div class="btns"><button class="btn out" data-act="nhan-vien">Gặp nhân viên</button></div>');
  },

  'nhan-vien'() {
    const o = S.order ? ORDERS[S.order] : null;
    const card = transfer({
      label: 'Nhân viên hỗ trợ', sla: 'nhân viên trả lời trong giờ làm việc',
      summary: o ? `Đơn ${o.ma} · ${o.ten} · người mua yêu cầu gặp nhân viên` : 'Chưa xác định đơn · người mua yêu cầu gặp nhân viên',
      flags: S.mt && S.mt.ngaySua ? [`⚑ Mô tả sửa sau khi bán (${S.mt.ngaySua})`] : [], decide: false,
    });
    msg('ai', '<p>Mình đã chuyển hồ sơ kèm toàn bộ những gì bạn gửi, bạn không phải kể lại.</p>' + card);
  },

  undo(b) {
    const x = S.staff.find((i) => i.id === b.dataset.id);
    if (!x) return;
    x.active = false;
    if (S.seller && S.seller.kind === 'hangGia' && x.label === 'Kiểm tra hàng giả') { S.seller = null; renderSeller(); }
    renderStaff();
    log('chuyen_truong_nhom', 'user', `Người mua hoàn tác chuyển HS-${x.id}`);
    const card = b.closest('.card');
    card.querySelector('.status').textContent = 'Đã huỷ chuyển.';
    b.outerHTML = `<button class="btn" data-act="redo" data-id="${x.id}">Chuyển lại</button>`;
  },

  redo(b) {
    const x = S.staff.find((i) => i.id === b.dataset.id);
    if (!x) return;
    x.active = true;
    if (x.label === 'Kiểm tra hàng giả' && S.c.kieu === 'hangGia') { S.seller = { kind: 'hangGia', order: S.c.order, deadline: Date.now() + 48 * 3.6e6 }; renderSeller(); }
    renderStaff();
    log('chuyen_truong_nhom', 'auto', `Chuyển lại HS-${x.id}`);
    b.closest('.card').querySelector('.status').textContent = 'Đã chuyển lại.';
    b.disabled = true;
  },

  'van-gui'(b) {
    b.parentElement.querySelectorAll('button').forEach((x) => { x.disabled = true; });
    log('soan_yeu_cau_tra_hang', 'auto', 'Soạn theo yêu cầu người mua, kèm ghi chú trung lập cho shop');
    msg('ai', `<p>Được, đây là bản nháp. Shop sẽ thấy ghi chú trung lập của mình ("chưa đủ căn cứ"), <b>không phải</b> một quyết định.</p>` + returnCard(S.c.order, S.c.lyDo));
  },

  hieu(b) {
    b.parentElement.querySelectorAll('button').forEach((x) => { x.disabled = true; });
    log(null, 'user', 'Người mua đồng ý với giải thích, không gửi yêu cầu');
    msg('ai', `<p>Cảm ơn bạn. Nếu sau này thấy lòng rổ nhỏ hơn 5L hoặc nồi có lỗi khác, bạn quay lại đây trước <b>${ORDERS[S.c.order].hanDen}</b> nhé.</p>`);
  },

  // 📎 Tải lên: demo đính kèm ngay ảnh dựng sẵn trong evidence/
  up(b) { attach(b.dataset.ev); },

  xem(b) { openLightbox(b.dataset.ev); },
  noop() {}, // bấm vào ảnh lớn không đóng khung
  'lb-close'() { $('#lb').hidden = true; $('#lb img').src = ''; },

  pick(b) {
    const g = b.dataset.g;
    b.parentElement.querySelectorAll('.chip').forEach((x) => x.classList.remove('sel'));
    b.classList.add('sel');
    S.picks[g] = b.dataset.v;
    const ok = b.closest('.ai').querySelector('[data-act="pick-ok"]');
    if (ok) ok.disabled = !(S.picks.o && S.picks.r);
  },

  'pick-ok'(b) {
    const box = b.closest('.ai');
    box.querySelectorAll('button').forEach((x) => { x.disabled = true; });
    const id = S.picks.o, r = S.picks.r, o = ORDERS[id];
    setOrder(id);
    S.mt = null; S.aiNote = '';
    log('doc_don_hang', 'auto', `Đọc đơn ${o.ma}: giao ${o.giao}, hạn đến ${o.hanDen}`);
    log('soan_yeu_cau_tra_hang', 'auto', 'Soạn bản nháp, chờ người mua bấm Gửi');
    const need = { 'Sai size': '1 ảnh tem size', 'Sai màu / mẫu': '1 ảnh sản phẩm dưới ánh sáng tự nhiên', 'Thiếu hoặc sai số lượng': '1 ảnh tất cả món trong hộp', 'Thông số không như mô tả': '1 ảnh/video đo thông số', 'Hàng lỗi / hỏng': '1 ảnh/video chỗ lỗi' }[r];
    const pe = PICK_EVIDENCE[id] || {};
    S.att = [];
    S.need = { ev: pe[r] || pe._, nut: `Tải ${need}`, thieu: need };
    log('yeu_cau_bang_chung', 'auto', `Xin người mua: ${need}`);
    msg('ai', `<p>Cảm ơn bạn. Đơn <b>${o.ma}</b> (${o.ten}), lý do <b>${r}</b>. Mình đã soạn sẵn yêu cầu bên dưới; bạn tải thêm <b>${need}</b> rồi bấm Gửi. Hạn còn <b>${o.conNgay} ngày</b>.</p>`
      + returnCard(id, r));
  },

  'chat-shop'(b) {
    b.disabled = true;
    msg('sys', 'Mở cửa sổ chat với shop trong app. Hai bên không thấy SĐT/địa chỉ của nhau.');
  },

  'sl-ok'() {
    const o = ORDERS[S.seller.order];
    S.seller.status = 'ok';
    log('soan_hoan_tien', 'ask', `<b>Người bán duyệt</b>: chấp nhận trả hàng → hoàn ${o.gia} khi shop nhận lại hàng`);
    renderSeller();
    msg('ai', `<p>Shop <b>${o.shop}</b> đã chấp nhận trả hàng. Bạn đóng gói và gửi hàng về theo hướng dẫn; ${o.gia} sẽ được hoàn sau khi shop nhận lại hàng.</p>`);
  },

  'sl-no'() {
    S.seller.status = 'no';
    const se = SHOP_EVIDENCE[S.seller.order];
    if (se) S.seller.shopAtt = [se];
    log(null, 'user', `Người bán không đồng ý, gửi bằng chứng phản hồi${se ? `: ${EVIDENCE[se].ten}` : ''}`);
    sendToStaff('hai bên không thống nhất');
    renderSeller();
    msg('ai', '<p>Shop chưa đồng ý và đã gửi bằng chứng của họ. Hồ sơ đã chuyển <b>nhân viên Shopee</b> để quyết; bạn chưa cần làm gì thêm. Mình không tự quyết hoàn tiền hay từ chối.</p>');
  },

  'sl-timeout'() {
    S.seller.status = 'timeout';
    log(null, 'sys', 'Quá 48h người bán không phản hồi → <b>không</b> tự hoàn, chuyển nhân viên');
    sendToStaff('người bán quá hạn 48h');
    renderSeller();
    msg('ai', '<p>Shop không phản hồi trong 48 giờ. Hồ sơ đã chuyển <b>nhân viên Shopee</b> để quyết; bạn chưa cần làm gì thêm.</p>');
  },

  'sl-docs'() {
    S.seller.docs = true;
    log(null, 'user', 'Người bán gửi giấy phân phối');
    const x = S.staff.find((i) => i.label === 'Kiểm tra hàng giả' && i.active);
    if (x) { x.flags.push('Shop đã gửi giấy phân phối'); x.ev.push(SHOP_EVIDENCE[S.seller.order]); renderStaff(); }
    renderSeller();
  },

  // K5: bộ phận kiểm tra hàng giả (con người) trả kết quả dựng. AI chỉ báo lại, không quyết gì.
  'kt-ketqua'(b) {
    const x = S.staff.find((i) => i.id === b.dataset.id);
    const coVideo = S.att.includes('d3-video-re');
    x.done = `✓ Kết luận của bộ phận kiểm tra: tem + serial hợp lệ (đã tra với hãng), <b>không phải hàng giả</b>. Không phạt shop.
      ${coVideo ? 'Tiếng rè có trong video → xử lý như <b>lỗi kỹ thuật</b> qua yêu cầu trả hàng thường.' : 'Tiếng rè: chưa có video, người mua có thể gửi kèm yêu cầu trả hàng thường.'}`;
    log('phat_shop', 'human', '<b>Bộ phận kiểm tra hàng giả</b> kết luận: không phải hàng giả → không phạt shop');
    const undo = document.querySelector(`#tf-${x.id} [data-act="undo"]`);
    if (undo) { undo.disabled = true; undo.textContent = 'Đã có kết quả kiểm tra'; }
    if (S.seller && S.seller.kind === 'hangGia') {
      S.seller.ketQua = '✓ Kết quả kiểm tra: <b>không phải hàng giả</b>. Không có hình phạt nào cho shop. Nếu người mua gửi yêu cầu trả hàng vì lỗi kỹ thuật, shop sẽ nhận thông báo như khiếu nại thường (48h).';
      renderSeller();
    }
    renderStaff();
    msg('ai', `<p>Bộ phận kiểm tra hàng giả đã trả kết quả: tem và serial <b>hợp lệ</b>, sản phẩm <b>không phải hàng giả</b>. Đây là kết luận của bộ phận kiểm tra, không phải của mình.</p>
      <p>Tiếng rè vẫn có thể là <b>lỗi kỹ thuật</b>. Nếu bạn muốn trả hàng vì lỗi này, mình đã soạn sẵn bản nháp bên dưới; bạn xem lại rồi bấm Gửi. Hạn còn <b>${ORDERS[S.c.order].conNgay} ngày</b>.</p>`
      + returnCard(S.c.order, 'Hàng lỗi / hỏng'));
    log('soan_yeu_cau_tra_hang', 'auto', 'Soạn bản nháp trả hàng vì lỗi kỹ thuật, chờ người mua bấm Gửi');
  },

  'nv-hoan'(b) { const x = S.staff.find((i) => i.id === b.dataset.id); x.confirm = 'hoan'; renderStaff(); },
  'nv-tuchoi'(b) { const x = S.staff.find((i) => i.id === b.dataset.id); x.confirm = 'tuchoi'; renderStaff(); },
  'nv-cancel'(b) { const x = S.staff.find((i) => i.id === b.dataset.id); x.confirm = null; renderStaff(); },

  'nv-yes'(b) {
    const x = S.staff.find((i) => i.id === b.dataset.id);
    const o = ORDERS[S.seller.order];
    if (x.confirm === 'hoan') {
      log('soan_hoan_tien', 'human', `<b>Nhân viên duyệt</b>: hoàn ${o.gia} cho người mua`);
      x.done = '✓ Đã duyệt hoàn tiền';
      S.seller.finalText = `Nhân viên Shopee đã quyết: hoàn ${o.gia} cho người mua.`;
      msg('sys', `Nhân viên Shopee đã quyết: hoàn ${o.gia} cho bạn.`);
    } else {
      log('tu_choi_khieu_nai', 'human', '<b>Nhân viên</b> đóng khiếu nại, tiền về người bán');
      x.done = '✓ Đã đóng khiếu nại';
      S.seller.finalText = 'Nhân viên Shopee đã quyết: đóng khiếu nại, tiền về shop.';
      msg('sys', 'Nhân viên Shopee đã xem hồ sơ và đóng khiếu nại. Nếu có bằng chứng mới, bạn có thể gặp nhân viên trong 7 ngày.');
    }
    x.confirm = null;
    S.seller.status = 'final';
    renderStaff(); renderSeller();
  },
};

/* ---------- khởi động ---------- */

document.addEventListener('click', (e) => {
  const b = e.target.closest('[data-act]');
  if (!b || b.disabled) return;
  const f = ACT[b.dataset.act];
  if (f) f(b);
});

$('#composer').addEventListener('submit', (e) => {
  e.preventDefault();
  const v = $('#free').value.trim();
  if (!v) return;
  $('#free').value = '';
  routeFree(v);
});

// "hoặc chọn ảnh từ máy": dùng ảnh thật trên máy người demo (chỉ hiện trong trình duyệt, không tải lên đâu cả)
document.addEventListener('change', (e) => {
  if (!e.target.classList.contains('up-file') || !e.target.files[0]) return;
  const f = e.target.files[0];
  const id = `tu-may-${Date.now()}`;
  EVIDENCE[id] = { ten: f.name, loai: 'ảnh', ben: 'nguoiMua', src: URL.createObjectURL(f) };
  attach(id);
});

// Khung xem ảnh lớn: bấm nền hoặc Esc để đóng
document.body.insertAdjacentHTML('beforeend', `<div id="lb" hidden data-act="lb-close">
  <div class="lb-box" data-act="noop"><img alt=""><div class="lb-cap"></div><button class="btn" data-act="lb-close">Đóng ✕</button></div></div>`);
document.addEventListener('keydown', (e) => { if (e.key === 'Escape' && !$('#lb').hidden) ACT['lb-close'](); });

$('#ann').addEventListener('change', (e) => document.body.classList.toggle('hide-n', !e.target.checked));

$('#cases').innerHTML = Object.entries(CASES).map(([id, c]) =>
  `<button data-id="${id}">${c.tab}${c.badge ? `<span class="badge${c.badge === 'đắt nhất' ? ' hot' : ''}">${c.badge}</span>` : ''}</button>`).join('');
$('#cases').addEventListener('click', (e) => { const b = e.target.closest('button'); if (b) reset(b.dataset.id); });

renderTools();
reset('K3');
