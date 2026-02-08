import { useEffect, useRef } from "react";
import { View, Text, Platform } from "react-native";
import * as ImagePicker from "expo-image-picker";
import React from "react";
import { useRouter } from "expo-router";
import { useIsFocused } from "@react-navigation/native";

export default function CameraTab() {
  const router = useRouter();
  const isFocused = useIsFocused();

  // Prevents double-launch loops
  const launchedRef = useRef(false);

  useEffect(() => {
    if (Platform.OS === "web") return;

    if (!isFocused) {
      launchedRef.current = false;
      return;
    }

    if (launchedRef.current) return;
    launchedRef.current = true;

    (async () => {
      const camPerm = await ImagePicker.requestCameraPermissionsAsync();
      if (!camPerm.granted) {
        // User denied camera → just go back
        router.back();
        return;
      }

      const result = await ImagePicker.launchCameraAsync({
        mediaTypes: ImagePicker.MediaTypeOptions.Images,
        quality: 0.7,
      });

      if (result.canceled) {
        // User canceled camera → go back
        router.back();
        return;
      }

      const uri = result.assets[0].uri;

      // Go to Instagram-style New Post UI
      router.push({
        pathname: "/new-post",
        params: { uri },
      });
    })();
  }, [isFocused, router]);

  return (
    <View style={{ flex: 1, alignItems: "center", justifyContent: "center" }}>
      <Text>Opening camera…</Text>
    </View>
  );
}
