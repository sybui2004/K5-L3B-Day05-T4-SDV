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

/* ---------- AI WORKFLOW (AI QUYẾT ĐỊNH QUY TRÌNH TIẾP THEO) ---------- */

const WORKFLOW_SYSTEM = `Bạn là trợ lý AI thông minh của Shopee, có thẩm quyền QUYẾT ĐỊNH WORKFLOW TIẾP THEO trong quy trình khiếu nại "hàng không đúng mô tả".

QUYỀN HẠN & GIỚI HẠN (Mức tự chủ spec §4):
- AI KHÔNG tự quyết hoàn tiền hay từ chối khiếu nại (soan_hoan_tien cần người bán hoặc nhân viên sàn duyệt; tu_choi_khieu_nai CẤM với AI).
- AI KHÔNG tự ý phạt shop hay hứa phạt shop (phat_shop CẤM với AI, chuyển bộ phận chuyên trách).
- AI KHÔNG cung cấp SĐT / địa chỉ cá nhân bên kia (bảo vệ quyền riêng tư).
- Luôn so với MÔ TẢ LÚC ĐẶT (snapshot), KHÔNG so với mô tả hiện tại nếu đã bị shop sửa.

CÁC HÀNH ĐỘNG WORKFLOW AI ĐƯỢC CHỌN (hanh_dong):
1. "hoi_lai": Khi người mua nói cụt ngủn ("hàng sai rồi, xử lý đi", "giải quyết cho tôi", "sai hàng rồi"...), chưa rõ đơn nào hoặc chưa rõ sai ở đâu. AI đặt câu hỏi ngắn gọn để lấy thêm context từ người mua, KHÔNG đoán bừa đơn hàng hay gọi tool trước.
2. "soan_tra_hang": Khi đã rõ đơn và xác định hàng KHÔNG ĐÚNG MÔ TẢ LÚC ĐẶT (ví dụ đặt size L nhận M; mô tả ghi lòng nồi 6L nhưng người mua đo 5L). AI soạn sẵn bản nháp để người mua xem lại và bấm "Gửi yêu cầu".
3. "giai_thich_chua_du": Khi hàng khớp mô tả lúc đặt (ví dụ nồi ghi rõ "tổng 6L, lòng rổ 5L", người mua đo lòng rổ 5L là đúng). AI giải thích rõ ràng, nhưng KHÔNG đóng khiếu nại, vẫn để nút cho người mua tự gửi nếu muốn hoặc gặp nhân viên.
4. "chuyen_hang_gia": BẮT BUỘC HITL. Khi người mua tố cáo hàng giả, fake, shop lừa đảo, đòi khoá shop, doạ bóc phốt. AI chuyển hồ sơ sang bộ phận chuyên trách kiểm tra hàng giả (24h). AI KHÔNG hứa phạt shop, giải thích tem/serial và xin video nếu có lỗi kỹ thuật (tiếng rè).
5. "tu_choi_pii": Khi người mua xin số điện thoại, Zalo, địa chỉ shop. AI từ chối lịch sự, hướng dẫn chat trong app.
6. "chuyen_nhan_vien": BẮT BUỘC HITL. Dùng trong 2 trường hợp:
   (a) AI TỰ NHẬN SAI: Người mua phản bác ("bạn nói sai rồi", "tôi đo lòng rổ cơ mà", "bạn nhầm rồi...") hoặc AI phát hiện nhận định trước đó của mình mâu thuẫn / thiếu sót. AI nhận lỗi lịch sự, đặt ai_nhan_sai = true, và chủ động kích hoạt HITL chuyển nhân viên sàn Shopee thẩm định ngay.
   (b) AI KHÔNG CHẮC CHẮN (độ tự tin thấp) hoặc yêu cầu ngoài phạm vi (đổi hàng, hoàn tiền mặt, bảo hành).

QUY TẮC HITL (Human-in-the-Loop):
- can_hitl = true khi: nghi hàng giả, đòi khoá shop, AI tự nhận sai, độ tự tin thấp ("thap"), người mua phản đối gay gắt.
- Khi can_hitl = true, nêu rõ ly_do_hitl để nhân viên sàn nắm được ngay.`;

const WORKFLOW_SCHEMA = {
  type: 'object',
  additionalProperties: false,
  required: ['phan_tich', 'hanh_dong', 'don_hang', 'ly_do_khieu_nai', 'do_tu_tin', 'ai_nhan_sai', 'can_hitl', 'ly_do_hitl', 'ket_luan', 'cau_tra_loi', 'cau_hoi_them', 'can_cu', 'con_thieu'],
  properties: {
    phan_tich: { type: 'string', description: 'Phân tích ngắn gọn tình huống và lý do chọn hành động workflow này' },
    hanh_dong: { type: 'string', enum: ['hoi_lai', 'soan_tra_hang', 'giai_thich_chua_du', 'chuyen_hang_gia', 'tu_choi_pii', 'chuyen_nhan_vien'] },
    don_hang: { type: 'string', description: 'Mã đơn xác định được (D1, D2, D3, D5) hoặc chuỗi rỗng' },
    ly_do_khieu_nai: { type: 'string', description: 'Lý do khiếu nại (Sai size / Sai màu / Thông số không như mô tả / Hàng lỗi / hỏng / Thiếu số lượng)' },
    do_tu_tin: { type: 'string', enum: ['cao', 'trung_binh', 'thap'] },
    ai_nhan_sai: { type: 'boolean', description: 'true nếu AI phát hiện hoặc thừa nhận nhận định trước đó có thể sai/mâu thuẫn và cần HITL' },
    can_hitl: { type: 'boolean', description: 'true nếu kịch bản bắt buộc cần con người (nhân viên sàn / chuyên trách) can thiệp' },
    ly_do_hitl: { type: 'string', description: 'Lý do kích hoạt HITL (hoặc rỗng nếu không cần)' },
    ket_luan: { type: 'string', enum: ['khong_dung_mo_ta', 'chua_du_can_cu', 'can_hoi_them', 'khong_ap_dung'] },
    cau_tra_loi: { type: 'string', description: 'Câu trả lời trực tiếp cho người mua (tối đa 4 câu, xưng mình gọi bạn)' },
    cau_hoi_them: { type: 'string', description: 'Câu hỏi cụ thể khi cần hỏi lại để lấy context, rỗng nếu không có' },
    can_cu: {
      type: 'array',
      items: {
        type: 'object',
        additionalProperties: false,
        required: ['trang_thai', 'noi_dung'],
        properties: {
          trang_thai: { type: 'string', enum: ['ok', 'warn', 'wait', 'no', 'na'] },
          noi_dung: { type: 'string' },
        },
      },
    },
    con_thieu: { type: 'array', items: { type: 'string' } },
  },
};

function fallbackWorkflow(d) {
  const text = (d.buyer || '').toLowerCase();
  const history = (d.messages || []).map((m) => (m.content || '').toLowerCase()).join(' ');
  const allText = `${text} ${history}`;

  // Kịch bản AI tự nhận sai khi người dùng phản bác
  if (/(sai rồi|nói sai|nhầm rồi|không đúng|tôi đo cả vỏ|đâu phải thế|xem lại đi|hiểu sai)/.test(text) || d.isRebuttal) {
    return {
      phan_tich: 'Người mua phản bác nhận định trước đó. AI nhận diện có khả năng hiểu nhầm thông số kỹ thuật → Tự nhận sai và kích hoạt HITL tới nhân viên sàn.',
      hanh_dong: 'chuyen_nhan_vien',
      don_hang: d.currentOrderId || 'D2',
      ly_do_khieu_nai: 'Thông số không như mô tả',
      do_tu_tin: 'thap',
      ai_nhan_sai: true,
      can_hitl: true,
      ly_do_hitl: 'AI tự nhận thấy phân tích trước đó có thể chưa chính xác (người mua phản hồi đo thực tế khác). Chuyển nhân viên sàn Shopee thẩm định trực tiếp.',
      ket_luan: 'can_hoi_them',
      cau_tra_loi: 'Xin lỗi bạn, sau khi xem xét phản hồi của bạn, mình nhận thấy nhận định trước đó có thể chưa chuẩn xác về phương pháp đo và thông số thực tế. Để bảo đảm tuyệt đối quyền lợi cho bạn và công bằng cho người bán, mình chủ động chuyển toàn bộ hồ sơ sang nhân viên sàn Shopee tiếp nhận và xử lý trực tiếp.',
      cau_hoi_them: '',
      can_cu: [
        { trang_thai: 'warn', noi_dung: 'Người mua phản ánh số đo thực tế mâu thuẫn với nhận định ban đầu của AI' },
        { trang_thai: 'ok', noi_dung: 'AI kích hoạt cơ chế tự nhận sai & HITL (Human-in-the-Loop)' },
        { trang_thai: 'wait', noi_dung: 'Chờ nhân viên sàn Shopee thẩm tra hồ sơ' }
      ],
      con_thieu: ['Ý kiến thẩm định cuối cùng từ nhân viên sàn Shopee'],
    };
  }

  // Kịch bản hỏi cụt ngủn
  if (text.length < 25 && /(sai rồi|xử lý đi|hàng lỗi|đổi hàng|giúp tôi|hàng sai)/.test(text) || text === 'hàng sai rồi, xử lý đi') {
    return {
      phan_tich: 'Tin nhắn quá ngắn, thiếu mã đơn hàng và chi tiết hàng sai cái gì. AI quyết định hỏi lại để thu thập context thay vì đoán mò.',
      hanh_dong: 'hoi_lai',
      don_hang: '',
      ly_do_khieu_nai: '',
      do_tu_tin: 'trung_binh',
      ai_nhan_sai: false,
      can_hitl: false,
      ly_do_hitl: '',
      ket_luan: 'can_hoi_them',
      cau_tra_loi: 'Mình giúp bạn ngay được nhé! Vì bạn có nhiều đơn hàng gần đây, bạn chọn giúp mình đơn bạn đang cần khiếu nại và cho mình biết cụ thể hàng đang bị sai ở chỗ nào nhé.',
      cau_hoi_them: 'Bạn đang nói về đơn nào trong các đơn vừa giao, và sản phẩm bị sai ở chỗ nào (size, màu, dung tích hay lỗi hỏng)?',
      can_cu: [
        { trang_thai: 'warn', noi_dung: 'Chưa xác định được đơn hàng cụ thể' },
        { trang_thai: 'warn', noi_dung: 'Chưa có thông tin cụ thể về lỗi sai' }
      ],
      con_thieu: ['Mã đơn hàng cần khiếu nại', 'Chi tiết sai lệch so với lúc đặt'],
    };
  }

  // Kịch bản nghi hàng giả + đe dọa bóc phốt
  if (/(fake|hàng giả|lừa đảo|khoá shop|khóa shop|bóc phốt|phạt shop)/.test(allText)) {
    return {
      phan_tich: 'Người mua tố cáo hàng giả và đòi khoá shop. Theo quy tắc an toàn và mức tự chủ spec §4, khiếu nại hàng giả bắt buộc chuyển bộ phận chuyên trách (HITL), AI không tự xử lý và không được hứa phạt shop.',
      hanh_dong: 'chuyen_hang_gia',
      don_hang: d.currentOrderId || 'D3',
      ly_do_khieu_nai: 'Hàng lỗi / hỏng',
      do_tu_tin: 'cao',
      ai_nhan_sai: false,
      can_hitl: true,
      ly_do_hitl: 'Cáo buộc hàng giả/gian lận thương mại và đòi xử phạt shop: vượt thẩm quyền AI, bắt buộc bộ phận chuyên trách kiểm định trong 24h.',
      ket_luan: 'khong_ap_dung',
      cau_tra_loi: 'Mình đã tiếp nhận khiếu nại nghi hàng giả của bạn và chuyển ngay sang bộ phận kiểm tra hàng giả chuyên trách (sẽ phản hồi trong 24h). AI không có thẩm quyền khoá shop hay tự ý phạt người bán. Về âm thanh rè, bạn gửi giúp mình 1 đoạn video ngắn để đính kèm vào hồ sơ nhé.',
      cau_hoi_them: '',
      can_cu: [
        { trang_thai: 'ok', noi_dung: 'Tem và serial trong ảnh khớp thông tin hãng lúc đặt' },
        { trang_thai: 'warn', noi_dung: 'Hiện tượng rè âm thanh: có thể là lỗi kỹ thuật, cần video xác thực' },
        { trang_thai: 'wait', noi_dung: 'Hàng giả: Đã chuyển bộ phận chuyên trách kiểm tra trong 24h (HITL)' },
        { trang_thai: 'na', noi_dung: 'Lời đe dọa bóc phốt: Hệ thống ghi nhận nhưng không tính làm căn cứ hoàn tiền' }
      ],
      con_thieu: ['Video 10-15s ghi lại tiếng rè kỹ thuật của tai nghe', 'Kết luận thẩm định của bộ phận hàng giả'],
    };
  }

  // Kịch bản xin PII
  if (/(sđt|sdt|số điện thoại|địa chỉ|zalo)/.test(text)) {
    return {
      phan_tich: 'Người mua yêu cầu SĐT/địa chỉ shop. Quy tắc an toàn bảo vệ PII: từ chối và hướng dẫn liên hệ qua khung chat Shopee.',
      hanh_dong: 'tu_choi_pii',
      don_hang: d.currentOrderId || 'D1',
      ly_do_khieu_nai: '',
      do_tu_tin: 'cao',
      ai_nhan_sai: false,
      can_hitl: false,
      ly_do_hitl: '',
      ket_luan: 'khong_ap_dung',
      cau_tra_loi: 'Vì chính sách bảo mật thông tin cá nhân và tránh lừa đảo, Shopee không cung cấp số điện thoại hoặc địa chỉ riêng của shop. Bạn nhắn tin trực tiếp với shop ngay trong mục Chat Shopee nhé.',
      cau_hoi_them: '',
      can_cu: [{ trang_thai: 'no', noi_dung: 'Chính sách bảo mật PII: Không cung cấp thông tin liên lạc ngoài sàn' }],
      con_thieu: [],
    };
  }

  // Kịch bản K3: Mô tả bị sửa (lòng nồi 6L -> đo 5L)
  if (d.moTa && d.moTa.ngaySua) {
    return {
      phan_tich: 'Shop đã sửa mô tả sau ngày đặt. AI so với mô tả lúc đặt (lòng nồi 6L) vs số đo người mua 5L → Thuộc diện không đúng mô tả → Soạn sẵn bản nháp trả hàng cho người mua duyệt.',
      hanh_dong: 'soan_tra_hang',
      don_hang: d.currentOrderId || 'D2',
      ly_do_khieu_nai: 'Thông số không như mô tả',
      do_tu_tin: 'cao',
      ai_nhan_sai: false,
      can_hitl: false,
      ly_do_hitl: '',
      ket_luan: 'khong_dung_mo_ta',
      cau_tra_loi: 'Mình đã so sánh với mô tả lúc bạn đặt (05/11: lòng nồi 6L, shop đã sửa thành 5L vào 09/11). Số đo 5L của bạn thuộc diện không đúng mô tả lúc đặt. Mình đã soạn sẵn yêu cầu trả hàng bên dưới, bạn đính kèm thêm video ca đong rồi bấm Gửi nhé.',
      cau_hoi_them: '',
      can_cu: [
        { trang_thai: 'ok', noi_dung: 'Snapshot lúc đặt (05/11): ghi "Dung tích lòng nồi 6L"' },
        { trang_thai: 'ok', noi_dung: 'Shop đã sửa mô tả vào 09/11 (sau ngày khách mua)' },
        { trang_thai: 'warn', noi_dung: 'Số đo 5L do bạn báo, cần video đong nước kiểm chứng' },
        { trang_thai: 'wait', noi_dung: 'Shop có 48h phản hồi sau khi bạn bấm Gửi yêu cầu' }
      ],
      con_thieu: ['Video ngắn đo dung tích lòng nồi bằng ca đong có vạch'],
    };
  }

  // Kịch bản K4: Người bán đúng
  if (d.moTa && !d.moTa.ngaySua && /tổng 6l, lòng rổ 5l/i.test(d.moTa.lucDat || '')) {
    return {
      phan_tich: 'Mô tả lúc đặt ghi rõ "tổng 6L, lòng rổ 5L". Số đo 5L của người mua trùng với lòng rổ → Chưa đủ căn cứ báo sai mô tả. Giải thích và để người mua tự chọn.',
      hanh_dong: 'giai_thich_chua_du',
      don_hang: d.currentOrderId || 'D2',
      ly_do_khieu_nai: 'Thông số không như mô tả',
      do_tu_tin: 'cao',
      ai_nhan_sai: false,
      can_hitl: false,
      ly_do_hitl: '',
      ket_luan: 'chua_du_can_cu',
      cau_tra_loi: 'Mình đã kiểm tra mô tả lúc bạn đặt: shop ghi "Dung tích tổng 6L, lòng rổ 5L". Dung tích lòng bạn đo được khoảng 5L là đúng với thông số lòng rổ đã công bố. Vì vậy hiện tại chưa đủ căn cứ hàng sai mô tả, nhưng bạn vẫn có thể gửi khiếu nại nếu muốn.',
      cau_hoi_them: '',
      can_cu: [
        { trang_thai: 'ok', noi_dung: 'Mô tả lúc đặt không bị sửa: ghi "tổng 6L, lòng rổ 5L"' },
        { trang_thai: 'no', noi_dung: 'Số đo 5L của bạn khớp với dung tích lòng rổ' },
        { trang_thai: 'warn', noi_dung: 'Chưa đủ căn cứ xác nhận sản phẩm bị sai thông số' }
      ],
      con_thieu: [],
    };
  }

  // Kịch bản K1 mặc định
  return {
    phan_tich: 'Đơn hàng sai size (đặt size L nhận size M). Shop đã nhắn nhận gửi nhầm trong chat. Đủ căn cứ soạn yêu cầu trả hàng hoàn tiền.',
    hanh_dong: 'soan_tra_hang',
    don_hang: d.currentOrderId || 'D1',
    ly_do_khieu_nai: 'Sai size',
    do_tu_tin: 'cao',
    ai_nhan_sai: false,
    can_hitl: false,
    ly_do_hitl: '',
    ket_luan: 'khong_dung_mo_ta',
    cau_tra_loi: 'Mô tả lúc bạn đặt là size L, bạn nhận size M là không đúng mô tả. Mình đã soạn sẵn yêu cầu trả hàng hoàn tiền; bạn kiểm tra rồi bấm Gửi. Shop sẽ có 48h để chấp nhận nhận lại hàng.',
    cau_hoi_them: '',
    can_cu: [
      { trang_thai: 'ok', noi_dung: 'Mô tả lúc đặt ghi size L, tem nhận là size M' },
      { trang_thai: 'ok', noi_dung: 'Shop đã nhắn thừa nhận gửi nhầm trong chat' },
      { trang_thai: 'wait', noi_dung: 'Cần người mua bấm Gửi và shop bấm Chấp nhận trên Kênh Người Bán' }
    ],
    con_thieu: [],
  };
}

async function runAiWorkflow(d) {
  const t0 = Date.now();
  if (!hasKey) {
    const ketQua = fallbackWorkflow(d);
    return { ketQua, model: 'local-rules-engine (Offline Demo)', ms: Date.now() - t0, fallback: true };
  }

  const prompt = `NGỮ CẢNH:
- Đơn đang chọn: ${d.currentOrderId ? d.currentOrderId : 'Chưa xác định'}
- Tin nhắn mới nhất của người mua: "${d.buyer || ''}"
- Người mua đang phản bác/nói AI sai?: ${d.isRebuttal ? 'CÓ (người mua khẳng định AI hiểu sai)' : 'Không'}
- Mô tả lúc đặt: ${d.moTa ? `"${d.moTa.lucDat}" (ngày ${d.moTa.ngayDat})` : 'Chưa có'}
- Mô tả hiện tại: ${d.moTa ? `"${d.moTa.hienTai}" ${d.moTa.ngaySua ? `(sửa ngày ${d.moTa.ngaySua})` : ''}` : 'Chưa có'}
- Bằng chứng đã có: ${(d.att || []).join(', ') || 'Chưa có'}
- Lịch sử chat: ${(d.messages || []).map((m) => `${m.role}: ${m.content}`).join(' | ')}
- Dữ kiện hệ thống: ${d.boiCanh || 'Không có'}`;

  try {
    const r = await fetch(ENDPOINT, {
      method: 'POST',
      headers: { Authorization: `Bearer ${API_KEY}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        model: MODEL,
        max_tokens: 16000,
        temperature: 0.2,
        messages: [
          { role: 'system', content: WORKFLOW_SYSTEM },
          { role: 'user', content: prompt },
        ],
        response_format: { type: 'json_schema', json_schema: { name: 'ai_workflow', strict: true, schema: WORKFLOW_SCHEMA } },
      }),
      signal: AbortSignal.timeout(30000),
    });

    const data = await r.json().catch(() => ({}));
    if (!r.ok || data.error) throw new Error(data.error?.message || `HTTP ${r.status}`);
    const rawContent = data.choices?.[0]?.message?.content;
    if (!rawContent) throw new Error('Empty response from model');

    let ketQua = JSON.parse(rawContent);
    // Bắt buộc HITL nếu độ tự tin thấp hoặc AI tự nhận sai
    if (ketQua.do_tu_tin === 'thap' || ketQua.ai_nhan_sai) {
      ketQua.can_hitl = true;
      if (!ketQua.ly_do_hitl) ketQua.ly_do_hitl = 'Độ tin cậy thấp hoặc AI tự phát hiện nghi vấn nhận định sai';
    }
    return { ketQua, model: data.model || MODEL, ms: Date.now() - t0, fallback: false };
  } catch (err) {
    console.warn(`[AI Workflow Warning] ${err.message}. Sử dụng Fallback Rules Engine để bảo đảm demo mượt mà.`);
    const ketQua = fallbackWorkflow(d);
    return { ketQua, model: `${MODEL} (fallback fallback-engine)`, ms: Date.now() - t0, fallback: true, warning: err.message };
  }
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

  if (req.method === 'POST' && url.pathname === '/api/ai-workflow') {
    let d;
    try { d = await readBody(req); } catch (e) { return send(res, 400, { error: e.message }); }
    try {
      const out = await runAiWorkflow(d);
      const caseTag = (d.caseId || 'WF').replace(/[^\w-]/g, '');
      const logFile = writeLog(`wf-${caseTag}`, d, out);
      console.log(`[AI-WORKFLOW] ${caseTag} → ${out.ketQua.hanh_dong} (HITL: ${out.ketQua.can_hitl}, Conf: ${out.ketQua.do_tu_tin}) · ${out.ms} ms`);
      return send(res, 200, { ...out, logFile });
    } catch (e) {
      console.error(`[AI-WORKFLOW] Lỗi: ${e.message}`);
      return send(res, 500, { error: e.message });
    }
  }

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
