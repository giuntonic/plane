import { Redirect, Stack } from "expo-router";
import { useAuth } from "@/auth/AuthContext";

export default function AppLayout() {
  const { session, isLoading } = useAuth();

  if (!isLoading && !session) {
    return <Redirect href="/login" />;
  }

  return (
    <Stack>
      <Stack.Screen name="projects/index" options={{ title: "Projetos" }} />
      <Stack.Screen name="projects/[projectId]/issues/index" options={{ title: "Issues" }} />
      <Stack.Screen name="projects/[projectId]/issues/new" options={{ title: "Nova issue", presentation: "modal" }} />
      <Stack.Screen name="projects/[projectId]/issues/[issueId]" options={{ title: "Issue" }} />
    </Stack>
  );
}
