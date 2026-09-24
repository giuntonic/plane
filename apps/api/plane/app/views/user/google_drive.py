# Copyright (c) 2023-present Plane Software, Inc. and contributors
# SPDX-License-Identifier: AGPL-3.0-only
# See the LICENSE file for details.

# Python imports
import html
import uuid
from datetime import timedelta
from urllib.parse import urlencode

# Django imports
from django.http import HttpResponse, HttpResponseRedirect
from django.utils import timezone
from django.utils.decorators import method_decorator
from django.views import View
from django.views.decorators.clickjacking import xframe_options_sameorigin

# Third party imports
import requests
from rest_framework import status
from rest_framework.response import Response

# Module imports
from plane.app.views.base import BaseAPIView
from plane.authentication.adapter.error import AuthenticationException
from plane.authentication.provider.oauth.google_drive import GoogleDriveOAuthProvider
from plane.db.models import GoogleDriveConnection
from plane.utils import google_drive as gdrive
from plane.utils.exception_logger import log_exception


def _safe_next_path(value):
    # Only same-origin relative paths — never an absolute URL (open redirect).
    if value and value.startswith("/") and not value.startswith("//") and "\\" not in value:
        return value
    return None


def _frontend_redirect(request, result, next_path=None):
    scheme = "https" if request.is_secure() else "http"
    base = f"{scheme}://{request.get_host()}"
    path = next_path or "/settings/profile/google-drive/"
    separator = "&" if "?" in path else "?"
    return HttpResponseRedirect(f"{base}{path}{separator}{urlencode({'google_drive': result})}")


def get_drive_access_token(user):
    """(connection, access_token) for this user, or (None, None) when the
    user never connected Drive. Raises when the refresh fails (revoked
    grant, etc.) — callers turn that into a 502."""
    connection = GoogleDriveConnection.objects.filter(user=user).first()
    if not connection:
        return None, None
    return connection, gdrive.get_valid_access_token(connection)


def drive_error_response(error):
    """Maps a failed Drive API call to a response the frontend can act on."""
    if isinstance(error, requests.HTTPError) and error.response is not None:
        if error.response.status_code in (401, 403):
            return Response(
                {"error": "Google Drive denied access", "code": "GOOGLE_DRIVE_FORBIDDEN"},
                status=status.HTTP_403_FORBIDDEN,
            )
        if error.response.status_code == 404:
            return Response(
                {"error": "File not found in Google Drive", "code": "GOOGLE_DRIVE_NOT_FOUND"},
                status=status.HTTP_404_NOT_FOUND,
            )
    log_exception(error)
    return Response(
        {"error": "Google Drive request failed", "code": "GOOGLE_DRIVE_ERROR"},
        status=status.HTTP_502_BAD_GATEWAY,
    )


def not_connected_response():
    return Response(
        {"error": "Google Drive is not connected", "code": "GOOGLE_DRIVE_NOT_CONNECTED"},
        status=status.HTTP_400_BAD_REQUEST,
    )


class GoogleDriveConnectEndpoint(View):
    def get(self, request):
        if not request.user.is_authenticated:
            return HttpResponseRedirect("/")

        state = uuid.uuid4().hex
        request.session["google_drive_state"] = state
        # Lets the picker send the user back to the work item/page they
        # were on instead of the settings page.
        request.session["google_drive_next"] = _safe_next_path(request.GET.get("next_path"))
        try:
            provider = GoogleDriveOAuthProvider(request=request, state=state)
            return HttpResponseRedirect(provider.get_auth_url())
        except AuthenticationException:
            return _frontend_redirect(request, "not_configured")


class GoogleDriveCallbackEndpoint(View):
    def get(self, request):
        if not request.user.is_authenticated:
            return HttpResponseRedirect("/")

        code = request.GET.get("code")
        state = request.GET.get("state")
        next_path = request.session.pop("google_drive_next", None)
        # One-shot: a state value can't be replayed.
        expected_state = request.session.pop("google_drive_state", None)

        if not code or not expected_state or state != expected_state:
            return _frontend_redirect(request, "error", next_path)

        try:
            provider = GoogleDriveOAuthProvider(request=request, code=code)
            token_data = provider.exchange_code_for_tokens()
            google_email = provider.fetch_google_email()

            connection, _ = GoogleDriveConnection.objects.get_or_create(user=request.user)
            connection.google_email = google_email
            connection.access_token = token_data.get("access_token")
            # Google only returns a refresh_token on the very first consent —
            # keep the existing one on reconnects where it's omitted.
            if token_data.get("refresh_token"):
                connection.refresh_token = token_data.get("refresh_token")
            connection.token_expires_at = timezone.now() + timedelta(seconds=token_data.get("expires_in", 3600))
            connection.save()
        except Exception as e:
            log_exception(e)
            return _frontend_redirect(request, "error", next_path)

        return _frontend_redirect(request, "connected", next_path)


class GoogleDriveStatusEndpoint(BaseAPIView):
    def get(self, request):
        connection = GoogleDriveConnection.objects.filter(user=request.user).first()
        if not connection:
            return Response({"connected": False}, status=status.HTTP_200_OK)
        return Response(
            {"connected": True, "google_email": connection.google_email, "connected_at": connection.created_at},
            status=status.HTTP_200_OK,
        )


class GoogleDriveDisconnectEndpoint(BaseAPIView):
    def delete(self, request):
        connection = GoogleDriveConnection.objects.filter(user=request.user).first()
        if not connection:
            return Response(status=status.HTTP_204_NO_CONTENT)

        gdrive.revoke_token(connection)
        # Hard delete: the row holds credentials, a soft-deleted copy would
        # keep them around and block a reconnect (OneToOne on user).
        connection.delete(soft=False)
        return Response(status=status.HTTP_204_NO_CONTENT)


class GoogleDriveFilesEndpoint(BaseAPIView):
    def get(self, request):
        """Browse/search the user's Drive for the picker."""
        try:
            connection, access_token = get_drive_access_token(request.user)
        except Exception as e:
            return drive_error_response(e)
        if not connection:
            return not_connected_response()

        folder_id = request.GET.get("folder_id") or None
        if folder_id and not gdrive.is_valid_drive_id(folder_id):
            return Response({"error": "Invalid folder id"}, status=status.HTTP_400_BAD_REQUEST)

        try:
            result = gdrive.list_files(
                access_token,
                view=request.GET.get("view", "my_drive"),
                search=(request.GET.get("search") or "").strip()[:200] or None,
                folder_id=folder_id,
                page_token=request.GET.get("page_token") or None,
            )
        except Exception as e:
            return drive_error_response(e)

        return Response(
            {
                "files": [gdrive.serialize_file(f) for f in result["files"]],
                "next_page_token": result["next_page_token"],
            },
            status=status.HTTP_200_OK,
        )

    def post(self, request):
        """Creates a blank Doc/Sheet/Slides in the user's Drive."""
        kind = request.data.get("kind")
        name = (request.data.get("name") or "").strip()[:255]
        parent_id = request.data.get("parent_id") or None
        if kind not in gdrive.CREATABLE_KINDS or not name:
            return Response({"error": "kind and name are required"}, status=status.HTTP_400_BAD_REQUEST)
        if parent_id and not gdrive.is_valid_drive_id(parent_id):
            return Response({"error": "Invalid folder id"}, status=status.HTTP_400_BAD_REQUEST)

        try:
            connection, access_token = get_drive_access_token(request.user)
        except Exception as e:
            return drive_error_response(e)
        if not connection:
            return not_connected_response()

        try:
            file = gdrive.create_file(access_token, name, kind, parent_id)
        except Exception as e:
            return drive_error_response(e)
        return Response(gdrive.serialize_file(file), status=status.HTTP_201_CREATED)


class GoogleDriveFileDetailEndpoint(BaseAPIView):
    def get(self, request, file_id):
        if not gdrive.is_valid_drive_id(file_id):
            return Response({"error": "Invalid file id"}, status=status.HTTP_400_BAD_REQUEST)
        try:
            connection, access_token = get_drive_access_token(request.user)
        except Exception as e:
            return drive_error_response(e)
        if not connection:
            return not_connected_response()

        try:
            file = gdrive.get_file(access_token, file_id)
        except Exception as e:
            return drive_error_response(e)
        return Response(gdrive.serialize_file(file), status=status.HTTP_200_OK)


# Largest file the inline preview will fetch from Drive.
PREVIEW_MAX_BYTES = 40 * 1024 * 1024


def _preview_message(title, body, link=None):
    """Small self-contained HTML page shown inside the preview iframe when
    there's nothing to render (not connected, unsupported type, too big)."""
    link_html = (
        f'<p><a href="{html.escape(link)}" target="_blank" rel="noopener noreferrer">Abrir no Google</a></p>'
        if link
        else ""
    )
    page = f"""<!doctype html><html lang="pt-BR"><head><meta charset="utf-8">
<style>body{{font:14px system-ui,sans-serif;color:#555;display:grid;place-items:center;height:100vh;margin:0;
text-align:center;padding:0 24px}}h1{{font-size:15px;color:#222;margin:0 0 6px}}a{{color:#3f76ff}}</style></head>
<body><div><h1>{html.escape(title)}</h1><p>{html.escape(body)}</p>{link_html}</div></body></html>"""
    response = HttpResponse(page, content_type="text/html; charset=utf-8")
    response["Content-Security-Policy"] = "default-src 'none'; style-src 'unsafe-inline'; sandbox allow-popups"
    response["Cache-Control"] = "no-store"
    return response


def _safe_google_link(link):
    # Only ever link back to Google's own hosts.
    if isinstance(link, str) and link.startswith(("https://docs.google.com/", "https://drive.google.com/")):
        return link
    return None


@method_decorator(xframe_options_sameorigin, name="dispatch")
class GoogleDriveFilePreviewEndpoint(BaseAPIView):
    """Serves a Drive file for viewing inside Plane without Google's embed.
    Google's /preview iframe needs third-party cookies, which many browsers
    block ("ative os cookies"); here the file is fetched server-side with the
    *viewer's* own Drive connection (so Drive permissions still apply) and
    served from Plane's origin: Docs/Sheets/Slides as PDF, drawings as PNG,
    PDFs and images as-is. Framable only by Plane itself (SAMEORIGIN)."""

    def get(self, request, file_id):
        if not gdrive.is_valid_drive_id(file_id):
            return _preview_message("Arquivo inválido", "O link do arquivo não é válido.")
        try:
            connection, access_token = get_drive_access_token(request.user)
        except Exception as e:
            log_exception(e)
            return _preview_message(
                "Não foi possível acessar o Google Drive",
                "Reconecte sua conta em Configurações → Perfil → Google Drive.",
            )
        if not connection:
            return _preview_message(
                "Conecte seu Google Drive",
                "Para ver este arquivo aqui, conecte sua conta em Configurações → Perfil → Google Drive.",
                f"https://drive.google.com/open?id={file_id}",
            )

        try:
            file = gdrive.get_file(access_token, file_id)
        except requests.HTTPError as e:
            code = e.response.status_code if e.response is not None else None
            if code in (403, 404):
                return _preview_message(
                    "Sem acesso a este arquivo",
                    "Sua conta Google não tem acesso a este arquivo no Drive. Peça acesso ao dono.",
                    f"https://drive.google.com/open?id={file_id}",
                )
            log_exception(e)
            return _preview_message("Erro no Google Drive", "Tente novamente em instantes.")
        except Exception as e:
            log_exception(e)
            return _preview_message("Erro no Google Drive", "Tente novamente em instantes.")

        link = _safe_google_link(file.get("webViewLink"))
        try:
            content, filename, content_type = gdrive.download_preview(access_token, file, PREVIEW_MAX_BYTES)
        except gdrive.GoogleDriveNotExportable:
            return _preview_message("Prévia indisponível", "Este tipo de arquivo não tem prévia no Pespo Hub.", link)
        except gdrive.GoogleDriveFileTooLarge:
            return _preview_message("Arquivo grande demais", "Abra este arquivo direto no Google.", link)
        except Exception as e:
            log_exception(e)
            return _preview_message("Erro no Google Drive", "Tente novamente em instantes.", link)

        if content_type not in gdrive.PREVIEW_INLINE_MIME_TYPES:
            return _preview_message("Prévia indisponível", "Este tipo de arquivo não tem prévia no Pespo Hub.", link)

        response = HttpResponse(content, content_type=content_type)
        ascii_name = "".join(c if c.isascii() and c not in '"\\\r\n' else "_" for c in filename)
        response["Content-Disposition"] = f'inline; filename="{ascii_name}"'
        response["X-Content-Type-Options"] = "nosniff"
        # Per-user content (served with the viewer's own token): never shared caches.
        response["Cache-Control"] = "private, max-age=300"
        return response
