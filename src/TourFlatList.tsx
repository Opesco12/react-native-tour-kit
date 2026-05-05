import React, { PropsWithChildren, useCallback, useEffect, useMemo, useRef } from "react";
import {
  FlatList,
  FlatListProps,
  LayoutRectangle,
  NativeScrollEvent,
  NativeSyntheticEvent,
  View,
} from "react-native";

import { TourStep } from "./types";
import { useTour } from "./useTour";

type TourFlatListProps<ItemT> = PropsWithChildren<
  FlatListProps<ItemT> & {
    id: string;
    revealSettleMs?: number;
    getTourTargetId?: (item: ItemT, index: number) => string;
  }
>;

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

const findIndexByTarget = <ItemT,>(
  step: TourStep,
  data: readonly ItemT[] | null | undefined,
  getTourTargetId?: (item: ItemT, index: number) => string,
) => {
  if (typeof step.scrollTargetIndex === "number") return step.scrollTargetIndex;
  if (!data || !getTourTargetId) return -1;
  return data.findIndex((item, index) => getTourTargetId(item, index) === step.target);
};

export const TourFlatList = <ItemT,>({
  id,
  revealSettleMs = 300,
  getTourTargetId,
  data,
  onScroll,
  onScrollToIndexFailed,
  scrollEventThrottle = 16,
  ...rest
}: TourFlatListProps<ItemT>) => {
  const { registerScrollContainer, unregisterScrollContainer } = useTour();
  const listRef = useRef<FlatList<ItemT>>(null);
  const containerRef = useRef<View>(null);
  const offsetYRef = useRef(0);
  const failedScrollInfoRef = useRef<{
    index: number;
    averageItemLength: number;
  } | null>(null);

  const stableData = useMemo<readonly ItemT[]>(() => {
    if (!data) return [];
    return Array.isArray(data) ? data : Array.from(data);
  }, [data]);

  const handleScroll = useCallback(
    (event: NativeSyntheticEvent<NativeScrollEvent>) => {
      offsetYRef.current = event.nativeEvent.contentOffset.y;
      onScroll?.(event);
    },
    [onScroll],
  );

  const handleScrollToIndexFailed = useCallback<NonNullable<FlatListProps<ItemT>["onScrollToIndexFailed"]>>(
    (info) => {
      failedScrollInfoRef.current = {
        index: info.index,
        averageItemLength: info.averageItemLength,
      };
      onScrollToIndexFailed?.(info);
    },
    [onScrollToIndexFailed],
  );

  useEffect(() => {
    registerScrollContainer(id, {
      revealTarget: async (step, targetRef, signal) => {
        const list = listRef.current;
        const container = containerRef.current;
        if (!list || !container) throw new Error("scroll_container_not_found");

        const index = findIndexByTarget(step, stableData, getTourTargetId);
        failedScrollInfoRef.current = null;
        if (index >= 0) {
          list.scrollToIndex({ index, animated: true, viewPosition: 0.5 });
        }
        await delay(revealSettleMs, signal);

        const failed = failedScrollInfoRef.current;
        if (failed && failed.index === index) {
          const fallbackOffset = Math.max(0, failed.averageItemLength * failed.index);
          list.scrollToOffset({ offset: fallbackOffset, animated: true });
          await delay(revealSettleMs, signal);
          list.scrollToIndex({ index: failed.index, animated: true, viewPosition: 0.5 });
          await delay(revealSettleMs, signal);
        }

        const targetNode = targetRef.current;
        if (!targetNode) return;
        const containerLayout = await measureInWindow(container);
        const targetLayout = await measureInWindow(targetNode);
        const currentOffsetY = offsetYRef.current;
        const targetTop = targetLayout.y - containerLayout.y + currentOffsetY;
        const targetBottom = targetTop + targetLayout.height;
        const visibleTop = currentOffsetY;
        const visibleBottom = currentOffsetY + containerLayout.height;

        let nextOffset = currentOffsetY;
        if (targetTop < visibleTop + 20) {
          nextOffset = Math.max(0, targetTop - 20);
        } else if (targetBottom > visibleBottom - 20) {
          nextOffset = Math.max(0, targetBottom - containerLayout.height + 20);
        }

        if (Math.abs(nextOffset - currentOffsetY) > 1) {
          list.scrollToOffset({ offset: nextOffset, animated: true });
          offsetYRef.current = nextOffset;
          await delay(revealSettleMs, signal);
        }
      },
    });

    return () => unregisterScrollContainer(id);
  }, [
    getTourTargetId,
    id,
    registerScrollContainer,
    revealSettleMs,
    stableData,
    unregisterScrollContainer,
  ]);

  return (
    <View ref={containerRef} collapsable={false} style={{ flex: 1 }}>
      <FlatList
        ref={listRef}
        data={data}
        onScroll={handleScroll}
        onScrollToIndexFailed={handleScrollToIndexFailed}
        scrollEventThrottle={scrollEventThrottle}
        {...rest}
      />
    </View>
  );
};
