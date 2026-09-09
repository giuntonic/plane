import { useState } from "react";
import { router, useLocalSearchParams } from "expo-router";
import { ActivityIndicator, Alert, Pressable, Text, TextInput, View } from "react-native";
import { useAuth } from "@/auth/AuthContext";
import { createIssue } from "@/api/queries";

export default function NewIssueScreen() {
  const { projectId } = useLocalSearchParams<{ projectId: string }>();
  const { api, session } = useAuth();
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);

  async function handleCreate() {
    if (!api || !session || !projectId || !name.trim()) return;
    setIsSubmitting(true);
    try {
      const issue = await createIssue(api, session, projectId, {
        name: name.trim(),
        description_html: description.trim() ? `<p>${description.trim()}</p>` : undefined,
      });
      router.replace(`/(app)/projects/${projectId}/issues/${issue.id}`);
    } catch {
      Alert.alert("Não foi possível criar a issue", "Tente novamente.");
    } finally {
      setIsSubmitting(false);
    }
  }

  return (
    <View style={{ flex: 1, padding: 16, gap: 12 }}>
      <TextInput
        placeholder="Título"
        value={name}
        onChangeText={setName}
        style={{ fontSize: 18, fontWeight: "600", paddingVertical: 8 }}
        autoFocus
      />
      <TextInput
        placeholder="Descrição (opcional)"
        value={description}
        onChangeText={setDescription}
        multiline
        style={{ flex: 1, textAlignVertical: "top", fontSize: 15, paddingTop: 8 }}
      />
      <Pressable
        onPress={handleCreate}
        disabled={!name.trim() || isSubmitting}
        style={{
          backgroundColor: name.trim() ? "#3F76FF" : "#9ca3af",
          borderRadius: 8,
          paddingVertical: 14,
          alignItems: "center",
        }}
      >
        {isSubmitting ? (
          <ActivityIndicator color="#fff" />
        ) : (
          <Text style={{ color: "#fff", fontWeight: "600" }}>Criar issue</Text>
        )}
      </Pressable>
    </View>
  );
}
