import { Platform } from "react-native";

import { useEffect, useMemo, useState } from "react";
import { View, Text, Pressable, ScrollView } from "react-native";
import MapView, { Marker } from "react-native-maps";
import * as Location from "expo-location";
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

// const FESTIVAL_ID = "acl_demo"; // change later if you add festival selector
const LOOKBACK_MINUTES = 60;
const HOTSPOT_WINDOW_MINUTES = 15;

// ~200m-ish grid (rough; good enough for hackathon)
const CELL_SIZE = 0.002;

export default function TabOneScreen() {
  const [region, setRegion] = useState<any>(null);
  const [posts, setPosts] = useState<PostRow[]>([]);
  const [status, setStatus] = useState<string>("Loading…");
  const [permissionDenied, setPermissionDenied] = useState(false);

  // 1) Get user location and set initial region
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

  if (Platform.OS === "web") {
    return (
      <View style={{ flex: 1, alignItems: "center", justifyContent: "center", padding: 16 }}>
        <Text style={{ fontSize: 18, fontWeight: "600", marginBottom: 8 }}>
          FestMap runs on mobile
        </Text>
        <Text>
          Open this app in Expo Go on iOS/Android to view the live map.
        </Text>
      </View>
    );
  }

  // 2) Fetch posts (poll every 10s)
  useEffect(() => {
    let timer: any;

    async function fetchPosts() {
      try {
        setStatus("Loading pins…");
        const since = new Date(Date.now() - LOOKBACK_MINUTES * 60 * 1000).toISOString();

        let q = supabase
          .from("posts")
          .select("id, media_url, media_type, caption, tag, lat, lng, created_at, expires_at")
          .gt("created_at", since)
          .order("created_at", { ascending: false })
          .limit(250);

        // If you DID NOT add festival_id column, comment this out:
        // q = q.eq("festival_id", FESTIVAL_ID);

        const { data, error } = await q;
        if (error) throw error;

        setPosts((data as any[]) ?? []);
        setStatus(`Loaded ${data?.length ?? 0} pins`);
      } catch (e: any) {
        console.log("Fetch posts error:", e);
        setStatus(`Error loading pins: ${e?.message ?? "unknown error"}`);
      }
    }

    fetchPosts();
    timer = setInterval(fetchPosts, 10000);

    return () => clearInterval(timer);
  }, []);

  // 3) Compute hotspots from posts in the last HOTSPOT_WINDOW_MINUTES
  const hotspots: Hotspot[] = useMemo(() => {
    const cutoff = Date.now() - HOTSPOT_WINDOW_MINUTES * 60 * 1000;

    const buckets = new Map<
      string,
      { count: number; sumLat: number; sumLng: number }
    >();

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

    const out: Hotspot[] = Array.from(buckets.entries())
      .map(([key, v]) => ({
        key,
        count: v.count,
        lat: v.sumLat / v.count,
        lng: v.sumLng / v.count,
      }))
      .sort((a, b) => b.count - a.count)
      .slice(0, 3);

    return out;
  }, [posts]);

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
      <MapView style={{ flex: 1 }} initialRegion={region} showsUserLocation>
        {posts.map((p) => (
          <Marker
            key={p.id}
            coordinate={{ latitude: p.lat, longitude: p.lng }}
            title={p.tag ?? "Post"}
            description={p.caption ?? ""}
          />
        ))}
      </MapView>

      {/* Bottom panel: status + hotspots */}
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
        <Text style={{ color: "white", fontSize: 14, marginBottom: 8 }}>
          {status}
        </Text>

        <Text style={{ color: "white", fontSize: 16, fontWeight: "600" }}>
          Hot Spots (last {HOTSPOT_WINDOW_MINUTES} min)
        </Text>

        {hotspots.length === 0 ? (
          <Text style={{ color: "white", marginTop: 6, opacity: 0.85 }}>
            No hotspots yet — create a few posts to see this light up.
          </Text>
        ) : (
          <ScrollView horizontal style={{ marginTop: 8 }}>
            {hotspots.map((h, idx) => (
              <Pressable
                key={h.key}
                onPress={() => {
                  // Zoom map to hotspot (approx)
                  setRegion({
                    latitude: h.lat,
                    longitude: h.lng,
                    latitudeDelta: 0.01,
                    longitudeDelta: 0.01,
                  });
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
                <Text style={{ color: "white", opacity: 0.9 }}>
                  {h.count} posts
                </Text>
              </Pressable>
            ))}
          </ScrollView>
        )}
      </View>
    </View>
  );
}
