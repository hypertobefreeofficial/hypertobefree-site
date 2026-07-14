import { execSync } from "child_process";
import fs from "fs";
import path from "path";

const FIXTURE_DIR = path.join(process.cwd(), "tests", "prayer", "fixtures", "generated");

export type MediaFixtures = {
  available: boolean;
  dir: string;
  validVideo?: string;
  over30Video?: string;
  validImage?: string;
  oversizeImage?: string;
};

function hasFfmpeg() {
  try {
    execSync("ffmpeg -version", { stdio: "ignore" });
    return true;
  } catch {
    return false;
  }
}

function writeTinyPng(filePath: string) {
  // 1x1 PNG
  const bytes = Buffer.from(
    "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR4nGMAAQAABQABDQottAAAAABJRU5ErkJggg==",
    "base64"
  );
  fs.writeFileSync(filePath, bytes);
}

export function ensureMediaFixtures(): MediaFixtures {
  fs.mkdirSync(FIXTURE_DIR, { recursive: true });

  const validVideo = path.join(FIXTURE_DIR, "valid-20s.mp4");
  const over30Video = path.join(FIXTURE_DIR, "over-35s.mp4");
  const validImage = path.join(FIXTURE_DIR, "valid.png");
  const oversizeImage = path.join(FIXTURE_DIR, "oversize.png");

  writeTinyPng(validImage);

  // Synthetic oversize image (>10 MB) using sparse file when supported.
  try {
    if (!fs.existsSync(oversizeImage)) {
      fs.writeFileSync(oversizeImage, Buffer.alloc(11 * 1024 * 1024, 0));
    }
  } catch {
    // If allocation fails, oversize image tests will skip.
  }

  if (hasFfmpeg()) {
    if (!fs.existsSync(validVideo)) {
      execSync(
        `ffmpeg -y -f lavfi -i testsrc=duration=20:size=320x240:rate=1 -c:v libx264 -pix_fmt yuv420p -t 20 "${validVideo}"`,
        { stdio: "ignore" }
      );
    }
    if (!fs.existsSync(over30Video)) {
      execSync(
        `ffmpeg -y -f lavfi -i testsrc=duration=35:size=320x240:rate=1 -c:v libx264 -pix_fmt yuv420p -t 35 "${over30Video}"`,
        { stdio: "ignore" }
      );
    }
  }

  const videoReady = fs.existsSync(validVideo) && fs.existsSync(over30Video);

  return {
    available: videoReady,
    dir: FIXTURE_DIR,
    validVideo: fs.existsSync(validVideo) ? validVideo : undefined,
    over30Video: fs.existsSync(over30Video) ? over30Video : undefined,
    validImage: fs.existsSync(validImage) ? validImage : undefined,
    oversizeImage: fs.existsSync(oversizeImage) ? oversizeImage : undefined,
  };
}

export async function createTemporaryOversizeVideo(
  userId: string
): Promise<{ localPath: string; storagePath: string; publicUrl: string } | null> {
  const env = process.env;
  const supabaseUrl = env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceRoleKey = env.SUPABASE_SERVICE_ROLE_KEY;
  if (!supabaseUrl || !serviceRoleKey) return null;

  const { createClient } = await import("@supabase/supabase-js");
  const admin = createClient(supabaseUrl, serviceRoleKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });

  const dir = path.join(FIXTURE_DIR, "tmp");
  fs.mkdirSync(dir, { recursive: true });
  const localPath = path.join(dir, `oversize-${Date.now()}.mp4`);

  // 101 MB sparse-ish payload; storage metadata size is authoritative for the API.
  fs.writeFileSync(localPath, Buffer.alloc(101 * 1024 * 1024, 1));

  const storagePath = `${userId}/playwright-oversize-${Date.now()}.mp4`;
  const fileBuffer = fs.readFileSync(localPath);

  const { error } = await admin.storage
    .from("story-videos")
    .upload(storagePath, fileBuffer, {
      contentType: "video/mp4",
      upsert: false,
    });

  if (error) {
    fs.unlinkSync(localPath);
    return null;
  }

  const { data } = admin.storage.from("story-videos").getPublicUrl(storagePath);

  return {
    localPath,
    storagePath,
    publicUrl: data.publicUrl,
  };
}

export async function deleteStorageObject(storagePath: string) {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!supabaseUrl || !serviceRoleKey) return;

  const { createClient } = await import("@supabase/supabase-js");
  const admin = createClient(supabaseUrl, serviceRoleKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
  await admin.storage.from("story-videos").remove([storagePath]);
}
