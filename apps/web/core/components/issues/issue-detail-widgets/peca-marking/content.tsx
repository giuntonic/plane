/**
 * Marcação visual de peça — pins numerados em imagem (posição x/y em %)
 * ou comentários por timestamp em vídeo, além do botão de aprovação.
 * Sem tabela nova: cada marcação/aprovação vira um comentário no próprio
 * work item, com a informação codificada no texto (mesmo formato usado
 * pelo portal-cliente, que fala com o Plane via API pública — os dois
 * lêem/escrevem o mesmo texto, então uma marcação feita aqui aparece lá
 * e vice-versa). A aprovação também é escutada por um webhook do Plane
 * -> n8n, que replica o evento pro Postgres do portal-cliente pra
 * aparecer no dashboard do Metabase.
 */

import React, { useMemo, useRef, useState } from "react";
import { observer } from "mobx-react";
import type { TIssueAttachment, TIssueServiceType } from "@plane/types";
import { EIssueServiceType } from "@plane/types";
import { Button, Input } from "@plane/ui";
// hooks
import { useIssueDetail } from "@/hooks/store/use-issue-detail";
import { useUser } from "@/hooks/store/user";
// local imports
import type { TPecaMediaKind } from "./helper";

type Props = {
  workspaceSlug: string;
  projectId: string;
  issueId: string;
  disabled: boolean;
  issueServiceType?: TIssueServiceType;
  attachment: TIssueAttachment;
  kind: TPecaMediaKind;
};

function formatTime(totalSeconds: number): string {
  const s = Math.max(0, Math.round(totalSeconds));
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const sec = s % 60;
  const mm = String(m).padStart(h > 0 ? 2 : 1, "0");
  const ss = String(sec).padStart(2, "0");
  return h > 0 ? `${h}:${mm}:${ss}` : `${mm}:${ss}`;
}

const PIN_IMAGE_REGEX = /^📍 Marca[cç][aã]o de (.+?) em \(([\d.]+)%, ([\d.]+)%\): (.*)$/;
const PIN_VIDEO_REGEX = /^🎬 Marca[cç][aã]o de (.+?) em (\d+:\d{2}(?::\d{2})?): (.*)$/;
// Aprovação — mesmo truque das marcações: vira um comentário no formato
// fixo abaixo. O n8n escuta o webhook de comentário do Plane e usa esse
// mesmo regex pra refletir a aprovação no dashboard do Metabase.
const APPROVAL_REGEX = /^✅ Pe[cç]a aprovada por (.+?) em (\d{2}\/\d{2}\/\d{4})$/;

function formatDateBR(d: Date): string {
  return d.toLocaleDateString("pt-BR", { day: "2-digit", month: "2-digit", year: "numeric" });
}

interface ImagePin {
  id: string;
  autor: string;
  x: number;
  y: number;
  texto: string;
}

interface VideoPin {
  id: string;
  autor: string;
  tempo: number;
  tempoFormatado: string;
  texto: string;
}

interface NewImagePin {
  localId: number;
  x: number;
  y: number;
  texto: string;
}

interface NewVideoPin {
  localId: number;
  tempo: number;
  texto: string;
}

export const PecaMarkingCollapsibleContent = observer(function PecaMarkingCollapsibleContent(props: Props) {
  const {
    workspaceSlug,
    projectId,
    issueId,
    disabled,
    issueServiceType = EIssueServiceType.ISSUES,
    attachment: latestAttachment,
    kind,
  } = props;
  const { data: currentUser } = useUser();
  const {
    comment: { getCommentsByIssueId, getCommentById, createComment },
  } = useIssueDetail(issueServiceType);

  const [newImagePins, setNewImagePins] = useState<NewImagePin[]>([]);
  const [newVideoPins, setNewVideoPins] = useState<NewVideoPin[]>([]);
  const [saving, setSaving] = useState(false);
  const [approving, setApproving] = useState(false);
  const nextLocalId = useRef(0);
  const imgRef = useRef<HTMLImageElement>(null);
  const videoRef = useRef<HTMLVideoElement>(null);

  const commentIds = getCommentsByIssueId(issueId) ?? [];
  const comments = commentIds.map((id) => getCommentById(id)).filter(Boolean);

  const savedImagePins: ImagePin[] = useMemo(() => {
    const pins: ImagePin[] = [];
    for (const c of comments) {
      const m = (c!.comment_stripped || "").trim().match(PIN_IMAGE_REGEX);
      if (!m) continue;
      pins.push({ id: c!.id, autor: m[1], x: parseFloat(m[2]), y: parseFloat(m[3]), texto: m[4] });
    }
    return pins;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [comments.length]);

  const savedVideoPins: VideoPin[] = useMemo(() => {
    const pins: VideoPin[] = [];
    for (const c of comments) {
      const m = (c!.comment_stripped || "").trim().match(PIN_VIDEO_REGEX);
      if (!m) continue;
      const parts = m[2].split(":").map(Number);
      const tempo = parts.length === 3 ? parts[0] * 3600 + parts[1] * 60 + parts[2] : parts[0] * 60 + parts[1];
      pins.push({ id: c!.id, autor: m[1], tempo, tempoFormatado: m[2], texto: m[3] });
    }
    return pins.sort((a, b) => a.tempo - b.tempo);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [comments.length]);

  const latestApproval = useMemo(() => {
    let found: { autor: string; data: string; updatedAt: string } | null = null;
    for (const c of comments) {
      const m = (c!.comment_stripped || "").trim().match(APPROVAL_REGEX);
      if (!m) continue;
      if (!found || new Date(c!.updated_at) > new Date(found.updatedAt)) {
        found = { autor: m[1], data: m[2], updatedAt: c!.updated_at };
      }
    }
    return found;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [comments.length]);

  const authorName = currentUser?.display_name || currentUser?.email || "Alguém";

  const handleApprove = async () => {
    setApproving(true);
    try {
      const raw = `✅ Peça aprovada por ${authorName} em ${formatDateBR(new Date())}`;
      await createComment(workspaceSlug, projectId, issueId, { comment_html: `<p>${raw}</p>` });
    } finally {
      setApproving(false);
    }
  };

  const handleImageClick = (ev: React.MouseEvent<HTMLDivElement>) => {
    if (disabled || ev.target !== imgRef.current) return;
    const rect = imgRef.current!.getBoundingClientRect();
    const x = ((ev.clientX - rect.left) / rect.width) * 100;
    const y = ((ev.clientY - rect.top) / rect.height) * 100;
    setNewImagePins((prev) => [...prev, { localId: nextLocalId.current++, x, y, texto: "" }]);
  };

  const saveImagePins = async () => {
    const toSave = newImagePins.filter((p) => p.texto.trim());
    if (toSave.length === 0) return;
    setSaving(true);
    try {
      for (const pin of toSave) {
        const raw = `📍 Marcação de ${authorName} em (${pin.x.toFixed(1)}%, ${pin.y.toFixed(1)}%): ${pin.texto.trim()}`;
        await createComment(workspaceSlug, projectId, issueId, { comment_html: `<p>${raw}</p>` });
      }
      setNewImagePins([]);
    } finally {
      setSaving(false);
    }
  };

  const addVideoPin = () => {
    if (!videoRef.current) return;
    setNewVideoPins((prev) => [...prev, { localId: nextLocalId.current++, tempo: videoRef.current!.currentTime, texto: "" }]);
  };

  const saveVideoPins = async () => {
    const toSave = newVideoPins.filter((p) => p.texto.trim());
    if (toSave.length === 0) return;
    setSaving(true);
    try {
      for (const pin of toSave) {
        const raw = `🎬 Marcação de ${authorName} em ${formatTime(pin.tempo)}: ${pin.texto.trim()}`;
        await createComment(workspaceSlug, projectId, issueId, { comment_html: `<p>${raw}</p>` });
      }
      setNewVideoPins([]);
    } finally {
      setSaving(false);
    }
  };

  const seekTo = (seconds: number) => {
    if (!videoRef.current) return;
    videoRef.current.currentTime = seconds;
    videoRef.current.play();
  };

  return (
    <div className="flex flex-col gap-3 px-1.5 pb-2">
      {latestApproval ? (
        <div className="flex items-center gap-2 rounded-md border border-green-500/30 bg-green-500/10 px-3 py-2">
          <span className="text-16">✅</span>
          <p className="text-13 text-secondary">
            <span className="font-medium text-primary">Aprovada</span> por {latestApproval.autor} em{" "}
            {latestApproval.data}
          </p>
        </div>
      ) : (
        !disabled && (
          <Button variant="primary" size="sm" onClick={handleApprove} loading={approving} disabled={approving} className="self-start">
            Aprovar peça
          </Button>
        )
      )}
      {kind === "imagem" && (
        <>
          <p className="text-13 text-tertiary">Clique na imagem pra deixar uma marcação.</p>
          <div className="relative inline-block max-w-full" onClick={handleImageClick}>
            <img
              ref={imgRef}
              src={latestAttachment.asset_url}
              alt="Peça"
              className="max-w-full rounded-md"
              style={{ cursor: disabled ? "default" : "crosshair", display: "block" }}
            />
            {savedImagePins.map((pin, i) => (
              <div
                key={pin.id}
                title={`${pin.autor}: ${pin.texto}`}
                className="absolute flex items-center justify-center rounded-full text-11 font-medium text-white"
                style={{
                  left: `${pin.x}%`,
                  top: `${pin.y}%`,
                  transform: "translate(-50%, -50%)",
                  width: 24,
                  height: 24,
                  background: "#6b7280",
                  border: "2px solid white",
                  boxShadow: "0 1px 4px rgba(0,0,0,0.4)",
                }}
              >
                {i + 1}
              </div>
            ))}
            {newImagePins.map((pin, i) => (
              <div
                key={pin.localId}
                className="absolute flex items-center justify-center rounded-full text-11 font-medium text-white"
                style={{
                  left: `${pin.x}%`,
                  top: `${pin.y}%`,
                  transform: "translate(-50%, -50%)",
                  width: 24,
                  height: 24,
                  background: "#3b82f6",
                  border: "2px solid white",
                  boxShadow: "0 1px 4px rgba(0,0,0,0.4)",
                }}
              >
                {savedImagePins.length + i + 1}
              </div>
            ))}
          </div>

          {savedImagePins.length > 0 && (
            <div className="flex flex-col gap-1">
              {savedImagePins.map((pin, i) => (
                <p key={pin.id} className="text-13 text-secondary">
                  <span className="font-medium">{i + 1}. {pin.autor}:</span> {pin.texto}
                </p>
              ))}
            </div>
          )}

          {newImagePins.length > 0 && (
            <div className="flex flex-col gap-2">
              {newImagePins.map((pin, i) => (
                <div key={pin.localId} className="flex items-center gap-2">
                  <span className="flex h-5 w-5 flex-shrink-0 items-center justify-center rounded-full bg-accent-primary text-11 text-white">
                    {savedImagePins.length + i + 1}
                  </span>
                  <Input
                    type="text"
                    placeholder="O que precisa mudar aqui?"
                    value={pin.texto}
                    onChange={(e) =>
                      setNewImagePins((prev) =>
                        prev.map((p) => (p.localId === pin.localId ? { ...p, texto: e.target.value } : p))
                      )
                    }
                    className="flex-1"
                  />
                  <button
                    type="button"
                    className="text-13 text-red-500"
                    onClick={() => setNewImagePins((prev) => prev.filter((p) => p.localId !== pin.localId))}
                  >
                    Remover
                  </button>
                </div>
              ))}
              <Button variant="primary" size="sm" onClick={saveImagePins} loading={saving} disabled={saving}>
                Salvar marcações
              </Button>
            </div>
          )}
        </>
      )}

      {kind === "video" && (
        <>
          <p className="text-13 text-tertiary">
            Assista o vídeo e clique em &quot;Comentar neste momento&quot; pra marcar. Clique numa marcação salva pra
            pular o vídeo pra lá.
          </p>
          {/* eslint-disable-next-line jsx-a11y/media-has-caption */}
          <video ref={videoRef} controls src={latestAttachment.asset_url} className="w-full rounded-md bg-black" />
          {!disabled && (
            <Button variant="neutral-primary" size="sm" onClick={addVideoPin} className="self-start">
              Comentar neste momento
            </Button>
          )}

          {savedVideoPins.length > 0 && (
            <div className="flex flex-col gap-1">
              {savedVideoPins.map((pin) => (
                <button
                  key={pin.id}
                  type="button"
                  className="flex items-start gap-2 text-left text-13 text-secondary hover:text-primary"
                  onClick={() => seekTo(pin.tempo)}
                >
                  <span className="flex-shrink-0 rounded bg-layer-2 px-1.5 py-0.5 font-mono text-11">
                    {pin.tempoFormatado}
                  </span>
                  <span>
                    <span className="font-medium">{pin.autor}:</span> {pin.texto}
                  </span>
                </button>
              ))}
            </div>
          )}

          {newVideoPins.length > 0 && (
            <div className="flex flex-col gap-2">
              {newVideoPins.map((pin) => (
                <div key={pin.localId} className="flex items-center gap-2">
                  <span className="flex-shrink-0 rounded bg-accent-primary px-1.5 py-0.5 font-mono text-11 text-white">
                    {formatTime(pin.tempo)}
                  </span>
                  <Input
                    type="text"
                    placeholder="O que precisa mudar nesse momento?"
                    value={pin.texto}
                    onChange={(e) =>
                      setNewVideoPins((prev) =>
                        prev.map((p) => (p.localId === pin.localId ? { ...p, texto: e.target.value } : p))
                      )
                    }
                    className="flex-1"
                  />
                  <button
                    type="button"
                    className="text-13 text-red-500"
                    onClick={() => setNewVideoPins((prev) => prev.filter((p) => p.localId !== pin.localId))}
                  >
                    Remover
                  </button>
                </div>
              ))}
              <Button variant="primary" size="sm" onClick={saveVideoPins} loading={saving} disabled={saving}>
                Salvar marcações
              </Button>
            </div>
          )}
        </>
      )}
    </div>
  );
});
