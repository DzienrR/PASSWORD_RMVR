"""Backend tests for PDF Unlocker API."""
import io
import os
import zipfile
import pytest
import requests
from pypdf import PdfReader, PdfWriter

BASE_URL = os.environ.get("REACT_APP_BACKEND_URL", "https://vault-pdf-tool.preview.emergentagent.com").rstrip("/")
API = f"{BASE_URL}/api"

PASSWORD = "hello123"


def _make_pdf(encrypted: bool = True, password: str = PASSWORD) -> bytes:
    w = PdfWriter()
    w.add_blank_page(width=200, height=200)
    if encrypted:
        w.encrypt(user_password=password)
    buf = io.BytesIO()
    w.write(buf)
    return buf.getvalue()


@pytest.fixture(scope="module")
def enc_pdf():
    return _make_pdf(True)


@pytest.fixture(scope="module")
def plain_pdf():
    return _make_pdf(False)


# --- /api/pdf/unlock ---
class TestUnlockSingle:
    def test_correct_password(self, enc_pdf):
        r = requests.post(f"{API}/pdf/unlock",
                          files={"file": ("a.pdf", enc_pdf, "application/pdf")},
                          data={"password": PASSWORD})
        assert r.status_code == 200, r.text
        d = r.json()
        assert d["status"] == "success"
        assert d["filename"] == "a.pdf"
        assert d["id"]
        assert isinstance(d["size"], int) and d["size"] > 0
        # download verification
        dl = requests.get(f"{API}/pdf/download/{d['id']}")
        assert dl.status_code == 200
        assert dl.headers["content-type"].startswith("application/pdf")
        assert "attachment" in dl.headers.get("content-disposition", "").lower()
        reader = PdfReader(io.BytesIO(dl.content))
        assert not reader.is_encrypted

    def test_wrong_password(self, enc_pdf):
        r = requests.post(f"{API}/pdf/unlock",
                          files={"file": ("a.pdf", enc_pdf, "application/pdf")},
                          data={"password": "wrong"})
        assert r.status_code == 401
        assert "incorrect password" in r.json()["detail"].lower()

    def test_non_encrypted_pdf(self, plain_pdf):
        r = requests.post(f"{API}/pdf/unlock",
                          files={"file": ("p.pdf", plain_pdf, "application/pdf")},
                          data={"password": ""})
        assert r.status_code == 200
        assert r.json()["status"] == "success"

    def test_corrupted_file(self):
        r = requests.post(f"{API}/pdf/unlock",
                          files={"file": ("bad.pdf", b"not a pdf", "application/pdf")},
                          data={"password": ""})
        assert r.status_code == 400

    def test_oversize_file(self):
        big = b"%PDF-1.4\n" + (b"0" * (51 * 1024 * 1024))
        r = requests.post(f"{API}/pdf/unlock",
                          files={"file": ("big.pdf", big, "application/pdf")},
                          data={"password": ""})
        assert r.status_code == 413


# --- /api/pdf/download/{id} ---
class TestDownload:
    def test_invalid_id(self):
        r = requests.get(f"{API}/pdf/download/nonexistent-id-xyz")
        assert r.status_code == 404


# --- /api/pdf/unlock-batch ---
class TestBatch:
    def test_batch_all_success(self, enc_pdf):
        files = [("files", (f"f{i}.pdf", enc_pdf, "application/pdf")) for i in range(3)]
        r = requests.post(f"{API}/pdf/unlock-batch", files=files, data={"password": PASSWORD})
        assert r.status_code == 200
        results = r.json()["results"]
        assert len(results) == 3
        for res in results:
            assert res["status"] == "success"
            assert res["id"]

    def test_batch_mixed(self, enc_pdf):
        other = _make_pdf(True, password="differentpwd")
        files = [
            ("files", ("good1.pdf", enc_pdf, "application/pdf")),
            ("files", ("bad.pdf", other, "application/pdf")),
            ("files", ("good2.pdf", enc_pdf, "application/pdf")),
        ]
        r = requests.post(f"{API}/pdf/unlock-batch", files=files, data={"password": PASSWORD})
        assert r.status_code == 200
        results = r.json()["results"]
        assert len(results) == 3
        statuses = [x["status"] for x in results]
        assert statuses.count("success") == 2
        assert statuses.count("error") == 1
        err = next(x for x in results if x["status"] == "error")
        assert err["error"] and "password" in err["error"].lower()

    def test_batch_too_many(self, enc_pdf):
        files = [("files", (f"f{i}.pdf", enc_pdf, "application/pdf")) for i in range(21)]
        r = requests.post(f"{API}/pdf/unlock-batch", files=files, data={"password": PASSWORD})
        assert r.status_code == 400


# --- /api/pdf/download-zip ---
class TestZip:
    def test_zip_valid(self, enc_pdf):
        files = [("files", (f"z{i}.pdf", enc_pdf, "application/pdf")) for i in range(2)]
        r = requests.post(f"{API}/pdf/unlock-batch", files=files, data={"password": PASSWORD})
        ids = [x["id"] for x in r.json()["results"]]
        z = requests.post(f"{API}/pdf/download-zip", json={"ids": ids, "zip_name": "out.zip"})
        assert z.status_code == 200
        assert z.headers["content-type"].startswith("application/zip")
        zf = zipfile.ZipFile(io.BytesIO(z.content))
        names = zf.namelist()
        assert len(names) == 2
        # verify unlocked
        for n in names:
            data = zf.read(n)
            reader = PdfReader(io.BytesIO(data))
            assert not reader.is_encrypted

    def test_zip_empty_ids(self):
        r = requests.post(f"{API}/pdf/download-zip", json={"ids": []})
        assert r.status_code == 400

    def test_zip_invalid_ids(self):
        r = requests.post(f"{API}/pdf/download-zip", json={"ids": ["bad-id-1", "bad-id-2"]})
        assert r.status_code == 404
