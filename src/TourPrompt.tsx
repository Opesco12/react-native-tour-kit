import React from "react";
import { Pressable, StyleSheet, Text, View } from "react-native";

import { TourButtonColors, TourPromptConfig } from "./types";

type TourPromptProps = {
  overlayColor: string;
  buttonColors: Required<TourButtonColors>;
  prompt?: TourPromptConfig;
  onSkip: () => void;
  onStart: () => void;
};

export const TourPrompt = ({
  overlayColor,
  buttonColors,
  prompt,
  onSkip,
  onStart,
}: TourPromptProps) => {
  return (
    <View style={StyleSheet.absoluteFill}>
      <Pressable style={[styles.overlay, { backgroundColor: overlayColor }]} />
      <View style={styles.promptCard}>
        <Text style={styles.promptTitle}>{prompt?.title ?? "Take a quick product tour?"}</Text>
        <Text style={styles.promptDescription}>
          {prompt?.description ?? "You can skip now and start it again later anytime."}
        </Text>
        <View style={styles.actionsRow}>
          <Pressable
            style={[styles.secondaryButton, { backgroundColor: buttonColors.secondaryBackground }]}
            onPress={onSkip}
          >
            <Text style={[styles.secondaryButtonText, { color: buttonColors.secondaryText }]}>
              {prompt?.skipButtonText ?? "Skip"}
            </Text>
          </Pressable>
          <Pressable
            style={[styles.primaryButton, { backgroundColor: buttonColors.primaryBackground }]}
            onPress={onStart}
          >
            <Text style={[styles.primaryButtonText, { color: buttonColors.primaryText }]}>
              {prompt?.startButtonText ?? "Start Tour"}
            </Text>
          </Pressable>
        </View>
      </View>
    </View>
  );
};

const styles = StyleSheet.create({
  overlay: {
    ...StyleSheet.absoluteFillObject,
  },
  promptCard: {
    marginTop: "auto",
    marginBottom: "auto",
    marginHorizontal: 20,
    borderRadius: 12,
    backgroundColor: "#fff",
    padding: 20,
  },
  promptTitle: {
    fontSize: 20,
    fontWeight: "700",
    color: "#0f172a",
    marginBottom: 8,
  },
  promptDescription: {
    fontSize: 14,
    lineHeight: 20,
    color: "#475569",
    marginBottom: 16,
  },
  actionsRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    gap: 12,
  },
  secondaryButton: {
    flex: 1,
    height: 42,
    borderRadius: 12,
    alignItems: "center",
    justifyContent: "center",
  },
  secondaryButtonText: {
    fontWeight: "600",
  },
  primaryButton: {
    flex: 1,
    height: 42,
    borderRadius: 12,
    alignItems: "center",
    justifyContent: "center",
  },
  primaryButtonText: {
    fontWeight: "700",
  },
});
