/**
 * Copyright (c) 2023-present Plane Software, Inc. and contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 * See the LICENSE file for details.
 */

import { Popover as HeadlessReactPopover, Transition } from "@headlessui/react";
import { EllipsisVertical } from "lucide-react";
import type { Ref } from "react";
import React, { Fragment, useState } from "react";
import { usePopper } from "react-popper";
// helpers
import { cn } from "../utils";
// types
import type { TPopover } from "./types";

export function Popover(props: TPopover) {
  const {
    popperPosition = "bottom-end",
    popperPadding = 0,
    buttonClassName = "",
    popoverClassName = "",
    button,
    disabled = false,
    panelClassName = "",
    children,
    popoverButtonRef,
    buttonRefClassName = "",
  } = props;
  // states
  const [referenceElement, setReferenceElement] = useState<HTMLDivElement | null>(null);
  // Headless UI v2 types Panel's ref as Ref<HTMLElement> rather than the concrete tag.
  const [popperElement, setPopperElement] = useState<HTMLElement | null>(null);

  // react-popper derived values
  const { styles, attributes } = usePopper(referenceElement, popperElement, {
    placement: popperPosition,
    modifiers: [
      {
        name: "preventOverflow",
        options: {
          padding: popperPadding,
        },
      },
    ],
  });

  return (
    <HeadlessReactPopover className={cn("relative flex h-full w-full items-center justify-center", popoverClassName)}>
      <div ref={setReferenceElement} className={cn("w-full", buttonRefClassName)}>
        {/* Rendered as a div, not a <button>: a caller-supplied `button` prop may already
            render its own <button>, and nesting one inside another is invalid HTML. Headless
            UI still manages click/keyboard behavior for this trigger regardless of the tag. */}
        <HeadlessReactPopover.Button
          as="div"
          // oxlint-disable-next-line jsx_a11y/prefer-tag-over-role
          role="button"
          tabIndex={disabled ? -1 : 0}
          ref={popoverButtonRef as Ref<HTMLButtonElement>}
          className={cn(
            {
              "flex h-6 w-6 items-center justify-center rounded-sm bg-surface-2 text-14 transition-all hover:bg-layer-1":
                !button,
            },
            buttonClassName
          )}
          disabled={disabled}
        >
          {button ? button : <EllipsisVertical className="h-3 w-3" />}
        </HeadlessReactPopover.Button>
      </div>

      <Transition
        as={Fragment}
        enter="transition ease-out duration-200"
        enterFrom="opacity-0 translate-y-1"
        enterTo="opacity-100 translate-y-0"
        leave="transition ease-in duration-150"
        leaveFrom="opacity-100 translate-y-0"
        leaveTo="opacity-0 translate-y-1"
      >
        <HeadlessReactPopover.Panel
          ref={setPopperElement}
          style={styles.popper}
          {...attributes.popper}
          className={cn("absolute top-full left-0 z-20 mt-2 w-screen max-w-xs", panelClassName)}
        >
          {children}
        </HeadlessReactPopover.Panel>
      </Transition>
    </HeadlessReactPopover>
  );
}
