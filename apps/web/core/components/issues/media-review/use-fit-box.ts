/**
 * Copyright (c) 2023-present Plane Software, Inc. and contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 * See the LICENSE file for details.
 */

import { useEffect, useState } from "react";

/** Maior caixa com a proporção da mídia que cabe na área: na largura dela e na altura dela (`maxScreenFraction`
 * nulo) ou numa fração da altura da janela. A camada de desenho cobre essa caixa sem sobra. */
export function useFitBox(
  areaRef: React.RefObject<HTMLElement | null>,
  aspect: number,
  maxScreenFraction: number | null
): { width: number; height: number } {
  const [size, setSize] = useState({ width: 0, height: 0 });

  useEffect(() => {
    const area = areaRef.current;
    if (!area) return;
    const measure = () => {
      const maxHeight = maxScreenFraction === null ? area.clientHeight : window.innerHeight * maxScreenFraction;
      const width = Math.max(0, Math.min(area.clientWidth, maxHeight * aspect));
      setSize({ width: Math.floor(width), height: Math.floor(width / aspect) });
    };
    measure();
    const observer = new ResizeObserver(measure);
    observer.observe(area);
    window.addEventListener("resize", measure);
    return () => {
      observer.disconnect();
      window.removeEventListener("resize", measure);
    };
  }, [areaRef, aspect, maxScreenFraction]);

  return size;
}
