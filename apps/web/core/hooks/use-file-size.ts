/**
 * Copyright (c) 2023-present Plane Software, Inc. and contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 * See the LICENSE file for details.
 */

// plane imports
import { MAX_FILE_SIZE } from "@plane/constants";
// hooks
import { useInstance } from "@/hooks/store/use-instance";

type TReturnProps = {
  maxFileSize: number;
  /** Pespo: vídeos (revisão da peça) têm um limite próprio, maior. */
  maxVideoFileSize: number;
  /** Limite que vale para este arquivo. */
  limitFor: (file: { type?: string }) => number;
  /** Para o `validator` do react-dropzone (com `maxSize: maxVideoFileSize`). */
  sizeValidator: (file: File) => { code: string; message: string } | null;
};

export const useFileSize = (): TReturnProps => {
  // store hooks
  const { config } = useInstance();

  const maxFileSize = config?.file_size_limit ?? MAX_FILE_SIZE;
  const maxVideoFileSize = Math.max(maxFileSize, config?.video_file_size_limit ?? maxFileSize);
  const limitFor = (file: { type?: string }) => (file.type?.startsWith("video/") ? maxVideoFileSize : maxFileSize);

  return {
    maxFileSize,
    maxVideoFileSize,
    limitFor,
    sizeValidator: (file) =>
      file.size > limitFor(file) ? { code: "file-too-large", message: "File is too large" } : null,
  };
};
