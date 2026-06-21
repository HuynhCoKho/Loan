# Loan

Web app tinh ke hoach tra no goc va lai vay bang tieng Viet.

## Tinh nang

- Nhap so tien vay, ngay giai ngan, ngay dao han, lai suat nam.
- Chon lai don hoac lai kep.
- Chon tra goc cuoi ky, lai tra hang thang hoac goc va lai tra deu hang thang.
- Them nhieu lan dieu chinh lai suat trong chu ky vay.
- Them nhieu lan gia han ngay dao han.
- Tinh lai theo du no goc thuc te va so ngay vay thuc te cua tung ky.
- Hien thi bang ke hoach tra no, du no goc con lai va dong tong cuoi bang.
- Nhap va hien thi ngay theo dinh dang `dd/mm/yyyy`, so hien thi kieu `#,##0`.
- Cho nhap goc thuc tra, lai thuc tra, lai phat qua han hoac phi tra truoc han theo tung ky.
- Tu dong tinh lai cac ky tiep theo dua tren du no goc thuc te sau moi lan sua so tien thuc tra.
- Tao, sua, xoa khoan vay.
- Luu cuc bo tren trinh duyet, xuat/nhap JSON, hoac ket noi Google Drive bang OAuth de luu file `loan-planner-data.json`.

## Su dung

Mo `index.html` trong trinh duyet hoac bat GitHub Pages cho repository nay.

## Google Drive

Ung dung chay tinh tren GitHub Pages nen chu app can cau hinh mot Google OAuth Client ID loai Web application trong `app.js`.

- Authorized JavaScript origin: `https://huynhcokho.github.io`
- Scope can dung: `https://www.googleapis.com/auth/drive.file`
- Dat gia tri vao hang `GOOGLE_CLIENT_ID`.
- Sau khi cau hinh xong, nguoi dung chi can bam Ket noi Drive, Google se hien man hinh dang nhap/xin quyen.
