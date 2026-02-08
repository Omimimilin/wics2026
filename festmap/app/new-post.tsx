import { useEffect, useMemo, useState } from "react";
import {
  View,
  Text,
  Image,
  TextInput,
  Pressable,
  ActivityIndicator,
  Platform,
  Alert,
} from "react-native";
import { useLocalSearchParams, useRouter } from "expo-router";
import * as Location from "expo-location";
import { uploadPhotoToSupabase, insertPostRow } from "../lib/posts";
import { ScrollView, KeyboardAvoidingView } from "react-native";
import * as ImagePicker from "expo-image-picker";
import React from "react";

export default function NewPost() {
  const router = useRouter();
  const { uri } = useLocalSearchParams<{ uri?: string }>();

  const [caption, setCaption] = useState("");
  const [crowd, setCrowd] = useState(3);
  const [loc, setLoc] = useState<{ lat: number; lng: number } | null>(null);
  const [loadingLoc, setLoadingLoc] = useState(true);
  const [posting, setPosting] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  const crowdDots = useMemo(() => [1, 2, 3, 4, 5], []);

  useEffect(() => {
    if (!uri) return;
    (async () => {
      try {
        setLoadingLoc(true);
        const perm = await Location.requestForegroundPermissionsAsync();
        if (!perm.granted) return;
        const pos = await Location.getCurrentPositionAsync({});
        setLoc({ lat: pos.coords.latitude, lng: pos.coords.longitude });
      } finally {
        setLoadingLoc(false);
      }
    })();
  }, [uri]);

  if (Platform.OS === "web") {
    return (
      <View style={{ flex: 1, alignItems: "center", justifyContent: "center" }}>
        <Text>Mobile only</Text>
      </View>
    );
  }

  if (!uri) {
    return (
      <View style={{ flex: 1, alignItems: "center", justifyContent: "center" }}>
        <Text>Missing photo.</Text>
      </View>
    );
  }

  function confirmDiscard() {
  // If you want to *always* confirm, remove this condition.
  const hasEdits = caption.trim().length > 0;

  Alert.alert(
    "Discard post?",
    "Are you sure you want to discard this post?",
            [
            { text: "Cancel", style: "cancel" },
            {
                text: "Discard",
                style: "destructive",
                onPress: () => router.replace("/(tabs)"),
            },
            ]
        );
    }

    async function onRetake() {
        try {
            const camPerm = await ImagePicker.requestCameraPermissionsAsync();
            if (!camPerm.granted) return;

            const result = await ImagePicker.launchCameraAsync({
            mediaTypes: ImagePicker.MediaTypeOptions.Images,
            quality: 0.7,
            });

            if (result.canceled) return;

            const newUri = result.assets[0].uri;

            // Replace current screen so user stays on New Post UI
            router.replace({ pathname: "/new-post", params: { uri: newUri } });
        } catch (e) {
            console.log("[RETKE] error:", e);
        }
    }


  async function onShare() {
    try {
      setErr(null);
      setPosting(true);
      if (!loc) throw new Error("Location not available.");

      const publicUrl = await uploadPhotoToSupabase(uri);
      await insertPostRow({
        mediaUrl: publicUrl,
        lat: loc.lat,
        lng: loc.lng,
        caption,
        crowd,
      });

      // Go to map tab after sharing
      router.replace("/(tabs)");
    } catch (e: any) {
      console.log("[NEW POST] error:", e);
      setErr(e?.message ?? "Failed to share");
    } finally {
      setPosting(false);
    }
  }

  return (
    <KeyboardAvoidingView
        style={{ flex: 1, backgroundColor: "#F4F4F5" }}
        behavior={Platform.OS === "ios" ? "padding" : undefined}
    >
        {/* Top bar (your custom header) */}
        <View style={{ paddingTop: 20, paddingHorizontal: 18, paddingBottom: 10 }}>
        <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between" }}>
            {/* X in top-left */}
            <Pressable onPress={confirmDiscard} hitSlop={12}>
            <Text style={{ fontSize: 22, fontWeight: "700" }}>✕</Text>
            </Pressable>

            <Text style={{ fontSize: 18, fontWeight: "700" }}>New Post</Text>

            {/* Retake in top-right */}
            <Pressable onPress={onRetake} hitSlop={12}>
                <Text style={{ fontSize: 16, fontWeight: "600" }}>Retake</Text>
            </Pressable>
        </View>
        </View>

        {/* Scrollable content */}
        <ScrollView
        style={{ flex: 1 }}
        contentContainerStyle={{ paddingHorizontal: 18, paddingBottom: 120 }}
        keyboardShouldPersistTaps="handled"
        >
        {/* Photo preview */}
        <View style={{ borderRadius: 20, overflow: "hidden", borderWidth: 2, borderColor: "#3B82F6" }}>
            <Image source={{ uri }} style={{ width: "100%", height: 260 }} resizeMode="cover" />
        </View>

        {/* Caption */}
        <View style={{ marginTop: 14, backgroundColor: "white", borderRadius: 16, paddingHorizontal: 14, paddingVertical: 12 }}>
            <TextInput
            placeholder="Add a caption..."
            value={caption}
            onChangeText={setCaption}
            style={{ fontSize: 16 }}
            />
        </View>

        {/* Location + Audio */}
        <View style={{ marginTop: 10, backgroundColor: "white", borderRadius: 16, paddingHorizontal: 14, paddingVertical: 12 }}>
            <View style={{ flexDirection: "row", justifyContent: "space-between" }}>
            <Text style={{ fontSize: 16 }}>📍 Add Location</Text>
            {loadingLoc ? (
                <ActivityIndicator />
            ) : (
                <Text style={{ fontSize: 13, color: loc ? "#10B981" : "#EF4444" }}>
                {loc ? "Auto" : "Off"}
                </Text>
            )}
            </View>

            <View style={{ height: 1, backgroundColor: "#F3F4F6", marginVertical: 10 }} />

            <View style={{ flexDirection: "row", justifyContent: "space-between" }}>
            <Text style={{ fontSize: 16 }}>🎵 Add Audio</Text>
            <Text style={{ fontSize: 13, color: "#9CA3AF" }}>Later</Text>
            </View>
        </View>

        {/* Crowd */}
        <View style={{ marginTop: 12, backgroundColor: "white", borderRadius: 16, paddingHorizontal: 14, paddingVertical: 12 }}>
            <Text style={{ fontSize: 14, marginBottom: 10 }}>How crowded is it?</Text>
            <View style={{ flexDirection: "row", gap: 10 }}>
            {crowdDots.map((n) => (
                <Pressable
                key={n}
                onPress={() => setCrowd(n)}
                style={{
                    width: 28,
                    height: 28,
                    borderRadius: 14,
                    backgroundColor: n <= crowd ? "#111827" : "#E5E7EB",
                }}
                />
            ))}
            </View>
        </View>

        {err ? (
            <View style={{ marginTop: 10 }}>
            <Text style={{ color: "#DC2626" }}>{err}</Text>
            </View>
        ) : null}
        </ScrollView>

        {/* Sticky bottom button */}
        <View
        style={{
            position: "absolute",
            left: 0,
            right: 0,
            bottom: 0,
            padding: 18,
            backgroundColor: "#F4F4F5",
        }}
        >
        <Pressable
            onPress={onShare}
            disabled={posting}
            style={{
            height: 54,
            borderRadius: 18,
            backgroundColor: posting ? "rgba(59,130,246,0.5)" : "#3B82F6",
            alignItems: "center",
            justifyContent: "center",
            }}
        >
            <Text style={{ color: "white", fontSize: 18, fontWeight: "700" }}>
            {posting ? "Posting…" : "Post"}
            </Text>
        </Pressable>
        </View>
    </KeyboardAvoidingView>
    );

}
