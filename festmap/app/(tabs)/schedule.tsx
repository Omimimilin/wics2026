import React from "react";
import { View, Text, ScrollView, StyleSheet } from "react-native";

export default function ScheduleTab() {
  const schedule = [
    { time: "10:00 AM", title: "Gates Open" },
    { time: "11:00 AM", title: "Opening Ceremony" },
    { time: "12:00 PM", title: "Main Stage: Band A" },
    { time: "1:30 PM", title: "Food Truck Lunch" },
    { time: "2:00 PM", title: "Workshop: Dance Lessons" },
    { time: "3:00 PM", title: "Main Stage: Band B" },
    { time: "4:30 PM", title: "Art Showcase" },
    { time: "6:00 PM", title: "Main Stage: Headliner" },
    { time: "8:00 PM", title: "Closing Fireworks" },
  ];

  return (
    <View style={styles.container}>
      {/* Header */}
      <View style={styles.header}>
        <Text style={styles.headerText}>Schedule</Text>
      </View>

      <ScrollView
        contentContainerStyle={{ paddingHorizontal: 18, paddingBottom: 120 }}
        showsVerticalScrollIndicator={false}
      >
        {schedule.map((item, idx) => (
          <View key={idx} style={styles.card}>
            <Text style={styles.time}>{item.time}</Text>
            <Text style={styles.title}>{item.title}</Text>
          </View>
        ))}
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: "#F4F4F5",
  },
  header: {
    paddingTop: 50,
    paddingBottom: 14,
    paddingHorizontal: 18,
    backgroundColor: "#fff",
    borderBottomWidth: 1,
    borderBottomColor: "#E5E7EB",
  },
  headerText: {
    fontSize: 22,
    fontWeight: "700",
  },
  card: {
    backgroundColor: "white",
    borderRadius: 16,
    paddingHorizontal: 14,
    paddingVertical: 16,
    marginTop: 12,
    shadowColor: "#000",
    shadowOpacity: 0.05,
    shadowRadius: 5,
    shadowOffset: { width: 0, height: 2 },
    elevation: 2,
  },
  time: {
    fontSize: 14,
    color: "#6B7280",
    marginBottom: 6,
  },
  title: {
    fontSize: 16,
    fontWeight: "600",
    color: "#111827",
  },
});