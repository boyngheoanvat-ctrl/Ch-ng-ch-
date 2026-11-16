# ERI CERT CHECK — Website kiểm tra chứng chỉ ESign miễn phí

Website giao diện tối, responsive, cho iPhone và máy tính. Lấy danh sách chứng chỉ công khai từ **NexSideloading** (https://sideloading.net/api/), có lọc trạng thái, tìm kiếm, và liên kết tải P12/mobileprovision/ZIP/mật khẩu khi nguồn có cung cấp.

## URL GitHub Pages

`https://boyngheoanvat-ctrl.github.io/Ch-ng-ch-/`

Trang chỉ truy cập được **sau khi workflow deploy GitHub Pages thành công**. Nếu chưa bật Pages, vào **Settings → Pages → Build and deployment → Source: GitHub Actions**, rồi vào **Actions → ERI Cert Check · Sync & Deploy → Run workflow**. Workflow cũng có thể tự bật Pages nếu GitHub cấp quyền.

## Tự động cập nhật

Workflow `.github/workflows/pages.yml` chạy lúc phút 11 và 41 mỗi giờ (có thể trễ tùy lịch GitHub), lấy dữ liệu qua `scripts/sync.py`, sau đó triển khai trang tĩnh lên GitHub Pages. Bấm **Tải bản cập nhật** trong website sẽ tải bản mới nhất đã xuất bản; không bắt nguồn phải đồng bộ tức thì.

Để chạy thủ công: Actions → ERI Cert Check · Sync & Deploy → Run workflow.

## Cấu trúc

- `index.html`, `styles.css`, `app.js`, `favicon.svg`: giao diện web
- `scripts/sync.py`: lấy dữ liệu từ 2 danh sách API và chuẩn hóa thành JSON
- `.github/workflows/pages.yml`: đồng bộ và triển khai GitHub Pages
- `site/data/certs.json`: **được tạo lúc triển khai**, không cần commit

## Lưu ý

Dữ liệu là trạng thái theo nguồn công khai bên thứ ba, **không phải kiểm tra trực tiếp với Apple**. Trạng thái Signed không đảm bảo chứng chỉ vẫn cài/khởi chạy được mọi ứng dụng. Apple hoặc chủ sở hữu có thể thu hồi bất cứ lúc nào. Việc sử dụng chứng chỉ của tổ chức cần có quyền hợp lệ.

Không gửi P12 hoặc mật khẩu bí mật của riêng bạn cho website khác. Website không yêu cầu người dùng tải file P12 lên.
