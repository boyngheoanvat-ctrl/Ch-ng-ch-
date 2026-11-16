# ERI CERT CHECK — Trang tải ZIP chứng chỉ ESign

**Mở bằng Safari:** https://eri-cert-check.onrender.com/

Giao diện tối giản, chỉ có **hai tab**:

- **Còn dùng được:** chỉ những mục mà API NexSideloading báo `SIGNED`, thời hạn hiện tại hợp lệ và thuộc danh sách có P12. Có nút **Tải ZIP**.
- **Đã thu hồi:** các mục bị báo `REVOKED` hoặc đã hết hạn, có ZIP ở nguồn công khai. Có nút **Tải ZIP** để lưu trữ; **không dùng để ký IPA**.

Mỗi chứng chỉ có tên, trạng thái, ngày cấp/hạn và liên kết tải ZIP trực tiếp theo API của nguồn:
https://sideloading.net/api/

Bộ chứng chỉ thiếu P12 không hiển thị ở cả hai tab. Giao diện đã loại phần tạo CSR, danh mục nguồn và tìm kiếm gói ZIP chưa xác minh.

## Cập nhật dữ liệu

`scripts/sync.py` đọc `/api/certificates/list/all` và `/api/certificates/list/missingP12`. Nó tạo JSON gồm `certificates` và `revokedCertificates`, sau đó GitHub Actions cập nhật `data/certs.json` theo lịch. Render sử dụng cùng script ở bước build.

Website đọc dữ liệu mới từ GitHub Raw, nếu không có sẽ đọc dữ liệu bản build Render. Nếu dữ liệu cũ hơn 3 giờ, hai danh sách được ẩn để tránh báo sai trạng thái.

## Cảnh báo

Trạng thái SIGNED/REVOKED do NexSideloading công bố, **không phải kiểm tra trực tiếp với Apple**. ZIP do nguồn ngoài cung cấp nên có thể không tải được nếu nguồn gỡ tệp. Chứng chỉ đã bị thu hồi, dù còn hạn theo ngày, cũng không giúp sửa lỗi xác minh tính toàn vẹn của ứng dụng. Việc sử dụng chứng chỉ phân phối của tổ chức phải có quyền phù hợp.
