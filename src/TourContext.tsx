import React, {
  createContext,
  ReactNode,
  RefObject,
  useCallback,
  useMemo,
  useRef,
  useState,
} from "react";
import { LayoutRectangle, Platform, Pressable, StatusBar, StyleSheet, View } from "react-native";
import Svg, { Path } from "react-native-svg";

import {
  DEFAULT_OVERLAY_OPACITY,
  DEFAULT_SPOTLIGHT_PADDING,
  DEFAULT_SPOTLIGHT_RADIUS,
  DEFAULT_TOOLTIP_BACKGROUND,
  DEFAULT_TOOLTIP_TEXT_COLOR,
} from "./constants";
import { DefaultTourTooltip } from "./DefaultTourTooltip";
import { buildSpotlightPath, getScreenSize, getTooltipPosition } from "./geometry";
import { TourPrompt } from "./TourPrompt";
import {
  NavigationAdapter,
  RouteChangeContext,
  ScrollContainerHandle,
  SpotlightShape,
  TourButtonColors,
  TourController,
  TourControllerState,
  TourDirection,
  TourEngineConfig,
  TourFailureContext,
  TourFailureReason,
  TourFailureStrategy,
  TourLifecycle,
  TourPromptConfig,
  TourRegistry,
  TourRouteRef,
  TourStorageAdapter,
  TourStartOptions,
  TourStep,
  TourTooltipRenderProps,
  TourTooltipRenderer,
  WaitForConfig,
} from "./types";

type RegisteredTarget = {
  ref: RefObject<View | null>;
};

type TourContextValue = TourController & {
  registerTarget: (id: string, ref: RefObject<View | null>) => void;
  unregisterTarget: (id: string) => void;
  registerScrollContainer: (id: string, handle: ScrollContainerHandle) => void;
  unregisterScrollContainer: (id: string) => void;
};

export const TourContext = createContext<TourContextValue | null>(null);

type TourProviderProps = {
  children: ReactNode;
  tours?: TourRegistry;
  storage?: TourStorageAdapter;
  prompt?: TourPromptConfig;
  renderTooltip?: TourTooltipRenderer;
  buttonColors?: TourButtonColors;
  spotlightShape?: SpotlightShape;
  spotlightBorderRadius?: number;
  spotlightPadding?: number;
  overlayOpacity?: number;
  overlayColor?: string;
  closeOnOverlayPress?: boolean;
  tooltipBackground?: string;
  tooltipTextColor?: string;
  onStart?: TourLifecycle["onStart"];
  onStepChange?: TourLifecycle["onStepChange"];
  onFinish?: TourLifecycle["onFinish"];
  onSkip?: TourLifecycle["onSkip"];
  onStop?: TourLifecycle["onStop"];
  lifecycle?: TourLifecycle;
  navigation?: NavigationAdapter;
  engine?: TourEngineConfig;
};

const DEFAULT_BUTTON_COLORS: Required<TourButtonColors> = {
  primaryBackground: "#2563eb",
  primaryText: "#fff",
  secondaryBackground: "#e2e8f0",
  secondaryText: "#0f172a",
};

const DEFAULT_WAIT: Required<Pick<WaitForConfig, "timeoutMs" | "pollIntervalMs">> = {
  timeoutMs: 10_000,
  pollIntervalMs: 50,
};

const measureTarget = (ref: RefObject<View | null>) => {
  return new Promise<LayoutRectangle>((resolve, reject) => {
    if (!ref.current) {
      reject(new Error("Target ref not found"));
      return;
    }

    ref.current.measureInWindow((x, y, width, height) => {
      const androidStatusBarOffset =
        Platform.OS === "android" ? (StatusBar.currentHeight ?? 0) : 0;

      resolve({
        x,
        y: y + androidStatusBarOffset,
        width,
        height,
      });
    });
  });
};

const sleep = (ms: number, signal?: AbortSignal) => {
  if (ms <= 0) return Promise.resolve();

  return new Promise<void>((resolve, reject) => {
    const timer = setTimeout(() => {
      signal?.removeEventListener("abort", onAbort);
      resolve();
    }, ms);

    const onAbort = () => {
      clearTimeout(timer);
      reject(new Error("aborted"));
    };

    if (signal) {
      if (signal.aborted) {
        clearTimeout(timer);
        reject(new Error("aborted"));
        return;
      }
      signal.addEventListener("abort", onAbort, { once: true });
    }
  });
};

const routeKey = (route: TourRouteRef | null | undefined) => {
  if (!route) return "";
  if (typeof route === "string") return route;

  const params = route.params ?? {};
  const sorted = Object.keys(params)
    .sort()
    .reduce<Record<string, string | number | boolean | null | undefined>>((acc, key) => {
      acc[key] = params[key];
      return acc;
    }, {});

  return `${route.pathname}:${JSON.stringify(sorted)}`;
};

const withTimeout = async <T,>(promise: Promise<T>, timeoutMs?: number, label = "timeout") => {
  if (!timeoutMs || timeoutMs <= 0) return promise;

  return await Promise.race<T>([
    promise,
    new Promise<T>((_, reject) => {
      setTimeout(() => reject(new Error(label)), timeoutMs);
    }),
  ]);
};

const buildStorageKey = (prefix: string, key: string, tourId: string) => {
  return `${prefix}:${key}:${tourId}`;
};

export const TourProvider = ({
  children,
  tours,
  storage,
  prompt,
  renderTooltip,
  buttonColors,
  spotlightShape = "rounded-rectangle",
  spotlightBorderRadius = DEFAULT_SPOTLIGHT_RADIUS,
  spotlightPadding = DEFAULT_SPOTLIGHT_PADDING,
  overlayOpacity = DEFAULT_OVERLAY_OPACITY,
  overlayColor,
  closeOnOverlayPress = false,
  tooltipBackground = DEFAULT_TOOLTIP_BACKGROUND,
  tooltipTextColor = DEFAULT_TOOLTIP_TEXT_COLOR,
  onStart,
  onStepChange,
  onFinish,
  onSkip,
  onStop,
  lifecycle,
  navigation,
  engine,
}: TourProviderProps) => {
  const { width: screenWidth, height: screenHeight } = getScreenSize();
  const targetsRef = useRef<Map<string, RegisteredTarget>>(new Map());
  const scrollContainersRef = useRef<Map<string, ScrollContainerHandle>>(new Map());

  const resolvedButtonColors = { ...DEFAULT_BUTTON_COLORS, ...buttonColors };
  const resolvedPrompt = prompt ?? {};
  const safeSpotlightPadding = Math.max(0, spotlightPadding);
  const clampedOverlayOpacity = Math.max(0, Math.min(overlayOpacity, 1));
  const resolvedOverlayColor = overlayColor ?? `rgba(0,0,0,${clampedOverlayOpacity})`;

  const lifecycleCallbacks: TourLifecycle = {
    onStart,
    onStepChange,
    onFinish,
    onSkip,
    onStop,
    ...lifecycle,
  };

  const [showPrompt, setShowPrompt] = useState(false);
  const [steps, setSteps] = useState<TourStep[]>([]);
  const [activeStepIndex, setActiveStepIndex] = useState<number | null>(null);
  const [targetLayout, setTargetLayout] = useState<LayoutRectangle | null>(null);

  const stepsRef = useRef<TourStep[]>([]);
  const toursRef = useRef<TourRegistry>(tours ?? {});
  const activeTourIdRef = useRef<string | null>(null);
  const activeStepIndexRef = useRef<number | null>(null);
  const pendingControllerRef = useRef<AbortController | null>(null);

  toursRef.current = tours ?? {};

  const resolveFailureStrategy = useCallback(
    (ctx: TourFailureContext): TourFailureStrategy => {
      if (!engine?.onFailure) return "stop";
      return typeof engine.onFailure === "function" ? engine.onFailure(ctx) : engine.onFailure;
    },
    [engine?.onFailure],
  );

  const stopTour = useCallback(
    (reason: "stop" | "skip" | "finish" | "internal" = "stop") => {
      const activeTourId = activeTourIdRef.current;
      pendingControllerRef.current?.abort();
      pendingControllerRef.current = null;

      if (reason === "finish") lifecycleCallbacks.onFinish?.();
      if (reason === "skip") lifecycleCallbacks.onSkip?.();
      if (reason === "stop") lifecycleCallbacks.onStop?.();

      if (storage?.keyPrefix && activeTourId) {
        const seenKey = buildStorageKey(storage.keyPrefix, "seen", activeTourId);
        const lastStepKey = buildStorageKey(storage.keyPrefix, "last-step-index", activeTourId);
        if (reason === "finish" || reason === "skip") {
          void Promise.resolve(storage.setItem(seenKey, "true")).catch(() => undefined);
          void Promise.resolve(storage.removeItem(lastStepKey)).catch(() => undefined);
        } else if (reason === "stop") {
          void Promise.resolve(storage.removeItem(lastStepKey)).catch(() => undefined);
        }
      }

      setActiveStepIndex(null);
      activeStepIndexRef.current = null;
      activeTourIdRef.current = null;
      setTargetLayout(null);
      setSteps([]);
      stepsRef.current = [];
      setShowPrompt(false);
    },
    [lifecycleCallbacks, storage],
  );

  const waitForTargetRegistration = useCallback(
    async (
      targetId: string,
      signal: AbortSignal,
      timeoutMs: number,
      pollIntervalMs: number,
    ): Promise<RegisteredTarget> => {
      const startedAt = Date.now();

      while (true) {
        if (signal.aborted) throw new Error("aborted");

        const target = targetsRef.current.get(targetId);
        if (target?.ref.current) return target;

        if (Date.now() - startedAt >= timeoutMs) {
          throw new Error("target_not_found");
        }

        await sleep(pollIntervalMs, signal);
      }
    },
    [],
  );

  const waitForReadiness = useCallback(
    async (step: TourStep, direction: TourDirection, signal: AbortSignal) => {
      const defaults = { ...DEFAULT_WAIT, ...(engine?.defaultReadiness ?? {}) };
      const readiness = { ...defaults, ...(step.readiness ?? {}) };
      const timeoutMs = readiness.timeoutMs;
      const pollIntervalMs = readiness.pollIntervalMs;

      lifecycleCallbacks.onWaitingForReadiness?.(step);

      if (readiness.delayMs && readiness.delayMs > 0) {
        await sleep(readiness.delayMs, signal);
      }

      if (readiness.isReady) {
        const startedAt = Date.now();

        while (!readiness.isReady()) {
          if (signal.aborted) throw new Error("aborted");
          if (Date.now() - startedAt >= timeoutMs) {
            throw new Error("readiness_timeout");
          }
          await sleep(pollIntervalMs, signal);
        }
      }

      if (readiness.waitFor) {
        await withTimeout(
          readiness.waitFor({
            stepId: step.id ?? step.target,
            direction,
            signal,
          }),
          timeoutMs,
          "readiness_timeout",
        );
      }
    },
    [engine?.defaultReadiness, lifecycleCallbacks],
  );

  const maybeNavigateToStepRoute = useCallback(
    async (step: TourStep, direction: TourDirection, signal: AbortSignal) => {
      if (!navigation || !step.route) return;

      const current = navigation.getCurrentRoute();
      if (routeKey(current) === routeKey(step.route)) return;

      const routeCtx: RouteChangeContext = {
        from: current,
        to: step.route,
        direction,
        step,
      };

      lifecycleCallbacks.onBeforeRouteChange?.(routeCtx);

      try {
        if (
          direction === "back" &&
          step.navigationMode === "back" &&
          step.allowBackNavigation !== false &&
          navigation.back
        ) {
          await navigation.back();
        } else {
          await navigation.navigate({
            to: step.route,
            mode: step.navigationMode,
          });
        }

        await navigation.waitForRoute(step.route, signal);
      } catch (error) {
        throw new Error(`route_navigation_failed:${String(error)}`);
      }

      lifecycleCallbacks.onAfterRouteChange?.(routeCtx);
    },
    [lifecycleCallbacks, navigation],
  );

  const moveToStep = useCallback(
    async (index: number, direction: TourDirection, attempt = 0) => {
      const tourSteps = stepsRef.current;
      const step = tourSteps[index];
      if (!step) {
        stopTour("internal");
        return;
      }

      pendingControllerRef.current?.abort();
      const controller = new AbortController();
      pendingControllerRef.current = controller;

      setActiveStepIndex(null);
      setTargetLayout(null);

      const defaults = { ...DEFAULT_WAIT, ...(engine?.defaultReadiness ?? {}) };

      try {
        await maybeNavigateToStepRoute(step, direction, controller.signal);
        await waitForReadiness(step, direction, controller.signal);

        const target = await waitForTargetRegistration(
          step.target,
          controller.signal,
          (step.readiness?.timeoutMs ?? defaults.timeoutMs) ?? DEFAULT_WAIT.timeoutMs,
          (step.readiness?.pollIntervalMs ?? defaults.pollIntervalMs) ??
            DEFAULT_WAIT.pollIntervalMs,
        );

        if (step.scrollToTarget) {
          const containerId = step.scrollContainerId;
          if (!containerId) {
            throw new Error("scroll_container_not_found");
          }

          const container = scrollContainersRef.current.get(containerId);
          if (!container) {
            throw new Error("scroll_container_not_found");
          }

          await container.revealTarget(step, target.ref, controller.signal);
          await sleep(120, controller.signal);
        }

        const layout = await measureTarget(target.ref);

        if (controller.signal.aborted) throw new Error("aborted");

        setTargetLayout(layout);
        setActiveStepIndex(index);
        activeStepIndexRef.current = index;
        const activeTourId = activeTourIdRef.current;
        if (storage?.keyPrefix && activeTourId) {
          const lastStepKey = buildStorageKey(storage.keyPrefix, "last-step-index", activeTourId);
          void Promise.resolve(storage.setItem(lastStepKey, String(index))).catch(() => undefined);
        }
        lifecycleCallbacks.onStepChange?.(step, index);
      } catch (error) {
        if (controller.signal.aborted) return;

        const message = error instanceof Error ? error.message : String(error);
        let reason: TourFailureReason = "readiness_rejected";

        if (message.includes("target_not_found")) reason = "target_not_found";
        else if (message.includes("scroll_container_not_found"))
          reason = "scroll_container_not_found";
        else if (message.includes("route_navigation_failed")) reason = "route_navigation_failed";
        else if (message.includes("readiness_timeout")) reason = "readiness_timeout";
        else if (message.includes("aborted")) reason = "aborted";

        const failureContext: TourFailureContext = {
          step,
          direction,
          reason,
          error,
        };

        // Navigation + mount timing can be briefly inconsistent across screens.
        // Retry transient failures once before applying configured failure strategy.
        if (
          attempt < 1 &&
          (reason === "route_navigation_failed" || reason === "target_not_found")
        ) {
          await sleep(120);
          await moveToStep(index, direction, attempt + 1);
          return;
        }

        lifecycleCallbacks.onStepFailed?.(failureContext);
        const strategy = resolveFailureStrategy(failureContext);

        if (strategy === "retry" && attempt < 1) {
          await moveToStep(index, direction, attempt + 1);
          return;
        }

        if (strategy === "skip") {
          if (direction === "back") {
            const previousIndex = index - 1;
            if (previousIndex < 0) {
              stopTour("stop");
              return;
            }
            await moveToStep(previousIndex, "back");
            return;
          }

          const nextIndex = index + 1;
          if (nextIndex >= tourSteps.length) {
            stopTour("finish");
            return;
          }
          await moveToStep(nextIndex, "forward");
          return;
        }

        stopTour("internal");
      }
    },
    [
      engine?.defaultReadiness,
      lifecycleCallbacks,
      maybeNavigateToStepRoute,
      resolveFailureStrategy,
      storage,
      stopTour,
      waitForReadiness,
      waitForTargetRegistration,
    ],
  );

  const beginTour = useCallback(async () => {
    lifecycleCallbacks.onStart?.(stepsRef.current);
    setShowPrompt(false);
    await moveToStep(0, "forward");
  }, [lifecycleCallbacks, moveToStep]);

  const hasTour = useCallback((id: string) => {
    const tour = toursRef.current[id];
    return Array.isArray(tour) && tour.length > 0;
  }, []);

  const getTour = useCallback((id: string) => {
    const tour = toursRef.current[id];
    return Array.isArray(tour) ? tour : undefined;
  }, []);

  const startTour = useCallback((stepsOrTourId: TourStep[] | string, options?: TourStartOptions) => {
    const activeTourId = typeof stepsOrTourId === "string" ? stepsOrTourId : null;
    const newSteps =
      typeof stepsOrTourId === "string"
        ? getTour(stepsOrTourId)
        : stepsOrTourId;

    if (!newSteps?.length) return;

    activeTourIdRef.current = activeTourId;
    setSteps(newSteps);
    stepsRef.current = newSteps;
    setActiveStepIndex(null);
    activeStepIndexRef.current = null;
    setTargetLayout(null);

    if (options?.suppressPrompt) {
      setShowPrompt(false);
      const startIndex = options.startAtStepId
        ? Math.max(
            0,
            newSteps.findIndex((step) => (step.id ?? step.target) === options.startAtStepId),
          )
        : (options?.startAtIndex ?? 0);
      void moveToStep(startIndex, "forward");
      return;
    }

    if (resolvedPrompt.enabled === false) {
      setShowPrompt(false);
      void moveToStep(0, "forward");
      return;
    }

    setShowPrompt(true);
  }, [getTour, moveToStep, resolvedPrompt.enabled]);

  const nextStep = useCallback(async () => {
    const current = activeStepIndexRef.current;
    if (current === null) return;
    const nextIndex = current + 1;
    if (nextIndex >= stepsRef.current.length) {
      stopTour("finish");
      return;
    }
    await moveToStep(nextIndex, "forward");
  }, [moveToStep, stopTour]);

  const previousStep = useCallback(async () => {
    const current = activeStepIndexRef.current;
    if (current === null) return;
    const previousIndex = current - 1;
    if (previousIndex < 0) return;
    await moveToStep(previousIndex, "back");
  }, [moveToStep]);

  const goToStep = useCallback(
    async (idOrIndex: string | number) => {
      const index =
        typeof idOrIndex === "number"
          ? idOrIndex
          : stepsRef.current.findIndex((step) => (step.id ?? step.target) === idOrIndex);

      if (index < 0 || index >= stepsRef.current.length) return;

      const current = activeStepIndexRef.current;
      const direction: TourDirection = current !== null && index < current ? "back" : "forward";
      await moveToStep(index, direction);
    },
    [moveToStep],
  );

  const getState = useCallback((): TourControllerState => {
    const currentIndex = activeStepIndexRef.current;
    const currentStep =
      currentIndex !== null && stepsRef.current[currentIndex]
        ? stepsRef.current[currentIndex]
        : null;

    return {
      isRunning: currentIndex !== null || showPrompt,
      activeStepIndex: currentIndex,
      activeStep: currentStep,
    };
  }, [showPrompt]);

  const isTourSeen = useCallback(async (id: string) => {
    if (!storage?.keyPrefix) return false;
    try {
      const key = buildStorageKey(storage.keyPrefix, "seen", id);
      const value = await Promise.resolve(storage.getItem(key));
      return value === "true";
    } catch {
      return false;
    }
  }, [storage]);

  const markTourSeen = useCallback(async (id: string) => {
    if (!storage?.keyPrefix) return;
    const key = buildStorageKey(storage.keyPrefix, "seen", id);
    await Promise.resolve(storage.setItem(key, "true"));
  }, [storage]);

  const clearTourSeen = useCallback(async (id: string) => {
    if (!storage?.keyPrefix) return;
    const seenKey = buildStorageKey(storage.keyPrefix, "seen", id);
    const lastStepKey = buildStorageKey(storage.keyPrefix, "last-step-index", id);
    await Promise.resolve(storage.removeItem(seenKey));
    await Promise.resolve(storage.removeItem(lastStepKey));
  }, [storage]);

  const activeStep =
    activeStepIndex !== null && steps[activeStepIndex] ? steps[activeStepIndex] : null;

  const tooltipPosition =
    activeStep && targetLayout ? getTooltipPosition(targetLayout, activeStep.placement) : null;

  const spotlightTop = targetLayout !== null ? targetLayout.y - safeSpotlightPadding : 0;
  const spotlightLeft = targetLayout !== null ? targetLayout.x - safeSpotlightPadding : 0;
  const spotlightWidth =
    targetLayout !== null ? targetLayout.width + safeSpotlightPadding * 2 : 0;
  const spotlightHeight =
    targetLayout !== null ? targetLayout.height + safeSpotlightPadding * 2 : 0;

  const normalizedLeft = Math.max(0, spotlightLeft);
  const normalizedTop = Math.max(0, spotlightTop);
  const normalizedWidth = Math.max(0, spotlightWidth);
  const normalizedHeight = Math.max(0, spotlightHeight);

  const spotlightPath = buildSpotlightPath({
    shape: spotlightShape,
    left: normalizedLeft,
    top: normalizedTop,
    width: normalizedWidth,
    height: normalizedHeight,
    borderRadius: spotlightBorderRadius,
  });

  const overlayPath = `M 0 0 H ${screenWidth} V ${screenHeight} H 0 Z ${spotlightPath}`;
  const spotlightRight = normalizedLeft + normalizedWidth;
  const spotlightBottom = normalizedTop + normalizedHeight;

  const allowInteractionWithTarget = Boolean(activeStep?.allowInteractionWithTarget);
  const handleOverlayPress = () => {
    if (closeOnOverlayPress) stopTour("stop");
  };

  const tooltipRenderProps: TourTooltipRenderProps | null =
    activeStep && activeStepIndex !== null && tooltipPosition
      ? {
          step: activeStep,
          stepIndex: activeStepIndex,
          totalSteps: steps.length,
          isFirstStep: activeStepIndex === 0,
          isLastStep: activeStepIndex === steps.length - 1,
          position: tooltipPosition,
          next: nextStep,
          back: previousStep,
          stop: () => stopTour("stop"),
        }
      : null;

  const contextValue = useMemo(
    () => ({
      registerTarget: (id: string, ref: RefObject<View | null>) => {
        targetsRef.current.set(id, { ref });
      },
      unregisterTarget: (id: string) => {
        targetsRef.current.delete(id);
      },
      registerScrollContainer: (id: string, handle: ScrollContainerHandle) => {
        scrollContainersRef.current.set(id, handle);
      },
      unregisterScrollContainer: (id: string) => {
        scrollContainersRef.current.delete(id);
      },
      startTour,
      stopTour: () => stopTour("stop"),
      nextStep,
      previousStep,
      goToStep,
      hasTour,
      getTour,
      isTourSeen,
      markTourSeen,
      clearTourSeen,
      getState,
    }),
    [
      clearTourSeen,
      getState,
      getTour,
      goToStep,
      hasTour,
      isTourSeen,
      markTourSeen,
      nextStep,
      previousStep,
      startTour,
      stopTour,
    ],
  );

  return (
    <TourContext.Provider value={contextValue}>
      {children}

      {showPrompt && activeStepIndex === null && (
        <TourPrompt
          overlayColor={resolvedOverlayColor}
          buttonColors={resolvedButtonColors}
          prompt={resolvedPrompt}
          onSkip={() => stopTour("skip")}
          onStart={beginTour}
        />
      )}

      {activeStep && targetLayout && tooltipPosition && (
        <View style={StyleSheet.absoluteFill} pointerEvents="box-none">
          {allowInteractionWithTarget ? (
            <>
              <Pressable
                style={[styles.overlayTouchSegment, { top: 0, left: 0, right: 0, height: normalizedTop }]}
                onPress={handleOverlayPress}
              />
              <Pressable
                style={[styles.overlayTouchSegment, { top: spotlightBottom, left: 0, right: 0, bottom: 0 }]}
                onPress={handleOverlayPress}
              />
              <Pressable
                style={[
                  styles.overlayTouchSegment,
                  { top: normalizedTop, left: 0, width: normalizedLeft, height: normalizedHeight },
                ]}
                onPress={handleOverlayPress}
              />
              <Pressable
                style={[
                  styles.overlayTouchSegment,
                  { top: normalizedTop, left: spotlightRight, right: 0, height: normalizedHeight },
                ]}
                onPress={handleOverlayPress}
              />
            </>
          ) : (
            <Pressable style={StyleSheet.absoluteFill} onPress={handleOverlayPress} />
          )}

          <Svg pointerEvents="none" width={screenWidth} height={screenHeight} style={StyleSheet.absoluteFill}>
            <Path d={overlayPath} fill={resolvedOverlayColor} fillRule="evenodd" />
          </Svg>

          <Svg pointerEvents="none" width={screenWidth} height={screenHeight} style={StyleSheet.absoluteFill}>
            <Path d={spotlightPath} fill="none" stroke="#fff" strokeWidth={2} />
          </Svg>

          {renderTooltip && tooltipRenderProps ? (
            renderTooltip(tooltipRenderProps)
          ) : (
            <DefaultTourTooltip
              step={activeStep}
              stepIndex={activeStepIndex!}
              totalSteps={steps.length}
              position={tooltipPosition}
              tooltipBackground={tooltipBackground}
              tooltipTextColor={tooltipTextColor}
              buttonColors={resolvedButtonColors}
              onClose={() => stopTour("stop")}
              onBack={previousStep}
              onNext={nextStep}
            />
          )}
        </View>
      )}
    </TourContext.Provider>
  );
};

const styles = StyleSheet.create({
  overlayTouchSegment: {
    position: "absolute",
  },
});
