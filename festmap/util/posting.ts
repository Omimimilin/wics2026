import { supabase } from "../lib/supabase";

export async function uploadPhotoToSupabase(uri: string, festivalId = "acl_demo") {
  const res = await fetch(uri);
  const arrayBuffer = await res.arrayBuffer();

  const filePath = `${festivalId}/${Date.now()}-${Math.random().toString(16).slice(2)}.jpg`;

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
  caption?: string;
  tag?: string;
  festivalId?: string;
}) {
  const expiresAt = new Date(Date.now() + 60 * 60 * 1000).toISOString();

  // Try inserting WITH festival_id (if your table has it)
  const payload: any = {
    media_url: params.mediaUrl,
    media_type: "image",
    caption: params.caption ?? null,
    tag: params.tag ?? "stage",
    lat: params.lat,
    lng: params.lng,
    expires_at: expiresAt,
  };

  if (params.festivalId) payload.festival_id = params.festivalId;

  let { error } = await supabase.from("posts").insert(payload);

  // If festival_id column doesn't exist, retry without it (so your code works either way)
  if (error?.message?.toLowerCase().includes("festival_id")) {
    delete payload.festival_id;
    const retry = await supabase.from("posts").insert(payload);
    error = retry.error;
  }

  if (error) throw error;
}
