import { useEffect, useMemo, useRef, useState } from "react";
import { View, Text, Pressable, ScrollView, Platform } from "react-native";
import MapView, { Marker } from "react-native-maps";
import * as Location from "expo-location";
import * as ImagePicker from "expo-image-picker";
import { supabase } from "../../lib/supabase";

type PostRow = {
  id: string;
  media_url: string;
  media_type: "image" | "video";
  caption: string | null;
  tag: string | null;
  lat: number;
  lng: number;
  created_at: string;
  expires_at: string | null;
};

type Hotspot = {
  key: string;
  count: number;
  lat: number;
  lng: number;
};

const FESTIVAL_ID = "acl_demo";
const LOOKBACK_MINUTES = 60;
const HOTSPOT_WINDOW_MINUTES = 15;
const CELL_SIZE = 0.002; // ~200m-ish grid (good enough for hackathon)

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
  // Avoid react-native-maps on web (it will crash)
  if (Platform.OS === "web") {
    return (
      <View style={{ flex: 1, alignItems: "center", justifyContent: "center", padding: 16 }}>
        <Text style={{ fontSize: 18, fontWeight: "600", marginBottom: 8 }}>
          FestMap runs on mobile
        </Text>
        <Text>Open in Expo Go on iOS/Android to use the live map.</Text>
      </View>
    );
  }

  const mapRef = useRef<MapView>(null);

  const [region, setRegion] = useState<any>(null);
  const [posts, setPosts] = useState<PostRow[]>([]);
  const [status, setStatus] = useState<string>("Loading…");
  const [permissionDenied, setPermissionDenied] = useState(false);
  const [posting, setPosting] = useState(false);

  // 1) Location + initial region
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

  // 2) Fetch posts function (reusable)
  async function fetchPostsNow() {
    try {
      const since = new Date(Date.now() - LOOKBACK_MINUTES * 60 * 1000).toISOString();

      let q = supabase
        .from("posts")
        .select("id, media_url, media_type, caption, tag, lat, lng, created_at, expires_at")
        .gt("created_at", since)
        .order("created_at", { ascending: false })
        .limit(250);

      // If your table doesn't have festival_id, this will error — we catch below and retry without it.
      q = q.eq("festival_id", FESTIVAL_ID);

      const { data, error } = await q;
      if (error) {
        // Retry without festival_id filter if column doesn't exist
        if (error.message.toLowerCase().includes("festival_id")) {
          const retry = await supabase
            .from("posts")
            .select("id, media_url, media_type, caption, tag, lat, lng, created_at, expires_at")
            .gt("created_at", since)
            .order("created_at", { ascending: false })
            .limit(250);

          if (retry.error) throw retry.error;
          setPosts((retry.data as any[]) ?? []);
          setStatus(`Loaded ${retry.data?.length ?? 0} pins`);
          return;
        }
        throw error;
      }

      setPosts((data as any[]) ?? []);
      setStatus(`Loaded ${data?.length ?? 0} pins`);
    } catch (e: any) {
      console.log("Fetch posts error:", e);
      setStatus(`Error loading pins: ${e?.message ?? "unknown error"}`);
    }
  }

  // 3) Poll pins every 10s
  useEffect(() => {
    fetchPostsNow();
    const timer = setInterval(fetchPostsNow, 10000);
    return () => clearInterval(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // 4) Hotspots (last HOTSPOT_WINDOW_MINUTES)
  const hotspots: Hotspot[] = useMemo(() => {
    const cutoff = Date.now() - HOTSPOT_WINDOW_MINUTES * 60 * 1000;

    const buckets = new Map<string, { count: number; sumLat: number; sumLng: number }>();

    for (const p of posts) {
      const t = new Date(p.created_at).getTime();
      if (t < cutoff) continue;

      const cellX = Math.floor(p.lat / CELL_SIZE);
      const cellY = Math.floor(p.lng / CELL_SIZE);
      const key = `${cellX}:${cellY}`;

      const cur = buckets.get(key) ?? { count: 0, sumLat: 0, sumLng: 0 };
      cur.count += 1;
      cur.sumLat += p.lat;
      cur.sumLng += p.lng;
      buckets.set(key, cur);
    }

    return Array.from(buckets.entries())
      .map(([key, v]) => ({
        key,
        count: v.count,
        lat: v.sumLat / v.count,
        lng: v.sumLng / v.count,
      }))
      .sort((a, b) => b.count - a.count)
      .slice(0, 3);
  }, [posts]);

  // 5) Post photo handler
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
      await fetchPostsNow(); // immediate refresh so pins/hotspots update now
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
      <MapView
        ref={mapRef}
        style={{ flex: 1 }}
        region={region}
        onRegionChangeComplete={(r) => setRegion(r)}
        showsUserLocation
      >
        {posts.map((p) => (
          <Marker
            key={p.id}
            coordinate={{ latitude: p.lat, longitude: p.lng }}
            title={p.tag ?? "Post"}
            description={p.caption ?? ""}
          />
        ))}
      </MapView>

      {/* Floating Post Button */}
      <Pressable
        onPress={handlePostPhoto}
        style={{
          position: "absolute",
          right: 18,
          bottom: 110,
          width: 56,
          height: 56,
          borderRadius: 28,
          alignItems: "center",
          justifyContent: "center",
          backgroundColor: posting ? "rgba(255,255,255,0.6)" : "white",
        }}
      >
        <Text style={{ fontSize: 28, fontWeight: "700" }}>{posting ? "…" : "+"}</Text>
      </Pressable>

      {/* Bottom panel */}
      <View
        style={{
          position: "absolute",
          left: 12,
          right: 12,
          bottom: 12,
          padding: 12,
          borderRadius: 16,
          backgroundColor: "rgba(0,0,0,0.75)",
        }}
      >
        <Text style={{ color: "white", fontSize: 14, marginBottom: 8 }}>{status}</Text>

        <Text style={{ color: "white", fontSize: 16, fontWeight: "600" }}>
          Hot Spots (last {HOTSPOT_WINDOW_MINUTES} min)
        </Text>

        {hotspots.length === 0 ? (
          <Text style={{ color: "white", marginTop: 6, opacity: 0.85 }}>
            No hotspots yet — post a few photos in the same area.
          </Text>
        ) : (
          <ScrollView horizontal style={{ marginTop: 8 }}>
            {hotspots.map((h, idx) => (
              <Pressable
                key={h.key}
                onPress={() => {
                  const newRegion = {
                    latitude: h.lat,
                    longitude: h.lng,
                    latitudeDelta: 0.01,
                    longitudeDelta: 0.01,
                  };
                  setRegion(newRegion);
                  mapRef.current?.animateToRegion(newRegion, 350);
                }}
                style={{
                  marginRight: 10,
                  paddingVertical: 8,
                  paddingHorizontal: 12,
                  borderRadius: 14,
                  backgroundColor: "rgba(255,255,255,0.15)",
                }}
              >
                <Text style={{ color: "white", fontWeight: "700" }}>
                  Hot Spot #{idx + 1}
                </Text>
                <Text style={{ color: "white", opacity: 0.9 }}>{h.count} posts</Text>
              </Pressable>
            ))}
          </ScrollView>
        )}
      </View>
    </View>
  );
}
