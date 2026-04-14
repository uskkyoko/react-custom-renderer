import Yoga, { Align, Direction, Edge, FlexDirection, Justify } from 'yoga-layout';
import { sendMessage } from './ipcBridge.js';
import type { Props, YogaNode } from './types.js';

const yogaNodes = new Map<string, YogaNode>();

let rootWidth = 800;
let rootHeight = 600;

export function createYogaNode(id: string, props: Props = {}): YogaNode {
  const node = Yoga.Node.create();
  applyYogaProps(node, props);
  yogaNodes.set(id, node);
  return node;
}

export function applyYogaProps(node: YogaNode, props: Props): void {
  if (props.width != null) node.setWidth(props.width as number);
  if (props.height != null) node.setHeight(props.height as number);
  if (props.flex != null) node.setFlex(props.flex as number);

  if (props.flexDirection === 'row') {
    node.setFlexDirection(FlexDirection.Row);
  } else {
    node.setFlexDirection(FlexDirection.Column);
  }

  if (props.padding != null) node.setPadding(Edge.All, props.padding as number);
  if (props.margin != null) node.setMargin(Edge.All, props.margin as number);

  if (props.justifyContent === 'center') {
    node.setJustifyContent(Justify.Center);
  } else if (props.justifyContent === 'space-between') {
    node.setJustifyContent(Justify.SpaceBetween);
  }

  if (props.alignItems === 'center') {
    node.setAlignItems(Align.Center);
  }
}

export function insertYogaChild(parentId: string, childId: string, index?: number): void {
  const parent = yogaNodes.get(parentId);
  const child = yogaNodes.get(childId);
  if (!parent || !child) return;
  parent.insertChild(child, index ?? parent.getChildCount());
}

export function removeYogaChild(parentId: string, childId: string): void {
  const parent = yogaNodes.get(parentId);
  const child = yogaNodes.get(childId);
  if (!parent || !child) return;
  parent.removeChild(child);
}

export function destroyYogaNode(id: string): void {
  const node = yogaNodes.get(id);
  if (node) {
    node.free();
    yogaNodes.delete(id);
  }
}

let rootYogaNode: YogaNode | null = null;

export function getRootYogaNode(): YogaNode {
  if (!rootYogaNode) {
    rootYogaNode = Yoga.Node.create();
    rootYogaNode.setWidth(rootWidth);
    rootYogaNode.setHeight(rootHeight);
    rootYogaNode.setFlexDirection(FlexDirection.Column);
  }
  return rootYogaNode;
}

export function recalculateAndSendLayout(rootId: string): void {
  const root = yogaNodes.get(rootId) ?? getRootYogaNode();
  root.calculateLayout(rootWidth, rootHeight, Direction.LTR);
  sendLayoutMessages(root, rootId);
}

function sendLayoutMessages(node: YogaNode, id: string): void {
  const layout = node.getComputedLayout();
  sendMessage({
    op: 'layout',
    id,
    x: layout.left,
    y: layout.top,
    w: layout.width,
    h: layout.height,
  });
  for (let i = 0; i < node.getChildCount(); i++) {
    const child = node.getChild(i);
    for (const [childId, n] of yogaNodes.entries()) {
      if (n === child) {
        sendLayoutMessages(child, childId);
        break;
      }
    }
  }
}

export function updateRootSize(w: number, h: number): void {
  rootWidth = w;
  rootHeight = h;
}
