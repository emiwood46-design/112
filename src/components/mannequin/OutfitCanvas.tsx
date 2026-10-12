"use client";

import type Konva from "konva";
import { useEffect, useImperativeHandle, useMemo, useRef, useState } from "react";
import { Image as KImage, Layer, Rect, Stage, Transformer } from "react-konva";
import { sortedLayers } from "@/domain/outfitRules";
import { MANNEQUIN_HEIGHT, MANNEQUIN_WIDTH } from "@/domain/slots";
import type { Item, MannequinKind, OutfitLayer } from "@/domain/types";
import { mannequinDataUrl } from "./mannequinSvg";
import { useBlobHtmlImage, useHtmlImage } from "./useHtmlImage";

export const CANVAS_BG = "#f3efe9";

export interface OutfitCanvasHandle {
  /** Рендерит образ в PNG. height — высота результата в пикселях. */
  exportPng(height: number): Promise<Blob>;
}

interface Props {
  mannequin: MannequinKind;
  layers: OutfitLayer[];
  items: Map<string, Item>;
  selectedId: string | null;
  onSelect: (id: string | null) => void;
  onLayerChange: (layer: OutfitLayer) => void;
  /** Вещь перетащили из списка на холст (desktop drag & drop) */
  onDropItem: (itemId: string, point: { x: number; y: number }) => void;
  handleRef?: React.Ref<OutfitCanvasHandle>;
}

export default function OutfitCanvas({
  mannequin,
  layers,
  items,
  selectedId,
  onSelect,
  onLayerChange,
  onDropItem,
  handleRef,
}: Props) {
  const containerRef = useRef<HTMLDivElement>(null);
  const stageRef = useRef<Konva.Stage>(null);
  const trRef = useRef<Konva.Transformer>(null);
  const nodes = useRef(new Map<string, Konva.Image>());
  const [box, setBox] = useState({ w: 0, h: 0 });

  // Холст вписывается в контейнер с сохранением пропорций 1:2
  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;
    const ro = new ResizeObserver(([entry]) => {
      const { width, height } = entry.contentRect;
      setBox({ w: width, h: height });
    });
    ro.observe(el);
    return () => ro.disconnect();
  }, []);
  const scale = box.w && box.h ? Math.min(box.w / MANNEQUIN_WIDTH, box.h / MANNEQUIN_HEIGHT) : 0;

  const mannequinImg = useHtmlImage(useMemo(() => mannequinDataUrl(mannequin), [mannequin]));

  // Привязываем трансформер к выбранной вещи
  useEffect(() => {
    const tr = trRef.current;
    if (!tr) return;
    const node = selectedId ? nodes.current.get(selectedId) : undefined;
    tr.nodes(node ? [node] : []);
    tr.getLayer()?.batchDraw();
  }, [selectedId, layers, scale]);

  useImperativeHandle(handleRef, () => ({
    async exportPng(height: number) {
      const stage = stageRef.current;
      const tr = trRef.current;
      if (!stage || !scale) throw new Error("Холст ещё не готов");
      tr?.visible(false);
      try {
        const pixelRatio = height / MANNEQUIN_HEIGHT / scale;
        return (await stage.toBlob({ pixelRatio, mimeType: "image/png" })) as Blob;
      } finally {
        tr?.visible(true);
      }
    },
  }));

  // Пинч двумя пальцами: масштаб и поворот выбранной вещи
  const pinch = useRef<{ dist: number; angle: number; scale: number; rotation: number } | null>(null);
  const touchInfo = (t: TouchList) => {
    const [a, b] = [t[0], t[1]];
    return {
      dist: Math.hypot(b.clientX - a.clientX, b.clientY - a.clientY),
      angle: (Math.atan2(b.clientY - a.clientY, b.clientX - a.clientX) * 180) / Math.PI,
    };
  };
  const onTouchMove = (e: Konva.KonvaEventObject<TouchEvent>) => {
    const t = e.evt.touches;
    const node = selectedId ? nodes.current.get(selectedId) : undefined;
    if (t.length !== 2 || !node) return;
    e.evt.preventDefault();
    node.stopDrag();
    const info = touchInfo(t);
    if (!pinch.current) {
      pinch.current = { ...info, scale: node.scaleX(), rotation: node.rotation() };
      return;
    }
    const s = Math.max(0.02, pinch.current.scale * (info.dist / pinch.current.dist));
    node.scale({ x: s, y: s });
    node.rotation(pinch.current.rotation + info.angle - pinch.current.angle);
    node.getLayer()?.batchDraw();
  };
  const onTouchEnd = () => {
    if (!pinch.current || !selectedId) return;
    pinch.current = null;
    const node = nodes.current.get(selectedId);
    const layer = layers.find((l) => l.id === selectedId);
    if (node && layer) commit(layer, node);
  };

  const commit = (layer: OutfitLayer, node: Konva.Node) =>
    onLayerChange({
      ...layer,
      x: node.x(),
      y: node.y(),
      scale: node.scaleX(),
      rotation: node.rotation(),
    });

  return (
    <div
      ref={containerRef}
      className="relative flex size-full items-center justify-center overflow-hidden"
      onDragOver={(e) => {
        if (e.dataTransfer.types.includes("application/x-wardrobe-item")) e.preventDefault();
      }}
      onDrop={(e) => {
        const itemId = e.dataTransfer.getData("application/x-wardrobe-item");
        const stage = stageRef.current;
        if (!itemId || !stage || !scale) return;
        e.preventDefault();
        stage.setPointersPositions(e.nativeEvent);
        const p = stage.getPointerPosition();
        onDropItem(itemId, p ? { x: p.x / scale, y: p.y / scale } : { x: 300, y: 600 });
      }}
    >
      {scale > 0 && (
        <Stage
          ref={stageRef}
          width={MANNEQUIN_WIDTH * scale}
          height={MANNEQUIN_HEIGHT * scale}
          scaleX={scale}
          scaleY={scale}
          className="overflow-hidden rounded-3xl shadow-sm"
          onMouseDown={(e) => e.target === e.target.getStage() && onSelect(null)}
          onTouchStart={(e) => {
            if (e.target === e.target.getStage()) onSelect(null);
            if (e.evt.touches.length === 2) pinch.current = null;
          }}
          onTouchMove={onTouchMove}
          onTouchEnd={onTouchEnd}
        >
          <Layer>
            <Rect
              width={MANNEQUIN_WIDTH}
              height={MANNEQUIN_HEIGHT}
              fill={CANVAS_BG}
              onMouseDown={() => onSelect(null)}
              onTouchStart={() => onSelect(null)}
            />
            {mannequinImg && (
              <KImage image={mannequinImg} width={MANNEQUIN_WIDTH} height={MANNEQUIN_HEIGHT} listening={false} />
            )}
            {sortedLayers(layers).map((layer) => {
              const item = items.get(layer.itemId);
              if (!item) return null;
              return (
                <LayerImage
                  key={layer.id}
                  layer={layer}
                  item={item}
                  registerNode={(n) => (n ? nodes.current.set(layer.id, n) : nodes.current.delete(layer.id))}
                  onSelect={() => onSelect(layer.id)}
                  onCommit={(node) => commit(layer, node)}
                />
              );
            })}
            <Transformer
              ref={trRef}
              keepRatio
              rotateEnabled
              rotationSnaps={[0, 90, 180, 270]}
              rotationSnapTolerance={4}
              enabledAnchors={["top-left", "top-right", "bottom-left", "bottom-right"]}
              anchorSize={14 / scale}
              anchorCornerRadius={7 / scale}
              anchorStroke="#b4532a"
              borderStroke="#b4532a"
              borderStrokeWidth={1.5 / scale}
              rotateAnchorOffset={36 / scale}
              padding={4 / scale}
              ignoreStroke
              boundBoxFunc={(oldBox, newBox) => (newBox.width < 20 || newBox.height < 20 ? oldBox : newBox)}
            />
          </Layer>
        </Stage>
      )}
    </div>
  );
}

function LayerImage({
  layer,
  item,
  registerNode,
  onSelect,
  onCommit,
}: {
  layer: OutfitLayer;
  item: Item;
  registerNode: (n: Konva.Image | null) => void;
  onSelect: () => void;
  onCommit: (node: Konva.Node) => void;
}) {
  const img = useBlobHtmlImage(item.imageId);
  if (!img) return null;
  // Используем реальный размер картинки: если вещь пересохранили после обрезки,
  // размеры в Item обновятся, а масштаб слоя остаётся относительным
  const w = img.naturalWidth;
  const h = img.naturalHeight;
  return (
    <KImage
      ref={registerNode}
      image={img}
      width={w}
      height={h}
      offsetX={w / 2}
      offsetY={h / 2}
      x={layer.x}
      y={layer.y}
      scaleX={layer.scale}
      scaleY={layer.scale}
      rotation={layer.rotation}
      draggable
      onMouseDown={onSelect}
      onTouchStart={onSelect}
      onDragStart={onSelect}
      onDragEnd={(e) => onCommit(e.target)}
      onTransformEnd={(e) => onCommit(e.target)}
      shadowColor="#000"
      shadowOpacity={0.12}
      shadowBlur={10}
      shadowOffsetY={4}
    />
  );
}
