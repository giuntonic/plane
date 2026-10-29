/**
 * Copyright (c) 2023-present Plane Software, Inc. and contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 * See the LICENSE file for details.
 */

import { i18nInstance } from "@plane/i18n";
import type { LucideIcon } from "lucide-react";
import {
  AlignCenter,
  AlignLeft,
  AlignRight,
  Bold,
  CaseSensitive,
  Code2,
  Heading1,
  Heading2,
  Heading3,
  Heading4,
  Heading5,
  Heading6,
  Image,
  Italic,
  List,
  ListOrdered,
  ListTodo,
  Strikethrough,
  Table,
  TextQuote,
  Underline,
} from "lucide-react";
import { MonospaceIcon, SansSerifIcon, SerifIcon } from "@plane/propel/icons";
import type { TCommandExtraProps, TEditorCommands, TEditorFontStyle } from "@/types";

export type TEditorTypes = "lite" | "document" | "sticky";

// Utility type to enforce the necessary extra props or make extraProps optional
export type ExtraPropsForCommand<T extends TEditorCommands> = T extends keyof TCommandExtraProps
  ? TCommandExtraProps[T]
  : object; // Default to empty object for commands without extra props

export type ToolbarMenuItem<T extends TEditorCommands = TEditorCommands> = {
  itemKey: T;
  renderKey: string;
  name: string;
  icon: LucideIcon;
  shortcut?: string[];
  editors: TEditorTypes[];
  extraProps?: ExtraPropsForCommand<T>;
};

export const TYPOGRAPHY_ITEMS: ToolbarMenuItem<"text" | "h1" | "h2" | "h3" | "h4" | "h5" | "h6">[] = [
  {
    itemKey: "text",
    renderKey: "text",
    get name() {
      return i18nInstance.t("editor_ui.menu.text");
    },
    icon: CaseSensitive,
    editors: ["document"],
  },
  {
    itemKey: "h1",
    renderKey: "h1",
    get name() {
      return i18nInstance.t("editor_ui.menu.heading_1");
    },
    icon: Heading1,
    editors: ["document"],
  },
  {
    itemKey: "h2",
    renderKey: "h2",
    get name() {
      return i18nInstance.t("editor_ui.menu.heading_2");
    },
    icon: Heading2,
    editors: ["document"],
  },
  {
    itemKey: "h3",
    renderKey: "h3",
    get name() {
      return i18nInstance.t("editor_ui.menu.heading_3");
    },
    icon: Heading3,
    editors: ["document"],
  },
  {
    itemKey: "h4",
    renderKey: "h4",
    get name() {
      return i18nInstance.t("editor_ui.menu.heading_4");
    },
    icon: Heading4,
    editors: ["document"],
  },
  {
    itemKey: "h5",
    renderKey: "h5",
    get name() {
      return i18nInstance.t("editor_ui.menu.heading_5");
    },
    icon: Heading5,
    editors: ["document"],
  },
  {
    itemKey: "h6",
    renderKey: "h6",
    get name() {
      return i18nInstance.t("editor_ui.menu.heading_6");
    },
    icon: Heading6,
    editors: ["document"],
  },
];

export const TEXT_ALIGNMENT_ITEMS: ToolbarMenuItem<"text-align">[] = [
  {
    itemKey: "text-align",
    renderKey: "text-align-left",
    get name() {
      return i18nInstance.t("editor_ui.menu.left_align");
    },
    icon: AlignLeft,
    shortcut: ["Cmd", "Shift", "L"],
    editors: ["lite", "document"],
    extraProps: {
      alignment: "left",
    },
  },
  {
    itemKey: "text-align",
    renderKey: "text-align-center",
    get name() {
      return i18nInstance.t("editor_ui.menu.center_align");
    },
    icon: AlignCenter,
    shortcut: ["Cmd", "Shift", "E"],
    editors: ["lite", "document"],
    extraProps: {
      alignment: "center",
    },
  },
  {
    itemKey: "text-align",
    renderKey: "text-align-right",
    get name() {
      return i18nInstance.t("editor_ui.menu.right_align");
    },
    icon: AlignRight,
    shortcut: ["Cmd", "Shift", "R"],
    editors: ["lite", "document"],
    extraProps: {
      alignment: "right",
    },
  },
];

const BASIC_MARK_ITEMS: ToolbarMenuItem<"bold" | "italic" | "underline" | "strikethrough">[] = [
  {
    itemKey: "bold",
    renderKey: "bold",
    get name() {
      return i18nInstance.t("editor_ui.menu.bold");
    },
    icon: Bold,
    shortcut: ["Cmd", "B"],
    editors: ["lite", "document"],
  },
  {
    itemKey: "italic",
    renderKey: "italic",
    get name() {
      return i18nInstance.t("editor_ui.menu.italic");
    },
    icon: Italic,
    shortcut: ["Cmd", "I"],
    editors: ["lite", "document"],
  },
  {
    itemKey: "underline",
    renderKey: "underline",
    get name() {
      return i18nInstance.t("editor_ui.menu.underline");
    },
    icon: Underline,
    shortcut: ["Cmd", "U"],
    editors: ["lite", "document"],
  },
  {
    itemKey: "strikethrough",
    renderKey: "strikethrough",
    get name() {
      return i18nInstance.t("editor_ui.menu.strikethrough");
    },
    icon: Strikethrough,
    shortcut: ["Cmd", "Shift", "S"],
    editors: ["lite", "document"],
  },
];

const LIST_ITEMS: ToolbarMenuItem<"bulleted-list" | "numbered-list" | "to-do-list">[] = [
  {
    itemKey: "bulleted-list",
    renderKey: "bulleted-list",
    get name() {
      return i18nInstance.t("editor_ui.menu.bulleted_list");
    },
    icon: List,
    shortcut: ["Cmd", "Shift", "7"],
    editors: ["lite", "document"],
  },
  {
    itemKey: "numbered-list",
    renderKey: "numbered-list",
    get name() {
      return i18nInstance.t("editor_ui.menu.numbered_list");
    },
    icon: ListOrdered,
    shortcut: ["Cmd", "Shift", "8"],
    editors: ["lite", "document"],
  },
  {
    itemKey: "to-do-list",
    renderKey: "to-do-list",
    get name() {
      return i18nInstance.t("editor_ui.menu.to_do_list");
    },
    icon: ListTodo,
    shortcut: ["Cmd", "Shift", "9"],
    editors: ["lite", "document"],
  },
];

export const USER_ACTION_ITEMS: ToolbarMenuItem<"quote" | "code">[] = [
  {
    itemKey: "quote",
    renderKey: "quote",
    get name() {
      return i18nInstance.t("editor_ui.menu.quote");
    },
    icon: TextQuote,
    editors: ["lite", "document"],
  },
  {
    itemKey: "code",
    renderKey: "code",
    get name() {
      return i18nInstance.t("editor_ui.menu.code");
    },
    icon: Code2,
    editors: ["lite", "document"],
  },
];

export const COMPLEX_ITEMS: ToolbarMenuItem<"table" | "image">[] = [
  {
    itemKey: "table",
    renderKey: "table",
    get name() {
      return i18nInstance.t("editor_ui.menu.table");
    },
    icon: Table,
    editors: ["document"],
  },
  {
    itemKey: "image",
    renderKey: "image",
    get name() {
      return i18nInstance.t("editor_ui.menu.image");
    },
    icon: Image,
    editors: ["lite", "document"],
  },
];

export const IMAGE_ITEM = COMPLEX_ITEMS.find((item): item is ToolbarMenuItem<"image"> => item.itemKey === "image")!;

export const TOOLBAR_ITEMS: {
  [editorType in TEditorTypes]: {
    [key: string]: ToolbarMenuItem[];
  };
} = {
  lite: {
    basic: BASIC_MARK_ITEMS.filter((item) => item.editors.includes("lite")),
    alignment: TEXT_ALIGNMENT_ITEMS.filter((item) => item.editors.includes("lite")),
    list: LIST_ITEMS.filter((item) => item.editors.includes("lite")),
    userAction: USER_ACTION_ITEMS.filter((item) => item.editors.includes("lite")),
    complex: COMPLEX_ITEMS.filter((item) => item.editors.includes("lite")),
  },
  document: {
    basic: BASIC_MARK_ITEMS.filter((item) => item.editors.includes("document")),
    alignment: TEXT_ALIGNMENT_ITEMS.filter((item) => item.editors.includes("document")),
    list: LIST_ITEMS.filter((item) => item.editors.includes("document")),
    userAction: USER_ACTION_ITEMS.filter((item) => item.editors.includes("document")),
    complex: COMPLEX_ITEMS.filter((item) => item.editors.includes("document")),
  },
  sticky: {
    basic: BASIC_MARK_ITEMS.filter((item) => ["bold", "italic"].includes(item.itemKey)),
    list: LIST_ITEMS.filter((item) => ["to-do-list"].includes(item.itemKey)),
  },
};

export const COLORS_LIST: {
  key: string;
  label: string;
  textColor: string;
  backgroundColor: string;
}[] = [
  {
    key: "gray",
    get label() {
      return i18nInstance.t("editor_ui.colors.gray");
    },
    textColor: "var(--editor-colors-gray-text)",
    backgroundColor: "var(--editor-colors-gray-background)",
  },
  {
    key: "peach",
    get label() {
      return i18nInstance.t("editor_ui.colors.peach");
    },
    textColor: "var(--editor-colors-peach-text)",
    backgroundColor: "var(--editor-colors-peach-background)",
  },
  {
    key: "pink",
    get label() {
      return i18nInstance.t("editor_ui.colors.pink");
    },
    textColor: "var(--editor-colors-pink-text)",
    backgroundColor: "var(--editor-colors-pink-background)",
  },
  {
    key: "orange",
    get label() {
      return i18nInstance.t("editor_ui.colors.orange");
    },
    textColor: "var(--editor-colors-orange-text)",
    backgroundColor: "var(--editor-colors-orange-background)",
  },
  {
    key: "green",
    get label() {
      return i18nInstance.t("editor_ui.colors.green");
    },
    textColor: "var(--editor-colors-green-text)",
    backgroundColor: "var(--editor-colors-green-background)",
  },
  {
    key: "light-blue",
    get label() {
      return i18nInstance.t("editor_ui.colors.light_blue");
    },
    textColor: "var(--editor-colors-light-blue-text)",
    backgroundColor: "var(--editor-colors-light-blue-background)",
  },
  {
    key: "dark-blue",
    get label() {
      return i18nInstance.t("editor_ui.colors.dark_blue");
    },
    textColor: "var(--editor-colors-dark-blue-text)",
    backgroundColor: "var(--editor-colors-dark-blue-background)",
  },
  {
    key: "purple",
    get label() {
      return i18nInstance.t("editor_ui.colors.purple");
    },
    textColor: "var(--editor-colors-purple-text)",
    backgroundColor: "var(--editor-colors-purple-background)",
  },
  // {
  //   key: "pink-blue-gradient",
  //   label: "Pink blue gradient",
  //   textColor: "var(--editor-colors-pink-blue-gradient-text)",
  //   backgroundColor: "var(--editor-colors-pink-blue-gradient-background)",
  // },
];

export const EDITOR_FONT_STYLES: {
  key: TEditorFontStyle;
  label: string;
  icon: React.FC;
}[] = [
  {
    key: "sans-serif",
    get label() {
      return i18nInstance.t("editor_ui.fonts.sans_serif");
    },
    icon: SansSerifIcon,
  },
  {
    key: "serif",
    get label() {
      return i18nInstance.t("editor_ui.fonts.serif");
    },
    icon: SerifIcon,
  },
  {
    key: "monospace",
    get label() {
      return i18nInstance.t("editor_ui.fonts.monospace");
    },
    icon: MonospaceIcon,
  },
];
