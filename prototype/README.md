# Prototype — T4 · Trợ lý khiếu nại "không đúng mô tả"

**Mở ứng dụng:**
1. Cài Node.js ≥ 20.12.
2. Trong thư mục `prototype/`: copy `.env.example` thành `.env`, điền `OPENROUTER_API_KEY=...`.
3. Chạy `npm start`, rồi mở <http://localhost:3000>.

## 2 Chế độ Demo trên giao diện (Toggle Mode)

Thanh điều khiển **"Chế độ Demo"** ở đầu trang cho phép chuyển đổi tức thì giữa:
1. **📋 Không có AI (Workflow kịch bản)**: Chạy kịch bản dựng sẵn cố định theo spec §3. AI chỉ có nút bấm phụ so sánh tham khảo ở K3/K4.
2. **⚡ Có AI thật (AI quyết định Workflow)**: AI thật (DeepSeek V4 Flash / model trong `.env`) đọc ngữ cảnh hội thoại, snapshot lúc đặt, bằng chứng và **trực tiếp quyết định bước tiếp theo**:
   - **Hỏi lại để lấy context** (`hoi_lai`): Khi người dùng nói cụt ngủn ("hàng sai rồi, xử lý đi"...), AI không đoán mò mà đưa ra câu hỏi thu thập context và chip chọn đơn/lỗi.
   - **Tố cáo hàng giả & đòi khoá shop** (`chuyen_hang_gia`): Bắt buộc HITL chuyển sang bộ phận chuyên trách kiểm tra hàng giả (24h). AI tuyệt đối không hứa phạt shop hay hoàn tiền ngay.
   - **Soạn yêu cầu trả hàng** (`soan_tra_hang`): Khi đủ căn cứ hàng lệch mô tả lúc đặt (K1, K3).
   - **Giải thích chưa đủ căn cứ** (`giai_thich_chua_du`): Khi hàng khớp mô tả (K4), người mua có quyền tự gửi hoặc phản bác.
   - **Kịch bản AI TỰ NHẬN SAI & HITL SÀN** (`K-Sai` hoặc khi người mua phản bác *"Bạn nói sai rồi!"*): AI phát hiện nghi vấn mâu thuẫn nhận định hoặc người mua chỉ ra sai sót → AI thừa nhận khả năng hiểu nhầm và **chủ động kích hoạt HITL (Human-in-the-Loop)** chuyển toàn bộ hồ sơ sang Nhân viên sàn Shopee xử lý trực tiếp.
   - **Bắt buộc HITL**: Mọi trường hợp AI có độ tự tin thấp (`do_tu_tin: "thap"`), nghi hàng giả, hoặc người mua phản đối gay gắt đều tự động kích hoạt HITL.

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
