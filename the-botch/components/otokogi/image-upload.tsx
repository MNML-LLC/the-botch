"use client";

import { useState, useRef, useCallback } from 'react';

export type OtokogiImageData = {
  id: string;
  url: string;
  createdAt: string;
};

interface ImageUploadProps {
  otokogiEventId: string;
  initialImages: OtokogiImageData[];
  onImagesChange?: (images: OtokogiImageData[]) => void;
}

const MAX_IMAGES = 10;
const MAX_SIZE_BYTES = 3 * 1024 * 1024;
const MAX_DIMENSION = 2048;

async function resizeImage(file: File): Promise<Blob> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    const objectUrl = URL.createObjectURL(file);
    img.onload = () => {
      URL.revokeObjectURL(objectUrl);
      const { naturalWidth: w, naturalHeight: h } = img;
      let newW = w;
      let newH = h;
      if (w > MAX_DIMENSION || h > MAX_DIMENSION) {
        if (w >= h) {
          newW = MAX_DIMENSION;
          newH = Math.round(h * MAX_DIMENSION / w);
        } else {
          newH = MAX_DIMENSION;
          newW = Math.round(w * MAX_DIMENSION / h);
        }
      }
      const canvas = document.createElement('canvas');
      canvas.width = newW;
      canvas.height = newH;
      const ctx = canvas.getContext('2d');
      if (!ctx) { reject(new Error('canvas context取得失敗')); return; }
      ctx.drawImage(img, 0, 0, newW, newH);
      canvas.toBlob(
        (blob) => { if (blob) resolve(blob); else reject(new Error('リサイズ失敗')); },
        'image/jpeg',
        0.85,
      );
    };
    img.onerror = reject;
    img.src = objectUrl;
  });
}

export function ImageUpload({ otokogiEventId, initialImages, onImagesChange }: ImageUploadProps) {
  const [images, setImages] = useState<OtokogiImageData[]>(initialImages);
  const [uploading, setUploading] = useState(false);
  const [lightboxIndex, setLightboxIndex] = useState<number | null>(null);
  const [error, setError] = useState<string | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  const updateImages = useCallback((next: OtokogiImageData[]) => {
    setImages(next);
    onImagesChange?.(next);
  }, [onImagesChange]);

  const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(e.target.files ?? []);
    e.target.value = '';
    if (!files.length) return;
    setError(null);

    const remaining = MAX_IMAGES - images.length;
    if (files.length > remaining) {
      setError(`最大${MAX_IMAGES}枚まで。あと${remaining}枚追加できます。`);
      return;
    }

    setUploading(true);
    const uploaded: OtokogiImageData[] = [];
    try {
      for (const file of files) {
        if (!file.type.startsWith('image/')) {
          setError('画像ファイルのみアップロードできます');
          continue;
        }
        if (file.size > MAX_SIZE_BYTES) {
          setError(`${file.name} は3MBを超えるためスキップしました`);
          continue;
        }
        const resized = await resizeImage(file);
        const fd = new FormData();
        fd.append('file', resized, file.name);
        const res = await fetch(`/api/otokogi/${otokogiEventId}/images`, {
          method: 'POST',
          body: fd,
        });
        if (!res.ok) {
          const data = (await res.json()) as { error?: string };
          setError(data.error ?? 'アップロードに失敗しました');
          break;
        }
        uploaded.push(await res.json() as OtokogiImageData);
      }
      if (uploaded.length > 0) updateImages([...images, ...uploaded]);
    } finally {
      setUploading(false);
    }
  };

  const handleDelete = async (imageId: string) => {
    if (!confirm('この画像を削除しますか？')) return;
    const res = await fetch(`/api/otokogi/${otokogiEventId}/images/${imageId}`, {
      method: 'DELETE',
    });
    if (res.ok) updateImages(images.filter((img) => img.id !== imageId));
  };

  const moveLightbox = (delta: number) => {
    if (lightboxIndex === null) return;
    setLightboxIndex((lightboxIndex + delta + images.length) % images.length);
  };

  return (
    <div>
      {/* Lightbox */}
      {lightboxIndex !== null && images[lightboxIndex] && (
        <div
          className="fixed inset-0 z-50 bg-black/90 flex items-center justify-center p-4"
          onClick={() => setLightboxIndex(null)}
        >
          <button
            className="absolute top-4 right-4 text-white/80 hover:text-white p-2 rounded-full hover:bg-white/10 text-2xl leading-none"
            onClick={() => setLightboxIndex(null)}
            aria-label="閉じる"
          >
            ✕
          </button>
          {images.length > 1 && (
            <>
              <button
                className="absolute left-2 top-1/2 -translate-y-1/2 text-white/80 hover:text-white p-3 rounded-full hover:bg-white/10 text-3xl leading-none"
                onClick={(e) => { e.stopPropagation(); moveLightbox(-1); }}
                aria-label="前の画像"
              >
                ‹
              </button>
              <button
                className="absolute right-2 top-1/2 -translate-y-1/2 text-white/80 hover:text-white p-3 rounded-full hover:bg-white/10 text-3xl leading-none"
                onClick={(e) => { e.stopPropagation(); moveLightbox(1); }}
                aria-label="次の画像"
              >
                ›
              </button>
            </>
          )}
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={images[lightboxIndex].url}
            alt=""
            className="max-h-[90vh] max-w-full object-contain rounded"
            onClick={(e) => e.stopPropagation()}
          />
          <p className="absolute bottom-4 text-white/60 text-sm select-none">
            {lightboxIndex + 1} / {images.length}
          </p>
        </div>
      )}

      {/* Thumbnail grid */}
      <div className="grid grid-cols-2 gap-2">
        {images.map((img, i) => (
          <div key={img.id} className="relative aspect-square bg-gray-100 rounded-lg overflow-hidden">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={img.url}
              alt=""
              className="w-full h-full object-cover cursor-pointer hover:opacity-90 transition-opacity"
              onClick={() => setLightboxIndex(i)}
            />
            <button
              className="absolute top-1 right-1 bg-black/50 hover:bg-black/70 rounded-full w-6 h-6 flex items-center justify-center text-white text-xs leading-none transition-colors"
              onClick={() => handleDelete(img.id)}
              aria-label="削除"
            >
              ✕
            </button>
          </div>
        ))}

        {/* Add photo button */}
        {images.length < MAX_IMAGES && (
          <button
            className="aspect-square bg-gray-50 border-2 border-dashed border-gray-300 rounded-lg flex flex-col items-center justify-center gap-1.5 hover:border-gray-400 hover:bg-gray-100 transition disabled:opacity-50"
            onClick={() => inputRef.current?.click()}
            disabled={uploading}
            type="button"
          >
            {uploading ? (
              <span className="text-xs text-gray-500">アップロード中...</span>
            ) : (
              <>
                <span className="text-2xl text-gray-400">📷</span>
                <span className="text-xs text-gray-500">
                  写真を追加
                  <br />
                  <span className="text-gray-400">({images.length}/{MAX_IMAGES})</span>
                </span>
              </>
            )}
          </button>
        )}
      </div>

      {error && <p className="text-xs text-red-500 mt-2">{error}</p>}

      <input
        ref={inputRef}
        type="file"
        accept="image/*"
        capture="environment"
        multiple
        className="hidden"
        onChange={handleFileChange}
      />
    </div>
  );
}
