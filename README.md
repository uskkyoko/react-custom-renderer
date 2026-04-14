# React → Flutter Custom Renderer

A custom React renderer that targets Flutter as its host platform.
React runs inside Node.js; Flutter runs as a separate process.
All communication crosses a **WebSocket IPC boundary** using a JSON mutation protocol.

The Node.js side is written in **TypeScript** and run with `tsx`.

---

## Architecture

```
Node.js Process                        Flutter Process
┌──────────────────────────┐          ┌────────────────────────────┐
│  React Components        │          │  WidgetRegistry            │
│  (HelloWorld.tsx)        │          │  (Map<id, WidgetNode>)     │
│          │               │          │          │                 │
│  react-reconciler        │          │  ReactWidgetBuilder        │
│          │               │          │  (recursive widget build)  │
│  hostConfig.ts           │  JSON    │          │                 │
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

All message shapes are typed as the `ProtocolMessage` union in `types.ts`.

---

## Element Types → Flutter Primitives

| React Element | Purpose          | Flutter Widget                      |
| ------------- | ---------------- | ----------------------------------- |
| `<container>` | Layout container | `Column` / `Row` (+ `Expanded`)     |
| `<text>`      | Display text     | `Text`                              |
| `<button>`    | Tap target       | `ElevatedButton` / `OutlinedButton` |
| `<listitem>`  | Todo list row    | `Row` with padding                  |
| `<input>`     | Text entry       | `TextField`                         |

These are declared as valid JSX in `custom-elements.d.ts`

---

## HostConfig → IPC + Yoga Mapping

| hostConfig method    | IPC message                  | Yoga operation                    |
| -------------------- | ---------------------------- | --------------------------------- |
| `createInstance`     | `{ op:"create" }`            | `createYogaNode(id, props)`       |
| `appendInitialChild` | `{ op:"appendChild" }`       | `insertYogaChild(parentId, id)`   |
| `appendChild`        | `{ op:"appendChild" }`       | `insertYogaChild(parentId, id)`   |
| `removeChild`        | `{ op:"removeChild" }`       | `removeYogaChild` + `destroyNode` |
| `insertBefore`       | `{ op:"insertBefore" }`      | `insertYogaChild(id, idx)`        |
| `commitUpdate`       | `{ op:"update" }`            | `applyYogaProps(node, newProps)`  |
| `createTextInstance` | `{ op:"create" type:"text"}` | (no Yoga node)                    |
| `commitTextUpdate`   | `{ op:"setText" }`           | —                                 |
| `resetAfterCommit`   | batch `{ op:"layout" }`      | `root.calculateLayout(800, 600)`  |

> `appendInitialChild` is called during the initial render (render phase).
> `appendChild` is called during updates (commit phase). Both do the same thing here.

### Callback handling over IPC

Functions cannot be serialized to JSON. `onClick` and `onChange` callbacks are
stored locally in `ipcBridge.ts` and replaced with `true` in the IPC message.
When Flutter fires an event back, `ipcBridge` looks up the stored callback by id
and calls it, triggering a React re-render.

---

## Project Structure

```
react-flutter-renderer/
├── node-side/
│   ├── package.json            # npm dependencies + scripts
│   ├── tsconfig.json           # TypeScript config (NodeNext, strict)
│   ├── types.ts                # Shared types: Instance, TextInstance,
│   │                           #   Container, ProtocolMessage, IncomingEvent
│   ├── custom-elements.d.ts    # JSX declarations for Flutter element types
│   ├── ipcBridge.ts            # WebSocket server + event routing
│   ├── yogaLayout.ts           # Yoga node management + calculateLayout
│   ├── hostConfig.ts           # react-reconciler host config (core)
│   ├── renderer.ts             # Creates reconciler + exposes render()
│   ├── HelloWorld.tsx          # React component using custom elements
│   ├── index.ts                # Entry: start IPC + render app
│   └── poc.ts                  # PoC: proves cross-process IPC works
│
└── flutter-side/
    ├── pubspec.yaml
    └── lib/
        ├── main.dart               # Flutter app entry, connects to WS
        ├── widget_registry.dart    # IPC listener, WidgetNode store
        └── widget_builder.dart     # Recursive Flutter widget builder
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
> `poc.ts` can be used on its own to verify that the Node.js WebSocket server
> starts correctly and sends the right JSON messages.
> Connect any WebSocket client (e.g. `wscat`, a browser `WebSocket`) to
> `ws://localhost:9000` to inspect the protocol output.

```bash
# Terminal 1: start the Node.js IPC server
cd node-side
npm run poc

# Terminal 2: connect a WebSocket client to inspect messages
npx wscat -c ws://localhost:9000
```

When a client connects you will see the following sequence logged in Terminal 1,
and the corresponding JSON messages received by the client:

1. `{ op:"create", id:"container-1", type:"container", props:{...} }`
2. `{ op:"create", id:"text-1", type:"text", props:{ text:"Hello from React!", ... } }`
3. `{ op:"appendChild", parentId:"container-1", childId:"text-1" }`
4. `{ op:"layout", id:"container-1", x:0, y:0, w:800, h:600 }`
5. `{ op:"layout", id:"text-1", x:20, y:20, w:760, h:40 }`

### Step 3b — Run the full app

```bash
# Terminal 1:
cd node-side
npm start

# Terminal 2:
cd flutter-side
flutter run
```

> Use `npm start` / `npm run poc`
