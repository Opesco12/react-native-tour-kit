import { TourRegistry } from "./types";

export const defineTours = <T extends TourRegistry>(tours: T) => tours;
