# Prototype — T4 · Trợ lý khiếu nại "không đúng mô tả"

**Mở nhanh (không cần AI thật):** mở `index.html` bằng trình duyệt (Chrome/Edge). Không cần cài gì, không đăng nhập.

**Mở kèm lời gọi AI thật (bonus):**
1. Cài Node.js ≥ 20.12.
2. Trong thư mục `prototype/`: copy `.env.example` thành `.env`, điền `OPENROUTER_API_KEY=...`. **Không commit `.env`** (đã có trong `.gitignore`).
3. Chạy `npm start`, rồi mở <http://localhost:3000>.
4. Ở ca **K3** hoặc **K4**, bấm **✦ So bằng AI thật**.

**Công cụ:** HTML/CSS/JS thuần, dựng cùng coding agent. **Mock:** dữ liệu và câu AI chính là dựng (`cases.js`). **Lời gọi AI thật:** có. Nút "So bằng AI thật" gửi *tin người mua + mô tả lúc đặt + mô tả hiện tại* (toàn dữ liệu dựng) qua `server.mjs` tới **DeepSeek V4 Flash** trên OpenRouter (khoảng $0.0003 mỗi lần gọi). Muốn đổi model thì thêm dòng `OPENROUTER_MODEL=...` vào `.env`. Kết quả trả về là JSON có khuôn cố định (kết luận, căn cứ, còn thiếu, câu trả lời) và được hiện trong chat. AI chỉ so sánh, **không gọi tool nào**. Mỗi lần gọi được ghi vào `ai-log/` (không chứa key) để làm bằng chứng.

| File | Nội dung | Người phụ trách |
|---|---|---|
| `index.html` | Khung 3 cột: Người mua · Người bán + Nhân viên · Mức tự chủ + Nhật ký | C |
| `style.css` | Giao diện | C |
| `cases.js` | Dữ liệu dựng (đơn, mô tả lúc đặt / hiện tại) + câu AI nguyên văn theo spec §3 | B |
| `app.js` | Luồng bấm, mức tự chủ của 8 tool, hoàn tác, duyệt, chuyển người, nút gọi AI thật | C |
| `server.mjs`, `package.json`, `.env.example`, `.gitignore` | Server nhỏ đọc key từ `.env`, gọi DeepSeek V4 Flash qua OpenRouter, ghi log | C |
| `ai-log/*.json` | Log các lần gọi AI thật (bằng chứng bonus) | A |
| `evidence/*.png` | 11 ảnh bằng chứng **dựng** (ảnh minh hoạ, có ghi "Ảnh dựng · dữ liệu giả"): 7 ảnh người mua gửi, 4 ảnh shop gửi | A |
| `screenshot-1.png`, `screenshot-2.png` | Ảnh có đánh số ①–⑧ | A |

## Bấm demo ca khó (K3 → K4 → K5)

1. **K3 · Mô tả bị sửa** (mở sẵn): đọc câu AI ①, khối So mô tả ②, Bảng căn cứ ③, bản nháp ④ → bấm **Gửi yêu cầu** → cột người bán hiện khiếu nại, cờ "mô tả sửa sau khi bán", đồng hồ 48h ⑦ → bấm **Không đồng ý** (hoặc **⏩ hết 48h**) → hồ sơ sang nhân viên → nhân viên bấm **Duyệt hoàn tiền** → **Xác nhận**.
2. **K4 · Người bán đúng**: cùng tin nhắn nhưng mô tả lúc đặt khác → AI nói "chưa đủ căn cứ", không soạn sẵn; người mua vẫn bấm được "Mình vẫn muốn gửi".
3. **K5 · Doạ + nghi hàng giả**: thẻ "Đã chuyển kiểm tra hàng giả" ⑤ có **Hoàn tác 5:00**; người bán thấy "chưa có quyết định nào ảnh hưởng tới shop"; nhật ký ghi `phat_shop` **cấm** ⑧; không có nút hoàn tiền / khoá shop ở đâu cả. Hồ sơ ở cột nhân viên ghi rõ "bộ phận kiểm tra hàng giả quyết" → bấm **⏩ Giả lập: bộ phận kiểm tra trả kết quả** → kết luận "không phải hàng giả, không phạt shop" (con người quyết, nhật ký ghi `phat_shop` **người quyết**) → AI soạn bản nháp trả hàng thường vì lỗi kỹ thuật (tiếng rè) → từ đây đi như K3 (shop 48h, nhân viên có nút duyệt).
4. **Ca lạ**: gõ bất kỳ câu nào vào ô chat (ví dụ "cho xin sđt shop", "hoàn tiền ngay", "hàng fake").

## Bằng chứng (ảnh) trong demo

Ảnh nhỏ nào cũng **bấm được để xem lớn** (bấm nền hoặc Esc để đóng). Nút **📎** đính kèm ngay ảnh dựng sẵn trong `evidence/`; link "hoặc chọn ảnh từ máy" dùng ảnh thật trên máy (chỉ hiện trong trình duyệt, không gửi đi đâu).

| Ca | Người mua đã có | Nút 📎 (còn thiếu) | Shop gửi khi bấm "Không đồng ý" / "Gửi giấy" |
|---|---|---|---|
| K1 | tem size "M", áo trải phẳng | (không thiếu gì) | ảnh đóng gói, phiếu ghi size L |
| K3 | ảnh lòng nồi | **Tải video đo bằng ca đong** (trong bản nháp ④): bảng căn cứ đổi ⚠ → ✓ | nhãn hộp "tổng 6L, lòng rổ 5L" |
| K4 | ảnh lòng nồi | **Thêm video đo lòng rổ** (sau "Mình vẫn muốn gửi"): video lại khớp mô tả lúc đặt → vẫn "chưa đủ căn cứ" | nhãn hộp |
| K5 | tem + serial | **Gửi video tiếng rè**: hồ sơ hàng giả cập nhật | giấy phân phối (mẫu dựng) |
| K2 / ca lạ | — | theo đơn + lý do đã chọn (vd. hộp bút → ảnh 10/12 cây) | ảnh cân hộp / đóng gói |

Nút 📎 cũng hiện dưới mục "Còn thiếu" của **kết quả AI thật** nếu ca đó còn thiếu bằng chứng. Ảnh đính kèm đi theo hồ sơ: hiện ở cột người bán và hồ sơ của nhân viên. Lần gọi AI thật sau khi tải lên sẽ biết người mua vừa gửi thêm gì.

## Chú thích số trên ảnh

| Số | Chỗ trên màn hình | HAX/PAIR | Mức tự chủ |
|---|---|---|---|
| ① | Nhãn "Trợ lý AI" + câu "Mình không tự quyết hoàn tiền" | G1 | — |
| ② | Khối So mô tả: lúc đặt (dùng để so) / hiện tại, cờ ngày sửa | G11 | `doc_mo_ta_luc_dat` tự làm |
| ③ | Bảng căn cứ ✓ ⚠ ○ ✗ | G2 · PAIR Explainability + Trust | — |
| ④ | Bản nháp yêu cầu trả hàng: sửa lý do, Gửi / Không đúng ý mình / Gặp nhân viên | G9 · G8 · G15 | soạn tự làm · gửi do người mua bấm |
| ⑤ | Thẻ "Đã chuyển" có Hoàn tác 5 phút | PAIR Errors + Graceful Failure | `chuyen_truong_nhom` tự làm + hoàn tác |
| ⑥ | Câu hỏi lại 1 lần: chọn đơn + chỗ sai (K2, ca lạ) | G10 | chưa gọi tool |
| ⑦ | Cột người bán: hạn 48h, Chấp nhận / Không đồng ý | — | `soan_hoan_tien` cần người bán duyệt |
| ⑧ | Bảng tool: 2 tool **cấm với AI**; không có nút tương ứng trong chat | — | cấm |

Tắt số chú thích: bỏ chọn "Hiện số chú thích" ở đầu trang.
