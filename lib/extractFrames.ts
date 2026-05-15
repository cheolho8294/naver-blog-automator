/**
 * 브라우저 전용: 영상/GIF에서 정지 프레임 JPEG 파일을 뽑아 비전 API에 넣기 위함.
 */

export async function extractVideoFrames(file: File, maxFrames = 4): Promise<File[]> {
  const url = URL.createObjectURL(file);
  try {
    const video = document.createElement("video");
    video.src = url;
    video.muted = true;
    video.playsInline = true;
    await new Promise<void>((resolve, reject) => {
      video.onloadedmetadata = () => resolve();
      video.onerror = () => reject(new Error("영상을 불러오지 못했습니다."));
    });

    const duration = Math.max(0.12, video.duration);
    const candidates = [
      0.08,
      duration * 0.25,
      duration * 0.55,
      duration * 0.82,
      duration - 0.1,
    ].filter((t) => t > 0.05 && t < duration - 0.05);

    const picks = Array.from(new Set(candidates.map((t) => Number(t.toFixed(3)))))
      .slice(0, maxFrames);

    const canvas = document.createElement("canvas");
    const ctx = canvas.getContext("2d");
    if (!ctx) throw new Error("Canvas를 사용할 수 없습니다.");

    const baseName = file.name.replace(/\.[^/.]+$/, "");
    const out: File[] = [];

    for (let i = 0; i < picks.length; i++) {
      const t = picks[i]!;
      video.currentTime = t;
      await new Promise<void>((resolve) => {
        video.onseeked = () => resolve();
      });
      canvas.width = video.videoWidth;
      canvas.height = video.videoHeight;
      ctx.drawImage(video, 0, 0);
      const blob = await new Promise<Blob | null>((res) =>
        canvas.toBlob((b) => res(b), "image/jpeg", 0.82)
      );
      if (blob) {
        out.push(
          new File([blob], `${baseName}_frame${i + 1}.jpg`, { type: "image/jpeg" })
        );
      }
    }

    return out;
  } finally {
    URL.revokeObjectURL(url);
  }
}

/** 애니GIF는 첫 프레임만 JPEG로 추출한다. */
export async function gifFirstFrameAsJpeg(file: File): Promise<File> {
  if (file.type !== "image/gif") return file;

  const url = URL.createObjectURL(file);
  try {
    const img = new Image();
    img.decoding = "async";
    img.src = url;
    await img.decode();

    const canvas = document.createElement("canvas");
    canvas.width = img.naturalWidth;
    canvas.height = img.naturalHeight;
    const ctx = canvas.getContext("2d");
    if (!ctx) throw new Error("Canvas를 사용할 수 없습니다.");
    ctx.drawImage(img, 0, 0);

    const blob = await new Promise<Blob | null>((res) =>
      canvas.toBlob((b) => res(b), "image/jpeg", 0.82)
    );
    if (!blob) throw new Error("GIF 프레임 추출 실패");

    const baseName = file.name.replace(/\.[^/.]+$/, "");
    return new File([blob], `${baseName}_frame1.jpg`, { type: "image/jpeg" });
  } finally {
    URL.revokeObjectURL(url);
  }
}
