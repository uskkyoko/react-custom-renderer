// Lifecycle → IPC + Yoga mapping:
//  createInstance      → { op:"create" }        + createYogaNode()
//  appendInitialChild  → { op:"appendChild" }   + insertYogaChild()   (initial render)
//  appendChild         → { op:"appendChild" }   + insertYogaChild()   (updates)
//  removeChild         → { op:"removeChild" }   + removeYogaChild()
//  commitUpdate        → { op:"update" }        + applyYogaProps() if layout props changed
//  createTextInstance  → { op:"create", type:"text" }
//  commitTextUpdate    → { op:"setText" }
//  resetAfterCommit    → batch { op:"layout" }  + recalculateAndSendLayout()

import {
  sendMessage,
  registerEventListener,
  removeEventListeners,
} from './ipcBridge.js';
import {
  createYogaNode,
  applyYogaProps,
  insertYogaChild,
  removeYogaChild,
  destroyYogaNode,
  recalculateAndSendLayout,
  getRootYogaNode,
} from './yogaLayout.js';
import type { Instance, TextInstance, Container, Props } from './types.js';

let idCounter = 0;
const ROOT_ID = 'root';

function generateId(type: string): string {
  return `${type}-${++idCounter}`;
}

/** Strip children and function props before sending over IPC — functions can't be serialized. */
function sanitizeProps(props: Props): Props {
  const out: Props = {};
  for (const [k, v] of Object.entries(props)) {
    if (k === 'children') continue;
    if (typeof v === 'function') continue;
    out[k] = v;
  }
  return out;
}

const hostConfig = {
  isPrimaryRenderer: true,
  supportsMutation: true,
  supportsPersistence: false,
  supportsHydration: false,

  scheduleTimeout: setTimeout,
  cancelTimeout: clearTimeout,
  noTimeout: -1,
  getCurrentEventPriority: () => 0,
  getInstanceFromNode: () => null,
  beforeActiveInstanceBlur: () => {},
  afterActiveInstanceBlur: () => {},
  prepareScopeUpdate: () => {},
  getInstanceFromScope: () => null,

  // ── Context ──────────────────────────────────────────────────────────────
  createContainer(containerInfo: Container): Container {
    return containerInfo;
  },

  getRootHostContext(): object {
    return {};
  },

  getChildHostContext(parentHostContext: object): object {
    return parentHostContext;
  },

  // ── Creation ─────────────────────────────────────────────────────────────
  createInstance(type: string, props: Props): Instance {
    const id = generateId(type);

    // Store callbacks locally — functions can't cross the IPC boundary
    if (typeof props.onClick === 'function') {
      const onClick = props.onClick as (e: unknown) => void;
      registerEventListener(id, (event) => {
        if (event.event === 'click') onClick(event);
      });
    }

    sendMessage({ op: 'create', id, type, props: sanitizeProps(props) });

    return {
      id,
      type,
      props: { ...props },
      children: [],
      yogaNode: createYogaNode(id, props),
    };
  },

  createTextInstance(text: string): TextInstance {
    const id = generateId('text');
    sendMessage({ op: 'create', id, type: 'text', props: { text } });
    return { id, text, isTextNode: true };
  },

  // ── Tree operations ───────────────────────────────────────────────────────

  /** Called during initial render (render phase) to build subtrees bottom-up. */
  appendInitialChild(parent: Instance, child: Instance | TextInstance): void {
    parent.children.push(child);
    sendMessage({ op: 'appendChild', parentId: parent.id, childId: child.id });
    if (!child.isTextNode) {
      insertYogaChild(parent.id, child.id);
    }
  },

  /** Called during commit phase when new children are added due to state changes. */
  appendChild(parent: Instance, child: Instance | TextInstance): void {
    parent.children.push(child);
    sendMessage({ op: 'appendChild', parentId: parent.id, childId: child.id });
    if (!child.isTextNode) {
      insertYogaChild(parent.id, child.id);
    }
  },

  /** Attaches a root-level child to the container (very top of the tree). */
  appendChildToContainer(container: Container, child: Instance | TextInstance): void {
    sendMessage({ op: 'appendChild', parentId: ROOT_ID, childId: child.id });
    const root = getRootYogaNode();
    if (!child.isTextNode) {
      root.insertChild(child.yogaNode, root.getChildCount());
    }
  },

  insertBefore(
    parent: Instance,
    child: Instance | TextInstance,
    beforeChild: Instance | TextInstance,
  ): void {
    const idx = parent.children.indexOf(beforeChild);
    parent.children.splice(idx, 0, child);
    sendMessage({
      op: 'insertBefore',
      parentId: parent.id,
      childId: child.id,
      beforeId: beforeChild.id,
    });
    if (!child.isTextNode) {
      insertYogaChild(parent.id, child.id, idx);
    }
  },

  insertInContainerBefore(
    _container: Container,
    child: Instance | TextInstance,
    beforeChild: Instance | TextInstance,
  ): void {
    sendMessage({
      op: 'insertBefore',
      parentId: ROOT_ID,
      childId: child.id,
      beforeId: beforeChild.id,
    });
  },

  removeChild(parent: Instance, child: Instance | TextInstance): void {
    parent.children = parent.children.filter((c) => c !== child);
    sendMessage({ op: 'removeChild', parentId: parent.id, childId: child.id });
    if (!child.isTextNode) {
      removeYogaChild(parent.id, child.id);
      destroyYogaNode(child.id);
    }
    removeEventListeners(child.id);
  },

  removeChildFromContainer(_container: Container, child: Instance | TextInstance): void {
    sendMessage({ op: 'removeChild', parentId: ROOT_ID, childId: child.id });
    if (!child.isTextNode) destroyYogaNode(child.id);
    removeEventListeners(child.id);
  },

  // ── Updates ───────────────────────────────────────────────────────────────

  /** Compute the diff between old and new props. Return null for no change, or the changed subset. */
  prepareUpdate(
    _instance: Instance,
    _type: string,
    oldProps: Props,
    newProps: Props,
  ): Props | null {
    const payload: Props = {};
    let hasChanges = false;
    for (const key of Object.keys(newProps)) {
      if (key === 'children') continue;
      if (oldProps[key] !== newProps[key]) {
        payload[key] = newProps[key];
        hasChanges = true;
      }
    }
    return hasChanges ? payload : null;
  },

  commitUpdate(
    instance: Instance,
    updatePayload: Props,
    _type: string,
    _oldProps: Props,
    newProps: Props,
  ): void {
    instance.props = { ...newProps };

    const wirePayload = sanitizeProps(updatePayload);
    if (Object.keys(wirePayload).length > 0) {
      sendMessage({ op: 'update', id: instance.id, props: wirePayload });
    }

    // Re-apply layout props to Yoga if any changed
    const layoutKeys = [
      'width', 'height', 'flex', 'flexDirection',
      'padding', 'margin', 'justifyContent', 'alignItems',
    ];
    if (layoutKeys.some((k) => k in updatePayload)) {
      applyYogaProps(instance.yogaNode, newProps);
    }

    // Re-register click handler if it changed
    if (updatePayload.onClick !== undefined) {
      removeEventListeners(instance.id);
      if (typeof newProps.onClick === 'function') {
        const onClick = newProps.onClick as (e: unknown) => void;
        registerEventListener(instance.id, (event) => {
          if (event.event === 'click') onClick(event);
        });
      }
    }
  },

  commitTextUpdate(textInstance: TextInstance, _oldText: string, newText: string): void {
    textInstance.text = newText;
    sendMessage({ op: 'setText', id: textInstance.id, text: newText });
  },

  // ── Commit lifecycle ──────────────────────────────────────────────────────

  prepareForCommit(): null {
    return null;
  },

  /** Called after React's commit phase. Run Yoga layout and send positions to Flutter. */
  resetAfterCommit(_containerInfo: Container): void {
    recalculateAndSendLayout(ROOT_ID);
  },

  // ── Required boilerplate ──────────────────────────────────────────────────
  finalizeInitialChildren(): boolean {
    return false;
  },
  shouldSetTextContent(): boolean {
    return false;
  },
  getPublicInstance(instance: Instance | TextInstance): Instance | TextInstance {
    return instance;
  },
  preparePortalMount(): void {},
  clearContainer(): void {},
  detachDeletedInstance(): void {},
};

export default hostConfig;
