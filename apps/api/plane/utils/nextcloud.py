# Copyright (c) 2023-present Plane Software, Inc. and contributors
# SPDX-License-Identifier: AGPL-3.0-only
# See the LICENSE file for details.

"""Pespo: cliente pequeno do Nextcloud (arquivos.pespo.com.br), usado pelo Acervo da peça.

Fala com o Nextcloud pela rede interna (``NEXTCLOUD_URL``, ex.: http://nextcloud) com o usuário de serviço do Hub
e uma senha de app. Só usa WebDAV (criar e listar pastas) e a API OCS de compartilhamento (links públicos). Os
caminhos são relativos à raiz do usuário de serviço, ex.: ``Acervo/Clientes/Padaria/Post``; ``/Acervo`` é o bucket
R2 montado para todos os usuários. As regras do Hub (que pasta, que link) ficam em ``plane/utils/acervo.py``."""

# Python imports
from email.utils import parsedate_to_datetime
from urllib.parse import quote, unquote, urlsplit

# Third party imports
import requests
from lxml import etree

TIMEOUT = (5, 20)

# Resposta do Nextcloud lida sem entidades nem DTD externos (XXE) e sem árvore gigante (expansão de entidades).
_XML_PARSER = etree.XMLParser(resolve_entities=False, no_network=True, load_dtd=False, huge_tree=False)

# Links públicos (OCS). "Só envio" é 4 (criar) SEM publicUpload=true: com ele o Nextcloud grava 31 (edição
# completa) e quem tem o link lista e baixa tudo. Leitura é 1.
SHARE_TYPE_PUBLIC_LINK = 3
PERMISSION_READ = 1
PERMISSION_CREATE = 4
# O Nextcloud acrescenta "compartilhar" ao link público de uma pasta (link só-leitura volta como 17 = 1 | 16).
# Esse bit não deixa ninguém escrever, então ele não entra na conferência.
PERMISSION_SHARE = 16

_DAV = "{DAV:}"
_OC = "{http://owncloud.org/ns}"
PROPFIND_BODY = (
    '<?xml version="1.0"?>'
    '<d:propfind xmlns:d="DAV:" xmlns:oc="http://owncloud.org/ns">'
    "<d:prop><d:resourcetype/><d:getcontentlength/><d:getlastmodified/><d:getetag/>"
    "<oc:fileid/><oc:size/></d:prop></d:propfind>"
)


class NextcloudError(Exception):
    """Nextcloud fora do ar, credencial errada ou resposta inesperada."""


class NextcloudNotFound(NextcloudError):
    pass


def split_path(path):
    """Partes de um caminho relativo, sem barras sobrando. ``.`` e ``..`` não passam."""
    parts = [part for part in (path or "").split("/") if part]
    if any(part in (".", "..") for part in parts):
        raise ValueError("Invalid path")
    return parts


def parse_propfind(xml_text):
    """Entradas de uma resposta PROPFIND (a primeira é a própria pasta). Cada uma: ``href``, ``name``,
    ``is_folder``, ``size``, ``modified`` (datetime ou None), ``etag`` e ``file_id``."""
    if isinstance(xml_text, str):
        xml_text = xml_text.encode()
    try:
        root = etree.fromstring(xml_text, parser=_XML_PARSER)
    except etree.XMLSyntaxError as e:
        raise NextcloudError(f"Invalid PROPFIND response: {e}") from e
    entries = []
    for response in root.findall(f"{_DAV}response"):
        href = response.findtext(f"{_DAV}href") or ""
        prop = None
        for propstat in response.findall(f"{_DAV}propstat"):
            if "200" in (propstat.findtext(f"{_DAV}status") or ""):
                prop = propstat.find(f"{_DAV}prop")
                break
        if prop is None:
            continue
        resourcetype = prop.find(f"{_DAV}resourcetype")
        is_folder = resourcetype is not None and resourcetype.find(f"{_DAV}collection") is not None
        size_text = prop.findtext(f"{_OC}size") if is_folder else prop.findtext(f"{_DAV}getcontentlength")
        modified_text = prop.findtext(f"{_DAV}getlastmodified")
        try:
            modified = parsedate_to_datetime(modified_text) if modified_text else None
        except (TypeError, ValueError):
            modified = None
        entries.append(
            {
                "href": href,
                "name": unquote(urlsplit(href).path.rstrip("/").rsplit("/", 1)[-1]),
                "is_folder": is_folder,
                "size": int(size_text) if (size_text or "").isdigit() else 0,
                "modified": modified,
                "etag": (prop.findtext(f"{_DAV}getetag") or "").strip('"'),
                "file_id": prop.findtext(f"{_OC}fileid") or "",
            }
        )
    return entries


def parse_ocs(response):
    """O ``data`` de uma resposta OCS v2 em JSON. 404 vira ``NextcloudNotFound``; outro erro, ``NextcloudError``."""
    try:
        body = response.json()
    except ValueError:
        body = None
    meta = ((body or {}).get("ocs") or {}).get("meta") or {}
    status = meta.get("statuscode") or response.status_code
    if response.status_code == 404 or status == 404:
        raise NextcloudNotFound(meta.get("message") or "Not found")
    if response.status_code >= 400 or status not in (100, 200) or body is None:
        raise NextcloudError(f"OCS {response.status_code}/{status}: {meta.get('message') or response.text[:200]}")
    return body["ocs"].get("data")


class NextcloudClient:
    def __init__(self, base_url, user, password, session=None):
        self.base_url = base_url.rstrip("/")
        self.user = user
        self.session = session or requests.Session()
        self.session.auth = (user, password)

    # --- WebDAV -------------------------------------------------------------------------------------------

    def _dav_url(self, path):
        parts = split_path(path)
        quoted = "/".join(quote(part, safe="") for part in parts)
        return f"{self.base_url}/remote.php/dav/files/{quote(self.user, safe='')}/{quoted}"

    def _request(self, method, url, **kwargs):
        try:
            return self.session.request(method, url, timeout=TIMEOUT, **kwargs)
        except requests.RequestException as e:
            raise NextcloudError(f"{method} failed: {e}") from e

    def make_folder(self, path):
        """Cria a pasta e, se faltar, as de cima. Já existir não é erro. ``True`` se criou."""
        response = self._request("MKCOL", self._dav_url(path))
        if response.status_code == 201:
            return True
        if response.status_code == 405:  # já existe
            return False
        if response.status_code == 409:  # falta a pasta de cima
            parent = split_path(path)[:-1]
            if not parent:
                raise NextcloudError("MKCOL conflict at the root")
            self.make_folder("/".join(parent))
            return self.make_folder(path)
        raise NextcloudError(f"MKCOL {response.status_code}")

    def list_folder(self, path):
        """``(pasta, filhos)``: a própria pasta e o que tem dentro (um nível)."""
        response = self._request(
            "PROPFIND",
            self._dav_url(path),
            data=PROPFIND_BODY,
            headers={"Depth": "1", "Content-Type": "application/xml; charset=utf-8"},
        )
        if response.status_code == 404:
            raise NextcloudNotFound(path)
        if response.status_code != 207:
            raise NextcloudError(f"PROPFIND {response.status_code}")
        entries = parse_propfind(response.content)
        if not entries:
            raise NextcloudError("Empty PROPFIND response")
        return entries[0], entries[1:]

    # --- Links públicos (OCS) ------------------------------------------------------------------------------

    def _ocs(self, method, endpoint, data=None):
        response = self._request(
            method,
            f"{self.base_url}/ocs/v2.php/apps/files_sharing/api/v1/shares{endpoint}",
            data=data,
            headers={"OCS-APIRequest": "true", "Accept": "application/json"},
        )
        return parse_ocs(response)

    def create_link(self, path, permissions, expires_on, label=""):
        """Link público da pasta. Confere a permissão que o Nextcloud gravou: se não for a pedida (ex.: 31, edição
        completa, num link que devia ser só envio), apaga na hora e dá erro."""
        data = self._ocs(
            "POST",
            "",
            {
                "path": "/" + "/".join(split_path(path)),
                "shareType": SHARE_TYPE_PUBLIC_LINK,
                "permissions": permissions,
                "expireDate": expires_on.isoformat(),
                "label": label[:250],
            },
        )
        share_id = str((data or {}).get("id") or "")
        token = (data or {}).get("token") or ""
        if not share_id or not token:
            raise NextcloudError("Share without id or token")
        # O que não pode aparecer num link é escrita (2 atualizar, 4 criar, 8 apagar). O bit de compartilhar,
        # que o Nextcloud põe sozinho em pasta, não conta — sem isso, todo link de entrega era recusado.
        gravada = int(data.get("permissions") or 0) & ~PERMISSION_SHARE
        if gravada != permissions:
            self.delete_link(share_id)
            raise NextcloudError(f"Share created with permissions {data.get('permissions')} instead of {permissions}")
        return {"id": share_id, "token": token}

    def update_link(self, share_id, expires_on=None, note=None):
        data = {}
        if expires_on is not None:
            data["expireDate"] = expires_on.isoformat()
        if note is not None:
            data["note"] = note
        return self._ocs("PUT", f"/{quote(str(share_id), safe='')}", data)

    def delete_link(self, share_id):
        """Apaga o link. Já não existir (expirou e o Nextcloud limpou) não é erro."""
        try:
            self._ocs("DELETE", f"/{quote(str(share_id), safe='')}")
        except NextcloudNotFound:
            pass
