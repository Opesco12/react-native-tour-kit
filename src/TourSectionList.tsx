import React, { PropsWithChildren, useCallback, useEffect, useMemo, useRef } from "react";
import {
  LayoutRectangle,
  NativeScrollEvent,
  NativeSyntheticEvent,
  SectionList,
  SectionListData,
  SectionListProps,
  View,
} from "react-native";

import { TourStep } from "./types";
import { useTour } from "./useTour";

type TourSectionListProps<ItemT, SectionT = DefaultSectionT> = PropsWithChildren<
  SectionListProps<ItemT, SectionT> & {
    id: string;
    revealSettleMs?: number;
    getTourTargetId?: (
      item: ItemT,
      itemIndex: number,
      section: SectionListData<ItemT, SectionT>,
      sectionIndex: number,
    ) => string;
  }
>;

type DefaultSectionT = {
  title?: string;
};

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

const findLocationByTarget = <ItemT, SectionT>(
  step: TourStep,
  sections: readonly SectionListData<ItemT, SectionT>[] | null | undefined,
  getTourTargetId?: (
    item: ItemT,
    itemIndex: number,
    section: SectionListData<ItemT, SectionT>,
    sectionIndex: number,
  ) => string,
) => {
  if (
    typeof step.scrollSectionIndex === "number" &&
    typeof step.scrollTargetIndex === "number"
  ) {
    return { sectionIndex: step.scrollSectionIndex, itemIndex: step.scrollTargetIndex };
  }

  if (!sections || !getTourTargetId) return null;

  for (let s = 0; s < sections.length; s += 1) {
    const section = sections[s];
    for (let i = 0; i < section.data.length; i += 1) {
      if (getTourTargetId(section.data[i], i, section, s) === step.target) {
        return { sectionIndex: s, itemIndex: i };
      }
    }
  }

  return null;
};

export const TourSectionList = <ItemT, SectionT = DefaultSectionT>({
  id,
  revealSettleMs = 300,
  getTourTargetId,
  sections,
  onScroll,
  onScrollToIndexFailed,
  scrollEventThrottle = 16,
  ...rest
}: TourSectionListProps<ItemT, SectionT>) => {
  const { registerScrollContainer, unregisterScrollContainer } = useTour();
  const listRef = useRef<SectionList<ItemT, SectionT>>(null);
  const containerRef = useRef<View>(null);
  const offsetYRef = useRef(0);
  const failedScrollInfoRef = useRef<{
    index: number;
    averageItemLength: number;
  } | null>(null);

  const stableSections = useMemo(() => sections ?? [], [sections]);

  const handleScroll = useCallback(
    (event: NativeSyntheticEvent<NativeScrollEvent>) => {
      offsetYRef.current = event.nativeEvent.contentOffset.y;
      onScroll?.(event);
    },
    [onScroll],
  );

  const handleScrollToIndexFailed = useCallback<NonNullable<SectionListProps<ItemT, SectionT>["onScrollToIndexFailed"]>>(
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
      revealTarget: async (step, _targetRef, signal) => {
        const list = listRef.current;
        const container = containerRef.current;
        if (!list || !container) throw new Error("scroll_container_not_found");

        const location = findLocationByTarget(step, stableSections, getTourTargetId);
        if (!location) return;

        failedScrollInfoRef.current = null;
        list.scrollToLocation({
          sectionIndex: location.sectionIndex,
          itemIndex: location.itemIndex,
          animated: true,
          viewPosition: 0.5,
        });

        await delay(revealSettleMs, signal);

        const failed = failedScrollInfoRef.current;
        if (failed) {
          const fallbackOffset = Math.max(0, failed.averageItemLength * failed.index);
          (list as unknown as { scrollToOffset: (args: { offset: number; animated: boolean }) => void })
            .scrollToOffset({ offset: fallbackOffset, animated: true });
          await delay(revealSettleMs, signal);
          list.scrollToLocation({
            sectionIndex: location.sectionIndex,
            itemIndex: location.itemIndex,
            animated: true,
            viewPosition: 0.5,
          });
          await delay(revealSettleMs, signal);
        }

        const targetNode = _targetRef.current;
        if (!targetNode) return;
        const containerLayout = await measureInWindow(container);
        const targetLayout = await measureInWindow(targetNode);
        const currentOffsetY = offsetYRef.current;
        const targetTop = targetLayout.y - containerLayout.y + currentOffsetY;
        const targetBottom = targetTop + targetLayout.height;
        const visibleTop = currentOffsetY;
        const visibleBottom = currentOffsetY + containerLayout.height;

        let needsCorrection = false;
        if (targetTop < visibleTop + 20 || targetBottom > visibleBottom - 20) {
          needsCorrection = true;
        }

        if (needsCorrection) {
          list.scrollToLocation({
            sectionIndex: location.sectionIndex,
            itemIndex: location.itemIndex,
            animated: true,
            viewPosition: 0.5,
          });
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
    stableSections,
    unregisterScrollContainer,
  ]);

  return (
    <View ref={containerRef} collapsable={false} style={{ flex: 1 }}>
      <SectionList
        ref={listRef}
        sections={sections}
        onScroll={handleScroll}
        onScrollToIndexFailed={handleScrollToIndexFailed}
        scrollEventThrottle={scrollEventThrottle}
        {...rest}
      />
    </View>
  );
};
