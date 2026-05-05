import React, {
  PropsWithChildren,
  useCallback,
  useEffect,
  useRef,
} from "react";
import {
  LayoutRectangle,
  NativeScrollEvent,
  NativeSyntheticEvent,
  ScrollView,
  ScrollViewProps,
  View,
} from "react-native";

import { useTour } from "./useTour";

type TourScrollViewProps = PropsWithChildren<
  ScrollViewProps & {
    id: string;
    revealPadding?: number;
    revealSettleMs?: number;
  }
>;

const measureInWindow = (node: {
  measureInWindow: (
    callback: (x: number, y: number, width: number, height: number) => void,
  ) => void;
}) =>
  new Promise<LayoutRectangle>((resolve) => {
    node.measureInWindow((x, y, width, height) => {
      resolve({ x, y, width, height });
    });
  });

const delay = (ms: number, signal: AbortSignal) => {
  if (ms <= 0) return Promise.resolve();

  return new Promise<void>((resolve, reject) => {
    const timer = setTimeout(() => {
      signal.removeEventListener("abort", onAbort);
      resolve();
    }, ms);

    const onAbort = () => {
      clearTimeout(timer);
      reject(new Error("aborted"));
    };

    if (signal.aborted) {
      clearTimeout(timer);
      reject(new Error("aborted"));
      return;
    }

    signal.addEventListener("abort", onAbort, { once: true });
  });
};

export const TourScrollView = ({
  id,
  children,
  revealPadding = 20,
  revealSettleMs = 300,
  onScroll,
  scrollEventThrottle = 16,
  ...rest
}: TourScrollViewProps) => {
  const { registerScrollContainer, unregisterScrollContainer } = useTour();
  const scrollRef = useRef<ScrollView>(null);
  const containerRef = useRef<View>(null);
  const offsetYRef = useRef(0);

  const handleScroll = useCallback(
    (event: NativeSyntheticEvent<NativeScrollEvent>) => {
      offsetYRef.current = event.nativeEvent.contentOffset.y;
      onScroll?.(event);
    },
    [onScroll],
  );

  useEffect(() => {
    registerScrollContainer(id, {
      revealTarget: async (_step, targetRef, signal) => {
        const scrollNode = scrollRef.current;
        const containerNode = containerRef.current;
        const targetNode = targetRef.current;
        if (!scrollNode || !containerNode || !targetNode) {
          throw new Error("scroll_container_not_found");
        }

        const containerLayout = await measureInWindow(containerNode);
        const targetLayout = await measureInWindow(targetNode);

        const currentOffsetY = offsetYRef.current;
        const targetTop = targetLayout.y - containerLayout.y + currentOffsetY;
        const targetBottom = targetTop + targetLayout.height;
        const visibleTop = currentOffsetY;
        const visibleBottom = currentOffsetY + containerLayout.height;

        let nextOffset = currentOffsetY;

        if (targetTop < visibleTop + revealPadding) {
          nextOffset = Math.max(0, targetTop - revealPadding);
        } else if (targetBottom > visibleBottom - revealPadding) {
          nextOffset = Math.max(
            0,
            targetBottom - containerLayout.height + revealPadding,
          );
        }

        if (Math.abs(nextOffset - currentOffsetY) < 1) return;

        scrollNode.scrollTo({ y: nextOffset, animated: true });
        offsetYRef.current = nextOffset;

        await delay(revealSettleMs, signal);
      },
    });

    return () => {
      unregisterScrollContainer(id);
    };
  }, [
    id,
    registerScrollContainer,
    revealPadding,
    revealSettleMs,
    unregisterScrollContainer,
  ]);

  return (
    <View
      ref={containerRef}
      collapsable={false}
      style={{ flex: 1 }}
    >
      <ScrollView
        ref={scrollRef}
        scrollEventThrottle={scrollEventThrottle}
        onScroll={handleScroll}
        {...rest}
      >
        {children}
      </ScrollView>
    </View>
  );
};
