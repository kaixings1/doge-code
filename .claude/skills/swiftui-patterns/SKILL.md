---
name: swiftui-patterns
description: SwiftUI模式和最佳实践
---

# SwiftUI Patterns

## Quick Start

Choose a track based on your goal:

### Existing project

- Identify the feature or scene and the primary interaction model: document, editor, sidebar-detail, utility window, settings, or menu bar extra.
- Read the nearest existing scene or root view before inventing a new desktop structure.
- Choose the relevant reference from `references/components-index.md`.
- If SwiftUI cannot express the required platform behavior cleanly, use the `appkit-interop` skill rather than forcing a shaky workaround.

### New app scaffolding

- Choose the scene model first: `WindowGroup`, `Window`, `Settings`, `MenuBarExtra`, or `DocumentGroup`.
- If the app combines a normal main window and a `MenuBarExtra`, use `WindowGroup(..., id:)` for the primary window when it should appear at launch. Treat `Window(...)` as a better fit for auxiliary/on-demand singleton windows; in menu-bar-heavy apps, a `Window(...)` scene may not present the main window automatically at launch.
- Before creating the scaffold, check whether the workspace is already inside a git repo with `git rev-parse --is-inside-work-tree`. If not, run `git init` at the project root so Codex app git-backed features are available from the start. Do not initialize a nested repo inside an existing parent checkout.
- For a new app scaffold, also create one project-local `script/build_and_run.sh` and `.codex/environments/environment.toml` so the Codex app Run button works immediately. Use the exact bootstrap contract from `build-run-debug` and its `references/run-button-bootstrap.md` file rather than inventing a second variant here.
- Decide which state is app-wide, scene-scoped, or window-scoped before writing views.
- Sketch file and module boundaries before writing the full UI. For any non-trivial app, create the folder structure first and split files by responsibility from the start.
- Use a single Swift file only for tiny throwaway examples or snippets: roughly under 50 lines, one screen, no persistence, no networking/process client, and no reusable models. Anything beyond that should be multi-file immediately.
- Use system-adaptive colors and materials by default (`Color.primary`, `Color.secondary`, semantic foreground styles, `.regularMaterial`, etc.) so the app follows Light/Dark mode automatically. Do not hardcode white or light backgrounds unless the user explicitly asks for a fixed theme, and do not reach for opaque `windowBackgroundColor` fills for root panes by default.
- Pick the references for the first feature surface you need: windowing, commands, split layouts, or settings.

## New App File Structure

For any non-trivial macOS app, start with this shape instead of putting the app,
all views, models, stores, services, and helpers in one Swift file:

- `App/<AppName>App.swift`: the `@main` app type and `AppDelegate` only.
- `Views/ContentView.swift`: root layout and high-level composition only.
- `Views/SidebarView.swift`, `Views/DetailView.swift`, `Views/ComposerView.swift`, etc.: feature views named after their primary type.
- `Models/*.swift`: value models, identifiers, and selection enums.
- `Stores/*.swift`: persistence and state stores.
- `Services/*.swift`: app-server, network, process, or platform clients.
- `Support/*.swift`: small formatters, resolvers, extensions, and glue helpers.

Keep files small and named after the primary type they contain. If a file starts
collecting unrelated views, models, stores, networking clients, and helper
extensions, split it before adding more behavior.

## Pre-Edit Checklist For New App Scaffolds

Before writing the full UI:

1. Choose the scene model.
2. Choose state ownership: app-wide, scene-scoped, window-scoped, or view-local.
3. Sketch file and module boundaries.
4. Create the folder structure before filling in the UI.
5. Keep `script/build_and_run.sh` and `.codex/environments/environment.toml` separate from app source.

## General Rules To Follow

- Design for pointer, keyboard, menus, and multiple windows.
- Keep scenes explicit. A separate settings window, utility window, or menu bar extra should be modeled as its own scene, not hidden inside one monolithic `ContentView`.
- Prefer system desktop affordances: `commands`, toolbars, sidebars, inspectors, contextual menus, and `searchable`.
- For menu bar apps, keep `MenuBarExtra` item titles and action labels short and scannable. Cap visible menu item text at 30 characters; if source content is longer, truncate or summarize it before rendering and open the full content in a dedicated window or detail surface.
- If a `MenuBarExtra` app should still behave like a regular Dock app with a visible main window/process, install an `NSApplicationDelegate` via `@NSApplicationDelegateAdaptor`, call `NSApp.setActivationPolicy(.regular)` during launch, and activate the app with `NSApp.activate(ignoringOtherApps: true)`. If the app is intentionally menu-bar-only, document that `.accessory` / no-Dock behavior is a deliberate product choice.
- Prefer system-adaptive colors, materials, and semantic foreground styles. Avoid fixed white/light backgrounds in scaffolding and examples unless the requested design explicitly calls for a custom non-adaptive theme.
- Do not paint `NavigationSplitView` sidebars or root window panes with opaque custom `Color(...)` or `Color(nsColor: .windowBackgroundColor)` fills by default. Prefer native macOS sidebar/window materials and system-provided backgrounds unless the user explicitly asks for a custom opaque surface. In sidebar-detail-inspector layouts, let the sidebar keep the standard source-list/material appearance and reserve custom backgrounds for detail or inspector content cards where needed.
- Use `@SceneStorage` for per-window ephemeral state and `@AppStorage` for durable user preferences.
- Keep selection state explicit and stable. macOS layouts often pivot around sidebar selection rather than push navigation.
- Prefer `NavigationSplitView` or a deliberate manual split layout over iOS-style stacked flows when the app benefits from always-visible structure.
- For `List(...).listStyle(.sidebar)` and `NavigationSplitView` sidebars, prefer flat native rows with standard system selection/highlight behavior. Keep rows visually lightweight and Mail-like: at most one leading icon, one strong title line, and one optional secondary detail line in `.secondary`. Avoid stacked metadata rows, repeated inline utility icons, or dense multi-column status text in the sidebar. Reserve card-style and metadata-heavy surfaces for detail or inspector panes unless the user explicitly asks for a highly custom sidebar treatment.
- Keep primary actions discoverable from both UI chrome and keyboard shortcuts when appropriate.
- Use SwiftUI-native scenes and views first. If you need low-level window, responder-chain, text system, or panel control, switch to `appkit-interop`.

## Recommended Sidebar Row Pattern

Prefer a native source-list row shape:

```swift
List(selection: $selection) {
  ForEach(items) { item in
    HStack(spacing: 10) {
      Image(systemName: item.systemImage)
        .foregroundStyle(.secondary)
        .frame(width: 16)

      VStack(alignment: .leading, spacing: 2) {
        Text(item.title)
          .lineLimit(1)

        if let detail = item.detail {
          Text(detail)
            .font(.caption)
            .foregroundStyle(.secondary)
            .lineLimit(1)
        }
      }
    }
    .tag(item.id)
  }
}
.listStyle(.sidebar)
```

This keeps selection, highlight, spacing, and scanability aligned with standard
macOS sidebars. Keep each row to one icon maximum and one or two text lines
maximum, with the second line reserved for a short detail label. Use richer card
treatments and denser metadata in the detail or inspector content, not in every
sidebar row.

## Recommended Split-View Background Pattern

Prefer letting the sidebar and split container use system backgrounds, while
applying custom surfaces only to detail cards or inspector sections:

```swift
NavigationSplitView {
  List(selection: $selection) {
    ForEach(items) { item in
      Label(item.title, systemImage: item.systemImage)
        .tag(item.id)
    }
  }
  .listStyle(.sidebar)
} detail: {
  ScrollView {
    VStack(alignment: .leading, spacing: 16) {
      DetailSummaryCard(item: selectedItem)
      DetailMetricsCard(item: selectedItem)
    }
    .padding()
  }
}
```

Avoid painting the sidebar and root split panes with opaque custom fills by
default:

```swift
NavigationSplitView {
  List(items) { item in
    SidebarCardRow(item: item)
  }
  .listStyle(.sidebar)
  .background(Color(nsColor: .windowBackgroundColor))
} detail: {
  DetailView(item: selectedItem)
    .background(Color(.white))
}
```

## State Ownership Summary

Use the narrowest state tool that matches the ownership model:

| Scenario | Preferred pattern |
| ---MYMEMORY WARNING: YOU USED ALL AVAILABLE FREE TRANSLATIONS FOR TODAY. NEXT AVAILABLE IN  21 HOURS 59 MINUTES 57 SECONDS VISIT HTTPS://MYMEMORY.TRANSLATED.NET/DOC/USAGELIMITS.PHP TO TRANSLATE MORE