/**
 * Copyright (c) 2023-present Plane Software, Inc. and contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 * See the LICENSE file for details.
 */

import { useEffect, useRef, useState } from "react";
import { observer } from "mobx-react";
import { CheckCircle2, Circle, CornerDownRight, History, Pencil, PenLine, Trash2 } from "lucide-react";
import { useTranslation } from "@plane/i18n";
import { Tooltip } from "@plane/propel/tooltip";
import { Avatar, Button, TextArea } from "@plane/ui";
import { calculateTimeAgo, cn, getFileURL } from "@plane/utils";
// hooks
import { useMember } from "@/hooks/store/use-member";
// local imports
import type { TLegacyMark, TMediaReviewComment } from "./types";

type TPermissions = {
  currentUserId: string | undefined;
  isTeam: boolean;
  isAdmin: boolean;
  canComment: boolean;
};

type ItemProps = {
  comment: TMediaReviewComment;
  replies: TMediaReviewComment[];
  label: string;
  selected: boolean;
  active: boolean;
  permissions: TPermissions;
  onSelect: () => void;
  onReply: (text: string) => Promise<unknown>;
  onEdit: (id: string, text: string) => Promise<unknown>;
  onDelete: (id: string) => Promise<unknown>;
  onResolve: (resolved: boolean) => Promise<unknown>;
};

const Author = observer(function Author({ userId, time, edited }: { userId: string; time: string; edited: boolean }) {
  const { t } = useTranslation();
  const { getUserDetails } = useMember();
  const user = getUserDetails(userId);
  return (
    <div className="flex min-w-0 items-center gap-1.5">
      <Avatar name={user?.display_name} src={getFileURL(user?.avatar_url ?? "")} size="sm" showTooltip={false} />
      <span className="truncate text-13 font-medium text-primary">
        {user?.display_name ?? t("media_review.someone")}
      </span>
      <span className="shrink-0 text-11 text-tertiary">
        {calculateTimeAgo(time)}
        {edited && ` · ${t("media_review.edited")}`}
      </span>
    </div>
  );
});

function InlineEditor(props: {
  initial: string;
  placeholder: string;
  submitLabel: string;
  onSubmit: (text: string) => Promise<unknown>;
  onCancel: () => void;
}) {
  const { initial, placeholder, submitLabel, onSubmit, onCancel } = props;
  const { t } = useTranslation();
  const [text, setText] = useState(initial);
  const [saving, setSaving] = useState(false);
  const inputRef = useRef<HTMLTextAreaElement>(null);
  // abre já com o cursor no campo (editar ou responder é sempre um clique de quem vai digitar)
  useEffect(() => inputRef.current?.focus(), []);
  const submit = async () => {
    if (!text.trim()) return;
    setSaving(true);
    try {
      await onSubmit(text.trim());
      onCancel();
    } finally {
      setSaving(false);
    }
  };
  return (
    <div className="flex flex-col gap-1.5">
      <TextArea
        ref={inputRef}
        value={text}
        onChange={(event) => setText(event.target.value)}
        onKeyDown={(event) => {
          if (event.key === "Enter" && (event.metaKey || event.ctrlKey)) {
            event.preventDefault();
            void submit();
          }
          if (event.key === "Escape") {
            event.stopPropagation();
            onCancel();
          }
        }}
        placeholder={placeholder}
        className="min-h-12 w-full resize-none text-13"
      />
      <div className="flex justify-end gap-2">
        <Button variant="neutral-primary" size="sm" onClick={onCancel}>
          {t("cancel")}
        </Button>
        <Button
          variant="primary"
          size="sm"
          onClick={() => void submit()}
          loading={saving}
          disabled={!text.trim() || saving}
        >
          {submitLabel}
        </Button>
      </div>
    </div>
  );
}

function IconAction(props: { label: string; onClick: () => void; children: React.ReactNode; className?: string }) {
  return (
    <Tooltip tooltipContent={props.label} position="top">
      <button
        type="button"
        aria-label={props.label}
        onClick={(event) => {
          event.stopPropagation();
          props.onClick();
        }}
        className={cn(
          "grid size-6 place-items-center rounded-sm text-tertiary hover:bg-layer-transparent-hover hover:text-secondary",
          props.className
        )}
      >
        {props.children}
      </button>
    </Tooltip>
  );
}

function Body(props: {
  comment: TMediaReviewComment;
  permissions: TPermissions;
  onEdit: (id: string, text: string) => Promise<unknown>;
  onDelete: (id: string) => Promise<unknown>;
  extraActions?: React.ReactNode;
}) {
  const { comment, permissions, onEdit, onDelete, extraActions } = props;
  const { t } = useTranslation();
  const [editing, setEditing] = useState(false);
  const [confirming, setConfirming] = useState(false);
  const isAuthor = comment.created_by === permissions.currentUserId;
  const canDelete = isAuthor || permissions.isAdmin;

  return (
    <div className="flex flex-col gap-1">
      <div className="flex items-start justify-between gap-2">
        <Author userId={comment.created_by} time={comment.created_at} edited={!!comment.edited_at} />
        <div className="flex shrink-0 items-center gap-0.5">
          {extraActions}
          {isAuthor && !editing && (
            <IconAction label={t("edit")} onClick={() => setEditing(true)}>
              <Pencil className="size-3.5" />
            </IconAction>
          )}
          {canDelete && (
            <IconAction label={t("delete")} onClick={() => setConfirming(true)} className="hover:text-danger-primary">
              <Trash2 className="size-3.5" />
            </IconAction>
          )}
        </div>
      </div>
      {editing ? (
        <InlineEditor
          initial={comment.text}
          placeholder={t("media_review.comment_placeholder_generic")}
          submitLabel={t("save")}
          onSubmit={(text) => onEdit(comment.id, text)}
          onCancel={() => setEditing(false)}
        />
      ) : (
        comment.text && <p className="text-13 break-words whitespace-pre-wrap text-secondary">{comment.text}</p>
      )}
      {confirming && (
        <div className="flex items-center justify-between gap-2 rounded-sm bg-layer-1 px-2 py-1.5 text-12">
          <span className="text-secondary">
            {comment.parent ? t("media_review.delete_reply_confirm") : t("media_review.delete_confirm")}
          </span>
          <div className="flex shrink-0 gap-1.5">
            <Button variant="neutral-primary" size="sm" onClick={() => setConfirming(false)}>
              {t("cancel")}
            </Button>
            <Button variant="danger" size="sm" onClick={() => void onDelete(comment.id)}>
              {t("delete")}
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}

export function ReviewCommentItem(props: ItemProps) {
  const { comment, replies, label, selected, active, permissions, onSelect, onReply, onEdit, onDelete, onResolve } =
    props;
  const { t } = useTranslation();
  const [replying, setReplying] = useState(false);
  const isAuthor = comment.created_by === permissions.currentUserId;
  const canResolve = isAuthor || permissions.isTeam;
  const resolved = !!comment.resolved_at;

  return (
    // O cartão inteiro leva ao momento do comentário; os botões dentro dele têm o próprio foco.
    // oxlint-disable-next-line jsx_a11y/click-events-have-key-events, jsx_a11y/no-static-element-interactions
    <div
      data-review-id={comment.id}
      onClick={onSelect}
      className={cn(
        "flex cursor-pointer flex-col gap-1.5 rounded-md border border-subtle p-2 transition-colors hover:bg-layer-1",
        selected && "border-accent-strong bg-accent-subtle/40",
        active && !selected && "border-warning-strong",
        resolved && "opacity-70"
      )}
    >
      <div className="flex items-center gap-1.5">
        <span className="rounded-sm bg-layer-2 px-1.5 py-0.5 text-11 font-semibold text-secondary tabular-nums">
          {label}
        </span>
        {comment.drawing.length > 0 && (
          <Tooltip tooltipContent={t("media_review.with_drawing")} position="top">
            <PenLine className="size-3.5 text-tertiary" />
          </Tooltip>
        )}
        {resolved && <span className="text-11 font-medium text-success-primary">{t("media_review.resolved")}</span>}
      </div>
      <Body
        comment={comment}
        permissions={permissions}
        onEdit={onEdit}
        onDelete={onDelete}
        extraActions={
          canResolve ? (
            <IconAction
              label={resolved ? t("media_review.reopen") : t("media_review.resolve")}
              onClick={() => void onResolve(!resolved)}
              className={resolved ? "text-success-primary" : undefined}
            >
              {resolved ? <CheckCircle2 className="size-3.5" /> : <Circle className="size-3.5" />}
            </IconAction>
          ) : null
        }
      />
      {replies.length > 0 && (
        <div className="mt-1 flex flex-col gap-2 border-l-2 border-subtle pl-2.5">
          {replies.map((reply) => (
            <Body key={reply.id} comment={reply} permissions={permissions} onEdit={onEdit} onDelete={onDelete} />
          ))}
        </div>
      )}
      {permissions.canComment &&
        (replying ? (
          // oxlint-disable-next-line jsx_a11y/click-events-have-key-events, jsx_a11y/no-static-element-interactions
          <div onClick={(event) => event.stopPropagation()}>
            <InlineEditor
              initial=""
              placeholder={t("media_review.reply_placeholder")}
              submitLabel={t("media_review.reply")}
              onSubmit={onReply}
              onCancel={() => setReplying(false)}
            />
          </div>
        ) : (
          <button
            type="button"
            onClick={(event) => {
              event.stopPropagation();
              setReplying(true);
            }}
            className="flex w-fit items-center gap-1 text-12 text-tertiary hover:text-secondary"
          >
            <CornerDownRight className="size-3.5" />
            {t("media_review.reply")}
          </button>
        ))}
    </div>
  );
}

/** Marcação antiga (Marcação da Peça de antes ou portal do cliente): só leitura. */
export function LegacyMarkItem(props: { mark: TLegacyMark; label: string; selected: boolean; onSelect: () => void }) {
  const { mark, label, selected, onSelect } = props;
  const { t } = useTranslation();
  return (
    <button
      type="button"
      onClick={onSelect}
      className={cn(
        "flex flex-col gap-1 rounded-md border border-dashed border-subtle p-2 text-left hover:bg-layer-1",
        selected && "border-accent-strong"
      )}
    >
      <div className="flex items-center gap-1.5">
        <span className="rounded-sm bg-layer-2 px-1.5 py-0.5 text-11 font-semibold text-secondary tabular-nums">
          {label}
        </span>
        <Tooltip tooltipContent={t("media_review.legacy_hint")} position="top">
          <span className="flex items-center gap-1 text-11 text-tertiary">
            <History className="size-3" />
            {t("media_review.legacy")}
          </span>
        </Tooltip>
        <span className="truncate text-12 font-medium text-primary">{mark.author}</span>
        <span className="shrink-0 text-11 text-tertiary">{calculateTimeAgo(mark.createdAt)}</span>
      </div>
      <p className="text-13 break-words whitespace-pre-wrap text-secondary">{mark.text}</p>
    </button>
  );
}
