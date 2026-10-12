"use client";

import { useImperativeHandle, useRef } from "react";

export interface PhotoInputsHandle {
  camera(): void;
  gallery(): void;
}

/** Скрытые поля выбора фото: камера телефона и галерея. */
export function PhotoInputs({
  onFile,
  handleRef,
}: {
  onFile: (file: File) => void;
  handleRef: React.Ref<PhotoInputsHandle>;
}) {
  const cameraRef = useRef<HTMLInputElement>(null);
  const galleryRef = useRef<HTMLInputElement>(null);
  useImperativeHandle(handleRef, () => ({
    camera: () => cameraRef.current?.click(),
    gallery: () => galleryRef.current?.click(),
  }));
  const onChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const f = e.target.files?.[0];
    e.target.value = "";
    if (f) onFile(f);
  };
  return (
    <>
      <input ref={cameraRef} type="file" accept="image/*" capture="environment" className="hidden" onChange={onChange} />
      <input ref={galleryRef} type="file" accept="image/*" className="hidden" onChange={onChange} />
    </>
  );
}
