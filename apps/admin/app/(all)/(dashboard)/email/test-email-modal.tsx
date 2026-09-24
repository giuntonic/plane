/**
 * Copyright (c) 2023-present Plane Software, Inc. and contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 * See the LICENSE file for details.
 */

import { useTranslation } from "@plane/i18n";
import { useEffect, useState, Fragment } from "react";
import { Dialog, Transition } from "@headlessui/react";
// plane imports
import { Button } from "@plane/propel/button";
import { InstanceService } from "@plane/services";
// ui
import { Input } from "@plane/ui";

type Props = {
  isOpen: boolean;
  handleClose: () => void;
};

enum ESendEmailSteps {
  SEND_EMAIL = "SEND_EMAIL",
  SUCCESS = "SUCCESS",
  FAILED = "FAILED",
}

const instanceService = new InstanceService();

export function SendTestEmailModal(props: Props) {
  const { t } = useTranslation();
  const { isOpen, handleClose } = props;

  // state
  const [receiverEmail, setReceiverEmail] = useState("");
  const [sendEmailStep, setSendEmailStep] = useState<ESendEmailSteps>(ESendEmailSteps.SEND_EMAIL);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState("");

  // reset state
  const resetState = () => {
    setReceiverEmail("");
    setSendEmailStep(ESendEmailSteps.SEND_EMAIL);
    setIsLoading(false);
    setError("");
  };

  useEffect(() => {
    if (!isOpen) {
      resetState();
    }
  }, [isOpen]);

  const handleSubmit = async (e: React.MouseEvent<HTMLButtonElement, MouseEvent>) => {
    e.preventDefault();

    setIsLoading(true);
    await instanceService
      .sendTestEmail(receiverEmail)
      .then(() => {
        setSendEmailStep(ESendEmailSteps.SUCCESS);
      })
      .catch((error) => {
        setError(error?.error || t("ui.failed_to_send_email"));
        setSendEmailStep(ESendEmailSteps.FAILED);
      })
      .finally(() => {
        setIsLoading(false);
      });
  };

  return (
    <Transition.Root show={isOpen} as={Fragment}>
      <Dialog as="div" className="relative z-20" onClose={handleClose}>
        <Transition.Child
          as={Fragment}
          enter="ease-out duration-300"
          enterFrom="opacity-0"
          enterTo="opacity-100"
          leave="ease-in duration-200"
          leaveFrom="opacity-100"
          leaveTo="opacity-0"
        >
          <div className="fixed inset-0 bg-backdrop transition-opacity" />
        </Transition.Child>
        <div className="fixed inset-0 z-20 overflow-y-auto">
          <div className="my-10 flex justify-center p-4 text-center sm:p-0 md:my-20">
            <Transition.Child
              as={Fragment}
              enter="ease-out duration-300"
              enterFrom="opacity-0 translate-y-4 sm:translate-y-0 sm:scale-95"
              enterTo="opacity-100 translate-y-0 sm:scale-100"
              leave="ease-in duration-200"
              leaveFrom="opacity-100 translate-y-0 sm:scale-100"
              leaveTo="opacity-0 translate-y-4 sm:translate-y-0 sm:scale-95"
            >
              <Dialog.Panel className="relative w-full transform rounded-lg bg-surface-1 p-5 px-4 text-left shadow-raised-200 transition-all sm:max-w-xl">
                <h3 className="text-16 leading-6 font-medium text-primary">
                  {sendEmailStep === ESendEmailSteps.SEND_EMAIL
                    ? t("ui.send_test_email")
                    : sendEmailStep === ESendEmailSteps.SUCCESS
                      ? t("ui.email_send")
                      : t("ui.failed")}{" "}
                </h3>
                <div className="pt-6 pb-2">
                  {sendEmailStep === ESendEmailSteps.SEND_EMAIL && (
                    <Input
                      id="receiver_email"
                      type="email"
                      value={receiverEmail}
                      onChange={(e) => setReceiverEmail(e.target.value)}
                      placeholder={t("ui.receiver_email")}
                      className="w-full resize-none text-16"
                      tabIndex={0}
                    />
                  )}
                  {sendEmailStep === ESendEmailSteps.SUCCESS && (
                    <div className="flex flex-col gap-y-4 text-13">
                      <p>
                        {t("ui.jsx_we_have_sent_the_test_email_to")} {receiverEmail}
                        {t("ui.jsx_please_check_your_spam_folder_if_you")}
                      </p>
                      <p>{t("ui.jsx_if_you_still_cannot_find_it_recheck")}</p>
                    </div>
                  )}
                  {sendEmailStep === ESendEmailSteps.FAILED && <div className="text-13">{error}</div>}
                  <div className="mt-5 flex items-center justify-end gap-2">
                    <Button variant="secondary" size="lg" onClick={handleClose} tabIndex={0}>
                      {sendEmailStep === ESendEmailSteps.SEND_EMAIL ? t("cancel") : t("close")}
                    </Button>
                    {sendEmailStep === ESendEmailSteps.SEND_EMAIL && (
                      <Button variant="primary" size="lg" loading={isLoading} onClick={handleSubmit} tabIndex={0}>
                        {isLoading ? t("ui.sending_email") : t("ui.send_email")}
                      </Button>
                    )}
                  </div>
                </div>
              </Dialog.Panel>
            </Transition.Child>
          </div>
        </div>
      </Dialog>
    </Transition.Root>
  );
}
