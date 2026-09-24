# Copyright (c) 2023-present Plane Software, Inc. and contributors
# SPDX-License-Identifier: AGPL-3.0-only
# See the LICENSE file for details.

"""Small client for the Google Drive API (v3), shared between the personal
OAuth/browse views (apps/api/plane/app/views/user/google_drive.py) and the
work item views (apps/api/plane/app/views/issue/google_drive.py).
Callers always pass an access token obtained from a GoogleDriveConnection
via get_valid_access_token() — this module never touches request/session
state."""

import re

import requests

# Token refresh/revoke are identical for every Google grant: they only read
# access_token/refresh_token/token_expires_at from the connection row.
from plane.utils.google_calendar import get_valid_access_token, revoke_token  # noqa: F401

DRIVE_API_BASE = "https://www.googleapis.com/drive/v3"

FOLDER_MIME_TYPE = "application/vnd.google-apps.folder"
GOOGLE_APPS_MIME_PREFIX = "application/vnd.google-apps."

FILE_FIELDS = (
    "id,name,mimeType,iconLink,webViewLink,thumbnailLink,modifiedTime,size,"
    "owners(displayName,emailAddress),capabilities(canEdit)"
)

# Google-native files have no binary content — to copy them into Plane as a
# regular attachment they have to be exported to a concrete format.
EXPORT_FORMATS = {
    "application/vnd.google-apps.document": ("application/pdf", "pdf"),
    "application/vnd.google-apps.spreadsheet": (
        "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        "xlsx",
    ),
    "application/vnd.google-apps.presentation": ("application/pdf", "pdf"),
    "application/vnd.google-apps.drawing": ("image/png", "png"),
}

# Kinds of blank files Plane can create straight in the user's Drive.
CREATABLE_KINDS = {
    "document": "application/vnd.google-apps.document",
    "spreadsheet": "application/vnd.google-apps.spreadsheet",
    "presentation": "application/vnd.google-apps.presentation",
}

VIEWS = ("my_drive", "shared", "recent", "starred")

# Drive ids are URL-safe base64-ish strings. Anything else is rejected before
# it gets interpolated into a request path or a `q` expression.
_DRIVE_ID_RE = re.compile(r"^[A-Za-z0-9_-]{1,200}$")


class GoogleDriveFileTooLarge(Exception):
    pass


class GoogleDriveNotExportable(Exception):
    pass


def is_valid_drive_id(value):
    return bool(value) and bool(_DRIVE_ID_RE.match(value))


def _escape_query_value(value):
    # Drive query language: string literals are single-quoted, with `\` and
    # `'` escaped by a backslash.
    return value.replace("\\", "\\\\").replace("'", "\\'")


def build_list_params(view="my_drive", search=None, folder_id=None, page_token=None, page_size=50):
    """Builds the files.list query params for the picker. Pure function —
    kept separate from the HTTP call so it can be unit tested."""
    if view not in VIEWS:
        view = "my_drive"
    if folder_id and not is_valid_drive_id(folder_id):
        raise ValueError("Invalid folder id")

    clauses = ["trashed = false"]
    order_by = "folder,name_natural"

    if search:
        clauses.append(f"name contains '{_escape_query_value(search)}'")
        order_by = "modifiedTime desc"
    if folder_id:
        clauses.append(f"'{folder_id}' in parents")
    elif not search:
        if view == "my_drive":
            clauses.append("'root' in parents")
        elif view == "shared":
            clauses.append("sharedWithMe = true")
            order_by = "sharedWithMeTime desc"
        elif view == "starred":
            clauses.append("starred = true")
        elif view == "recent":
            clauses.append(f"mimeType != '{FOLDER_MIME_TYPE}'")
            order_by = "viewedByMeTime desc"

    params = {
        "q": " and ".join(clauses),
        "orderBy": order_by,
        "pageSize": max(1, min(int(page_size), 100)),
        "fields": f"nextPageToken,files({FILE_FIELDS})",
        "supportsAllDrives": "true",
        "includeItemsFromAllDrives": "true",
    }
    if page_token:
        params["pageToken"] = page_token
    return params


def export_format_for(mime_type):
    """(mime_type, extension) to export a Google-native file to, or None
    when the file already has binary content (PDF, images, Office files…)."""
    return EXPORT_FORMATS.get(mime_type)


def attachment_filename(name, mime_type):
    """File name for the Plane attachment copy: exported Google files get
    the extension of the format they were exported to."""
    export = export_format_for(mime_type)
    if not export:
        return name
    extension = export[1]
    if name.lower().endswith(f".{extension}"):
        return name
    return f"{name}.{extension}"


def _headers(access_token):
    return {"Authorization": f"Bearer {access_token}"}


def list_files(access_token, **kwargs):
    response = requests.get(
        f"{DRIVE_API_BASE}/files",
        headers=_headers(access_token),
        params=build_list_params(**kwargs),
        timeout=15,
    )
    response.raise_for_status()
    data = response.json()
    return {"files": data.get("files", []), "next_page_token": data.get("nextPageToken")}


def get_file(access_token, file_id):
    if not is_valid_drive_id(file_id):
        raise ValueError("Invalid file id")
    response = requests.get(
        f"{DRIVE_API_BASE}/files/{file_id}",
        headers=_headers(access_token),
        params={"fields": FILE_FIELDS, "supportsAllDrives": "true"},
        timeout=15,
    )
    response.raise_for_status()
    return response.json()


def create_file(access_token, name, kind, parent_id=None):
    mime_type = CREATABLE_KINDS.get(kind)
    if not mime_type:
        raise ValueError("Invalid kind")
    body = {"name": name, "mimeType": mime_type}
    if parent_id:
        if not is_valid_drive_id(parent_id):
            raise ValueError("Invalid folder id")
        body["parents"] = [parent_id]
    response = requests.post(
        f"{DRIVE_API_BASE}/files",
        headers=_headers(access_token),
        params={"fields": FILE_FIELDS, "supportsAllDrives": "true"},
        json=body,
        timeout=15,
    )
    response.raise_for_status()
    return response.json()


def download_file(access_token, file, max_bytes):
    """Downloads (or exports, for Google-native files) a Drive file.
    Returns (content_bytes, filename, mime_type). Streams the body and
    aborts as soon as it goes over max_bytes, so a huge file never gets
    fully buffered in memory."""
    file_id = file["id"]
    if not is_valid_drive_id(file_id):
        raise ValueError("Invalid file id")
    mime_type = file.get("mimeType", "")

    if mime_type == FOLDER_MIME_TYPE:
        raise GoogleDriveNotExportable("Folders can't be attached")

    export = export_format_for(mime_type)
    if export:
        url = f"{DRIVE_API_BASE}/files/{file_id}/export"
        params = {"mimeType": export[0]}
        content_type = export[0]
    elif mime_type.startswith(GOOGLE_APPS_MIME_PREFIX):
        # Forms, Sites, shortcuts… have no downloadable representation.
        raise GoogleDriveNotExportable(f"{mime_type} can't be exported")
    else:
        if file.get("size") and int(file["size"]) > max_bytes:
            raise GoogleDriveFileTooLarge()
        url = f"{DRIVE_API_BASE}/files/{file_id}"
        params = {"alt": "media", "supportsAllDrives": "true"}
        content_type = mime_type

    with requests.get(url, headers=_headers(access_token), params=params, stream=True, timeout=60) as response:
        response.raise_for_status()
        chunks = []
        total = 0
        for chunk in response.iter_content(chunk_size=64 * 1024):
            total += len(chunk)
            if total > max_bytes:
                raise GoogleDriveFileTooLarge()
            chunks.append(chunk)

    return b"".join(chunks), attachment_filename(file.get("name") or "arquivo", mime_type), content_type


def serialize_file(file):
    """Trims a Drive API file resource to what the Plane frontend uses."""
    return {
        "id": file.get("id"),
        "name": file.get("name"),
        "mime_type": file.get("mimeType"),
        "icon_link": file.get("iconLink"),
        "web_view_link": file.get("webViewLink"),
        "thumbnail_link": file.get("thumbnailLink"),
        "modified_time": file.get("modifiedTime"),
        "size": int(file["size"]) if file.get("size") else None,
        "is_folder": file.get("mimeType") == FOLDER_MIME_TYPE,
        "owner_name": (file.get("owners") or [{}])[0].get("displayName"),
        "can_edit": (file.get("capabilities") or {}).get("canEdit", False),
    }
