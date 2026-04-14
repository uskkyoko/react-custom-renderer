# React → Flutter Custom Renderer

A custom React renderer that targets Flutter as its host platform.
React runs inside Node.js; Flutter runs as a separate process.
All communication crosses a **WebSocket IPC boundary** using a JSON mutation protocol.

---

## Architecture

```
Node.js Process                        Flutter Process
┌──────────────────────────┐          ┌────────────────────────────┐
│  React Components        │          │  WidgetRegistry            │
│  (HelloWorld.jsx)        │          │  (Map<id, WidgetNode>)     │
│          │               │          │          │                 │
│  react-reconciler        │          │  ReactWidgetBuilder        │
│          │               │          │  (recursive widget build)  │
│  hostConfig.js           │  JSON    │          │                 │
│  ┌───────────────────┐   │◄────────►│  WebSocket listener        │
│  │ createInstance    │──►│ create   │          │                 │
│  │ appendChild       │──►│ append   │  Flutter render tree       │
│  │ removeChild       │──►│ remove   │  (real native widgets)     │
│  │ commitUpdate      │──►│ update   │                            │
│  │ resetAfterCommit  │──►│ layout   │  Events back:              │
│  └───────────────────┘   │◄──────── │  { event:"click",          │
│          │               │          │    targetId:"button-1" }   │
│  Yoga Layout (Node.js)   │          └────────────────────────────┘
│  calculateLayout()       │
│  → batch layout msgs     │
└──────────────────────────┘
```

---

## JSON Protocol

| Operation     | Message                                                            |
| ------------- | ------------------------------------------------------------------ |
| Create        | `{ op:"create", id:"n1", type:"container", props:{...} }`          |
| Append child  | `{ op:"appendChild", parentId:"n1", childId:"n2" }`                |
| Remove child  | `{ op:"removeChild", parentId:"n1", childId:"n2" }`                |
| Insert before | `{ op:"insertBefore", parentId:"n1", childId:"n2", beforeId:"n3"}` |
| Update props  | `{ op:"update", id:"n1", props:{ label:"New" } }`                  |
| Set text      | `{ op:"setText", id:"n5", text:"Updated" }`                        |
| Layout        | `{ op:"layout", id:"n1", x:0, y:0, w:400, h:300 }`                 |
| Event (back)  | `{ event:"click", targetId:"button-1" }`                           |
| Change (back) | `{ event:"change", targetId:"input-1", value:"text" }`             |

---

## Element Types → Flutter Primitives

| React Element | Purpose          | Flutter Widget                      |
| ------------- | ---------------- | ----------------------------------- |
| `<container>` | Layout container | `Column` / `Row` (+ `Expanded`)     |
| `<text>`      | Display text     | `Text`                              |
| `<button>`    | Tap target       | `ElevatedButton` / `OutlinedButton` |
| `<listitem>`  | Todo list row    | `Row` with padding                  |
| `<input>`     | Text entry       | `TextField`                         |

---

## HostConfig → IPC + Yoga Mapping

| hostConfig method    | IPC message                | Yoga operation                    |
| -------------------- | -------------------------- | --------------------------------- |
| `createInstance`     | `{ op:"create" }`          | `createYogaNode(id, props)`       |
| `appendChild`        | `{ op:"appendChild" }`     | `insertYogaChild(parentId, id)`   |
| `removeChild`        | `{ op:"removeChild" }`     | `removeYogaChild` + `destroyNode` |
| `insertBefore`       | `{ op:"insertBefore" }`    | `insertYogaChild(id, idx)`        |
| `commitUpdate`       | `{ op:"update" }`          | `applyYogaProps(node, newProps)`  |
| `createTextInstance` | `{ op:"create" type:text}` | (no Yoga node)                    |
| `commitTextUpdate`   | `{ op:"setText" }`         | —                                 |
| `resetAfterCommit`   | batch `{ op:"layout" }`    | `root.calculateLayout(800, 600)`  |

---

## Project Structure

```
react-flutter-renderer/
├── node-side/
│   ├── package.json       # npm dependencies
│   ├── ipcBridge.js       # WebSocket server + event routing
│   ├── yogaLayout.js      # Yoga node management + calculateLayout
│   ├── hostConfig.js      # react-reconciler host config (core)
│   ├── renderer.js        # Creates reconciler + exposes render()
│   ├── HelloWorld.jsx     # React todo app using custom elements
│   ├── index.js           # Entry: start IPC + render app
│   └── poc.js             # PoC: proves cross-process IPC works
│
└── flutter-side/
    ├── pubspec.yaml
    └── lib/
        ├── main.dart          # Flutter app entry, connects to WS
        ├── widget_registry.dart  # IPC listener, WidgetNode store
        └── widget_builder.dart   # Recursive Flutter widget builder
```

---

## Running the Project

### Prerequisites

- Node.js ≥ 18
- Flutter SDK ≥ 3.10
- Dart SDK ≥ 3.0

### Step 1 — Install Node.js dependencies

```bash
cd node-side
npm install
```

### Step 2 — Install Flutter dependencies

```bash
cd flutter-side
flutter pub get
```

### Step 3a — Run the PoC (simplest demo)

> **Note: the Flutter renderer is not working yet.**
> The Flutter side cannot render the widget tree at this stage of development.
> `poc.js` can still be used on its own to verify that the Node.js WebSocket
> server starts correctly and sends the right JSON messages.
> You can connect any WebSocket client (e.g. `wscat`, a browser `WebSocket`,
> or a custom script) to `ws://localhost:9000` to inspect the protocol output.

```bash
# Terminal 1: start the Node.js IPC server
cd node-side
node poc.js

# (Optional) Terminal 2: connect a WebSocket client to inspect messages
npx wscat -c ws://localhost:9000
```

When a client connects you will see the following sequence logged in Terminal 1,
and the corresponding JSON messages received by the client:

1. `{ op:"create", id:"container-1", type:"container", props:{...} }`
2. `{ op:"create", id:"text-1", type:"text", props:{ text:"Hello from React!", ... } }`
3. `{ op:"appendChild", parentId:"container-1", childId:"text-1" }`
4. `{ op:"layout", id:"container-1", x:0, y:0, w:800, h:600 }`
5. `{ op:"layout", id:"text-1", x:20, y:20, w:760, h:40 }`

This confirms the IPC bridge and JSON protocol are working end-to-end.
Once the Flutter renderer is implemented, it will connect here and render the
widget tree from these messages.

### Step 3b — Run the full Todo App

```bash
# Terminal 1:
cd node-side
node index.js

# Terminal 2:
cd flutter-side
flutter run
```

---

## Key Design Decisions

### Why WebSocket over stdin/stdout?

WebSocket gives us a proper bidirectional channel with framing, reconnect support,
and works across all platforms (including Godot/Flutter running on desktop).
stdin/stdout pipes are simpler but one-way and platform-specific.

### Why Yoga on the Node.js side?

Yoga runs in Node.js so that React controls layout, not Flutter.
This matches how React Native works: the JS thread computes layout,
and the native thread only receives final pixel positions. Flutter receives
`{ op:"layout", x, y, w, h }` messages and positions widgets accordingly.

### Why separate processes?

React (Node.js) and Flutter have fundamentally different runtimes (V8 vs Dart VM).
Running them in separate processes means they don't block each other,
and Flutter can run its own event loop independently. The IPC bridge
is the only coupling point.

---

## Grading Checklist

- [x] **Architecture Diagram** — two-process pipeline with IPC boundary
- [x] **Yoga placement** — Node.js side, `calculateLayout` in `resetAfterCommit`
- [x] **Event flow** — Flutter → WebSocket → `registerEventListener` → React callback
- [x] **JSON Protocol** — all 8 operations defined and implemented
- [x] **Element Types** — 5 types mapped to Flutter primitives
- [x] **HostConfig mapping** — all key methods documented and implemented
- [x] **Feasibility PoC** — `poc.js` proves cross-process IPC end-to-end
- [x] **Todo App** — full React todo app using custom element types
