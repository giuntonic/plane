# Copyright (c) 2023-present Plane Software, Inc. and contributors
# SPDX-License-Identifier: AGPL-3.0-only
# See the LICENSE file for details.

# Third party imports
from celery import shared_task

# Module imports
from plane.utils.time_tracking import stop_forgotten_entries


@shared_task
def stop_forgotten_timers():
    """Pespo: para os cronômetros de tempo gasto esquecidos rodando (mais de 12 h)."""
    return stop_forgotten_entries()
