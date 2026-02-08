import { useEffect, useState } from "react";
import { View, Text, Platform } from "react-native";
import * as Location from "expo-location";
import * as ImagePicker from "expo-image-picker";
import { supabase } from "../../lib/supabase";
import React from "react";
import { useRouter } from "expo-router";
import { useIsFocused } from "@react-navigation/native";

const FESTIVAL_ID = "acl_demo";

async function uploadPhotoToSupabase(uri: string, festivalId: string) {
  const res = await fetch(uri);
  const arrayBuffer = await res.arrayBuffer();

  const filePath = `${festivalId}/${Date.now()}-${Math.random()
    .toString(16)
    .slice(2)}.jpg`;

  const { error: uploadError } = await supabase.storage
    .from("posts")
    .upload(filePath, arrayBuffer, { contentType: "image/jpeg", upsert: false });

  if (uploadError) throw uploadError;

  const { data } = supabase.storage.from("posts").getPublicUrl(filePath);
  return data.publicUrl;
}

async function insertPostRow(params: {
  mediaUrl: string;
  lat: number;
  lng: number;
  caption?: string;
  tag?: string;
  festivalId?: string;
}) {
  const expiresAt = new Date(Date.now() + 60 * 60 * 1000).toISOString(); // 60 min

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

  // If your DB doesn't have festival_id, retry without it
  if (error?.message?.toLowerCase().includes("festival_id")) {
    delete payload.festival_id;
    const retry = await supabase.from("posts").insert(payload);
    error = retry.error;
  }

  if (error) throw error;
}

export default function TabOneScreen() {
  const [region, setRegion] = useState<any>(null);
  const [status, setStatus] = useState<string>("Loading…");
  const [permissionDenied, setPermissionDenied] = useState(false);
  const [posting, setPosting] = useState(false);
  const router = useRouter();
  const isFocused = useIsFocused();

  useEffect(() => {
    if (Platform.OS !== "web" && isFocused) {
        handlePostPhoto();
        router.replace("/(tabs)")
    }
  }, [isFocused]);

  // Location + initial region
  useEffect(() => {
    (async () => {
      const { status } = await Location.requestForegroundPermissionsAsync();
      if (status !== "granted") {
        setPermissionDenied(true);
        setStatus("Location permission denied");
        return;
      }

      const loc = await Location.getCurrentPositionAsync({});
      setRegion({
        latitude: loc.coords.latitude,
        longitude: loc.coords.longitude,
        latitudeDelta: 0.02,
        longitudeDelta: 0.02,
      });
    })();
  }, []);

  // Post photo handler
  async function handlePostPhoto() {
    if (posting) return;

    try {
      setPosting(true);
      setStatus("Opening camera…");

      const camPerm = await ImagePicker.requestCameraPermissionsAsync();
      if (!camPerm.granted) {
        setStatus("Camera permission denied");
        return;
      }

      const result = await ImagePicker.launchCameraAsync({
        mediaTypes: ImagePicker.MediaTypeOptions.Images,
        quality: 0.7,
      });

      if (result.canceled) {
        setStatus("Canceled");
        return;
      }

      // Get a fresh GPS reading for accurate pinning
      setStatus("Getting location…");
      const loc = await Location.getCurrentPositionAsync({});
      const lat = loc.coords.latitude;
      const lng = loc.coords.longitude;

      // Upload + insert
      setStatus("Uploading photo…");
      const uri = result.assets[0].uri;
      const mediaUrl = await uploadPhotoToSupabase(uri, FESTIVAL_ID);

      setStatus("Saving pin…");
      await insertPostRow({
        mediaUrl,
        lat,
        lng,
        caption: "",
        tag: "stage",
        festivalId: FESTIVAL_ID,
      });

      setStatus("✅ Posted!");
    } catch (e: any) {
      console.log("Post error:", e);
      setStatus(`Post failed: ${e?.message ?? "unknown error"}`);
    } finally {
      setPosting(false);
    }
  }

  if (permissionDenied) {
    return (
      <View style={{ flex: 1, alignItems: "center", justifyContent: "center" }}>
        <Text>Location permission denied. Enable location to use the map.</Text>
      </View>
    );
  }

  if (!region) {
    return (
      <View style={{ flex: 1, alignItems: "center", justifyContent: "center" }}>
        <Text>Getting location…</Text>
      </View>
    );
  }

  return (
    <View style={{ flex: 1 }}>
        <Text style={{ fontSize: 28, fontWeight: "700" }}>{posting ? "…" : "+"}</Text>
    </View>
  );
}
