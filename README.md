# ERI CERT CHECK — Website kiểm tra chứng chỉ ESign miễn phí

**Mở trực tiếp trên Safari:** https://eri-cert-check.onrender.com/

Website giao diện tối, responsive cho iPhone và máy tính; danh sách chứng chỉ doanh nghiệp lấy từ nguồn công khai **NexSideloading** (https://sideloading.net/api/). Tìm theo tên, lọc trạng thái Signed / Revoked / hết hạn, xem ngày hiệu lực và tải P12, mobileprovision, ZIP hoặc mật khẩu khi nguồn có cung cấp.

## Triển khai

- Mã nguồn: https://github.com/boyngheoanvat-ctrl/Ch-ng-ch-
- Hosting: Render Static Site `eri-cert-check`, nhánh `main`
- Build Command: `mkdir -p site && cp index.html styles.css app.js favicon.svg site/ && python3 scripts/sync.py`
- Publish directory: `site`
- Public URL: https://eri-cert-check.onrender.com/

## Cập nhật tự động

Workflow `.github/workflows/pages.yml` chạy phút 11 và 41 mỗi giờ (lịch GitHub Actions có thể chạy trễ), đọc nguồn công khai rồi cập nhật file `data/certs.json` trên nhánh `main`. Render auto-deploy trên commit mới, tại bước build sẽ tạo bản dữ liệu mới vào `site/data/certs.json`. Nút làm mới trong website chỉ tải dữ liệu được xuất bản gần nhất.

Chạy cập nhật thủ công: vào **Actions → ERI Cert Check · Update Render data → Run workflow**.

## Lưu ý

Các trạng thái do bên thứ ba cung cấp, **không phải xác minh trực tiếp từ Apple**; nhãn Signed không bảo đảm hoạt động trên mọi iPhone hoặc không bị thu hồi sau đó. Chỉ sử dụng các chứng chỉ khi có quyền hợp lệ. Website không yêu cầu tải chứng chỉ cá nhân của người dùng lên.

## Bộ lọc hiện tại (Safari)

Trang chỉ liệt kê chứng chỉ theo nguồn NexSideloading báo `SIGNED`, có ngày bắt đầu trước thời điểm hiện tại, chưa hết hạn, có danh mục P12 và mobileprovision. Các mục thiếu P12, revoked, expired hoặc thiếu ngày hợp lệ đều bị ẩn. Trình duyệt kiểm tra lại thời hạn và **ẩn danh sách nếu dữ liệu cũ hơn 3 giờ**, tránh coi dữ liệu cũ là hiện tại.

Danh sách chỉ dựa trên dữ liệu công khai, **không xác minh trực tiếp với Apple, không xác minh file P12 tải về và không cam kết cài IPA thành công**. Nút tải P12/ZIP trỏ về nguồn công khai.

## Nguồn dữ liệu tổng hợp

- **NexSideloading**: API công khai có danh sách Signed/Revoked, hạn sử dụng, nhóm thiếu P12 và đường dẫn tải.
- **NabzClan**: đọc số lượng Signed/Revoked từ trang công khai, chưa tải file qua API (API kiểm tra tệp cần token).
- **Loyahdev**: đọc metadata trạng thái và lịch sử bản phát hành từ GitHub Releases; metadata cũ không tự chứng minh còn hiệu lực.
- **SignHub**: đọc danh mục ZIP công khai; chưa có thông tin xác thực trạng thái thu hồi từng gói.
- **Eojoo**: lưu trữ chứng chỉ cũ, chỉ tham khảo.
- **Khoindvn, AppleJR, LARP IPAs, CocoCloud**: theo dõi danh mục công khai; chưa có giao diện lập trình đầy đủ để tự xác minh cả trạng thái + khóa P12.
- **NezusHub, Delta Executor, AppleP12 Telegram**: nguồn tham khảo thủ công.

`scripts/source_catalog.py` lấy metadata từ các nguồn truy cập được (tối đa 7 giây/nguồn, song song); nguồn thiếu API được ghi rõ tình trạng. `scripts/sync.py` xuất JSON có trường `sources`, `summary`, `certificates`.

**Quy tắc bảo vệ:** không lấy một tên gói ZIP hoặc nút cài đặt làm bằng chứng `SIGNED`. Chỉ cho vào danh sách ký IPA khi nguồn có thông tin trạng thái, thời hạn và tài liệu P12/provision liên quan. Chưa xác minh OCSP trực tiếp với Apple; không cam kết cài IPA được.

Nguồn nào ngừng truy cập sẽ hiện `Tạm không truy cập được`; không tự động thay bằng dữ liệu giả. GitHub Actions đồng bộ định kỳ (push mã nguồn và theo lịch 11/41 mỗi giờ), ghi `data/certs.json` vào nhánh `main`; website trên Safari ưu tiên dữ liệu JSON mới từ GitHub Raw và dự phòng JSON của lần triển khai Render gần nhất. Nếu cả hai quá 3 giờ, danh sách sẽ tạm ẩn để tránh báo sai.
