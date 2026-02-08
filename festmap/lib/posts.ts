import { supabase } from "./supabase";

const FESTIVAL_ID = "acl_demo";

export async function uploadPhotoToSupabase(uri: string) {
  const res = await fetch(uri);
  const arrayBuffer = await res.arrayBuffer();

  const filePath = `${FESTIVAL_ID}/${Date.now()}-${Math.random()
    .toString(16)
    .slice(2)}.jpg`;

  const { error: uploadError } = await supabase.storage
    .from("posts")
    .upload(filePath, arrayBuffer, { contentType: "image/jpeg", upsert: false });

  if (uploadError) throw uploadError;

  const { data } = supabase.storage.from("posts").getPublicUrl(filePath);
  return data.publicUrl;
}

export async function insertPostRow(params: {
  mediaUrl: string;
  lat: number;
  lng: number;
  caption: string;
  crowd: number; // 1-5
}) {
  const expiresAt = new Date(Date.now() + 60 * 60 * 1000).toISOString();

  const payload: any = {
    media_url: params.mediaUrl,
    media_type: "image",
    caption: params.caption || null,
    tag: `crowd:${params.crowd}`,
    lat: params.lat,
    lng: params.lng,
    expires_at: expiresAt,
  };

  const { error } = await supabase.from("posts").insert(payload);
  if (error) throw error;
}
