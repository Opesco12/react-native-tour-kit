import { ReactNode, RefObject } from "react";
import { LayoutRectangle, View } from "react-native";

export type Placement = "top" | "bottom" | "left" | "right" | "auto";
export type TourDirection = "forward" | "back";
export type NavigationMode = "push" | "replace" | "back";

export type TourRouteParams = Record<
  string,
  string | number | boolean | null | undefined
>;

export type TourRouteRef =
  | string
  | {
      pathname: string;
      params?: TourRouteParams;
    };

export type WaitForContext = {
  stepId: string;
  direction: TourDirection;
  signal: AbortSignal;
};

export type WaitForPredicate = () => boolean;
export type WaitForAsync = (ctx: WaitForContext) => Promise<void>;

export type WaitForConfig = {
  delayMs?: number;
  timeoutMs?: number;
  pollIntervalMs?: number;
  isReady?: WaitForPredicate;
  waitFor?: WaitForAsync;
};

export type TourStep = {
  id?: string;
  target: string;
  title: string;
  description?: string;
  placement?: Placement;
  allowInteractionWithTarget?: boolean;
  route?: TourRouteRef;
  navigationMode?: NavigationMode;
  allowBackNavigation?: boolean;
  readiness?: WaitForConfig;
  scrollToTarget?: boolean;
  scrollContainerId?: string;
  scrollTargetIndex?: number;
  scrollSectionIndex?: number;
  skippable?: boolean;
};

export type TourRegistry = Record<string, TourStep[]>;

export type TourStorageAdapter = {
  keyPrefix: string;
  getItem: (key: string) => string | null | Promise<string | null>;
  setItem: (key: string, value: string) => void | Promise<void>;
  removeItem: (key: string) => void | Promise<void>;
};

export type TourTargetHandle = {
  measureInWindow: (
    callback: (x: number, y: number, width: number, height: number) => void,
  ) => void;
};

export type TooltipPosition = {
  top: number;
  left: number;
  placement: Placement;
};

export type TargetLayout = LayoutRectangle;

export type TourTooltipRenderProps = {
  step: TourStep;
  stepIndex: number;
  totalSteps: number;
  isFirstStep: boolean;
  isLastStep: boolean;
  position: TooltipPosition;
  next: () => void;
  back: () => void;
  stop: () => void;
};

export type TourTooltipRenderer = (
  props: TourTooltipRenderProps,
) => ReactNode;

export type TourButtonColors = {
  primaryBackground?: string;
  primaryText?: string;
  secondaryBackground?: string;
  secondaryText?: string;
};

export type TourPromptConfig = {
  enabled?: boolean;
  title?: string;
  description?: string;
  startButtonText?: string;
  skipButtonText?: string;
};

export type TourLifecycle = {
  onStart?: (tour: TourStep[]) => void;
  onStepChange?: (step: TourStep, index: number) => void;
  onFinish?: () => void;
  onSkip?: () => void;
  onStop?: () => void;
  onBeforeRouteChange?: (ctx: RouteChangeContext) => void;
  onAfterRouteChange?: (ctx: RouteChangeContext) => void;
  onWaitingForReadiness?: (step: TourStep) => void;
  onStepFailed?: (ctx: TourFailureContext) => void;
};

export type SpotlightShape =
  | "rectangle"
  | "rounded-rectangle"
  | "circle"
  | "oval";

export type TourStartOptions = {
  startAtStepId?: string;
  startAtIndex?: number;
  suppressPrompt?: boolean;
};

export type TourFailureReason =
  | "target_not_found"
  | "scroll_container_not_found"
  | "route_navigation_failed"
  | "route_mismatch"
  | "readiness_timeout"
  | "readiness_rejected"
  | "aborted";

export type RegisteredTargetRef = RefObject<View | null>;

export type ScrollContainerHandle = {
  revealTarget: (
    step: TourStep,
    targetRef: RegisteredTargetRef,
    signal: AbortSignal,
  ) => Promise<void>;
};

export type TourFailureContext = {
  step: TourStep;
  direction: TourDirection;
  reason: TourFailureReason;
  error?: unknown;
};

export type RouteChangeContext = {
  from: TourRouteRef | null;
  to: TourRouteRef;
  direction: TourDirection;
  step: TourStep;
};

export type TourFailureStrategy = "stop" | "skip" | "retry";

export type TourEngineConfig = {
  defaultReadiness?: Required<
    Pick<WaitForConfig, "timeoutMs" | "pollIntervalMs">
  > &
    Omit<WaitForConfig, "timeoutMs" | "pollIntervalMs">;
  onFailure?:
    | TourFailureStrategy
    | ((ctx: TourFailureContext) => TourFailureStrategy);
};

export type NavigateArgs = {
  to: TourRouteRef;
  mode?: NavigationMode;
};

export type NavigationAdapter = {
  getCurrentRoute: () => TourRouteRef | null;
  navigate: (args: NavigateArgs) => void | Promise<void>;
  back?: () => void | Promise<void>;
  waitForRoute: (to: TourRouteRef, signal: AbortSignal) => Promise<void>;
};

export type ExpoRouterAdapterOptions = {
  waitForRouteTimeoutMs?: number;
  compare?: (
    current: TourRouteRef | null,
    target: TourRouteRef,
  ) => boolean;
};

export type TourControllerState = {
  isRunning: boolean;
  activeStepIndex: number | null;
  activeStep: TourStep | null;
};

export type TourController = {
  startTour: (stepsOrTourId: TourStep[] | string, options?: TourStartOptions) => void;
  stopTour: () => void;
  nextStep: () => Promise<void>;
  previousStep: () => Promise<void>;
  goToStep: (idOrIndex: string | number) => Promise<void>;
  hasTour: (id: string) => boolean;
  getTour: (id: string) => TourStep[] | undefined;
  isTourSeen: (id: string) => Promise<boolean>;
  markTourSeen: (id: string) => Promise<void>;
  clearTourSeen: (id: string) => Promise<void>;
  getState: () => TourControllerState;
};
