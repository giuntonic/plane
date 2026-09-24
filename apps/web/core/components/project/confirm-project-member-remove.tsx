/**
 * Copyright (c) 2023-present Plane Software, Inc. and contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 * See the LICENSE file for details.
 */

import { useTranslation } from "@plane/i18n";
import { useState } from "react";
import { observer } from "mobx-react";
import { useParams } from "next/navigation";
import { AlertTriangle } from "lucide-react";
// types
import { Button } from "@plane/propel/button";
import type { IUserLite } from "@plane/types";
// ui
import { EModalPosition, EModalWidth, ModalCore } from "@plane/ui";
// hooks
import { useProject } from "@/hooks/store/use-project";
import { useUser } from "@/hooks/store/user";

type Props = {
  data: Partial<IUserLite>;
  onSubmit: () => Promise<void>;
  isOpen: boolean;
  onClose: () => void;
};

export const ConfirmProjectMemberRemove = observer(function ConfirmProjectMemberRemove(props: Props) {
  const { t } = useTranslation();
  const { data, onSubmit, isOpen, onClose } = props;
  // router
  const { projectId } = useParams();
  // states
  const [isDeleteLoading, setIsDeleteLoading] = useState(false);
  // store hooks
  const { data: currentUser } = useUser();
  const { getProjectById } = useProject();

  const handleClose = () => {
    onClose();
    setIsDeleteLoading(false);
  };

  const handleDeletion = async () => {
    setIsDeleteLoading(true);

    await onSubmit();

    handleClose();
  };

  if (!projectId) return <></>;

  const isCurrentUser = currentUser?.id === data?.id;
  const currentProjectDetails = getProjectById(projectId.toString());

  return (
    <ModalCore isOpen={isOpen} handleClose={handleClose} position={EModalPosition.CENTER} width={EModalWidth.XXL}>
      <div className="bg-surface-1 px-4 pt-5 pb-4 sm:p-6 sm:pb-4">
        <div className="sm:flex sm:items-start">
          <div className="mx-auto flex h-12 w-12 shrink-0 items-center justify-center rounded-full bg-danger-subtle sm:mx-0 sm:h-10 sm:w-10">
            <AlertTriangle className="h-6 w-6 text-danger-primary" aria-hidden="true" />
          </div>
          <div className="mt-3 text-center sm:mt-0 sm:ml-4 sm:text-left">
            <h3 className="text-16 leading-6 font-medium text-primary">
              {isCurrentUser ? t("ui.leave_project") : `Remove ${data?.display_name}?`}
            </h3>
            <div className="mt-2">
              <p className="text-13 text-secondary">
                {isCurrentUser ? (
                  <>
                    {t("ui.jsx_are_you_sure_you_want_to_leave")}{" "}
                    <span className="font-bold">{currentProjectDetails?.name}</span>{" "}
                    {t("ui.jsx_project_you_will_be_able_to_join")}
                  </>
                ) : (
                  <>
                    {t("ui.jsx_are_you_sure_you_want_to_remove")}{" "}
                    <span className="font-bold">{data?.display_name}</span>
                    {t("ui.jsx_they_will_no_longer_have_access_to")}
                  </>
                )}
              </p>
            </div>
          </div>
        </div>
      </div>
      <div className="flex justify-end gap-2 p-4 sm:px-6">
        <Button variant="secondary" size="lg" onClick={handleClose}>
          {t("cancel")}
        </Button>
        <Button variant="error-fill" size="lg" tabIndex={1} onClick={handleDeletion} loading={isDeleteLoading}>
          {isCurrentUser
            ? isDeleteLoading
              ? t("ui.leaving")
              : t("leave")
            : isDeleteLoading
              ? t("ui.removing")
              : t("remove")}
        </Button>
      </div>
    </ModalCore>
  );
});
