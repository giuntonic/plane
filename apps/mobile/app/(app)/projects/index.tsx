import { useCallback, useEffect, useState } from "react";
import { router } from "expo-router";
import { ActivityIndicator, FlatList, Pressable, RefreshControl, Text, View } from "react-native";
import { useAuth } from "@/auth/AuthContext";
import { listProjects } from "@/api/queries";
import type { TApiProject } from "@/api/types";

export default function ProjectsScreen() {
  const { api, session, signOut } = useAuth();
  const [projects, setProjects] = useState<TApiProject[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const fetchProjects = useCallback(async () => {
    if (!api || !session) return;
    try {
      setError(null);
      setProjects(await listProjects(api, session));
    } catch {
      setError("Não foi possível carregar os projetos.");
    }
  }, [api, session]);

  useEffect(() => {
    fetchProjects().finally(() => setIsLoading(false));
  }, [fetchProjects]);

  if (isLoading) {
    return (
      <View style={{ flex: 1, alignItems: "center", justifyContent: "center" }}>
        <ActivityIndicator />
      </View>
    );
  }

  return (
    <FlatList
      data={projects}
      keyExtractor={(item) => item.id}
      contentContainerStyle={{ padding: 16, gap: 8 }}
      refreshControl={
        <RefreshControl
          refreshing={isRefreshing}
          onRefresh={async () => {
            setIsRefreshing(true);
            await fetchProjects();
            setIsRefreshing(false);
          }}
        />
      }
      ListEmptyComponent={
        <View style={{ paddingTop: 48, alignItems: "center", gap: 8 }}>
          <Text style={{ color: "#6b7280" }}>{error ?? "Nenhum projeto encontrado neste workspace."}</Text>
          <Pressable onPress={signOut}>
            <Text style={{ color: "#3F76FF" }}>Sair</Text>
          </Pressable>
        </View>
      }
      renderItem={({ item }) => (
        <Pressable
          onPress={() => router.push(`/(app)/projects/${item.id}/issues`)}
          style={{
            borderWidth: 1,
            borderColor: "#e5e7eb",
            borderRadius: 10,
            padding: 14,
          }}
        >
          <Text style={{ fontSize: 16, fontWeight: "600" }}>{item.name}</Text>
          <Text style={{ color: "#6b7280", marginTop: 2 }}>{item.identifier}</Text>
        </Pressable>
      )}
    />
  );
}
