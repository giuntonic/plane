import { useState } from "react";
import { router } from "expo-router";
import { ActivityIndicator, Alert, Pressable, ScrollView, Text, TextInput, View } from "react-native";
import { useAuth } from "@/auth/AuthContext";
import { normalizeBaseUrl } from "@/auth/session";

export default function LoginScreen() {
  const { signIn } = useAuth();
  const [instanceUrl, setInstanceUrl] = useState("");
  const [workspaceSlug, setWorkspaceSlug] = useState("");
  const [apiToken, setApiToken] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);

  const canSubmit = instanceUrl.trim() && workspaceSlug.trim() && apiToken.trim() && !isSubmitting;

  async function handleSubmit() {
    setIsSubmitting(true);
    try {
      await signIn({
        baseUrl: normalizeBaseUrl(instanceUrl),
        workspaceSlug: workspaceSlug.trim(),
        apiToken: apiToken.trim(),
      });
      router.replace("/(app)/projects");
    } catch {
      Alert.alert(
        "Não foi possível entrar",
        "Verifique a URL da instância, o slug do workspace e o token de API. O token é gerado em Settings → API Tokens no app web."
      );
    } finally {
      setIsSubmitting(false);
    }
  }

  return (
    <ScrollView contentContainerStyle={{ flexGrow: 1, justifyContent: "center", padding: 24, gap: 16 }}>
      <Text style={{ fontSize: 24, fontWeight: "700", marginBottom: 8 }}>Entrar no Plane</Text>

      <Field
        label="URL da instância"
        placeholder="plane.pespo.com.br"
        value={instanceUrl}
        onChangeText={setInstanceUrl}
        autoCapitalize="none"
        keyboardType="url"
      />
      <Field
        label="Slug do workspace"
        placeholder="minha-empresa"
        value={workspaceSlug}
        onChangeText={setWorkspaceSlug}
        autoCapitalize="none"
      />
      <Field
        label="Token de API"
        placeholder="plane_api_..."
        value={apiToken}
        onChangeText={setApiToken}
        autoCapitalize="none"
        secureTextEntry
      />

      <Text style={{ color: "#6b7280", fontSize: 13, marginTop: -8 }}>
        Gere o token em Configurações do workspace → API Tokens, no app web da sua instância.
      </Text>

      <Pressable
        onPress={handleSubmit}
        disabled={!canSubmit}
        style={{
          backgroundColor: canSubmit ? "#3F76FF" : "#9ca3af",
          borderRadius: 8,
          paddingVertical: 14,
          alignItems: "center",
          marginTop: 8,
        }}
      >
        {isSubmitting ? (
          <ActivityIndicator color="#fff" />
        ) : (
          <Text style={{ color: "#fff", fontWeight: "600" }}>Entrar</Text>
        )}
      </Pressable>
    </ScrollView>
  );
}

function Field(props: {
  label: string;
  placeholder: string;
  value: string;
  onChangeText: (v: string) => void;
  autoCapitalize?: "none" | "sentences";
  keyboardType?: "default" | "url";
  secureTextEntry?: boolean;
}) {
  return (
    <View style={{ gap: 6 }}>
      <Text style={{ fontSize: 13, fontWeight: "600", color: "#374151" }}>{props.label}</Text>
      <TextInput
        value={props.value}
        onChangeText={props.onChangeText}
        placeholder={props.placeholder}
        autoCapitalize={props.autoCapitalize ?? "sentences"}
        keyboardType={props.keyboardType ?? "default"}
        secureTextEntry={props.secureTextEntry}
        style={{
          borderWidth: 1,
          borderColor: "#d1d5db",
          borderRadius: 8,
          paddingHorizontal: 12,
          paddingVertical: 10,
          fontSize: 16,
        }}
      />
    </View>
  );
}
