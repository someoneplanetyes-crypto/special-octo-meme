import { React, ReactNative } from "@vendetta/metro/common";
import { findByName, findByProps } from "@vendetta/metro";
import { after, unpatchAll } from "@vendetta/patcher";
import { showModal, hideModal } from "@vendetta/ui/modals";

const { View, Text, TextInput, TouchableOpacity, ScrollView, Image, StyleSheet } = ReactNative;
const ReactionModules = findByProps("addReaction", "removeReaction");
const MessageActionSheet = findByName("MessageActionSheet", false);
const LazyActionSheet = findByProps("openLazy", "hideActionSheet");

const styles = StyleSheet.create({
  container: { padding: 20, backgroundColor: "#1e1f22", borderTopLeftRadius: 16, borderTopRightRadius: 16 },
  title: { fontSize: 18, fontWeight: "bold", color: "#f2f3f5", marginBottom: 8 },
  note: { fontSize: 12, color: "#b5bac1", marginBottom: 14 },
  input: { backgroundColor: "#2b2d31", color: "#f2f3f5", borderRadius: 8, padding: 12, fontSize: 16, marginBottom: 14 },
  tray: { flexDirection: "row", marginBottom: 18 },
  emoji: { width: 42, height: 42, justifyContent: "center", alignItems: "center", backgroundColor: "#2b2d31", borderRadius: 8, marginRight: 8 },
  excluded: { opacity: 0.3 },
  emojiText: { fontSize: 22 },
  customEmoji: { width: 28, height: 28, resizeMode: "contain" },
  button: { backgroundColor: "#248046", paddingVertical: 12, borderRadius: 8, alignItems: "center" },
  disabled: { opacity: 0.4 },
  buttonText: { color: "#fff", fontWeight: "bold", fontSize: 14 },
});

const emojiRegex = /<a?:\w+:\d+>|[\u{1F300}-\u{1FAFF}\u{2600}-\u{27BF}]/gu;

function MultiReactModal({ channelId, messageId }: { channelId: string; messageId: string }) {
  const [inputText, setInputText] = React.useState("");
  const [excluded, setExcluded] = React.useState<number[]>([]);
  const [busy, setBusy] = React.useState(false);
  const emojis = inputText.match(emojiRegex) || [];
  const active = emojis.filter((_, i) => !excluded.includes(i));

  const toggle = (index: number) => setExcluded(old =>
    old.includes(index) ? old.filter(i => i !== index) : [...old, index]
  );

  const apply = async () => {
    if (!active.length || busy) return;
    setBusy(true);
    for (const emoji of active) {
      try {
        let param: any = { name: emoji, id: null, animated: false };
        if (emoji.startsWith("<")) {
          const parts = emoji.slice(1, -1).split(":");
          param = { name: parts[parts.length - 2], id: parts[parts.length - 1], animated: emoji.startsWith("<a:") };
        }
        await ReactionModules.addReaction(channelId, messageId, param);
        await new Promise(resolve => setTimeout(resolve, 150));
      } catch (error) {
        console.error("[Multi Emoji Legacy] Failed to add reaction", emoji, error);
      }
    }
    setBusy(false);
    hideModal();
  };

  return (
    <View style={styles.container}>
      <Text style={styles.title}>Multi React</Text>
      <Text style={styles.note}>Paste emojis below, then tap any preview to exclude it.</Text>
      <TextInput
        style={styles.input}
        placeholder="Paste or type emojis here..."
        placeholderTextColor="#6d737d"
        value={inputText}
        onChangeText={setInputText}
        autoFocus
      />
      {emojis.length > 0 && (
        <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.tray}>
          {emojis.map((emoji, index) => {
            const custom = emoji.startsWith("<");
            const id = custom ? emoji.slice(1, -1).split(":").pop() : "";
            const url = custom ? `https://cdn.discordapp.com/emojis/${id}.${emoji.startsWith("<a:") ? "gif" : "png"}?size=48` : "";
            return (
              <TouchableOpacity key={index} onPress={() => toggle(index)} style={[styles.emoji, excluded.includes(index) && styles.excluded]}>
                {custom ? <Image source={{ uri: url }} style={styles.customEmoji} /> : <Text style={styles.emojiText}>{emoji}</Text>}
              </TouchableOpacity>
            );
          })}
        </ScrollView>
      )}
      <TouchableOpacity onPress={apply} disabled={busy || active.length === 0} style={[styles.button, active.length === 0 && styles.disabled]}>
        <Text style={styles.buttonText}>{busy ? "Reacting..." : `Apply ${active.length} Reaction(s)`}</Text>
      </TouchableOpacity>
    </View>
  );
}

export default {
  onLoad() {
    if (!ReactionModules || !MessageActionSheet || !LazyActionSheet) {
      console.error("[Multi Emoji Legacy] Required Discord modules were not found.");
      return;
    }

    after("default", MessageActionSheet, ([args], result) => {
      const message = args?.message;
      if (!message || !Array.isArray(result?.props?.options)) return result;

      result.props.options.push({
        text: "Multi React",
        icon: "ic_add_reaction_24px",
        onPress: () => {
          LazyActionSheet.hideActionSheet();
          showModal({
            render: () => <MultiReactModal channelId={message.channel_id} messageId={message.id} />
          });
        }
      });
      return result;
    });
  },
  onUnload() {
    unpatchAll();
  }
};
