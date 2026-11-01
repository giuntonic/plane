# Copyright (c) 2023-present Plane Software, Inc. and contributors
# SPDX-License-Identifier: AGPL-3.0-only
# See the LICENSE file for details.

"""Pespo: a conta Google da pessoa (agenda e Drive num consentimento só), conectada de onde ela estiver.

``connect/?next=/caminho&popup=1`` abre o consentimento do Google. Com ``popup``, o callback devolve uma
página mínima que avisa a janela de origem (``postMessage``) e se fecha, então a pessoa continua no item,
na página ou no calendário em que estava. Sem ``popup`` (navegador que bloqueou a janela), volta para
``next``. Os fluxos separados da agenda e do Drive continuam funcionando."""

# Python imports
import json
import uuid
from urllib.parse import urlencode, urlparse

# Django imports
from django.conf import settings
from django.http import HttpResponse, HttpResponseRedirect
from django.views import View

# Third party imports
from rest_framework import status
from rest_framework.response import Response

# Module imports
from plane.app.views.base import BaseAPIView
from plane.authentication.adapter.error import AuthenticationException
from plane.authentication.provider.oauth.google_account import GoogleAccountOAuthProvider
from plane.bgtasks.google_calendar_sync_task import sync_user_calendar, teardown_connection
from plane.db.models import GoogleCalendarConnection, GoogleDriveConnection
from plane.utils import google_calendar as gcal
from plane.utils.exception_logger import log_exception
from plane.utils.google_calendar import get_google_integration_credentials

from .google_calendar import store_calendar_grant
from .google_drive import _safe_next_path, store_drive_grant

SETTINGS_PATH = "/settings/profile/google/"

POPUP_PAGE = """<!doctype html>
<html lang="pt-BR"><head><meta charset="utf-8"><title>Pespo Hub</title>
<meta name="viewport" content="width=device-width, initial-scale=1"></head>
<body style="font-family: system-ui, sans-serif; padding: 24px; color: #333">
<p>{message}</p>
<script>
(function () {{
  var data = {{ type: "pespo:google-account", status: {status} }};
  // A janela de origem é avisada pelos dois caminhos: postMessage (se a ligação com ela ainda existe) e o
  // canal do navegador, que vale mesmo quando a página do Google cortou a ligação (mesma origem do Hub).
  try {{ if (window.opener && !window.opener.closed) window.opener.postMessage(data, {target}); }} catch (e) {{}}
  try {{
    var channel = new BroadcastChannel("pespo-google-account");
    channel.postMessage(data);
    channel.close();
  }} catch (e) {{}}
  setTimeout(function () {{ window.close(); }}, 80);
  // aberta direto (sem ser janela): segue para o Hub
  setTimeout(function () {{ window.location.replace({fallback}); }}, 700);
}})();
</script>
</body></html>"""


def _web_origin(request):
    """Origem do web (quem abriu a janela). Em produção é o mesmo domínio da API; em desenvolvimento, não."""
    parsed = urlparse(settings.WEB_URL or "")
    if parsed.scheme and parsed.netloc:
        return f"{parsed.scheme}://{parsed.netloc}"
    return f"{'https' if request.is_secure() else 'http'}://{request.get_host()}"


def _finish(request, result, next_path, popup):
    """Fim do fluxo: fecha a janela (popup) ou volta para onde a pessoa estava."""
    path = next_path or SETTINGS_PATH
    separator = "&" if "?" in path else "?"
    target = f"{path}{separator}{urlencode({'google': result})}"
    if popup:
        message = (
            "Conta Google conectada. Pode fechar esta janela."
            if result == "connected"
            else ("Não foi possível conectar a conta Google. Feche esta janela e tente de novo.")
        )
        page = POPUP_PAGE.format(
            message=message,
            status=json.dumps(result),
            fallback=json.dumps(_web_origin(request) + target),
            target=json.dumps(_web_origin(request)),
        )
        response = HttpResponse(page, content_type="text/html; charset=utf-8")
        response["Cache-Control"] = "no-store"
        # O padrão do Django (same-origin) corta a ligação com a janela que abriu esta, e o aviso não chegaria.
        response["Cross-Origin-Opener-Policy"] = "unsafe-none"
        return response
    scheme = "https" if request.is_secure() else "http"
    return HttpResponseRedirect(f"{scheme}://{request.get_host()}{target}")


class GoogleAccountConnectEndpoint(View):
    def get(self, request):
        if not request.user.is_authenticated:
            return HttpResponseRedirect("/")
        state = uuid.uuid4().hex
        request.session["google_account_state"] = state
        request.session["google_account_next"] = _safe_next_path(request.GET.get("next"))
        request.session["google_account_popup"] = request.GET.get("popup") == "1"
        try:
            provider = GoogleAccountOAuthProvider(request=request, state=state)
            return HttpResponseRedirect(provider.get_auth_url())
        except AuthenticationException:
            return _finish(
                request,
                "not_configured",
                request.session.pop("google_account_next", None),
                request.session.pop("google_account_popup", False),
            )


class GoogleAccountCallbackEndpoint(View):
    def get(self, request):
        if not request.user.is_authenticated:
            return HttpResponseRedirect("/")
        code = request.GET.get("code")
        state = request.GET.get("state")
        next_path = request.session.pop("google_account_next", None)
        popup = request.session.pop("google_account_popup", False)
        # One-shot: a state value can't be replayed.
        expected_state = request.session.pop("google_account_state", None)
        if not code or not expected_state or state != expected_state:
            return _finish(request, "error", next_path, popup)

        try:
            provider = GoogleAccountOAuthProvider(request=request, code=code)
            token_data = provider.exchange_code_for_tokens()
            google_email = provider.fetch_google_email()
            # Com o consentimento granular do Google, a pessoa pode desmarcar um dos serviços.
            granted = set((token_data.get("scope") or provider.scope).split())
            calendar = None
            if provider.CALENDAR_SCOPE in granted:
                calendar = store_calendar_grant(request.user, token_data, google_email)
            if provider.DRIVE_SCOPE in granted:
                store_drive_grant(request.user, token_data, google_email)
            if not calendar and provider.DRIVE_SCOPE not in granted:
                return _finish(request, "error", next_path, popup)
        except Exception as e:
            log_exception(e)
            return _finish(request, "error", next_path, popup)

        if calendar:
            # First sync right away instead of waiting for the next beat.
            sync_user_calendar.delay(str(calendar.id))
        return _finish(request, "connected", next_path, popup)


class GoogleAccountStatusEndpoint(BaseAPIView):
    def get(self, request):
        client_id, client_secret = get_google_integration_credentials()
        calendar = GoogleCalendarConnection.objects.filter(user=request.user).first()
        drive = GoogleDriveConnection.objects.filter(user=request.user).first()
        return Response(
            {
                "configured": bool(client_id and client_secret),
                "google_email": (calendar or drive).google_email if (calendar or drive) else "",
                "calendar": bool(calendar),
                "drive": bool(drive),
            },
            status=status.HTTP_200_OK,
        )


class GoogleAccountDisconnectEndpoint(BaseAPIView):
    """Desconecta a agenda e o Drive de uma vez, revogando cada concessão uma vez só."""

    def delete(self, request):
        calendar = GoogleCalendarConnection.objects.filter(user=request.user).first()
        drive = GoogleDriveConnection.objects.filter(user=request.user).first()
        revoked = set()
        if calendar:
            teardown_connection(calendar)
        for connection in (calendar, drive):
            if not connection:
                continue
            token = connection.refresh_token or connection.access_token
            if token and token not in revoked:
                gcal.revoke_token(connection)
                revoked.add(token)
            # Hard delete: the row holds credentials and owns the OneToOne on user.
            connection.delete(soft=False)
        return Response(status=status.HTTP_204_NO_CONTENT)
