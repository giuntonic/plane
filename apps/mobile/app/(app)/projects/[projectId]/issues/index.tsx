import { useCallback, useEffect, useState } from "react";
import { router, useLocalSearchParams } from "expo-router";
import { ActivityIndicator, FlatList, Pressable, RefreshControl, Text, View } from "react-native";
import { useAuth } from "@/auth/AuthContext";
import { listIssues } from "@/api/queries";
import type { TApiIssue } from "@/api/types";

const PRIORITY_COLOR: Record<TApiIssue["priority"], string> = {
  urgent: "#ef4444",
  high: "#f97316",
  medium: "#eab308",
  low: "#22c55e",
  none: "#9ca3af",
};

export default function IssuesScreen() {
  const { projectId } = useLocalSearchParams<{ projectId: string }>();
  const { api, session } = useAuth();
  const [issues, setIssues] = useState<TApiIssue[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const fetchIssues = useCallback(async () => {
    if (!api || !session || !projectId) return;
    try {
      setError(null);
      const page = await listIssues(api, session, projectId);
      setIssues(page.results);
    } catch {
      setError("Não foi possível carregar as issues.");
    }
  }, [api, session, projectId]);

  useEffect(() => {
    fetchIssues().finally(() => setIsLoading(false));
  }, [fetchIssues]);

  if (isLoading) {
    return (
      <View style={{ flex: 1, alignItems: "center", justifyContent: "center" }}>
        <ActivityIndicator />
      </View>
    );
  }

  return (
    <View style={{ flex: 1 }}>
      <FlatList
        data={issues}
        keyExtractor={(item) => item.id}
        contentContainerStyle={{ padding: 16, gap: 8 }}
        refreshControl={
          <RefreshControl
            refreshing={isRefreshing}
            onRefresh={async () => {
              setIsRefreshing(true);
              await fetchIssues();
              setIsRefreshing(false);
            }}
          />
        }
        ListEmptyComponent={
          <View style={{ paddingTop: 48, alignItems: "center" }}>
            <Text style={{ color: "#6b7280" }}>{error ?? "Nenhuma issue neste projeto ainda."}</Text>
          </View>
        }
        renderItem={({ item }) => (
          <Pressable
            onPress={() => router.push(`/(app)/projects/${projectId}/issues/${item.id}`)}
            style={{ flexDirection: "row", gap: 10, alignItems: "flex-start", paddingVertical: 8 }}
          >
            <View
              style={{
                width: 8,
                height: 8,
                borderRadius: 4,
                marginTop: 6,
                backgroundColor: PRIORITY_COLOR[item.priority],
              }}
            />
            <View style={{ flex: 1 }}>
              <Text style={{ fontSize: 15 }} numberOfLines={2}>
                {item.name}
              </Text>
              <Text style={{ color: "#9ca3af", fontSize: 12, marginTop: 2 }}>#{item.sequence_id}</Text>
            </View>
          </Pressable>
        )}
      />
      <Pressable
        onPress={() => router.push(`/(app)/projects/${projectId}/issues/new`)}
        style={{
          position: "absolute",
          right: 20,
          bottom: 24,
          width: 56,
          height: 56,
          borderRadius: 28,
          backgroundColor: "#3F76FF",
          alignItems: "center",
          justifyContent: "center",
        }}
      >
        <Text style={{ color: "#fff", fontSize: 28, lineHeight: 30 }}>+</Text>
      </Pressable>
    </View>
  );
}
