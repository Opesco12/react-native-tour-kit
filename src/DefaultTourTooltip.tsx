import React from "react";
import { Pressable, StyleSheet, Text, View } from "react-native";

import { TooltipPosition, TourButtonColors, TourStep } from "./types";

type DefaultTourTooltipProps = {
  step: TourStep;
  stepIndex: number;
  totalSteps: number;
  position: TooltipPosition;
  tooltipBackground: string;
  tooltipTextColor: string;
  buttonColors: Required<TourButtonColors>;
  onClose: () => void;
  onBack: () => void;
  onNext: () => void;
};

export const DefaultTourTooltip = ({
  step,
  stepIndex,
  totalSteps,
  position,
  tooltipBackground,
  tooltipTextColor,
  buttonColors,
  onClose,
  onBack,
  onNext,
}: DefaultTourTooltipProps) => {
  return (
    <View
      style={[
        styles.tooltip,
        {
          top: position.top,
          left: position.left,
          backgroundColor: tooltipBackground,
        },
      ]}
    >
      <Pressable
        onPress={onClose}
        style={styles.closeButton}
        hitSlop={8}
      >
        <Text style={[styles.closeButtonText, { color: tooltipTextColor }]}>
          ×
        </Text>
      </Pressable>

      <Text
        style={[styles.stepCounter, { color: tooltipTextColor, opacity: 0.7 }]}
      >
        Step {stepIndex + 1} of {totalSteps}
      </Text>

      <Text style={[styles.tooltipTitle, { color: tooltipTextColor }]}>
        {step.title}
      </Text>

      {step.description ? (
        <Text
          style={[
            styles.tooltipDescription,
            { color: tooltipTextColor, opacity: 0.85 },
          ]}
        >
          {step.description}
        </Text>
      ) : null}

      <View style={styles.actionsRow}>
        <Pressable
          onPress={onBack}
          disabled={stepIndex === 0}
          style={[
            styles.secondaryButton,
            { backgroundColor: buttonColors.secondaryBackground },
            stepIndex === 0 && styles.disabledButton,
          ]}
        >
          <Text
            style={[
              styles.secondaryButtonText,
              { color: buttonColors.secondaryText },
            ]}
          >
            Back
          </Text>
        </Pressable>

        <Pressable
          onPress={onNext}
          style={[
            styles.primaryButton,
            { backgroundColor: buttonColors.primaryBackground },
          ]}
        >
          <Text
            style={[
              styles.primaryButtonText,
              { color: buttonColors.primaryText },
            ]}
          >
            {stepIndex === totalSteps - 1 ? "Done" : "Next"}
          </Text>
        </Pressable>
      </View>
    </View>
  );
};

const styles = StyleSheet.create({
  tooltip: {
    position: "absolute",
    width: 280,
    minHeight: 140,
    borderRadius: 12,
    padding: 16,
  },
  closeButton: {
    position: "absolute",
    top: 8,
    right: 8,
    width: 28,
    height: 28,
    borderRadius: 14,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "#e2e8f0",
  },
  closeButtonText: {
    fontSize: 16,
    lineHeight: 20,
    fontWeight: "700",
  },
  stepCounter: {
    fontSize: 10,
    marginBottom: 8,
    paddingRight: 32,
  },
  tooltipTitle: {
    fontSize: 14,
    fontWeight: "700",
    marginBottom: 8,
  },
  tooltipDescription: {
    fontSize: 12,
    lineHeight: 20,
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
    fontSize: 12,
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
    fontSize: 12,
  },
  disabledButton: {
    opacity: 0.4,
  },
});
