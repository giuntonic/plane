/**
 * Copyright (c) 2023-present Plane Software, Inc. and contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 * See the LICENSE file for details.
 */

/**
 * Revisão da peça (Pespo): o que o Clapshot fazia, dentro do item de trabalho. Cada imagem ou vídeo
 * anexado é uma versão (v1, v2…); os comentários ficam presos à versão, no tempo do vídeo ou num
 * ponto da imagem, com desenho por cima e respostas. Aprovar e pedir refação continuam como antes
 * (comentários de texto fixo), agora mostrados na versão que era a mais nova naquele momento.
 * As marcações feitas só como comentário (Marcação da Peça antiga, portal do cliente) aparecem como
 * "marcação antiga", só para leitura.
 */
import { useEffect, useMemo, useRef, useState } from "react";
import { observer } from "mobx-react";
import { AlertTriangle, Eye, EyeOff, Loader2, Maximize2, RotateCw, Upload, X } from "lucide-react";
import { EUserPermissions, EUserPermissionsLevel } from "@plane/constants";
import { useTranslation } from "@plane/i18n";
import { TOAST_TYPE, setToast } from "@plane/propel/toast";
import { Tooltip } from "@plane/propel/tooltip";
import type { TIssueServiceType } from "@plane/types";
import { cn, getFileURL, renderFormattedDate } from "@plane/utils";
// components
import { useAttachmentOperations } from "@/components/issues/issue-detail-widgets/attachments/helper";
// hooks
import { useIssueDetail } from "@/hooks/store/use-issue-detail";
// services
import { renditionFilePath } from "@/services/media-review.service";
import { useUser, useUserPermissions } from "@/hooks/store/user";
import { useFileSize } from "@/hooks/use-file-size";
// local imports
import { LegacyMarkItem, ReviewCommentItem } from "./comment-list";
import { ReviewComposer } from "./composer";
import { ReviewDecisionBar } from "./decision-bar";
import {
  DRAWING_COLORS,
  DRAWING_WIDTH,
  buildVersions,
  formatDateBR,
  formatTimecode,
  parseDecision,
  parseLegacyMark,
  versionAt,
} from "./helpers";
import { ReviewImageStage } from "./image-stage";
import type {
  TDrawingShape,
  TDrawingTool,
  TLegacyMark,
  TMediaReviewComment,
  TReviewMarker,
  TReviewVersion,
  TVersionDecision,
} from "./types";
import { useMediaRenditions, useMediaReview } from "./use-media-review";
import { ReviewVideoStage } from "./video-stage";
import type { TVideoStageHandle } from "./video-stage";

type Props = {
  workspaceSlug: string;
  projectId: string;
  issueId: string;
  disabled: boolean;
  issueServiceType: TIssueServiceType;
  layout: "compact" | "expanded";
  onExpand?: () => void;
  onClose?: () => void;
};

const escapeHtml = (value: string) => value.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");

/** Imagens e vídeos anexados ao item, da v1 à mais nova. */
export function useReviewVersions(issueId: string, issueServiceType: TIssueServiceType): TReviewVersion[] {
  const {
    attachment: { getAttachmentsByIssueId, getAttachmentById },
  } = useIssueDetail(issueServiceType);
  const ids = getAttachmentsByIssueId(issueId) ?? [];
  const attachments = ids.map((id) => getAttachmentById(id)).filter((item) => !!item);
  return buildVersions(attachments);
}

type TEntry =
  | { type: "comment"; comment: TMediaReviewComment; replies: TMediaReviewComment[]; label: string; sortKey: number }
  | { type: "legacy"; mark: TLegacyMark; label: string; sortKey: number };

export const MediaReview = observer(function MediaReview(props: Props) {
  const { workspaceSlug, projectId, issueId, disabled, issueServiceType, layout, onExpand, onClose } = props;
  const { t } = useTranslation();
  const expanded = layout === "expanded";
  // store hooks
  const { data: currentUser } = useUser();
  const { allowPermissions } = useUserPermissions();
  const {
    comment: { getCommentsByIssueId, getCommentById, createComment },
    attachment: { getAttachmentsUploadStatusByIssueId },
    fetchIssue,
    fetchComments,
    fetchActivities,
  } = useIssueDetail(issueServiceType);
  const { maxFileSize } = useFileSize();
  const { operations: attachmentOperations } = useAttachmentOperations(
    workspaceSlug,
    projectId,
    issueId,
    issueServiceType
  );
  const review = useMediaReview(workspaceSlug, projectId, issueId, issueServiceType);
  const versions = useReviewVersions(issueId, issueServiceType);
  const { renditions, retry: retryRendition } = useMediaRenditions(
    workspaceSlug,
    projectId,
    issueId,
    versions.filter((item) => item.kind === "video").map((item) => item.attachment.id)
  );
  // state
  const [versionId, setVersionId] = useState<string | null>(null);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [showResolved, setShowResolved] = useState(true);
  const [playerTime, setPlayerTime] = useState(0);
  const [isPlaying, setIsPlaying] = useState(false);
  const [text, setText] = useState("");
  const [shapes, setShapes] = useState<TDrawingShape[]>([]);
  const [drawTool, setDrawTool] = useState<TDrawingTool | null>(null);
  const [drawColor, setDrawColor] = useState(DRAWING_COLORS[0]);
  const [draftPoint, setDraftPoint] = useState<{ x: number; y: number } | null>(null);
  const [lockedTime, setLockedTime] = useState<number | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const stageRef = useRef<TVideoStageHandle>(null);
  const listRef = useRef<HTMLDivElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const versionCount = useRef(versions.length);

  // Uma versão nova (enviada agora) passa a ser a escolhida.
  useEffect(() => {
    if (versions.length > versionCount.current) setVersionId(versions[versions.length - 1].attachment.id);
    versionCount.current = versions.length;
  }, [versions]);

  const latest = versions[versions.length - 1];
  const version = versions.find((item) => item.attachment.id === versionId) ?? latest;

  const resetDraft = () => {
    setText("");
    setShapes([]);
    setDrawTool(null);
    setDraftPoint(null);
    setLockedTime(null);
  };

  // trocar de versão descarta o rascunho e a seleção
  useEffect(() => {
    setSelectedId(null);
    setText("");
    setShapes([]);
    setDrawTool(null);
    setDraftPoint(null);
    setLockedTime(null);
  }, [version?.attachment.id]);

  // permissões: o cliente (convidado) também comenta, aprova e pede refação
  const canComment =
    !disabled ||
    allowPermissions(
      [EUserPermissions.ADMIN, EUserPermissions.MEMBER, EUserPermissions.GUEST],
      EUserPermissionsLevel.PROJECT,
      workspaceSlug,
      projectId
    );
  const isTeam = allowPermissions(
    [EUserPermissions.ADMIN, EUserPermissions.MEMBER],
    EUserPermissionsLevel.PROJECT,
    workspaceSlug,
    projectId
  );
  const isAdmin = allowPermissions([EUserPermissions.ADMIN], EUserPermissionsLevel.PROJECT, workspaceSlug, projectId);
  const permissions = { currentUserId: currentUser?.id, isTeam, isAdmin, canComment };

  // comentários comuns do item: aprovações, refações e marcações antigas
  const issueComments = (getCommentsByIssueId(issueId) ?? []).map((id) => getCommentById(id)).filter((c) => !!c);
  const linkedCommentIds = new Set((review.comments ?? []).map((item) => item.comment).filter(Boolean));

  const decisionsByVersion = new Map<string, TVersionDecision>();
  const legacyByVersion = new Map<string, TLegacyMark[]>();
  for (const comment of issueComments) {
    const decision = parseDecision(comment);
    if (decision) {
      const target = versionAt(versions, decision.createdAt);
      const previous = target && decisionsByVersion.get(target.attachment.id);
      if (target && (!previous || previous.createdAt < decision.createdAt))
        decisionsByVersion.set(target.attachment.id, decision);
      continue;
    }
    // as marcações novas também têm a cópia nesse formato; só fica de fora o que não veio da revisão
    if (!review.comments || linkedCommentIds.has(comment.id)) continue;
    const mark = parseLegacyMark(comment);
    if (!mark) continue;
    const target = versionAt(versions, new Date(mark.createdAt).getTime());
    if (!target || (target.kind === "video") !== (mark.timecode !== null)) continue;
    legacyByVersion.set(target.attachment.id, [...(legacyByVersion.get(target.attachment.id) ?? []), mark]);
  }

  const entries: TEntry[] = useMemo(() => {
    if (!version) return [];
    const isVideo = version.kind === "video";
    const own = (review.comments ?? []).filter((item) => item.asset === version.attachment.id);
    const topLevel = own.filter((item) => !item.parent);
    const repliesOf = (id: string) => own.filter((item) => item.parent === id);
    const list: TEntry[] = [
      ...topLevel.map((comment) => ({
        type: "comment" as const,
        comment,
        replies: repliesOf(comment.id),
        label: "",
        sortKey: isVideo ? (comment.timecode ?? 0) : new Date(comment.created_at).getTime(),
      })),
      ...(legacyByVersion.get(version.attachment.id) ?? []).map((mark) => ({
        type: "legacy" as const,
        mark,
        label: "",
        sortKey: isVideo ? (mark.timecode ?? 0) : new Date(mark.createdAt).getTime(),
      })),
    ];
    // oxlint-disable-next-line unicorn/no-array-sort -- a lista acabou de ser montada
    list.sort((a, b) => a.sortKey - b.sortKey);
    // na imagem, os pontos são numerados na ordem em que foram feitos
    list.forEach((entry, index) => {
      entry.label = isVideo
        ? formatTimecode(entry.type === "comment" ? entry.comment.timecode! : entry.mark.timecode!)
        : `#${index + 1}`;
    });
    return list;
    // legacyByVersion é recalculado a cada render; a chave do que muda é a lista de comentários do item
    // oxlint-disable-next-line hooks/exhaustive-deps
  }, [version, review.comments, issueComments.length]);

  const resolvedCount = entries.filter((entry) => entry.type === "comment" && entry.comment.resolved_at).length;
  const visibleEntries = showResolved
    ? entries
    : entries.filter((entry) => entry.type !== "comment" || !entry.comment.resolved_at);

  const markers: TReviewMarker[] = visibleEntries.map((entry) =>
    entry.type === "comment"
      ? {
          id: entry.comment.id,
          timecode: entry.comment.timecode,
          x: entry.comment.x,
          y: entry.comment.y,
          label: entry.label,
          preview: entry.comment.text || t("media_review.with_drawing"),
          resolved: !!entry.comment.resolved_at,
          legacy: false,
          hasDrawing: entry.comment.drawing.length > 0,
        }
      : {
          id: entry.mark.id,
          timecode: entry.mark.timecode,
          x: entry.mark.x,
          y: entry.mark.y,
          label: entry.label,
          preview: entry.mark.text,
          resolved: false,
          legacy: true,
          hasDrawing: false,
        }
  );

  if (!version) return null;
  const isVideo = version.kind === "video";
  const selectedEntry = entries.find((entry) =>
    entry.type === "comment" ? entry.comment.id === selectedId : entry.mark.id === selectedId
  );
  const selectedComment = selectedEntry?.type === "comment" ? selectedEntry.comment : null;
  const isDrafting = shapes.length > 0 || !!drawTool;
  // Desenho na tela: o do rascunho, ou o do comentário escolhido (no vídeo, parado no tempo dele).
  const overlayShapes = isDrafting
    ? shapes
    : selectedComment && (!isVideo || (!isPlaying && Math.abs(playerTime - (selectedComment.timecode ?? 0)) < 0.25))
      ? selectedComment.drawing
      : [];

  const draftTime = lockedTime ?? playerTime;
  const positionLabel = isVideo
    ? t("media_review.at_time", { time: formatTimecode(draftTime) })
    : draftPoint || shapes.length
      ? t("media_review.at_point")
      : null;

  const select = (id: string) => {
    setSelectedId(id);
    const entry = entries.find((item) => (item.type === "comment" ? item.comment.id : item.mark.id) === id);
    const timecode = entry?.type === "comment" ? entry.comment.timecode : entry?.mark.timecode;
    if (isVideo && timecode !== null && timecode !== undefined) {
      stageRef.current?.pause();
      stageRef.current?.seek(timecode);
    }
    listRef.current?.querySelector(`[data-review-id="${id}"]`)?.scrollIntoView({ block: "nearest" });
  };

  const startDraft = () => {
    setSelectedId(null);
    if (isVideo) stageRef.current?.pause();
  };

  const changeTool = (tool: TDrawingTool | null) => {
    setDrawTool(tool);
    if (tool) startDraft();
  };

  const addShape = (shape: TDrawingShape) => {
    if (isVideo && lockedTime === null) setLockedTime(stageRef.current?.currentTime() ?? playerTime);
    setShapes((current) => [...current, shape]);
  };

  const submit = async () => {
    if (!text.trim() && !shapes.length) return;
    let position: { timecode?: number; x?: number; y?: number };
    if (isVideo)
      position = { timecode: Number((lockedTime ?? stageRef.current?.currentTime() ?? playerTime).toFixed(3)) };
    else {
      const point =
        draftPoint ?? (shapes[0] ? { x: shapes[0].points[0][0] * 100, y: shapes[0].points[0][1] * 100 } : null);
      if (!point) return;
      position = { x: Number(point.x.toFixed(2)), y: Number(point.y.toFixed(2)) };
    }
    setSubmitting(true);
    try {
      const created = await review.create({
        asset: version.attachment.id,
        text: text.trim(),
        drawing: shapes,
        ...position,
      });
      resetDraft();
      setSelectedId(created.id);
    } catch (error) {
      const message = (error as { error?: string } | undefined)?.error;
      setToast({
        type: TOAST_TYPE.ERROR,
        title: t("media_review.save_error"),
        message:
          message === "You are not allowed to comment on the issue" ? t("media_review.guest_not_allowed") : undefined,
      });
    } finally {
      setSubmitting(false);
    }
  };

  const withToast = async (action: () => Promise<unknown>) => {
    try {
      await action();
    } catch {
      setToast({ type: TOAST_TYPE.ERROR, title: t("media_review.save_error") });
    }
  };

  const handleApprove = async () => {
    const author = currentUser?.display_name || currentUser?.email || "Alguém";
    // texto fixo: o n8n ("Peça Aprovada") e o painel de peças leem este formato
    const raw = `✅ Peça aprovada por ${escapeHtml(author)} em ${formatDateBR(new Date())}`;
    await createComment(workspaceSlug, projectId, issueId, { comment_html: `<p>${raw}</p>` });
  };

  const refreshAfterRework = async () => {
    await Promise.allSettled([
      fetchIssue(workspaceSlug, projectId, issueId),
      fetchComments(workspaceSlug, projectId, issueId),
      fetchActivities(workspaceSlug, projectId, issueId),
    ]);
  };

  const uploadVersion = async (file: File) => {
    if (file.size > maxFileSize) {
      setToast({
        type: TOAST_TYPE.ERROR,
        title: t("toast.error"),
        message: t("ui.file_size_limit", { size: maxFileSize / 1024 / 1024 }),
      });
      return;
    }
    try {
      await attachmentOperations.create(file);
    } catch {
      // o toast do envio já avisou
    }
  };

  const uploading = (getAttachmentsUploadStatusByIssueId(issueId) ?? [])[0];
  const decision = decisionsByVersion.get(version.attachment.id) ?? null;

  // Conversão do vídeo (fase 2): a cópia que toca em qualquer navegador, a capa e as miniaturas.
  const rendition = isVideo ? renditions?.find((item) => item.asset === version.attachment.id) : undefined;
  const fileUrl = (kind: "playback" | "poster" | "sprite") =>
    getFileURL(renditionFilePath(workspaceSlug, projectId, issueId, version.attachment.id, kind)) ?? "";
  const isReady = rendition?.status === "ready";
  const isConverting = rendition?.status === "pending" || rendition?.status === "processing";
  const src =
    isReady && rendition?.has_playback ? fileUrl("playback") : (getFileURL(version.attachment.asset_url) ?? "");
  const preview = isReady && rendition?.sprite ? { ...rendition.sprite, url: fileUrl("sprite") } : null;

  const conversionStatus = isConverting ? (
    <span className="flex shrink-0 items-center gap-1 text-12 text-tertiary">
      <Loader2 className="size-3.5 animate-spin" />
      {t("media_review.converting")}
    </span>
  ) : rendition?.status === "failed" ? (
    <Tooltip tooltipContent={rendition.error || t("media_review.conversion_failed")} position="top">
      <span className="flex shrink-0 items-center gap-1 text-12 text-warning-primary">
        <AlertTriangle className="size-3.5" />
        {t("media_review.conversion_failed")}
        {isTeam && (
          <button
            type="button"
            onClick={() => void withToast(() => retryRendition(version.attachment.id))}
            className="ml-1 flex items-center gap-0.5 text-secondary underline-offset-2 hover:underline"
          >
            <RotateCw className="size-3" />
            {t("media_review.retry")}
          </button>
        )}
      </span>
    </Tooltip>
  ) : null;

  const versionPicker = (
    <div className="flex min-w-0 flex-1 items-center gap-1 overflow-x-auto">
      {versions.map((item) => {
        const status = decisionsByVersion.get(item.attachment.id)?.kind;
        const active = item.attachment.id === version.attachment.id;
        return (
          <Tooltip
            key={item.attachment.id}
            tooltipContent={`${item.attachment.attributes.name} · ${renderFormattedDate(new Date(item.createdAt)) ?? ""}`}
            position="top"
          >
            <button
              type="button"
              onClick={() => setVersionId(item.attachment.id)}
              className={cn(
                "flex h-6 shrink-0 items-center gap-1 rounded-sm border px-2 text-12 font-medium",
                active
                  ? "border-accent-strong bg-accent-subtle text-accent-primary"
                  : "border-subtle text-secondary hover:bg-layer-transparent-hover"
              )}
            >
              v{item.number}
              {status && (
                <span
                  className={cn(
                    "size-1.5 rounded-full",
                    status === "approved" ? "bg-success-primary" : "bg-warning-primary"
                  )}
                />
              )}
            </button>
          </Tooltip>
        );
      })}
    </div>
  );

  const toolbar = (
    <div className="flex items-center gap-2">
      {versionPicker}
      {conversionStatus}
      {!disabled && (
        <>
          <input
            ref={fileInputRef}
            type="file"
            accept="image/*,video/*"
            className="hidden"
            onChange={(event) => {
              const file = event.target.files?.[0];
              event.target.value = "";
              if (file) void uploadVersion(file);
            }}
          />
          <Tooltip tooltipContent={t("media_review.upload_version")} position="top">
            <button
              type="button"
              aria-label={t("media_review.upload_version")}
              onClick={() => fileInputRef.current?.click()}
              disabled={!!uploading}
              className="flex h-6 shrink-0 items-center gap-1 rounded-sm px-1.5 text-12 text-secondary hover:bg-layer-transparent-hover disabled:opacity-60"
            >
              <Upload className="size-3.5" />
              {uploading
                ? t("media_review.uploading", { progress: Math.round(uploading.progress ?? 0) })
                : expanded
                  ? t("media_review.upload_version")
                  : null}
            </button>
          </Tooltip>
        </>
      )}
      {onExpand && (
        <Tooltip tooltipContent={t("media_review.expand")} position="top">
          <button
            type="button"
            aria-label={t("media_review.expand")}
            onClick={onExpand}
            className="grid size-6 shrink-0 place-items-center rounded-sm text-secondary hover:bg-layer-transparent-hover"
          >
            <Maximize2 className="size-3.5" />
          </button>
        </Tooltip>
      )}
      {onClose && (
        <Tooltip tooltipContent={t("close")} position="top">
          <button
            type="button"
            aria-label={t("close")}
            onClick={onClose}
            className="grid size-7 shrink-0 place-items-center rounded-sm text-secondary hover:bg-layer-transparent-hover"
          >
            <X className="size-4" />
          </button>
        </Tooltip>
      )}
    </div>
  );

  const stage = isVideo ? (
    <ReviewVideoStage
      ref={stageRef}
      src={src}
      poster={isReady && rendition?.has_poster ? fileUrl("poster") : undefined}
      initialAspect={rendition?.width && rendition.height ? rendition.width / rendition.height : null}
      fps={rendition?.fps}
      preview={preview}
      pendingMessage={isConverting ? t("media_review.video_converting") : null}
      markers={markers}
      selectedId={selectedId}
      onMarkerClick={select}
      shapes={overlayShapes}
      drawTool={drawTool}
      drawColor={drawColor}
      drawWidth={DRAWING_WIDTH}
      onShapeComplete={addShape}
      onTimeChange={(time, playing) => {
        setPlayerTime(time);
        setIsPlaying(playing);
      }}
      fill={expanded}
    />
  ) : (
    <ReviewImageStage
      src={getFileURL(version.attachment.asset_url) ?? ""}
      alt={version.attachment.attributes.name}
      markers={markers}
      selectedId={selectedId}
      onMarkerClick={select}
      draftPoint={draftPoint}
      onPointClick={
        canComment
          ? (point) => {
              setSelectedId(null);
              setDraftPoint(point);
            }
          : undefined
      }
      shapes={overlayShapes}
      drawTool={drawTool}
      drawColor={drawColor}
      drawWidth={DRAWING_WIDTH}
      onShapeComplete={addShape}
      fill={expanded}
    />
  );

  const composer = canComment && (
    <ReviewComposer
      placeholder={
        isVideo
          ? t("media_review.comment_placeholder_video", { time: formatTimecode(draftTime) })
          : draftPoint || shapes.length
            ? t("media_review.comment_placeholder_generic")
            : t("media_review.comment_placeholder_image")
      }
      positionLabel={positionLabel}
      text={text}
      onTextChange={setText}
      onFocus={startDraft}
      drawTool={drawTool}
      onDrawToolChange={changeTool}
      drawColor={drawColor}
      onDrawColorChange={setDrawColor}
      shapeCount={shapes.length}
      onUndo={() =>
        setShapes((current) => {
          const next = current.slice(0, -1);
          if (!next.length) setLockedTime(null);
          return next;
        })
      }
      onClearDrawing={() => {
        setShapes([]);
        setLockedTime(null);
      }}
      submitting={submitting}
      onSubmit={() => void submit()}
      onCancel={resetDraft}
    />
  );

  const activeIds = new Set(
    isVideo && isPlaying
      ? entries
          .filter((entry) => {
            const timecode = entry.type === "comment" ? entry.comment.timecode : entry.mark.timecode;
            return timecode !== null && Math.abs(timecode - playerTime) < 1;
          })
          .map((entry) => (entry.type === "comment" ? entry.comment.id : entry.mark.id))
      : []
  );

  const list = (
    <div className="flex flex-col gap-2">
      <div className="flex items-center justify-between gap-2">
        <span className="text-13 font-medium text-primary">
          {t("media_review.comments_count", { count: entries.length })}
        </span>
        {resolvedCount > 0 && (
          <button
            type="button"
            onClick={() => setShowResolved(!showResolved)}
            className="flex items-center gap-1 text-12 text-tertiary hover:text-secondary"
          >
            {showResolved ? <EyeOff className="size-3.5" /> : <Eye className="size-3.5" />}
            {showResolved
              ? t("media_review.hide_resolved", { count: resolvedCount })
              : t("media_review.show_resolved", { count: resolvedCount })}
          </button>
        )}
      </div>
      {review.comments && visibleEntries.length === 0 && (
        <p className="text-13 text-tertiary">
          {isVideo ? t("media_review.empty_video") : t("media_review.empty_image")}
        </p>
      )}
      <div ref={listRef} className="flex flex-col gap-2">
        {visibleEntries.map((entry) =>
          entry.type === "comment" ? (
            <ReviewCommentItem
              key={entry.comment.id}
              comment={entry.comment}
              replies={entry.replies}
              label={entry.label}
              selected={selectedId === entry.comment.id}
              active={activeIds.has(entry.comment.id)}
              permissions={permissions}
              onSelect={() => select(entry.comment.id)}
              onReply={(replyText) => withToast(() => review.create({ parent: entry.comment.id, text: replyText }))}
              onEdit={(id, newText) => withToast(() => review.update(id, { text: newText }))}
              onDelete={(id) => withToast(() => review.remove(id))}
              onResolve={(resolved) => withToast(() => review.update(entry.comment.id, { resolved }))}
            />
          ) : (
            <LegacyMarkItem
              key={entry.mark.id}
              mark={entry.mark}
              label={entry.label}
              selected={selectedId === entry.mark.id}
              onSelect={() => select(entry.mark.id)}
            />
          )
        )}
      </div>
    </div>
  );

  const decisionBar = (
    <ReviewDecisionBar
      workspaceSlug={workspaceSlug}
      projectId={projectId}
      issueId={issueId}
      decision={decision}
      isLatest={version.attachment.id === latest?.attachment.id}
      canReview={canComment}
      onApprove={handleApprove}
      onReworkRequested={refreshAfterRework}
    />
  );

  if (expanded)
    return (
      <div className="flex h-full min-h-0 flex-col">
        <div className="flex shrink-0 items-center gap-3 border-b border-subtle px-4 py-2.5">
          <h3 className="shrink-0 text-14 font-semibold text-primary">{t("media_review.title")}</h3>
          <div className="min-w-0 flex-1">{toolbar}</div>
        </div>
        <div className="flex min-h-0 flex-1 flex-col md:flex-row">
          <div className="flex min-h-0 min-w-0 flex-1 flex-col gap-2 p-4">
            <div className="min-h-0 flex-1">{stage}</div>
            {isVideo && <p className="shrink-0 text-11 text-tertiary">{t("media_review.shortcuts")}</p>}
          </div>
          <div className="flex w-full shrink-0 flex-col gap-3 overflow-y-auto border-t border-subtle p-4 md:w-96 md:border-t-0 md:border-l">
            {decisionBar}
            {composer}
            {list}
          </div>
        </div>
      </div>
    );

  return (
    <div className="flex flex-col gap-3 px-1.5 pb-2">
      {toolbar}
      {stage}
      {composer}
      {decisionBar}
      {list}
    </div>
  );
});
