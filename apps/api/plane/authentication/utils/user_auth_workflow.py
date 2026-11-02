# Copyright (c) 2023-present Plane Software, Inc. and contributors
# SPDX-License-Identifier: AGPL-3.0-only
# See the LICENSE file for details.

from .workspace_project_join import process_workspace_project_invitations


def post_user_auth_workflow(user, is_signup, request):
    process_workspace_project_invitations(user=user)
    # Pespo: o login do cliente liberado no Hub entra nos projetos do cliente
    from plane.utils.pespo_clients import attach_client_logins  # noqa: PLC0415

    attach_client_logins(user)
