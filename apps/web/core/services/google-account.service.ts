/**
 * Copyright (c) 2023-present Plane Software, Inc. and contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 * See the LICENSE file for details.
 */

// plane imports
import { API_BASE_URL } from "@plane/constants";
// services
import { APIService } from "@/services/api.service";

export type TGoogleAccountStatus = {
  configured: boolean;
  google_email: string;
  calendar: boolean;
  drive: boolean;
};

// Pespo: a conta Google da pessoa (agenda e Drive num consentimento só, users/me/google/…).
export class GoogleAccountService extends APIService {
  constructor() {
    super(API_BASE_URL);
  }

  /** Endereço do consentimento. `nextPath` é para onde voltar se o navegador bloquear a janela. */
  connectUrl(options: { nextPath?: string; popup?: boolean } = {}): string {
    const query = new URLSearchParams();
    if (options.nextPath) query.set("next", options.nextPath);
    if (options.popup) query.set("popup", "1");
    const suffix = query.toString() ? `?${query.toString()}` : "";
    return `${this.baseURL}/api/users/me/google/connect/${suffix}`;
  }

  async status(): Promise<TGoogleAccountStatus> {
    return this.get("/api/users/me/google/status/")
      .then((response) => response?.data)
      .catch((error) => {
        throw error?.response?.data;
      });
  }

  async disconnect(): Promise<void> {
    return this.delete("/api/users/me/google/disconnect/")
      .then(() => undefined)
      .catch((error) => {
        throw error?.response?.data;
      });
  }
}

export const googleAccountService = new GoogleAccountService();
