import { supabase } from "./supabase";

export interface CompressionResult {
  blob: Blob;
  previewUrl: string;
  originalSize: number;
  compressedSize: number;
  width: number;
  height: number;
}

/**
 * Rasmni kvadrat (1:1) shaklida markazdan kesadi va siqadi (compression).
 * Hajmi 5-10 MB bo'lgan rasmlarni ~50-120 KB gacha ixchamlashtiradi.
 */
export async function compressAndCropSquare(
  file: File,
  targetSize = 800,
  quality = 0.82
): Promise<CompressionResult> {
  return new Promise((resolve, reject) => {
    const originalSize = file.size;
    const reader = new FileReader();

    reader.onload = (e) => {
      const img = new Image();
      img.onload = () => {
        try {
          const canvas = document.createElement("canvas");
          const ctx = canvas.getContext("2d");

          if (!ctx) {
            reject(new Error("Canvas context yaratib bo'lmadi"));
            return;
          }

          // Kvadrat uchun eng kichik tomonni aniqlash (Center Crop)
          const minSide = Math.min(img.width, img.height);
          const cropX = (img.width - minSide) / 2;
          const cropY = (img.height - minSide) / 2;

          // Yakuniy o'lcham (targetSize dan oshmasligi kerak)
          const finalSize = Math.min(minSide, targetSize);
          canvas.width = finalSize;
          canvas.height = finalSize;

          // Silliq sifatli chizish sozlamalari
          ctx.imageSmoothingEnabled = true;
          ctx.imageSmoothingQuality = "high";

          // Markazdan kvadrat shaklda qirqib chizish
          ctx.drawImage(
            img,
            cropX,
            cropY,
            minSide,
            minSide,
            0,
            0,
            finalSize,
            finalSize
          );

          canvas.toBlob(
            (blob) => {
              if (!blob) {
                reject(new Error("Rasmni siqishda xatolik yuz berdi"));
                return;
              }

              const previewUrl = URL.createObjectURL(blob);
              resolve({
                blob,
                previewUrl,
                originalSize,
                compressedSize: blob.size,
                width: finalSize,
                height: finalSize,
              });
            },
            "image/jpeg",
            quality
          );
        } catch (err) {
          reject(err);
        }
      };

      img.onerror = () => reject(new Error("Rasmni o'qib bo'lmadi"));
      img.src = e.target?.result as string;
    };

    reader.onerror = () => reject(new Error("Faylni o'qishda xatolik"));
    reader.readAsDataURL(file);
  });
}

/**
 * Rasmni siqib, kvadrat qilib Supabase Storage ('tovarlar' bucket) ga yuklaydi.
 * Ommaviy (Public) URL manzilini qaytaradi.
 */
export async function uploadTovarRasm(
  file: File,
  maxDimension = 800
): Promise<{ url: string; originalSize: number; compressedSize: number }> {
  // 1. Rasmni kvadrat qilib siqish
  const compressed = await compressAndCropSquare(file, maxDimension);

  // 2. Takrorlanmas fayl nomi
  const cleanFileName = `tovar_${Date.now()}_${Math.random().toString(36).substring(2, 8)}.jpg`;

  // 3. Supabase Storage 'tovarlar' bucketiga yuklash
  const { data, error } = await supabase.storage
    .from("tovarlar")
    .upload(cleanFileName, compressed.blob, {
      contentType: "image/jpeg",
      cacheControl: "31536000",
      upsert: true,
    });

  if (error) {
    if (error.message?.includes("Bucket not found") || (error as any).statusCode === "404") {
      throw new Error(
        "Supabase Storage-da 'tovarlar' nomli bucket mavjud emas. Iltimos, Supabase Dashboard -> Storage bo'limida 'tovarlar' (Public) bucketini yarating."
      );
    }
    throw new Error(`Rasm yuklashda xatolik: ${error.message}`);
  }

  // 4. Ommaviy (Public) havolani olish
  const { data: urlData } = supabase.storage
    .from("tovarlar")
    .getPublicUrl(cleanFileName);

  return {
    url: urlData.publicUrl,
    originalSize: compressed.originalSize,
    compressedSize: compressed.compressedSize,
  };
}
