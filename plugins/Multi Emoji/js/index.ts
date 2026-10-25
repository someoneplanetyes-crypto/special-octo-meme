import React, { useState } from "react";
import { metro } from "@revenge";
import { after } from "@revenge/patcher";

// 1. Locate Discord's internal modules and foundational UI components
const ReactionModules = metro.findByProps("addReaction", "removeReaction");
const MessageActionSheet = metro.find(m => m?.default?.name === "MessageActionSheet" || m?.MessageActionSheet);
const LazyActionSheet = metro.findByProps("openLazy", "hideActionSheet");

// Pull React Native UI elements exposed in Discord's bundle
const { View, Text, TextInput, TouchableOpacity, ScrollView, Image, StyleSheet } = metro.findByProps("View", "Text", "TextInput", "Image");
const { showModal } = metro.findByProps("showModal", "hideModal");

let unpatch: () => void;

function MultiReactModal({ channelId, messageId, onClose }: { channelId: string, messageId: string, onClose: () => void }) {
    const [inputText, setInputText] = useState("");
    const [deselectedEmojis, setDeselectedEmojis] = useState<number[]>([]); 
    const [isReacting, setIsReacting] = useState(false);

    // Regular expression matching custom Discord emojis AND standard Unicode emojis
    const emojiRegex = /<a?:\w+:\d+>|[\u{1F300}-\u{1F9FF}\u{2600}-\u{26FF}\u{2700}-\u{27BF}\u{1F000}-\u{1F02F}\u{1F0A0}-\u{1F0FF}\u{1F100}-\u{1F1FF}\u{1F200}-\u{1F2FF}\u{1F600}-\u{1F64F}\u{1F680}-\u{1F6FF}\u{1F900}-\u{1F9FF}]/gu;
    const parsedEmojis = inputText.match(emojiRegex) || [];

    const handleEmojiPress = (index: number) => {
        if (deselectedEmojis.includes(index)) {
            setDeselectedEmojis(deselectedEmojis.filter(i => i !== index));
        } else {
            setDeselectedEmojis([...deselectedEmojis, index]);
        }
    };

    const activeEmojis = parsedEmojis.filter((_, index) => !deselectedEmojis.includes(index));

    const executeReactions = async () => {
        if (activeEmojis.length === 0) return;
        setIsReacting(true);

        for (const emoji of activeEmojis) {
            try {
                let emojiParam: any = { name: emoji, id: null, animated: false };
                
                if (emoji.startsWith("<")) {
                    const isAnimated = emoji.startsWith("<a:");
                    const parts = emoji.replace(/[<>]/g, "").split(":");
                    
                    // FIXED: Safe explicit index parsing for Discord Gateway API payloads
                    const emojiId = parts[parts.length - 1];
                    const emojiName = parts[parts.length - 2];

                    emojiParam = {
                        name: emojiName,
                        id: emojiId,
                        animated: isAnimated
                    };
                }

                await ReactionModules.addReaction(channelId, messageId, emojiParam);
                await new Promise(resolve => setTimeout(resolve, 150));
            } catch (err: any) {
                console.error(`[MultiReact] Error reacting with ${emoji}`, err);
            }
        }

        setIsReacting(false);
        onClose();
    };

    return (
        <View style={styles.modalContainer}>
            <Text style={styles.title}>Multi React</Text>
            <Text style={styles.disclaimer}>
                Heads up: no, your free nitro emoji plugin will not work with this for obvious reasons.
            </Text>

            <TextInput
                style={styles.input}
                placeholder="Paste or type emojis here..."
                placeholderTextColor="#6d737d"
                value={inputText}
                onChangeText={setInputText}
                autoFocus={true}
            />

            {parsedEmojis.length > 0 && (
                <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.scrollTray}>
                    {parsedEmojis.map((emoji, index) => {
                        const isExcluded = deselectedEmojis.includes(index);
                        const activeIndex = !isExcluded ? activeEmojis.indexOf(emoji) + 1 : null;
                        
                        // Parse info for visual previews
                        const isCustom = emoji.startsWith("<");
                        let customUrl = "";
                        if (isCustom) {
                            const parts = emoji.replace(/[<>]/g, "").split(":");
                            const id = parts[parts.length - 1];
                            const ext = emoji.startsWith("<a:") ? "gif" : "png";
                            customUrl = `https://discordapp.com{id}.${ext}`;
                        }

                        return (
                            <TouchableOpacity 
                                key={index} 
                                onPress={() => handleEmojiPress(index)}
                                activeOpacity={0.7}
                                style={[styles.emojiWrapper, isExcluded && styles.emojiDeselected]}
                            >
                                {/* FIXED: Replaced standard text diamond placeholder with native remote URL rendering support */}
                                {isCustom ? (
                                    <Image source={{ uri: customUrl }} style={styles.customEmojiImage} />
                                ) : (
                                    <Text style={styles.emojiText}>{emoji}</Text>
                                )}
                                
                                {activeIndex !== null && (
                                    <View style={styles.badge}>
                                        <Text style={styles.badgeText}>{activeIndex}</Text>
                                    </View>
                                )}
                            </TouchableOpacity>
                        );
                    })}
                </ScrollView>
            )}

            <TouchableOpacity 
                onPress={executeReactions} 
                disabled={isReacting || activeEmojis.length === 0}
                style={[styles.submitButton, activeEmojis.length === 0 && styles.disabledButton]}
            >
                <Text style={styles.submitText}>
                    {isReacting ? "Reacting..." : `Apply ${activeEmojis.length} Reaction(s)`}
                </Text>
            </TouchableOpacity>
        </View>
    );
}

const styles = StyleSheet.create({
    modalContainer: { padding: 20, backgroundColor: "#1e1f22", borderTopLeftRadius: 16, borderTopRightRadius: 16 },
    title: { fontSize: 18, fontWeight: "bold", color: "#f2f3f5", marginBottom: 4 },
    disclaimer: { fontSize: 12, color: "#949ba4", fontStyle: "italic", marginBottom: 16 },
    input: { backgroundColor: "#2b2d31", color: "#f2f3f5", borderRadius: 8, padding: 12, fontSize: 16, marginBottom: 16 },
    scrollTray: { flexDirection: "row", marginBottom: 20 },
    emojiWrapper: { width: 50, height: 50, justifyContent: "center", alignItems: "center", backgroundColor: "#2b2d31", borderRadius: 8, marginRight: 10, position: "relative" },
    emojiDeselected: { opacity: 0.3, backgroundColor: "#1c1d1f" },
    emojiText: { fontSize: 22 },
    customEmojiImage: { width: 28, height: 28, resizeMode: "contain" },
    badge: { position: "absolute", top: -4, right: -4, backgroundColor: "#5865f2", borderRadius: 10, width: 18, height: 18, justifyContent: "center", alignItems: "center" },
    badgeText: { color: "#ffffff", fontSize: 10, fontWeight: "bold" },
    submitButton: { backgroundColor: "#248046", paddingVertical: 12, borderRadius: 8, alignItems: "center" },
    disabledButton: { backgroundColor: "#4e5058", opacity: 0.5 },
    submitText: { color: "#ffffff", fontWeight: "bold", fontSize: 14 }
});

export default {
    onLoad: () => {
        console.log("[MultiReact] Safe build initialized.");
        unpatch = after("default", MessageActionSheet, ([{ message }], res) => {
            if (!res || !res.props || !res.props.options) return;

            res.props.options.push({
                text: "Multi React",
                icon: "add-reaction", 
                onPress: () => {
                    LazyActionSheet.hideActionSheet();
                    showModal({
                        render: () => (
                            <MultiReactModal 
                                channelId={message.channel_id} 
                                messageId={message.id} 
                                onClose={() => LazyActionSheet.hideActionSheet()} 
                            />
                        )
                    });
                }
            });
        });
    },
    onUnload: () => {
        if (unpatch) unpatch();
        console.log("[MultiReact] Cleanly shut down.");
    }
};