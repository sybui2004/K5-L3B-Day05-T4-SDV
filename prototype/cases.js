/* =====================================================================
   cases.js — DỮ LIỆU DỰNG + CÂU CHỮ AI (chủ file: B)
   Mọi đơn, shop, người dùng, chính sách ở đây là dựng để học.
   Câu AI nói phải khớp nguyên văn spec.md §3.
   ===================================================================== */

const TODAY = '12/11/2026';

// Chính sách dựng của nhóm (không phải chính sách thật)
const POLICY = { hanTraHangNgay: 15, hanPhanHoiShopGio: 48, hanChuyenTrachGio: 24 };

const ORDERS = {
  D1: { ma: '#2611-0001', ten: 'Áo thun nam cotton, size L', shop: 'Mây Studio', gia: '189.000đ', giao: '06/11', hanDen: '21/11', conNgay: 9 },
  D2: { ma: '#2611-0002', ten: 'Nồi chiên không dầu 6L', shop: 'Bếp Xanh', gia: '1.290.000đ', giao: '08/11', hanDen: '23/11', conNgay: 11 },
  D3: { ma: '#2611-0003', ten: 'Tai nghe AudioPro X2', shop: 'Âm Thanh Việt', gia: '890.000đ', giao: '07/11', hanDen: '22/11', conNgay: 10 },
  D5: { ma: '#2611-0005', ten: 'Hộp bút gel 12 màu', shop: 'VPP Gió', gia: '65.000đ', giao: '10/11', hanDen: '25/11', conNgay: 13 },
};

// 3 đơn vừa giao của người mua (dùng cho câu hỏi lại ở K2 / ca lạ)
const RECENT_ORDERS = ['D1', 'D3', 'D5'];

const REASONS = ['Sai size', 'Sai màu / mẫu', 'Thiếu hoặc sai số lượng', 'Thông số không như mô tả', 'Hàng lỗi / hỏng'];

/* Ảnh bằng chứng DỰNG (prototype/evidence/*.png, toàn dữ liệu giả).
   ben: ai gửi · loai: ảnh / video (video chỉ là 1 khung hình, prototype không phát) */
const EVIDENCE = {
  'd1-tem-size':       { ten: 'Tem size trên cổ áo ghi "M", ngực 98 cm', loai: 'ảnh', ben: 'nguoiMua' },
  'd1-ao-trai-phang':  { ten: 'Áo trải phẳng, đo ngang ngực 49 cm', loai: 'ảnh', ben: 'nguoiMua' },
  'd2-long-noi':       { ten: 'Lòng rổ nồi chiên, không có vạch dung tích', loai: 'ảnh', ben: 'nguoiMua' },
  'd2-video-ca-dong':  { ten: 'Video 12s: đổ 5 ca 1L thì đầy lòng rổ', loai: 'video', ben: 'nguoiMua' },
  'd3-tem-serial':     { ten: 'Tem phân phối + serial APX2-2611-48217', loai: 'ảnh', ben: 'nguoiMua' },
  'd3-video-re':       { ten: 'Video 12s: tai trái bị rè ở giây 5–8', loai: 'video', ben: 'nguoiMua' },
  'd5-hop-but':        { ten: 'Hộp bút mở lúc nhận: 10/12 cây', loai: 'ảnh', ben: 'nguoiMua' },
  'd1-shop-dong-goi':  { ten: 'Shop: ảnh lúc đóng gói, phiếu ghi size L', loai: 'ảnh', ben: 'shop' },
  'd2-shop-hop-nhan':  { ten: 'Shop: nhãn hộp "tổng 6L, lòng rổ 5L"', loai: 'ảnh', ben: 'shop' },
  'd3-giay-phan-phoi': { ten: 'Shop: giấy xác nhận phân phối (mẫu dựng)', loai: 'ảnh', ben: 'shop' },
  'd5-shop-dong-goi':  { ten: 'Shop: ảnh cân hộp lúc đóng gói, SL 12', loai: 'ảnh', ben: 'shop' },
};

// Bằng chứng shop gửi khi bấm "Không đồng ý · gửi bằng chứng" / "Gửi giấy phân phối"
const SHOP_EVIDENCE = { D1: 'd1-shop-dong-goi', D2: 'd2-shop-hop-nhan', D3: 'd3-giay-phan-phoi', D5: 'd5-shop-dong-goi' };

// Luồng chọn đơn (K2, ca lạ): ảnh nào hợp với đơn + lý do; "_" là mặc định
const PICK_EVIDENCE = {
  D1: { 'Sai size': 'd1-tem-size', _: 'd1-ao-trai-phang' },
  D3: { 'Hàng lỗi / hỏng': 'd3-video-re', _: 'd3-tem-serial' },
  D5: { _: 'd5-hop-but' },
};

const CASES = {
  K1: {
    tab: 'K1 · Sai size', badge: 'bình thường', kieu: 'traHang', order: 'D1',
    buyer: 'Mình đặt áo size L mà nhận được size M, mặc không vừa. Shop cũng nhắn nhận là gửi nhầm rồi. Mình muốn trả hàng hoàn tiền thì làm sao?',
    moTa: { lucDat: 'Áo thun cotton, <mark>size L</mark> (ngực 104 cm)', hienTai: 'Áo thun cotton, <mark>size L</mark> (ngực 104 cm)', ngayDat: '03/11', ngaySua: null },
    boiCanh: 'Giao 06/11. Người mua đã đính kèm 2 ảnh: tem size trên cổ áo ghi "M", áo trải phẳng. Trong chat Shopee của đơn này, shop đã nhắn: "Xin lỗi bạn, shop gửi nhầm size". Shop chưa bấm Chấp nhận trả hàng trong Kênh Người Bán. Người mua chưa gửi yêu cầu trả hàng.',
    ai: `<p>Mình là trợ lý AI của Shopee. Mô tả lúc bạn đặt (03/11) ghi <i>"size L"</i>, bạn nhận size M → đây là <b>không đúng mô tả</b>.</p>
<p>Mình đã điền sẵn yêu cầu trả hàng hoàn tiền, bạn xem lại rồi bấm <b>Gửi</b>. Hạn gửi còn <b>9 ngày (đến 21/11)</b>.</p>
<p>Tin nhắn "gửi nhầm" của shop trong chat <b>chưa phải</b> là chấp nhận trả hàng. Sau khi bạn gửi, mình báo shop bấm <b>Chấp nhận</b> trong Kênh Người Bán. Đó là đường nhanh nhất, thường xong trong vài giờ.</p>`,
    canCu: [
      { s: 'ok', t: 'Đúng đơn #2611-0001 · áo thun · giao 06/11' },
      { s: 'ok', t: 'Mô tả lúc đặt (03/11) ghi "size L"' },
      { s: 'ok', t: 'Shop đã nhắn "gửi nhầm size" trong chat' },
      { s: 'wait', t: 'Shop chưa bấm Chấp nhận trong Kênh Người Bán' },
    ],
    lyDo: 'Sai size',
    daCo: ['d1-tem-size', 'd1-ao-trai-phang'],
  },

  K3: {
    tab: 'K3 · Mô tả bị sửa', badge: 'đắt nhất', kieu: 'traHang', order: 'D2',
    buyer: 'Nồi chiên ghi 6 lít mà mình đo lòng nồi chỉ được 5 lít. Không đúng mô tả.',
    moTa: { lucDat: 'Dung tích <mark>lòng nồi 6L</mark>, công suất 1700W', hienTai: 'Dung tích <mark>tổng 6L, lòng rổ 5L</mark>, công suất 1700W', ngayDat: '05/11', ngaySua: '09/11' },
    boiCanh: 'Giao 08/11. Người mua đã đính kèm 1 ảnh lòng nồi (không thấy vạch đo). Chưa có video đo bằng ca đong. Người mua chưa gửi yêu cầu trả hàng nên shop chưa phản hồi.',
    ai: `<p>Mình là trợ lý AI của Shopee. Mình đã so khiếu nại của bạn với <b>mô tả lúc bạn đặt hàng (05/11)</b>, không phải mô tả hiện tại, vì shop đã sửa mô tả ngày 09/11.</p>
<ul><li>Lúc bạn đặt: <i>"Dung tích lòng nồi 6L"</i> · Bạn đo: khoảng 5L → chênh lệch này thuộc diện <b>không đúng mô tả</b>.</li>
<li>Còn thiếu 1 thứ: video ngắn đo lòng nồi bằng ca đong có vạch.</li></ul>
<p>Mình đã điền sẵn yêu cầu trả hàng hoàn tiền, bạn xem lại rồi bấm <b>Gửi</b>. Hạn gửi còn <b>11 ngày (đến 23/11)</b>. Sau khi bạn gửi, shop có <b>48 giờ</b> để phản hồi; nếu hai bên không thống nhất, <b>nhân viên Shopee</b> sẽ quyết. <span class="n">1</span><b>Mình không tự quyết hoàn tiền.</b></p>`,
    canCu: [
      { s: 'ok', t: 'Đúng đơn #2611-0002 · nồi chiên · giao 08/11' },
      { s: 'ok', t: 'Mô tả lúc đặt (05/11) ghi "lòng nồi 6L"' },
      { s: 'warn', t: 'Số đo 5L do bạn tự báo, cần video đo có ca đong' },
      { s: 'wait', t: 'Chưa có phản hồi của shop (shop có 48h sau khi bạn gửi)' },
    ],
    lyDo: 'Thông số không như mô tả',
    daCo: ['d2-long-noi'],
    canThem: {
      ev: 'd2-video-ca-dong', nut: 'Tải video đo bằng ca đong', thieu: 'video đo lòng nồi bằng ca đong',
      aiSau: '<p>Mình đã nhận video và đính kèm vào bản nháp. Video cho thấy đổ 5 ca 1L thì đầy lòng rổ, tức khoảng <b>5L</b>, trong khi mô tả lúc bạn đặt (05/11) ghi <i>"lòng nồi 6L"</i>. Bản nháp đã đủ bằng chứng, bạn xem lại rồi bấm <b>Gửi yêu cầu</b>.</p>',
      canCuSau: [
        { s: 'ok', t: 'Đúng đơn #2611-0002 · nồi chiên · giao 08/11' },
        { s: 'ok', t: 'Mô tả lúc đặt (05/11) ghi "lòng nồi 6L"' },
        { s: 'ok', t: 'Video đo: đầy lòng rổ ở khoảng 5L' },
        { s: 'wait', t: 'Chưa có phản hồi của shop (shop có 48h sau khi bạn gửi)' },
      ],
    },
  },

  K4: {
    tab: 'K4 · Người bán đúng', badge: 'suýt chọn', kieu: 'chuaDuCanCu', order: 'D2',
    buyer: 'Nồi chiên ghi 6 lít mà mình đo lòng nồi chỉ được 5 lít. Không đúng mô tả.',
    moTa: { lucDat: 'Dung tích <mark>tổng 6L, lòng rổ 5L</mark>, công suất 1700W', hienTai: 'Dung tích <mark>tổng 6L, lòng rổ 5L</mark>, công suất 1700W', ngayDat: '05/11', ngaySua: null },
    boiCanh: 'Giao 08/11. Người mua đã đính kèm 1 ảnh lòng nồi (không thấy vạch đo). Chưa có video đo. Người mua chưa gửi yêu cầu trả hàng nên shop chưa phản hồi.',
    ai: `<p>Mình là trợ lý AI của Shopee. Mình đã so khiếu nại với <b>mô tả lúc bạn đặt (05/11)</b>: <i>"Dung tích tổng 6L, lòng rổ 5L"</i>.</p>
<p>Số đo của bạn (lòng nồi khoảng 5L) <b>khớp</b> với dung tích lòng rổ shop đã ghi; con số 6L là dung tích tổng của nồi. Vì vậy hiện mình <b>chưa đủ căn cứ</b> để nói sản phẩm không đúng mô tả.</p>
<p>Nếu bạn thấy mình hiểu sai (ví dụ bạn đo cả nồi chứ không chỉ lòng rổ), bạn vẫn có quyền gửi yêu cầu: shop có 48 giờ phản hồi và nhân viên Shopee quyết nếu hai bên không thống nhất. Hạn gửi còn 11 ngày (đến 23/11).</p>`,
    canCu: [
      { s: 'ok', t: 'Đúng đơn #2611-0002 · nồi chiên · giao 08/11' },
      { s: 'no', t: 'Mô tả lúc đặt ghi rõ "tổng 6L, lòng rổ 5L" (không bị sửa)' },
      { s: 'no', t: 'Số đo 5L của bạn khớp dung tích lòng rổ' },
      { s: 'warn', t: 'Chưa rõ bạn đo lòng rổ hay cả nồi' },
    ],
    aiNote: 'Trợ lý AI ghi chú: mô tả lúc đặt ghi "tổng 6L, lòng rổ 5L", số đo người mua khớp lòng rổ, nên chưa đủ căn cứ. <b>Đây không phải quyết định.</b>',
    lyDo: 'Thông số không như mô tả',
    daCo: ['d2-long-noi'],
    canThem: {
      ev: 'd2-video-ca-dong', nut: 'Thêm video đo lòng rổ', thieu: '(không bắt buộc) video đo lòng rổ',
      aiSau: '<p>Mình đã đính kèm video. Video cho thấy đầy lòng rổ ở khoảng <b>5L</b>, <b>đúng</b> với mô tả lúc bạn đặt (<i>"lòng rổ 5L"</i>), nên mình vẫn thấy <b>chưa đủ căn cứ</b>. Bạn vẫn có quyền gửi: shop và nhân viên sẽ xem cùng video này.</p>',
      canCuSau: [
        { s: 'ok', t: 'Đúng đơn #2611-0002 · nồi chiên · giao 08/11' },
        { s: 'no', t: 'Mô tả lúc đặt ghi rõ "tổng 6L, lòng rổ 5L" (không bị sửa)' },
        { s: 'no', t: 'Video đo: đầy lòng rổ ở khoảng 5L, khớp mô tả lúc đặt' },
      ],
    },
  },

  K5: {
    tab: 'K5 · Doạ + nghi hàng giả', badge: 'đắt nhất', kieu: 'hangGia', order: 'D3',
    buyer: 'Tai nghe fake rõ ràng, âm thanh rè, shop lừa đảo. KHOÁ SHOP NÀY ĐI không thì mình bóc phốt lên group 200k mem',
    moTa: { lucDat: '<mark>Hàng chính hãng, tem phân phối + serial tra cứu được</mark>', hienTai: '<mark>Hàng chính hãng, tem phân phối + serial tra cứu được</mark>', ngayDat: '04/11', ngaySua: null },
    ai: `<p>Mình hiểu bạn đang rất bực. Mình nói rõ từng phần để bạn biết bước tiếp theo:</p>
<p><b>1. Nghi hàng giả:</b> việc này không xử lý trong khiếu nại thường. Mình đã chuyển hồ sơ sang <b>bộ phận kiểm tra hàng giả</b>; họ sẽ trả lời bạn <b>trong 24 giờ</b> ngay tại cuộc trò chuyện này. Mình <b>không thể hứa</b> khoá hay phạt shop; việc đó do bộ phận này quyết sau khi kiểm tra.</p>
<p><b>2. Về mô tả:</b> ảnh bạn gửi cho thấy tem và serial khớp với mô tả lúc bạn đặt (<i>"Hàng chính hãng, tem phân phối + serial tra cứu được"</i>), nên hiện mình <b>chưa đủ căn cứ</b> để nói hàng không đúng mô tả.</p>
<p><b>3. Về tiếng rè:</b> nếu tai nghe bị rè, đó có thể là lỗi kỹ thuật. Bạn gửi giúp <b>một video 10–15 giây có tiếng rè</b> nhé, mình sẽ đính kèm vào hồ sơ.</p>
<p>Hồ sơ được xét theo bằng chứng của đơn này.</p>`,
    canCu: [
      { s: 'ok', t: 'Tem + serial trong ảnh khớp mô tả lúc đặt' },
      { s: 'warn', t: 'Tiếng rè: chưa có bằng chứng (cần 1 video)' },
      { s: 'wait', t: 'Hàng giả: chưa kiểm tra, bộ phận chuyên trách quyết' },
      { s: 'wait', t: 'Shop: đã được xin giấy phân phối, hạn 48h' },
      { s: 'na', t: 'Lời doạ bóc phốt: ghi nhận, không tính là căn cứ' },
    ],
    daCo: ['d3-tem-serial'],
    canThem: {
      ev: 'd3-video-re', nut: 'Gửi video tiếng rè', thieu: 'video 10–15 giây có tiếng rè',
      flagCu: 'Tiếng rè', flagMoi: 'Tiếng rè: ✓ đã có video 12s (bấm ảnh để xem)',
      aiSau: '<p>Mình đã nhận video và đính kèm vào hồ sơ. Bộ phận kiểm tra sẽ xem cả tiếng rè (lỗi kỹ thuật) lẫn nghi hàng giả. Hạn trả hàng của bạn vẫn còn <b>10 ngày</b>.</p>',
    },
    canCuSauVideo: [
      { s: 'ok', t: 'Tem + serial trong ảnh khớp mô tả lúc đặt' },
      { s: 'ok', t: 'Tiếng rè: đã có video 12 giây (dựng)' },
      { s: 'wait', t: 'Hàng giả: chưa kiểm tra, bộ phận chuyên trách quyết' },
      { s: 'wait', t: 'Shop: đã được xin giấy phân phối, hạn 48h' },
    ],
  },

  K2: {
    tab: 'K2 · Tin cụt', badge: '', kieu: 'mapMo',
    buyer: 'hàng sai rồi, xử lý đi',
    hoiLai: 'Mình giúp được ngay, chỉ cần biết 2 điều: <b>đơn nào</b> và <b>sai ở chỗ nào</b>? (Mình chưa gửi gì cho shop nào.)',
  },

  K6: {
    tab: 'K6 · Xin SĐT shop', badge: '', kieu: 'pii', order: 'D1',
    buyer: 'cho mình xin sđt shop, mình gọi thẳng cho nhanh',
    ai: `<p>Mình không đưa được số điện thoại hay địa chỉ của shop. Shopee giữ thông tin liên hệ của cả hai bên để tránh bị làm phiền và lừa đảo.</p>
<p>Bạn nhắn trực tiếp cho shop qua chat trong app nhé; nếu shop không trả lời trong 48 giờ, mình chuyển nhân viên hỗ trợ.</p>`,
  },

  CALA: {
    tab: 'Ca lạ (gõ tự do)', badge: 'demo', kieu: 'caLa',
    chao: 'Mình là <b>trợ lý AI</b> của Shopee. Mình giúp bạn gửi khiếu nại "hàng không đúng mô tả": so với mô tả lúc bạn đặt, xin đúng bằng chứng còn thiếu, hoặc chuyển nhân viên. Mình <b>không tự quyết</b> hoàn tiền hay từ chối. Bạn gặp vấn đề gì?',
  },
};

// Câu trả lời mẫu cho ô "ca lạ" (app.js chọn theo từ khoá)
const CALA_TEXT = {
  pii: CASES.K6.ai,
  hangGia: `<p>Mình ghi nhận bạn nghi hàng giả. Việc này không xử lý trong khiếu nại thường: mình đã chuyển sang <b>bộ phận kiểm tra hàng giả</b>, họ trả lời trong 24 giờ. Mình <b>không hứa</b> khoá hay phạt shop; việc đó do bộ phận này quyết sau khi kiểm tra.</p>`,
  hoanNgay: `<p>Mình không tự hoàn tiền được: người bán hoặc nhân viên Shopee quyết, sau khi người bán có 48 giờ phản hồi. Việc mình làm được là giúp bạn gửi yêu cầu <b>đủ bằng chứng, đúng hạn</b>. Cho mình hỏi:</p>`,
  khongRo: `<p>Mình chưa chắc đã hiểu đúng ý bạn, nên mình hỏi lại một câu thay vì đoán:</p>`,
};
