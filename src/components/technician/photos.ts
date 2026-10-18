// Photos are resized and compressed on the phone before upload (≈100-250 KB each), so they fit
// in a Firestore document and upload quickly on a weak 4G connection.
const MAX_SIDE = 1280;
const MAX_CHARS = 850_000;

function loadImage(file: File): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(file);
    const img = new Image();
    img.onload = () => {
      URL.revokeObjectURL(url);
      resolve(img);
    };
    img.onerror = () => {
      URL.revokeObjectURL(url);
      reject(new Error('الصورة غير واضحة'));
    };
    img.src = url;
  });
}

export async function compressPhoto(file: File): Promise<string> {
  const img = await loadImage(file);
  let side = MAX_SIDE;
  let quality = 0.72;
  for (let attempt = 0; attempt < 6; attempt++) {
    const scale = Math.min(1, side / Math.max(img.naturalWidth, img.naturalHeight));
    const canvas = document.createElement('canvas');
    canvas.width = Math.round(img.naturalWidth * scale);
    canvas.height = Math.round(img.naturalHeight * scale);
    canvas.getContext('2d')!.drawImage(img, 0, 0, canvas.width, canvas.height);
    const dataUrl = canvas.toDataURL('image/jpeg', quality);
    if (dataUrl.length <= MAX_CHARS) return dataUrl;
    side = Math.round(side * 0.8);
    quality = Math.max(0.45, quality - 0.08);
  }
  throw new Error('الصورة ثقيلة جدا، أعد التقاطها.');
}
