/**
 * Copyright (c) 2023-present Plane Software, Inc. and contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 * See the LICENSE file for details.
 */

import { useRef, useState } from "react";
// local imports
import type { TDrawingShape, TDrawingTool } from "./types";

// Desenho por cima do quadro. As coordenadas são frações (0 a 1) da mídia e o SVG cobre a mídia
// exatamente, com um viewBox de 1000 de largura, então o desenho fica no lugar em qualquer tamanho.

const VIEW_WIDTH = 1000;
const MAX_PEN_POINTS = 2000;

type Props = {
  aspect: number;
  shapes: TDrawingShape[];
  /** Com uma ferramenta, o SVG recebe o ponteiro e cada traço vira uma forma nova. */
  tool?: TDrawingTool | null;
  color?: string;
  width?: number;
  onShapeComplete?: (shape: TDrawingShape) => void;
};

function ShapeView({ shape, height }: { shape: TDrawingShape; height: number }) {
  const stroke = Math.max(1, shape.width * VIEW_WIDTH);
  const points = shape.points.map(([x, y]) => [x * VIEW_WIDTH, y * height] as const);
  const common = {
    stroke: shape.color,
    strokeWidth: stroke,
    fill: "none",
    strokeLinecap: "round" as const,
    strokeLinejoin: "round" as const,
  };
  if (shape.tool === "pen") {
    if (points.length === 1) return <circle cx={points[0][0]} cy={points[0][1]} r={stroke / 2} fill={shape.color} />;
    return <polyline points={points.map((point) => point.join(",")).join(" ")} {...common} />;
  }
  const [[x1, y1], [x2, y2]] = points.length === 2 ? points : [points[0], points[0]];
  if (shape.tool === "rect")
    return (
      <rect
        x={Math.min(x1, x2)}
        y={Math.min(y1, y2)}
        width={Math.abs(x2 - x1)}
        height={Math.abs(y2 - y1)}
        {...common}
      />
    );
  // seta: a linha e duas pontas no fim
  const angle = Math.atan2(y2 - y1, x2 - x1);
  const head = Math.max(stroke * 4, 14);
  const left = [x2 - head * Math.cos(angle - Math.PI / 7), y2 - head * Math.sin(angle - Math.PI / 7)];
  const right = [x2 - head * Math.cos(angle + Math.PI / 7), y2 - head * Math.sin(angle + Math.PI / 7)];
  return (
    <g {...common}>
      <line x1={x1} y1={y1} x2={x2} y2={y2} />
      <polyline points={`${left.join(",")} ${x2},${y2} ${right.join(",")}`} />
    </g>
  );
}

export function DrawingLayer(props: Props) {
  const { aspect, shapes, tool = null, color = "#ef4444", width = 0.004, onShapeComplete } = props;
  const svgRef = useRef<SVGSVGElement>(null);
  const [current, setCurrent] = useState<TDrawingShape | null>(null);
  const height = VIEW_WIDTH / (aspect || 16 / 9);

  const pointFrom = (event: React.PointerEvent): [number, number] => {
    const rect = svgRef.current!.getBoundingClientRect();
    const x = Math.min(Math.max((event.clientX - rect.left) / rect.width, 0), 1);
    const y = Math.min(Math.max((event.clientY - rect.top) / rect.height, 0), 1);
    return [Number(x.toFixed(4)), Number(y.toFixed(4))];
  };

  const handleDown = (event: React.PointerEvent<SVGSVGElement>) => {
    if (!tool || event.button !== 0) return;
    event.preventDefault();
    event.stopPropagation();
    svgRef.current?.setPointerCapture(event.pointerId);
    const point = pointFrom(event);
    setCurrent({ tool, color, width, points: tool === "pen" ? [point] : [point, point] });
  };

  const handleMove = (event: React.PointerEvent<SVGSVGElement>) => {
    if (!current) return;
    const point = pointFrom(event);
    if (current.tool === "pen") {
      const last = current.points[current.points.length - 1];
      if (current.points.length >= MAX_PEN_POINTS) return;
      if (Math.hypot(point[0] - last[0], point[1] - last[1]) < 0.002) return;
      setCurrent({ ...current, points: [...current.points, point] });
    } else setCurrent({ ...current, points: [current.points[0], point] });
  };

  const handleUp = (event: React.PointerEvent<SVGSVGElement>) => {
    if (!current) return;
    svgRef.current?.releasePointerCapture(event.pointerId);
    const [start, end] = [current.points[0], current.points[current.points.length - 1]];
    // seta ou retângulo sem tamanho é um clique perdido
    const tiny = current.tool !== "pen" && Math.hypot(end[0] - start[0], end[1] - start[1]) < 0.01;
    if (!tiny) onShapeComplete?.(current);
    setCurrent(null);
  };

  const visible = current ? [...shapes, current] : shapes;
  return (
    <svg
      ref={svgRef}
      viewBox={`0 0 ${VIEW_WIDTH} ${height}`}
      preserveAspectRatio="none"
      className="absolute inset-0 h-full w-full"
      style={{
        pointerEvents: tool ? "auto" : "none",
        cursor: tool ? "crosshair" : "default",
        touchAction: tool ? "none" : "auto",
      }}
      onPointerDown={handleDown}
      onPointerMove={handleMove}
      onPointerUp={handleUp}
      onPointerCancel={() => setCurrent(null)}
      aria-hidden
    >
      {visible.map((shape, index) => (
        // as formas não têm id; a ordem não muda enquanto estão na tela
        // oxlint-disable-next-line react/no-array-index-key
        <ShapeView key={index} shape={shape} height={height} />
      ))}
    </svg>
  );
}
