/* =====================================================================
   server.mjs — server nhỏ cho bonus "lời gọi AI thật" (chủ file: C)
   - Đọc OPENROUTER_API_KEY từ prototype/.env (không commit file này)
   - Phục vụ prototype tại http://localhost:3000
   - POST /api/so-mo-ta: gọi model AI (DeepSeek V4 Flash qua OpenRouter) so khiếu nại với
     MÔ TẢ LÚC ĐẶT, ghi log vào prototype/ai-log/ làm bằng chứng (không chứa key)
   Chạy:  npm start   (không cần npm install, chỉ cần Node >= 20.12)
   ===================================================================== */
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
try { process.loadEnvFile(path.join(here, '.env')); } catch { /* chưa có .env */ }

const PORT = Number(process.env.PORT) || 3000;
const MODEL = process.env.OPENROUTER_MODEL || 'deepseek/deepseek-v4-flash';
const API_KEY = process.env.OPENROUTER_API_KEY;
const hasKey = Boolean(API_KEY);
const ENDPOINT = 'https://openrouter.ai/api/v1/chat/completions';

/* AI chỉ SO SÁNH và đề xuất câu trả lời. Nó không gọi tool nào,
   không quyết hoàn tiền / từ chối — đúng mức tự chủ ở spec §4. */
const SYSTEM = `Bạn là trợ lý AI trong mục "Trò chuyện với Shopee", giúp người mua báo "hàng không đúng mô tả".
Nhiệm vụ duy nhất: so khiếu nại của người mua với MÔ TẢ LÚC ĐẶT HÀNG, rồi nói rõ căn cứ.

Đầu vào gồm: mô tả lúc đặt, mô tả hiện tại, tin nhắn người mua, và "Dữ kiện hệ thống Shopee đã có".
"Dữ kiện hệ thống" là thứ Shopee đã thấy trực tiếp (ảnh người mua đính kèm, tin nhắn trong chat Shopee của đơn, trạng thái đơn):
coi là ĐÃ KIỂM CHỨNG. Không xin người mua gửi lại hay chụp màn hình những thứ đã có ở đây.

Quy tắc:
- Chỉ dùng "mô tả lúc đặt" làm căn cứ. "Mô tả hiện tại" chỉ để biết người bán có sửa sau khi bán; không bao giờ dùng nó để kết luận.
- Không tự quyết hoàn tiền hay từ chối; không hứa phạt shop. Người bán có 48 giờ phản hồi sau khi người mua gửi yêu cầu, nhân viên Shopee quyết khi hai bên không thống nhất.
- Lời doạ (bóc phốt, đánh giá xấu) không phải căn cứ.

Làm theo thứ tự:
1. "mo_ta_luc_dat_ghi": trích chi tiết liên quan trong mô tả lúc đặt (ví dụ "size L", "lòng nồi 6L", "lòng rổ 5L").
2. "nguoi_mua_nhan": người mua nói đã nhận / đo được gì (ví dụ "size M", "lòng nồi 5L").
3. "lech": so hai cái trên. Chỉ so CON SỐ / THUỘC TÍNH, không xét bằng chứng mạnh hay yếu ở bước này.
   Ví dụ: mô tả "lòng nồi 6L", người mua đo "5L" → "co". Mô tả "lòng rổ 5L", người mua đo lòng "5L" → "khong".
   Người mua hay gọi cùng một bộ phận bằng từ khác (ví dụ "lòng nồi" và "lòng rổ" đều là phần chứa đồ ăn).
   Nếu con số người mua đo trùng với con số mô tả lúc đặt ghi cho bộ phận tương ứng thì "lech" = "khong".
4. "ket_luan" PHẢI theo "lech": "co" → "khong_dung_mo_ta"; "khong" → "chua_du_can_cu"; "chua_ro" → "can_hoi_them".
   Bằng chứng còn yếu không làm đổi kết luận: ghi nó là "warn" trong "can_cu" và đưa vào "con_thieu".

Ý nghĩa "ket_luan":
- "khong_dung_mo_ta": mô tả lúc đặt ghi rõ một điều, và điều người mua nhận được khác điều đó (có ảnh, hoặc người bán đã thừa nhận, hoặc số đo người mua báo mâu thuẫn trực tiếp với con số trong mô tả lúc đặt). Vẫn chọn mức này khi chỉ còn thiếu một bằng chứng phụ để củng cố; ghi bằng chứng đó vào "con_thieu".
- "chua_du_can_cu": mô tả lúc đặt đã ghi đúng (hoặc không mâu thuẫn với) điều người mua phàn nàn, tức là hàng có vẻ đúng mô tả lúc đặt.
- "can_hoi_them": chỉ khi thiếu thông tin cơ bản để so: không rõ đơn nào, hoặc không rõ chỗ nào sai.

"can_cu": 2–4 điểm, mỗi điểm một câu tiếng Việt có dấu. "trang_thai" cho biết điểm đó có ỦNG HỘ KHIẾU NẠI của người mua không:
  · "ok"   = đã kiểm, ủng hộ khiếu nại (hàng lệch mô tả lúc đặt; người bán thừa nhận gửi sai trong chat Shopee; người bán sửa mô tả sau khi bán).
  · "warn" = có nhưng chưa chắc, cần thêm bằng chứng (số đo người mua tự báo, ảnh không thấy rõ chi tiết cần so).
  · "wait" = chưa có, đang chờ một bên làm (người bán chưa bấm Chấp nhận, người bán chưa phản hồi).
  · "no"   = đã kiểm, KHÔNG ủng hộ khiếu nại (mô tả lúc đặt đã ghi đúng điều người mua phàn nàn).
  · "na"   = trung lập, chỉ để thông tin (ví dụ "mô tả không bị sửa sau khi bán").
  "ok" KHÔNG có nghĩa là "khớp với mô tả": nếu hàng đúng như mô tả lúc đặt thì điểm đó là "no".
  Bằng chứng còn yếu (ảnh không thấy rõ, chưa có video) luôn là "warn", không phải "ok" hay "no".
  "Mô tả không bị sửa sau khi bán" luôn là "na".

"con_thieu": chỉ ghi thứ THỰC SỰ chưa có (không ghi thứ đã có trong "Dữ kiện hệ thống"); tối đa 1 mục quan trọng nhất; có thể rỗng.
Mỗi mục là một câu tiếng Việt có dấu, KHÔNG viết dạng mã như ten_bien_snake_case.

"cau_tra_loi": tiếng Việt, xưng "mình", gọi người mua là "bạn", tối đa 4 câu, mở đầu bằng việc đã so với mô tả lúc đặt ngày nào, nói rõ bước tiếp theo người mua nên làm.
Bước tiếp theo phải theo đúng những gì đang có trong khung chat, không bảo người mua vào menu khác của ứng dụng:
- Nếu "khong_dung_mo_ta": trong chat đã có sẵn bản nháp yêu cầu trả hàng hoàn tiền, người mua xem lại rồi bấm "Gửi yêu cầu".
- Nếu "chua_du_can_cu": nếu người mua vẫn thấy sai thì bấm "Mình vẫn muốn gửi yêu cầu" hoặc "Gặp nhân viên".`;

const SCHEMA = {
  type: 'object',
  additionalProperties: false,
  required: ['mo_ta_luc_dat_ghi', 'nguoi_mua_nhan', 'lech', 'can_cu', 'ket_luan', 'con_thieu', 'cau_tra_loi'],
  properties: {
    // Model phải so trước (3 trường đầu), rồi mới kết luận: model nhỏ chọn kết luận trước thì hay tự mâu thuẫn
    mo_ta_luc_dat_ghi: { type: 'string', description: 'Trích đúng chi tiết liên quan trong mô tả lúc đặt' },
    nguoi_mua_nhan: { type: 'string', description: 'Điều người mua nói là đã nhận / đo được' },
    lech: { type: 'string', enum: ['co', 'khong', 'chua_ro'], description: 'co = điều người mua nhận khác điều mô tả lúc đặt ghi; khong = trùng hoặc không mâu thuẫn; chua_ro = không biết đơn nào / chỗ nào sai' },
    can_cu: {
      type: 'array',
      items: {
        type: 'object',
        additionalProperties: false,
        required: ['trang_thai', 'noi_dung'],
        properties: {
          trang_thai: { type: 'string', enum: ['ok', 'warn', 'wait', 'no', 'na'], description: 'ok = ủng hộ khiếu nại · warn = có nhưng chưa chắc · wait = đang chờ · no = không ủng hộ khiếu nại · na = trung lập' },
          noi_dung: { type: 'string' },
        },
      },
    },
    ket_luan: { type: 'string', enum: ['khong_dung_mo_ta', 'chua_du_can_cu', 'can_hoi_them'] },
    con_thieu: { type: 'array', items: { type: 'string', description: 'Một câu tiếng Việt có dấu, không phải mã' } },
    cau_tra_loi: { type: 'string' },
  },
};

function buildPrompt(d) {
  return `Đơn: ${d.tenDon}
Ngày đặt: ${d.ngayDat}
Mô tả lúc đặt (${d.ngayDat}): "${d.lucDat}"
Mô tả hiện tại: "${d.hienTai}"${d.ngaySua ? ` (người bán sửa ngày ${d.ngaySua})` : ' (không thay đổi)'}

Dữ kiện hệ thống Shopee đã có (đã kiểm chứng):
${d.boiCanh || '(không có thêm dữ kiện)'}

Tin nhắn người mua:
"${d.buyer}"`;
}

class ApiError extends Error {
  constructor(status, message) { super(message); this.status = status; }
}

const API_ERRORS = {
  401: 'OPENROUTER_API_KEY sai hoặc đã bị thu hồi. Kiểm tra lại prototype/.env.',
  402: 'Tài khoản OpenRouter hết credit. Nạp thêm tại openrouter.ai/settings/credits.',
  429: 'Đang bị giới hạn tần suất gọi. Đợi vài giây rồi thử lại.',
};

async function soMoTa(d) {
  const t0 = Date.now();
  let r;
  try {
    r = await fetch(ENDPOINT, {
      method: 'POST',
      headers: { Authorization: `Bearer ${API_KEY}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        model: MODEL,
        max_tokens: 16000,
        temperature: 0.2, // so sánh cần ổn định, không cần sáng tạo
        messages: [
          { role: 'system', content: SYSTEM },
          { role: 'user', content: buildPrompt(d) },
        ],
        // Ép câu trả lời đúng khuôn JSON ở trên (structured output)
        response_format: { type: 'json_schema', json_schema: { name: 'so_mo_ta', strict: true, schema: SCHEMA } },
      }),
      signal: AbortSignal.timeout(120000),
    });
  } catch (e) {
    throw new ApiError(502, `Không kết nối được OpenRouter: ${e.message}`);
  }

  const data = await r.json().catch(() => ({}));
  if (!r.ok || data.error) {
    const status = r.ok ? (data.error.code || 502) : r.status;
    throw new ApiError(status, API_ERRORS[status] || `Lỗi từ OpenRouter (${status}): ${data.error?.message || r.statusText}`);
  }

  const choice = data.choices?.[0];
  if (!choice?.message?.content) throw new ApiError(502, 'Phản hồi không có nội dung.');
  if (choice.finish_reason === 'content_filter') throw new ApiError(422, 'Model từ chối trả lời yêu cầu này.');

  let ketQua;
  try {
    ketQua = JSON.parse(choice.message.content);
  } catch {
    const m = choice.message.content.match(/\{[\s\S]*\}/); // phòng khi model bọc JSON trong chữ
    if (!m) throw new ApiError(502, 'Model không trả về JSON đúng khuôn.');
    ketQua = JSON.parse(m[0]);
  }
  // Model nhỏ đôi khi trả mục rỗng ("") hoặc thiếu mảng: chuẩn hoá trước khi gửi xuống giao diện
  ketQua.can_cu = (Array.isArray(ketQua.can_cu) ? ketQua.can_cu : []).filter((c) => c && String(c.noi_dung || '').trim());
  if (!d.ngaySua) for (const c of ketQua.can_cu) if (/không (bị )?(sửa|thay đổi)/i.test(c.noi_dung) && !/lệch|khác|nhưng/i.test(c.noi_dung)) c.trang_thai = 'na';
  const THEO_LECH = { co: 'khong_dung_mo_ta', khong: 'chua_du_can_cu', chua_ro: 'can_hoi_them' };
  if (THEO_LECH[ketQua.lech] && ketQua.ket_luan !== THEO_LECH[ketQua.lech]) {
    ketQua.ket_luan_goc = ketQua.ket_luan; // ghi lại trong log để thấy model tự mâu thuẫn
    ketQua.ket_luan = THEO_LECH[ketQua.lech];
  }
  ketQua.con_thieu = (Array.isArray(ketQua.con_thieu) ? ketQua.con_thieu : []).filter((s) => String(s || '').trim())
    .map((s) => (/^[a-z0-9_]+$/i.test(s) ? s.replace(/_/g, ' ') : s)); // phòng khi model vẫn trả dạng mã snake_case
  ketQua.cau_tra_loi = String(ketQua.cau_tra_loi || '');
  return { ketQua, model: data.model || MODEL, usage: data.usage, ms: Date.now() - t0 };
}

function writeLog(caseId, input, output) {
  const dir = path.join(here, 'ai-log');
  fs.mkdirSync(dir, { recursive: true });
  const stamp = new Date().toISOString().replace(/[:.]/g, '-');
  const file = path.join(dir, `${stamp}-${caseId}.json`);
  fs.writeFileSync(file, JSON.stringify({ thoi_gian: new Date().toISOString(), ca: caseId, model: output.model, dau_vao: input, ket_qua: output.ketQua, usage: output.usage, ms: output.ms }, null, 2));
  return path.basename(file);
}

/* ---------- HTTP ---------- */

const TYPES = { '.html': 'text/html', '.css': 'text/css', '.js': 'text/javascript', '.png': 'image/png', '.json': 'application/json', '.md': 'text/markdown' };
const PUBLIC = new Set(['index.html', 'style.css', 'cases.js', 'app.js', 'README.md']);

function send(res, status, body, type = 'application/json') {
  const bin = Buffer.isBuffer(body);
  res.writeHead(status, { 'Content-Type': bin ? type : `${type}; charset=utf-8` });
  res.end(bin || typeof body === 'string' ? body : JSON.stringify(body));
}

function readBody(req) {
  return new Promise((resolve, reject) => {
    let raw = '';
    req.on('data', (c) => { raw += c; if (raw.length > 20000) { reject(new Error('Dữ liệu quá lớn')); req.destroy(); } });
    req.on('end', () => { try { resolve(JSON.parse(raw)); } catch { reject(new Error('JSON không hợp lệ')); } });
  });
}

const FIELDS = ['caseId', 'tenDon', 'buyer', 'lucDat', 'hienTai', 'ngayDat'];

const server = http.createServer(async (req, res) => {
  const url = new URL(req.url, `http://${req.headers.host}`);

  if (req.method === 'GET' && url.pathname === '/api/status') return send(res, 200, { hasKey, model: MODEL });

  if (req.method === 'POST' && url.pathname === '/api/so-mo-ta') {
    if (!hasKey) return send(res, 400, { error: 'Chưa có OPENROUTER_API_KEY trong prototype/.env. Điền key rồi chạy lại npm start.' });
    let d;
    try { d = await readBody(req); } catch (e) { return send(res, 400, { error: e.message }); }
    for (const f of FIELDS) if (typeof d[f] !== 'string' || d[f].length > 2000) return send(res, 400, { error: `Thiếu hoặc sai trường ${f}` });
    const input = { tenDon: d.tenDon, buyer: d.buyer, lucDat: d.lucDat, hienTai: d.hienTai, ngayDat: d.ngayDat, ngaySua: typeof d.ngaySua === 'string' ? d.ngaySua : null, boiCanh: typeof d.boiCanh === 'string' ? d.boiCanh.slice(0, 2000) : '' };
    try {
      const out = await soMoTa(input);
      const logFile = writeLog(d.caseId.replace(/[^\w-]/g, ''), input, out);
      console.log(`[AI] ${d.caseId} → ${out.ketQua.ket_luan} (${out.ms} ms) · log: ai-log/${logFile}`);
      return send(res, 200, { ...out, logFile });
    } catch (e) {
      const status = Number.isInteger(e.status) && e.status >= 400 && e.status < 600 ? e.status : 500;
      console.log(`[AI] ${d.caseId} lỗi ${status}: ${e.message}`);
      return send(res, status, { error: e.message });
    }
  }

  if (req.method === 'GET') {
    const name = url.pathname === '/' ? 'index.html' : url.pathname.slice(1);
    // Ảnh bằng chứng dựng: chỉ evidence/<tên>.png, không cho đi ra ngoài thư mục
    if (/^evidence\/[\w-]+\.png$/.test(name) && fs.existsSync(path.join(here, name))) {
      return send(res, 200, fs.readFileSync(path.join(here, name)), 'image/png');
    }
    if (!PUBLIC.has(name)) return send(res, 404, 'Không tìm thấy', 'text/plain');
    return send(res, 200, fs.readFileSync(path.join(here, name), 'utf8'), TYPES[path.extname(name)] || 'text/plain');
  }

  send(res, 405, 'Method not allowed', 'text/plain');
});

server.listen(PORT, '127.0.0.1', () => {
  console.log(`Prototype: http://localhost:${PORT}`);
  console.log(hasKey ? `Đã đọc OPENROUTER_API_KEY từ .env · model ${MODEL}` : 'CHƯA có OPENROUTER_API_KEY trong prototype/.env: nút "So bằng AI thật" sẽ báo lỗi.');
});
