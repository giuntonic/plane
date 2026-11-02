/**
 * Copyright (c) 2023-present Plane Software, Inc. and contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 * See the LICENSE file for details.
 */

// Pespo: novo cliente. Cria o projeto (a partir de um modelo de projeto), o cliente, o contrato, a equipe do projeto
// e os logins do cliente, que recebem o e-mail "Seu acesso ao Pespo Hub".
import { useMemo, useState } from "react";
import { observer } from "mobx-react";
import { useTranslation } from "@plane/i18n";
import { Button } from "@plane/propel/button";
import { TOAST_TYPE, setToast } from "@plane/propel/toast";
import type { TPespoContractInput } from "@plane/types";
import { CustomSelect, EModalWidth, ModalCore, TextArea } from "@plane/ui";
import { cn } from "@plane/utils";
import { MemberDropdown } from "@/components/dropdowns/member/dropdown";
import { useMember } from "@/hooks/store/use-member";
import { pespoClientsService } from "@/services/pespo-clients.service";
import { ContractFields, inputClass } from "./contract-fields";
import { clientErrorMessage, emptyContract } from "./helpers";

type Props = {
  isOpen: boolean;
  onClose: () => void;
  workspaceSlug: string;
  templates: { id: string; name: string }[];
  onCreated: (clientId: string) => void;
};

export const NewClientModal = observer(function NewClientModal(props: Props) {
  const { isOpen, onClose, workspaceSlug, templates, onCreated } = props;
  const { t } = useTranslation();
  const {
    workspace: { workspaceMemberIds, getWorkspaceMemberDetails },
  } = useMember();
  const [name, setName] = useState("");
  const [identifier, setIdentifier] = useState("");
  const [templateId, setTemplateId] = useState("");
  const [contract, setContract] = useState<TPespoContractInput>(emptyContract());
  const [emails, setEmails] = useState("");
  const [memberIds, setMemberIds] = useState<string[]>([]);
  const [saving, setSaving] = useState(false);
  // só a equipe (membros e admins) entra no projeto por aqui; os convidados são os logins do cliente
  const teamIds = useMemo(
    () => (workspaceMemberIds ?? []).filter((id) => (getWorkspaceMemberDetails(id)?.role ?? 0) >= 15),
    [workspaceMemberIds, getWorkspaceMemberDetails]
  );

  const reset = () => {
    setName("");
    setIdentifier("");
    setTemplateId("");
    setContract(emptyContract());
    setEmails("");
    setMemberIds([]);
  };

  const submit = async () => {
    if (!name.trim()) return;
    setSaving(true);
    try {
      const result = await pespoClientsService.create(workspaceSlug, {
        ...contract,
        name: name.trim(),
        identifier: identifier.trim() || undefined,
        template_id: templateId || undefined,
        emails,
        member_ids: memberIds,
      });
      setToast({
        type: TOAST_TYPE.SUCCESS,
        title: t("pespo_clients.new.created", { identifier: result.project.identifier }),
        message: result.logins.length ? t("pespo_clients.new.logins_sent", { count: result.logins.length }) : undefined,
      });
      reset();
      onCreated(result.client.id);
    } catch (error) {
      setToast({ type: TOAST_TYPE.ERROR, title: t("toast.error"), message: clientErrorMessage(t, error) });
    } finally {
      setSaving(false);
    }
  };

  return (
    <ModalCore isOpen={isOpen} handleClose={onClose} width={EModalWidth.XXL} preventOutsideClick>
      <div className="flex max-h-[85vh] flex-col">
        <div className="border-b border-subtle px-5 py-4">
          <h3 className="text-body-lg-medium text-primary">{t("pespo_clients.new.title")}</h3>
          <p className="text-body-xs-regular text-tertiary">{t("pespo_clients.new.description")}</p>
        </div>
        <div className="flex flex-col gap-5 overflow-y-auto px-5 py-4">
          <div className="flex flex-wrap gap-4">
            <label className="flex min-w-60 flex-1 flex-col gap-1">
              <span className="text-body-xs-medium text-secondary">{t("pespo_clients.new.name")}</span>
              <input className={inputClass} value={name} onChange={(event) => setName(event.target.value)} />
            </label>
            <label className="flex w-32 flex-col gap-1">
              <span className="text-body-xs-medium text-secondary">{t("pespo_clients.new.identifier")}</span>
              <input
                className={inputClass}
                value={identifier}
                maxLength={12}
                placeholder={t("pespo_clients.new.identifier_auto")}
                onChange={(event) => setIdentifier(event.target.value.toUpperCase())}
              />
            </label>
          </div>
          <div className="flex flex-col gap-1">
            <span className="text-body-xs-medium text-secondary">{t("pespo_clients.new.template")}</span>
            <CustomSelect
              value={templateId}
              label={
                <span className="truncate">
                  {templates.find((template) => template.id === templateId)?.name ?? t("pespo_clients.new.no_template")}
                </span>
              }
              onChange={(value: string) => setTemplateId(value)}
              buttonClassName={cn(inputClass, "w-72")}
            >
              <CustomSelect.Option value="">{t("pespo_clients.new.no_template")}</CustomSelect.Option>
              {templates.map((template) => (
                <CustomSelect.Option key={template.id} value={template.id}>
                  {template.name}
                </CustomSelect.Option>
              ))}
            </CustomSelect>
            <span className="text-caption-sm-regular text-tertiary">{t("pespo_clients.new.template_hint")}</span>
          </div>
          <ContractFields value={contract} onChange={setContract} />
          <div className="flex flex-col gap-1">
            <span className="text-body-xs-medium text-secondary">{t("pespo_clients.new.emails")}</span>
            <TextArea
              value={emails}
              onChange={(event) => setEmails(event.target.value)}
              placeholder="ana@cliente.com.br, marcos@cliente.com.br"
              className="min-h-16 w-full resize-none text-body-sm-regular"
            />
            <span className="text-caption-sm-regular text-tertiary">{t("pespo_clients.new.emails_hint")}</span>
          </div>
          <div className="flex flex-col gap-1">
            <span className="text-body-xs-medium text-secondary">{t("pespo_clients.new.team")}</span>
            <div className="w-fit rounded-md border border-subtle">
              <MemberDropdown
                memberIds={teamIds}
                value={memberIds}
                onChange={setMemberIds}
                multiple
                buttonVariant="transparent-with-text"
                placeholder={t("pespo_clients.new.team_placeholder")}
              />
            </div>
          </div>
        </div>
        <div className="flex justify-end gap-2 border-t border-subtle px-5 py-3">
          <Button variant="secondary" size="sm" onClick={onClose}>
            {t("cancel")}
          </Button>
          <Button
            variant="primary"
            size="sm"
            onClick={() => void submit()}
            loading={saving}
            disabled={saving || !name.trim()}
          >
            {t("pespo_clients.new.submit")}
          </Button>
        </div>
      </div>
    </ModalCore>
  );
});
