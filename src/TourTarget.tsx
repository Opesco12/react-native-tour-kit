import React, { ReactNode, useEffect, useRef } from "react";
import { View } from "react-native";

import { useTour } from "./useTour";

type TourTargetProps = {
  id: string;
  children: ReactNode;
};

export const TourTarget = ({ id, children }: TourTargetProps) => {
  const ref = useRef<View>(null);
  const { registerTarget, unregisterTarget } = useTour();

  useEffect(() => {
    registerTarget(id, ref);

    return () => {
      unregisterTarget(id);
    };
  }, [id, registerTarget, unregisterTarget]);

  return (
    <View
      ref={ref}
      collapsable={false}
    >
      {children}
    </View>
  );
};
