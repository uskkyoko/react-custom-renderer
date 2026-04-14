import Yoga from "yoga-layout";

// ── Basic aliases
export type Type = string;
export type Props = Record<string, unknown>;
export type YogaNode = ReturnType<typeof Yoga.Node.create>;

// ── Element tree nodes

export interface Instance {
  id: string;
  type: string;
  props: Props;
  children: (Instance | TextInstance)[];
  yogaNode: YogaNode;
  isTextNode?: false;
}

export interface TextInstance {
  id: string;
  text: string;
  isTextNode: true;
}

export interface Container {
  id: string;
  type: string;
  children: Instance[];
}

// ── JSON protocol messages (Node.js → Flutter)
export type ProtocolMessage =
  | { op: "create"; id: string; type: string; props: Props }
  | { op: "update"; id: string; props: Props }
  | { op: "delete"; id: string }
  | { op: "appendChild"; parentId: string; childId: string }
  | { op: "removeChild"; parentId: string; childId: string }
  | { op: "insertBefore"; parentId: string; childId: string; beforeId: string }
  | { op: "setText"; id: string; text: string }
  | { op: "layout"; id: string; x: number; y: number; w: number; h: number };

// ── Event messages (Flutter → Node.js)
export interface IncomingEvent {
  event: string;
  targetId: string;
  value?: string;
}
