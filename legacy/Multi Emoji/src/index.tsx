import { React, ReactNative } from "@vendetta/metro/common";
import { findByName, findByProps } from "@vendetta/metro";
import { findInReactTree } from "@vendetta/utils";
import { after, before, unpatchAll } from "@vendetta/patcher";
import { showModal, hideModal } from "@vendetta/ui/modals";

const { View, Text, TextInput, TouchableOpacity, ScrollView, Image, StyleSheet } = ReactNative;
const ReactionModules = findByProps("addReaction", "removeReaction");
const LazyActionSheet = findByProps("openLazy", "hideActionSheet");
const ActionSheetRowModule = findByProps("ActionSheetRow");
const ActionSheetRow = ActionSheetRowModule?.ActionSheetRow;
const AlertModules = findByProps("openAlert", "dismissAlert");
const AlertComponents = findByProps("AlertModal", "AlertActions");

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

function injectMultiReactRow(tree: any, message: any) {
  if (!findInReactTree || !ActionSheetRow) return false;

  const row = React.createElement(ActionSheetRow, {
    label: "Multi React",
    onPress: () => {
      try {
        LazyActionSheet?.hideActionSheet?.();

        const openAlert = AlertModules?.openAlert;
        const AlertModal = AlertComponents?.AlertModal;

        if (typeof openAlert !== "function" || typeof AlertModal !== "function") {
          console.error("[Multi Emoji Legacy] Revenge alert API not found.", {
            openAlert: typeof openAlert,
            AlertModal: typeof AlertModal,
          });
          return;
        }

        openAlert(
          "multi-emoji-alert-api-test",
          React.createElement(AlertModal, {
            title: "Multi React — API Test",
            content: React.createElement(
              Text,
              { style: { color: "#f2f3f5" } },
              "If you can see this, Revenge's alert API opened successfully."
            ),
          }),
        );
      } catch (error) {
        console.error("[Multi Emoji Legacy] Alert API test failed:", error);
      }
    },
    key: "multi-emoji-legacy",
  });

  const groups = findInReactTree(
    tree,
    (value: any) => Array.isArray(value) && value?.[0]?.type?.name === "ActionSheetRowGroup",
  );
  if (groups?.length) {
    const target = groups[1] ?? groups[0];
    const rows = target?.props?.children;
    if (Array.isArray(rows)) {
      if (rows.some((child: any) => child?.key === "multi-emoji-legacy" || child?.props?.label === "Multi React")) return true;
      rows.push(row);
      return true;
    }
  }

  const rows = findInReactTree(
    tree,
    (value: any) => Array.isArray(value) && value.some((child: any) => child?.type?.name === "ActionSheetRow"),
  );
  if (rows) {
    if (!rows.some((child: any) => child?.key === "multi-emoji-legacy" || child?.props?.label === "Multi React")) {
      rows.push(row);
    }
    return true;
  }
  return false;
}

export default {
  onLoad() {
    if (!ReactionModules?.addReaction || !LazyActionSheet?.openLazy || !findInReactTree || !ActionSheetRow) {
      console.error("[Multi Emoji Legacy] Required Discord modules were not found.", {
        reactions: !!ReactionModules?.addReaction,
        actionSheet: !!LazyActionSheet?.openLazy,
        row: !!ActionSheetRow,
        reactTree: !!findInReactTree,
      });
      return;
    }

    before("openLazy", LazyActionSheet, ([component, sheetName, context]) => {
      const message = context?.message;
      if (sheetName !== "MessageLongPressActionSheet" || !message) return;

      Promise.resolve(component).then((instance: any) => {
        if (!instance || typeof instance.default !== "function") {
          console.error("[Multi Emoji Legacy] Long-press sheet component was not found.");
          return;
        }

        let unpatchInstance: (() => void) | undefined;
        unpatchInstance = after("default", instance, (_args: any, tree: any) => {
          try {
            React.useEffect(() => () => {
              try { unpatchInstance?.(); } catch {}
            }, []);
          } catch {}
          try {
            const injected = injectMultiReactRow(tree, message);
            if (!injected) console.warn("[Multi Emoji Legacy] Could not find an action-row container.");
          } catch (error) {
            console.error("[Multi Emoji Legacy] Action-sheet injection failed", error);
          }
          return tree;
        });
      }).catch((error: any) => {
        console.error("[Multi Emoji Legacy] Failed to load long-press sheet", error);
      });
    });
  },
  onUnload() {
    unpatchAll();
  },
};
