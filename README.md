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
