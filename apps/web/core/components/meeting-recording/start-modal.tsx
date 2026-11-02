/**
 * Copyright (c) 2023-present Plane Software, Inc. and contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 * See the LICENSE file for details.
 */

import { observer } from "mobx-react";
import { Headphones, Megaphone, MonitorUp, Video } from "lucide-react";
import { useTranslation } from "@plane/i18n";
import { Button } from "@plane/propel/button";
import { EModalWidth, ModalCore } from "@plane/ui";
// local imports
import { isRecordingSupported, meetingRecorder, useMeetingRecorder } from "./recorder";

type Props = {
  isOpen: boolean;
  onClose: () => void;
  workspaceSlug: string;
  projectId: string;
  issueId: string;
  /** "CLI-12": o item, para o atalho no topo enquanto grava. */
  issueLabel: string;
  calendarEventId?: string;
};

/** Pespo: explica o que vai acontecer e começa a gravação (a escolha da aba precisa vir de um clique). */
export const StartRecordingModal = observer(function StartRecordingModal(props: Props) {
  const { isOpen, onClose, workspaceSlug, projectId, issueId, issueLabel, calendarEventId } = props;
  const { t } = useTranslation();
  const state = useMeetingRecorder();
  const supported = isRecordingSupported();

  const start = async () => {
    await meetingRecorder.start({ workspaceSlug, projectId, issueId }, { calendarEventId, label: issueLabel });
    onClose();
  };

  const steps = [
    { icon: Video, text: t("meeting_recording.step_open") },
    { icon: MonitorUp, text: t("meeting_recording.step_choose") },
    { icon: Megaphone, text: t("meeting_recording.step_notice") },
    { icon: Headphones, text: t("meeting_recording.step_headphones") },
  ];

  return (
    <ModalCore isOpen={isOpen} handleClose={onClose} width={EModalWidth.LG} preventOutsideClick>
      <div className="flex flex-col gap-4 p-5">
        <div className="flex flex-col gap-1">
          <h3 className="text-h5-medium text-primary">{t("meeting_recording.start_title")}</h3>
          <p className="text-body-sm-regular text-secondary">{t("meeting_recording.start_intro")}</p>
        </div>
        <ul className="flex flex-col gap-2.5">
          {steps.map(({ icon: Icon, text }) => (
            <li key={text} className="flex items-start gap-2.5 text-body-sm-regular text-primary">
              <Icon className="mt-0.5 size-4 shrink-0 text-tertiary" />
              <span>{text}</span>
            </li>
          ))}
        </ul>
        {!supported && (
          <p className="text-body-xs-regular text-danger-primary">{t("meeting_recording.errors.unsupported")}</p>
        )}
      </div>
      <div className="flex justify-end gap-2 border-t border-subtle px-5 py-4">
        <Button variant="secondary" onClick={onClose}>
          {t("common.cancel")}
        </Button>
        <Button
          variant="primary"
          onClick={() => void start()}
          disabled={!supported || state.status !== "idle"}
          loading={state.status === "starting"}
        >
          {state.status === "starting" ? t("meeting_recording.starting") : t("meeting_recording.start")}
        </Button>
      </div>
    </ModalCore>
  );
});
