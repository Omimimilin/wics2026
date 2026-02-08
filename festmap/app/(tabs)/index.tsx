import React, { useEffect, useMemo, useRef, useState } from "react";
import { View, Text, Pressable, ScrollView, Platform } from "react-native";
import MapView, { Marker } from "react-native-maps";
import * as Location from "expo-location";
import { supabase } from "../../lib/supabase";
import axios from "axios";
import { TextInput } from "react-native-gesture-handler";
import Animated, { useSharedValue, useAnimatedStyle, withSpring } from "react-native-reanimated";
import { PanGestureHandler, GestureHandlerRootView } from "react-native-gesture-handler"

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

type SearchResult = {
  name: string;
  address: string;
  lat: number;
  lng: number;
}

const FESTIVAL_ID = "acl_demo";
const LOOKBACK_MINUTES = 60;
const HOTSPOT_WINDOW_MINUTES = 15;
const CELL_SIZE = 0.002; // ~200m-ish grid (good enough for hackathon)
const SERPAPI_KEY = process.env.EXPO_PUBLIC_SERPAPI_KEY;

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

// SerpAPI search
async function searchPlaces(
  query: string, 
  coords?: {lat: number; lng: number },
  fallbackLocation: string = "Austin, TX"
) {
  try {
    const params: any = {
      q: query,
      engine: "google_maps",
      api_key: SERPAPI_KEY,
      type: "search",
    };
    
    if (coords) {
      const zoom = 14;
      params.ll = `@${coords.lat.toFixed(6)},${coords.lng.toFixed(6)}, ${zoom}z`;
    } else {
      params.location = fallbackLocation;
    }

    const res = await axios.get("https://serpapi.com/search.json", { params });
    const results = res.data.local_results ?? [];
    
  return results
    .map((r: any) => {
      return {
        name: r.title,
        address: r.address,
        lat: r.gps_coordinates.latitude,
        lng: r.gps_coordinates.longitude,
      };
    })
    .filter((r: any) => r.lat && r.lng);
  } catch (e: any) {
    console.error("SerpApi search error:", e.response?.data || e.message);
    return [];
  }
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
  const [searchQuery, setSearchQuery] = useState("");
  const [searchResults, setSearchResults] = useState<SearchResult[]>([]);

  const bottomSheetHeight = 400;
  const translateY = useSharedValue(bottomSheetHeight);

  const animatedStyle = useAnimatedStyle(() => ({
    transform: [{ translateY: translateY.value }],
  }));

  const showSheet = () => {
    translateY.value = withSpring(0, { damping: 20, stiffness: 120 });
  };

  const hideSheet = () => {
    translateY.value = withSpring(bottomSheetHeight, { damping: 20, stiffness: 120 })
  };

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

  // Search
  async function handleSearch() {
    if (!searchQuery || !region) return;

    const results = await searchPlaces(searchQuery, region ? { lat: region.latitude, lng: region.longitude } : undefined);
    setSearchResults(results);
    if (results.length > 0) {
      showSheet();
      const newRegion = {
        latitude: results[0].lat,
        longitude: results[0].lng,
        latitudeDelta: 0.02,
        longitudeDelta: 0.02,
      };
      setRegion(newRegion);
      mapRef.current?.animateToRegion(newRegion, 500);
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
    <GestureHandlerRootView style={{ flex: 1 }}>
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

      {/* Search bar */}
      <View
        style={{
          position: "absolute",
          top: 80,
          width: "90%",
          alignSelf: "center",
          zIndex: 10,
        }}
        >
          <TextInput
            placeholder="Search places..."
            value={searchQuery}
            onChangeText={setSearchQuery}
            onSubmitEditing={handleSearch}
            placeholderTextColor="#000"
            style={{
              backgroundColor: "white",
              paddingHorizontal: 12,
              paddingVertical: 12,
              borderRadius: 20,
              fontSize:16,
            }}
          />
      </View>

      {/* Bottom panel */}
      <PanGestureHandler
       onGestureEvent={(event) => {
        translateY.value = Math.max(event.nativeEvent.translationY, 0);
       }}
       onEnded={(event) => {
        if (event.nativeEvent.translationY > bottomSheetHeight / 3) {
          translateY.value = withSpring(bottomSheetHeight, { damping: 20, stiffness: 120});
        } else {
          translateY.value = withSpring(0, { damping: 20, stiffness: 120 });
        }
       }} 
      >
        <Animated.View
          style={[
            animatedStyle,
            {
              position: "absolute",
              bottom: 0,
              left: 0,
              right: 0,
              maxHeight: bottomSheetHeight,
              backgroundColor: "white",
              borderRadius: 16,
              padding: 8,
              shadowColor: "#000",
              shadowOffset: { width: 0, height: 2 },
              shadowOpacity: 0.25,
              shadowRadius: 3.84,
              elevation: 5,
            },
          ]}
        >
          <View
            style={{
              width:40,
              height:5,
              backgroundColor: "#ccc",
              borderRadius: 2.5,
              alignSelf: "center",
              marginBottom: 8,
            }}
          />

          <ScrollView>
            {searchResults.map((r, idx) => (
              <Pressable
                key={idx}
                onPress={() => {
                  const newRegion = {
                    latitude: r.lat,
                    longitude: r.lng,
                    latitudeDelta: 0.02,
                    longitudeDelta: 0.02,
                  };
                  setRegion(newRegion);
                  mapRef.current?.animateToRegion(newRegion, 500);
                  hideSheet();
                  setSearchResults([]);
                }}
                style={{
                  padding: 12,
                  borderBottomWidth: idx !== searchResults.length - 1 ? 1 : 0,
                  borderBottomColor: "#ddd",
                }}
              >
                <Text style={{ fontWeight: "600" }}>{r.name}</Text>
                <Text style={{ color: "#555" }}>{r.address}</Text>
              </Pressable>
            ))}
          </ScrollView>
        </Animated.View>
      </PanGestureHandler>
      
      <View style ={{ position: "absolute", top: 150, left: 12, right: 12}}>
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
    </GestureHandlerRootView>
  );
}
