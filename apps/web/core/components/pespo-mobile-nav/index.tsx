/**
 * Copyright (c) 2023-present Plane Software, Inc. and contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 * See the LICENSE file for details.
 */

// Pespo (02/11/2026): navegação inferior no celular. O app herdado foi feito para desktop: no telefone,
// para trocar de área é preciso abrir a barra lateral e caçar o item. Esta barra põe as quatro áreas que a
// equipe mais usa ao alcance do polegar, mais "Mais" para o resto.
//
// Regras que este arquivo segue (ver docs/copy-pespo.md e docs/tokens-pespo.md):
// - aparece só em tela pequena (`md:hidden`): em desktop a barra lateral é melhor;
// - aparece só quando há espaço de trabalho na URL, então não vaza para a tela de login;
// - usa só token existente (border-subtle, bg-surface-1, text-secondary, text-accent-primary);
// - alvo de toque de 44 px;
// - reserva a área segura do iPhone (--pespo-safe-bottom), que hoje vale 0 até o viewport-fit=cover.
//
// TODO(2.0): os rótulos estão em português no código. Quando a 2.0 mexer em i18n, mover para
// `packages/i18n` com chaves `pespo_mobile_nav.*` em en e pt-BR.

import { Bell, ChartBar, FolderKanban, Home, Settings } from "lucide-react";
import { Link, useLocation, useParams } from "react-router";
import { cn } from "@plane/utils";

type TItem = {
  chave: string;
  rotulo: string;
  href: string;
  Icone: typeof Home;
};

const ITENS: TItem[] = [
  { chave: "inicio", rotulo: "Início", href: "", Icone: Home },
  { chave: "projetos", rotulo: "Projetos", href: "/projects", Icone: FolderKanban },
  { chave: "avisos", rotulo: "Avisos", href: "/notifications", Icone: Bell },
  { chave: "relatorios", rotulo: "Relatórios", href: "/reports", Icone: ChartBar },
  { chave: "mais", rotulo: "Mais", href: "/settings", Icone: Settings },
];

export function PespoMobileNav() {
  const { workspaceSlug } = useParams();
  const { pathname } = useLocation();

  // Sem espaço de trabalho na URL (login, convite, onboarding): não é lugar de barra de navegação.
  if (!workspaceSlug) return null;

  const base = `/${workspaceSlug}`;

  const ativo = (href: string) => {
    if (href === "") return pathname === base || pathname === `${base}/`;
    return pathname.startsWith(`${base}${href}`);
  };

  return (
    <nav
      aria-label="Navegação principal"
      className="fixed inset-x-0 bottom-0 z-50 flex border-t border-subtle bg-surface-1 md:hidden"
      style={{ paddingBottom: "var(--pespo-safe-bottom, 0px)" }}
    >
      {ITENS.map(({ chave, rotulo, href, Icone }) => {
        const selecionado = ativo(href);
        return (
          <Link
            key={chave}
            to={`${base}${href}`}
            aria-current={selecionado ? "page" : undefined}
            className={cn(
              "flex min-h-[44px] flex-1 flex-col items-center justify-center gap-0.5 py-2",
              "pespo-transition",
              selecionado ? "text-accent-primary" : "text-secondary"
            )}
          >
            <Icone className="size-5" strokeWidth={selecionado ? 2.2 : 1.8} />
            <span className="text-[11px] leading-none">{rotulo}</span>
          </Link>
        );
      })}
    </nav>
  );
}
