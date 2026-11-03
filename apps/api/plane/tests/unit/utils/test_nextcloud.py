# Copyright (c) 2023-present Plane Software, Inc. and contributors
# SPDX-License-Identifier: AGPL-3.0-only
# See the LICENSE file for details.

"""Pespo: cliente do Nextcloud do Acervo (WebDAV e links públicos) e as regras de nome e caminho, sem rede."""

from datetime import date, timedelta

import pytest

from plane.utils import acervo
from plane.utils.nextcloud import (
    PERMISSION_CREATE,
    PERMISSION_READ,
    NextcloudClient,
    NextcloudError,
    NextcloudNotFound,
    parse_propfind,
    split_path,
)

PROPFIND = b"""<?xml version="1.0"?>
<d:multistatus xmlns:d="DAV:" xmlns:oc="http://owncloud.org/ns">
 <d:response>
  <d:href>/remote.php/dav/files/pespo-hub/Acervo/Clientes/Padaria/Post%20Natal/Recebido/</d:href>
  <d:propstat><d:prop><d:resourcetype><d:collection/></d:resourcetype><d:getetag>"abc"</d:getetag>
   <oc:fileid>10</oc:fileid><oc:size>3072</oc:size></d:prop><d:status>HTTP/1.1 200 OK</d:status></d:propstat>
 </d:response>
 <d:response>
  <d:href>/remote.php/dav/files/pespo-hub/Acervo/Clientes/Padaria/Post%20Natal/Recebido/Grava%C3%A7%C3%A3o%201.mov</d:href>
  <d:propstat><d:prop><d:resourcetype/><d:getcontentlength>2048</d:getcontentlength>
   <d:getlastmodified>Mon, 02 Nov 2026 12:00:00 GMT</d:getlastmodified><d:getetag>"f1"</d:getetag>
   <oc:fileid>11</oc:fileid></d:prop><d:status>HTTP/1.1 200 OK</d:status></d:propstat>
  <d:propstat><d:prop><oc:size/></d:prop><d:status>HTTP/1.1 404 Not Found</d:status></d:propstat>
 </d:response>
 <d:response>
  <d:href>/remote.php/dav/files/pespo-hub/Acervo/Clientes/Padaria/Post%20Natal/Recebido/Fotos/</d:href>
  <d:propstat><d:prop><d:resourcetype><d:collection/></d:resourcetype><oc:fileid>12</oc:fileid>
   <oc:size>1024</oc:size></d:prop><d:status>HTTP/1.1 200 OK</d:status></d:propstat>
 </d:response>
</d:multistatus>"""


class FakeResponse:
    def __init__(self, status_code, content=b"", json_data=None):
        self.status_code = status_code
        self.content = content
        self._json = json_data
        self.text = content.decode() if isinstance(content, bytes) else str(content)

    def json(self):
        if self._json is None:
            raise ValueError("no json")
        return self._json


class FakeSession:
    def __init__(self, *responses):
        self.responses = list(responses)
        self.calls = []
        self.auth = None

    def request(self, method, url, **kwargs):
        self.calls.append((method, url, kwargs))
        return self.responses.pop(0)


def ocs(status_code, data=None, statuscode=None, message=""):
    return FakeResponse(
        status_code,
        json_data={"ocs": {"meta": {"statuscode": statuscode or status_code, "message": message}, "data": data}},
    )


def client(*responses):
    session = FakeSession(*responses)
    return NextcloudClient("http://nextcloud/", "pespo-hub", "senha-de-app", session=session), session


@pytest.mark.unit
class TestPropfind:
    def test_entries_names_and_sizes(self):
        folder, *children = parse_propfind(PROPFIND)
        assert folder["is_folder"] is True and folder["name"] == "Recebido" and folder["etag"] == "abc"
        video, photos = children
        assert video["name"] == "Gravação 1.mov"
        assert video["size"] == 2048 and video["file_id"] == "11" and video["is_folder"] is False
        assert video["modified"].isoformat() == "2026-11-02T12:00:00+00:00"
        assert photos["name"] == "Fotos" and photos["is_folder"] is True and photos["size"] == 1024

    def test_external_entities_are_not_resolved(self):
        hostile = b"""<?xml version="1.0"?>
<!DOCTYPE d:multistatus [<!ENTITY x SYSTEM "file:///etc/passwd">]>
<d:multistatus xmlns:d="DAV:"><d:response><d:href>/a/&x;</d:href><d:propstat><d:prop><d:resourcetype/></d:prop>
<d:status>HTTP/1.1 200 OK</d:status></d:propstat></d:response></d:multistatus>"""
        entries = parse_propfind(hostile)
        assert all("root:" not in entry["href"] for entry in entries)

    def test_invalid_xml_is_an_error(self):
        with pytest.raises(NextcloudError):
            parse_propfind(b"<html>proxy error</html")


@pytest.mark.unit
class TestFolders:
    def test_split_path_refuses_dot_dot(self):
        assert split_path("/Acervo//Clientes/") == ["Acervo", "Clientes"]
        with pytest.raises(ValueError):
            split_path("Acervo/../../etc")

    def test_make_folder_quotes_each_part(self):
        nc, session = client(FakeResponse(201))
        assert nc.make_folder("Acervo/Clientes/Padaria Bom Dia/Reels ação #1") is True
        method, url, _ = session.calls[0]
        assert method == "MKCOL"
        assert url == (
            "http://nextcloud/remote.php/dav/files/pespo-hub/Acervo/Clientes/Padaria%20Bom%20Dia/Reels%20a%C3%A7%C3%A3o%20%231"
        )
        assert session.auth == ("pespo-hub", "senha-de-app")

    def test_existing_folder_is_not_an_error(self):
        nc, _ = client(FakeResponse(405))
        assert nc.make_folder("Acervo/Clientes") is False

    def test_missing_parent_is_created_first(self):
        nc, session = client(FakeResponse(409), FakeResponse(201), FakeResponse(201))
        assert nc.make_folder("Acervo/Clientes/Padaria") is True
        assert [url.rsplit("/", 1)[-1] for _, url, _ in session.calls] == ["Padaria", "Clientes", "Padaria"]

    def test_list_folder(self):
        nc, session = client(FakeResponse(207, PROPFIND))
        folder, children = nc.list_folder("Acervo/Clientes/Padaria/Post Natal/Recebido")
        assert folder["name"] == "Recebido" and len(children) == 2
        assert session.calls[0][0] == "PROPFIND" and session.calls[0][2]["headers"]["Depth"] == "1"

    def test_list_missing_folder(self):
        nc, _ = client(FakeResponse(404))
        with pytest.raises(NextcloudNotFound):
            nc.list_folder("Acervo/Nada")

    def test_server_error(self):
        nc, _ = client(FakeResponse(503))
        with pytest.raises(NextcloudError):
            nc.make_folder("Acervo/Clientes")


@pytest.mark.unit
class TestLinks:
    def test_upload_only_link_never_sends_public_upload(self):
        nc, session = client(ocs(200, {"id": 7, "token": "AbC123", "permissions": PERMISSION_CREATE}))
        share = nc.create_link("Acervo/Clientes/P/Post/Recebido", PERMISSION_CREATE, date(2026, 12, 2), label="envio")
        assert share == {"id": "7", "token": "AbC123"}
        method, url, kwargs = session.calls[0]
        assert method == "POST" and url.endswith("/ocs/v2.php/apps/files_sharing/api/v1/shares")
        assert kwargs["headers"]["OCS-APIRequest"] == "true"
        assert kwargs["data"]["path"] == "/Acervo/Clientes/P/Post/Recebido"
        assert kwargs["data"]["shareType"] == 3
        assert kwargs["data"]["permissions"] == 4
        assert kwargs["data"]["expireDate"] == "2026-12-02"
        assert "publicUpload" not in kwargs["data"]

    def test_link_with_wrong_permissions_is_deleted(self):
        # o Nextcloud gravou edição completa (31) num link que devia ser só envio: some na hora
        nc, session = client(ocs(200, {"id": 8, "token": "x", "permissions": 31}), ocs(200, []))
        with pytest.raises(NextcloudError):
            nc.create_link("Acervo/P/Recebido", PERMISSION_CREATE, date(2026, 12, 2))
        assert session.calls[1][0] == "DELETE" and session.calls[1][1].endswith("/shares/8")

    def test_read_only_link_accepts_the_share_bit(self):
        # Em pasta, o Nextcloud devolve o link só-leitura como 17 (1 | 16, "compartilhar"). O bit de compartilhar
        # não deixa ninguém escrever, então o link vale — antes disso, todo link de entrega era recusado.
        nc, session = client(ocs(200, {"id": 9, "token": "tok", "permissions": 17}))
        share = nc.create_link("Acervo/Clientes/P/Post/Entrega", PERMISSION_READ, date(2026, 12, 2), label="entrega")
        assert share == {"id": "9", "token": "tok"}
        assert session.calls[0][2]["data"]["permissions"] == 1

    def test_update_and_delete(self):
        nc, session = client(ocs(200, {"id": 7}), ocs(404, statuscode=404, message="Wrong share ID"))
        nc.update_link("7", expires_on=date(2027, 1, 10), note="Envie aqui")
        assert session.calls[0][0] == "PUT"
        assert session.calls[0][2]["data"] == {"expireDate": "2027-01-10", "note": "Envie aqui"}
        nc.delete_link("7")  # já não existia: não é erro

    def test_update_missing_link(self):
        nc, _ = client(ocs(404, statuscode=404))
        with pytest.raises(NextcloudNotFound):
            nc.update_link("99", expires_on=date(2027, 1, 10))

    def test_wrong_password(self):
        nc, _ = client(FakeResponse(401, b"Unauthorized"))
        with pytest.raises(NextcloudError):
            nc.create_link("Acervo/P", PERMISSION_READ, date(2026, 12, 2))


@pytest.mark.unit
class TestAcervoNames:
    def test_safe_name(self):
        assert acervo.safe_name("Reels 1/2: lançamento?", "Peça") == "Reels 1-2- lançamento-"
        assert acervo.safe_name("  ..Post   Natal.. ", "Peça") == "Post Natal"
        assert acervo.safe_name("///", "Peça") == "---"
        assert acervo.safe_name("", "Peça") == "Peça"
        assert len(acervo.safe_name("x" * 300, "Peça")) == acervo.MAX_NAME_LENGTH

    def test_project_folder_must_stay_inside_the_acervo(self, settings):
        settings.NEXTCLOUD_ROOT = "Acervo/Clientes"
        assert acervo.normalize_folder("/Acervo/Outros/Padaria/") == "Acervo/Outros/Padaria"
        assert acervo.normalize_folder("Acervo") is None
        assert acervo.normalize_folder("Pessoal/Padaria") is None
        assert acervo.normalize_folder("Acervo/../Pessoal") is None
        assert acervo.normalize_browse_path("") == "Acervo/Clientes"
        assert acervo.normalize_browse_path("Acervo") == "Acervo"
        assert acervo.normalize_browse_path("Fotos") is None

    def test_urls(self, settings):
        settings.NEXTCLOUD_PUBLIC_URL = "https://arquivos.pespo.com.br/"
        assert acervo.link_url("AbC") == "https://arquivos.pespo.com.br/s/AbC"
        assert (
            acervo.files_url("Acervo/Clientes/Padaria Bom Dia")
            == "https://arquivos.pespo.com.br/apps/files/files?dir=/Acervo/Clientes/Padaria%20Bom%20Dia"
        )

    def test_format_size(self):
        assert acervo.format_size(0) == "0 B"
        assert acervo.format_size(850 * 1024) == "850 KB"
        assert acervo.format_size(int(2.1 * 1024**3)) == "2,1 GB"
        assert acervo.format_size(150 * 1024**2) == "150 MB"

    def test_parse_expiry(self):
        today = date(2026, 11, 2)
        assert acervo.parse_expiry("2026-11-03", today) == date(2026, 11, 3)
        assert acervo.parse_expiry("2026-11-02", today) is None
        assert acervo.parse_expiry(str(today + timedelta(days=acervo.MAX_LINK_DAYS + 1)), today) is None
        assert acervo.parse_expiry("amanhã", today) is None

    def test_hidden_and_partial_files(self):
        assert acervo.is_visible_file({"name": "video.mov"})
        assert not acervo.is_visible_file({"name": ".DS_Store"})
        assert not acervo.is_visible_file({"name": "video.mov.ocTransferId123.part"})
