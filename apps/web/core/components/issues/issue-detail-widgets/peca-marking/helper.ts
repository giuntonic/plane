import type { TIssueAttachment, TIssueServiceType } from "@plane/types";
// hooks
import { useIssueDetail } from "@/hooks/store/use-issue-detail";

const IMAGE_EXTENSIONS = ["png", "jpg", "jpeg", "gif", "webp", "svg", "bmp"];
const VIDEO_EXTENSIONS = ["mp4", "mov", "webm", "avi", "mkv"];

export type TPecaMediaKind = "imagem" | "video";

function extensionOf(name: string): string {
  const parts = name.split(".");
  return parts.length > 1 ? parts[parts.length - 1].toLowerCase() : "";
}

export function mediaKindOf(name: string): TPecaMediaKind | null {
  const ext = extensionOf(name);
  if (IMAGE_EXTENSIONS.includes(ext)) return "imagem";
  if (VIDEO_EXTENSIONS.includes(ext)) return "video";
  return null;
}

/**
 * Anexo mais recente do work item, e o tipo de mídia detectado pela
 * extensão do nome. Sem useMemo de propósito: o componente chamador já é
 * um `observer` do mobx-react, que rastreia os observables lidos aqui
 * (attachments/attachmentMap) e re-renderiza sozinho quando mudam — um
 * memo com dependência própria só arriscaria ficar dessincronizado.
 */
export function useLatestPecaAttachment(
  issueId: string,
  issueServiceType: TIssueServiceType
): { attachment: TIssueAttachment | undefined; kind: TPecaMediaKind | null } {
  const {
    attachment: { getAttachmentsByIssueId, getAttachmentById },
  } = useIssueDetail(issueServiceType);

  const ids = getAttachmentsByIssueId(issueId) ?? [];
  const attachments = ids.map((id) => getAttachmentById(id)).filter((a): a is TIssueAttachment => !!a);
  if (attachments.length === 0) return { attachment: undefined, kind: null };

  const latest = attachments
    .slice()
    .sort((a, b) => new Date(b.updated_at).getTime() - new Date(a.updated_at).getTime())[0];
  return { attachment: latest, kind: mediaKindOf(latest.attributes.name) };
}
