import { useCallback, useEffect, useState } from "react";
import { useLocalSearchParams } from "expo-router";
import {
  ActivityIndicator,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  ScrollView,
  Text,
  TextInput,
  View,
} from "react-native";
import { useAuth } from "@/auth/AuthContext";
import { createComment, getIssue, listComments } from "@/api/queries";
import type { TApiComment, TApiIssue } from "@/api/types";
import { stripHtml } from "@/utils/html";

export default function IssueDetailScreen() {
  const { projectId, issueId } = useLocalSearchParams<{ projectId: string; issueId: string }>();
  const { api, session } = useAuth();
  const [issue, setIssue] = useState<TApiIssue | null>(null);
  const [comments, setComments] = useState<TApiComment[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [draft, setDraft] = useState("");
  const [isSending, setIsSending] = useState(false);

  const load = useCallback(async () => {
    if (!api || !session || !projectId || !issueId) return;
    const [issueData, commentsData] = await Promise.all([
      getIssue(api, session, projectId, issueId),
      listComments(api, session, projectId, issueId),
    ]);
    setIssue(issueData);
    setComments(commentsData);
  }, [api, session, projectId, issueId]);

  useEffect(() => {
    load().finally(() => setIsLoading(false));
  }, [load]);

  async function handleSendComment() {
    if (!api || !session || !projectId || !issueId || !draft.trim()) return;
    setIsSending(true);
    try {
      const comment = await createComment(api, session, projectId, issueId, `<p>${draft.trim()}</p>`);
      setComments((prev) => [...prev, comment]);
      setDraft("");
    } finally {
      setIsSending(false);
    }
  }

  if (isLoading || !issue) {
    return (
      <View style={{ flex: 1, alignItems: "center", justifyContent: "center" }}>
        <ActivityIndicator />
      </View>
    );
  }

  return (
    <KeyboardAvoidingView
      style={{ flex: 1 }}
      behavior={Platform.OS === "ios" ? "padding" : undefined}
      keyboardVerticalOffset={90}
    >
      <ScrollView contentContainerStyle={{ padding: 16, gap: 16 }}>
        <View>
          <Text style={{ color: "#9ca3af", fontSize: 12 }}>#{issue.sequence_id}</Text>
          <Text style={{ fontSize: 20, fontWeight: "700", marginTop: 4 }}>{issue.name}</Text>
        </View>

        {issue.description_html ? (
          <Text style={{ fontSize: 15, color: "#374151" }}>{stripHtml(issue.description_html)}</Text>
        ) : null}

        <View>
          <Text style={{ fontWeight: "600", marginBottom: 8 }}>Comentários</Text>
          {comments.length === 0 ? (
            <Text style={{ color: "#9ca3af" }}>Nenhum comentário ainda.</Text>
          ) : (
            comments.map((comment) => (
              <View key={comment.id} style={{ paddingVertical: 8, borderTopWidth: 1, borderColor: "#f3f4f6" }}>
                <Text style={{ fontSize: 14 }}>{stripHtml(comment.comment_html)}</Text>
              </View>
            ))
          )}
        </View>
      </ScrollView>

      <View style={{ flexDirection: "row", gap: 8, padding: 12, borderTopWidth: 1, borderColor: "#e5e7eb" }}>
        <TextInput
          value={draft}
          onChangeText={setDraft}
          placeholder="Escreva um comentário…"
          style={{
            flex: 1,
            borderWidth: 1,
            borderColor: "#d1d5db",
            borderRadius: 8,
            paddingHorizontal: 12,
            paddingVertical: 8,
          }}
        />
        <Pressable
          onPress={handleSendComment}
          disabled={!draft.trim() || isSending}
          style={{
            backgroundColor: draft.trim() ? "#3F76FF" : "#9ca3af",
            borderRadius: 8,
            paddingHorizontal: 16,
            justifyContent: "center",
          }}
        >
          {isSending ? (
            <ActivityIndicator color="#fff" />
          ) : (
            <Text style={{ color: "#fff", fontWeight: "600" }}>Enviar</Text>
          )}
        </Pressable>
      </View>
    </KeyboardAvoidingView>
  );
}
