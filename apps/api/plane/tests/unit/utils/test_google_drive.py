# Copyright (c) 2023-present Plane Software, Inc. and contributors
# SPDX-License-Identifier: AGPL-3.0-only
# See the LICENSE file for details.

from unittest import mock

import pytest

from plane.utils import google_drive as gdrive
from plane.utils.content_validator import validate_html_content


@pytest.mark.unit
class TestBuildListParams:
    def test_my_drive_lists_root_folders_first(self):
        params = gdrive.build_list_params()
        assert params["q"] == "trashed = false and 'root' in parents"
        assert params["orderBy"] == "folder,name_natural"
        assert params["supportsAllDrives"] == "true"

    def test_folder_browsing_ignores_view(self):
        params = gdrive.build_list_params(view="shared", folder_id="abc_DEF-123")
        assert params["q"] == "trashed = false and 'abc_DEF-123' in parents"

    def test_search_escapes_quotes_and_backslashes(self):
        params = gdrive.build_list_params(search="it's a \\ test")
        assert params["q"] == "trashed = false and name contains 'it\\'s a \\\\ test'"
        assert params["orderBy"] == "modifiedTime desc"

    @pytest.mark.parametrize(
        "view,clause",
        [("shared", "sharedWithMe = true"), ("starred", "starred = true"), ("recent", "mimeType != ")],
    )
    def test_views(self, view, clause):
        assert clause in gdrive.build_list_params(view=view)["q"]

    def test_unknown_view_falls_back_to_my_drive(self):
        assert "'root' in parents" in gdrive.build_list_params(view="everything")["q"]

    def test_rejects_folder_id_that_could_break_the_query(self):
        with pytest.raises(ValueError):
            gdrive.build_list_params(folder_id="x' or name contains '")

    def test_page_size_is_clamped(self):
        assert gdrive.build_list_params(page_size=5000)["pageSize"] == 100

    def test_page_token_is_forwarded(self):
        assert gdrive.build_list_params(page_token="tok")["pageToken"] == "tok"


@pytest.mark.unit
class TestFileHelpers:
    @pytest.mark.parametrize(
        "value,expected",
        [("1AbC_d-9", True), ("", False), (None, False), ("../etc", False), ("a/b", False), ("a" * 201, False)],
    )
    def test_is_valid_drive_id(self, value, expected):
        assert gdrive.is_valid_drive_id(value) is expected

    def test_export_format_for_google_native_types(self):
        assert gdrive.export_format_for("application/vnd.google-apps.document") == ("application/pdf", "pdf")
        assert gdrive.export_format_for("application/vnd.google-apps.spreadsheet")[1] == "xlsx"
        assert gdrive.export_format_for("application/pdf") is None

    def test_attachment_filename_appends_export_extension_once(self):
        assert gdrive.attachment_filename("Briefing", "application/vnd.google-apps.document") == "Briefing.pdf"
        assert gdrive.attachment_filename("Briefing.pdf", "application/vnd.google-apps.document") == "Briefing.pdf"
        assert gdrive.attachment_filename("foto.png", "image/png") == "foto.png"

    def test_serialize_file(self):
        data = gdrive.serialize_file(
            {
                "id": "f1",
                "name": "Plano",
                "mimeType": gdrive.FOLDER_MIME_TYPE,
                "size": "42",
                "owners": [{"displayName": "Ana"}],
                "capabilities": {"canEdit": True},
            }
        )
        assert data["is_folder"] is True
        assert data["size"] == 42
        assert data["owner_name"] == "Ana"
        assert data["can_edit"] is True


class _FakeStreamResponse:
    def __init__(self, chunks):
        self._chunks = chunks

    def __enter__(self):
        return self

    def __exit__(self, *args):
        return False

    def raise_for_status(self):
        pass

    def iter_content(self, chunk_size):
        yield from self._chunks


@pytest.mark.unit
class TestDownloadFile:
    def test_exports_google_docs_as_pdf(self):
        with mock.patch.object(gdrive.requests, "get", return_value=_FakeStreamResponse([b"%PDF", b"-1.4"])) as get:
            content, name, mime = gdrive.download_file(
                "tok", {"id": "doc1", "name": "Ata", "mimeType": "application/vnd.google-apps.document"}, 1000
            )
        assert (content, name, mime) == (b"%PDF-1.4", "Ata.pdf", "application/pdf")
        assert get.call_args.args[0].endswith("/files/doc1/export")
        assert get.call_args.kwargs["params"] == {"mimeType": "application/pdf"}

    def test_downloads_binary_files_as_is(self):
        with mock.patch.object(gdrive.requests, "get", return_value=_FakeStreamResponse([b"png"])) as get:
            _, name, mime = gdrive.download_file("tok", {"id": "img", "name": "a.png", "mimeType": "image/png"}, 1000)
        assert (name, mime) == ("a.png", "image/png")
        assert get.call_args.kwargs["params"]["alt"] == "media"

    def test_rejects_declared_size_over_limit_without_downloading(self):
        with mock.patch.object(gdrive.requests, "get") as get:
            with pytest.raises(gdrive.GoogleDriveFileTooLarge):
                gdrive.download_file("tok", {"id": "big", "mimeType": "video/mp4", "size": "5000"}, 1000)
        get.assert_not_called()

    def test_aborts_stream_over_limit(self):
        # Exports have no declared size — the limit is enforced while streaming.
        chunks = [b"x" * 600, b"x" * 600]
        with mock.patch.object(gdrive.requests, "get", return_value=_FakeStreamResponse(chunks)):
            with pytest.raises(gdrive.GoogleDriveFileTooLarge):
                gdrive.download_file("tok", {"id": "d", "mimeType": "application/vnd.google-apps.document"}, 1000)

    @pytest.mark.parametrize("mime", [gdrive.FOLDER_MIME_TYPE, "application/vnd.google-apps.form"])
    def test_rejects_non_exportable(self, mime):
        with pytest.raises(gdrive.GoogleDriveNotExportable):
            gdrive.download_file("tok", {"id": "x", "mimeType": mime}, 1000)


@pytest.mark.unit
def test_content_validator_keeps_google_drive_embed_and_its_attributes():
    html = (
        '<google-drive-embed-component url="https://docs.google.com/document/d/abc/edit" name="Ata" '
        'mime_type="application/vnd.google-apps.document" mode="edit" height="600">'
        "</google-drive-embed-component>"
    )
    is_valid, _, sanitized = validate_html_content(html)
    assert is_valid
    assert "<google-drive-embed-component" in sanitized
    for attribute in ('url="https://docs.google.com/document/d/abc/edit"', 'name="Ata"', 'mode="edit"', 'height="600"'):
        assert attribute in sanitized
    assert 'mime_type="application/vnd.google-apps.document"' in sanitized
