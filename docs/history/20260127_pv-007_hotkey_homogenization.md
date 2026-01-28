**Feature:** pv-007 → Homogenize and simplify hotkey mappings across pv/fv views

## Problem Summary

The `pv` TUI has inconsistent hotkey behavior across views that violates user expectations:

| Issue | Impact |
|-------|--------|
| `f` cycles 5 filters in portfolio, but only toggles 2 in tree | Muscle memory fails |
| `a` works only on empty tree (silently ignored otherwise) | Dead key confusion |
| `n`/`N` asymmetry: `n` = new in epic, `N` = new in project | Cognitive load |
| Search navigation `n`/`N` conflicts with "new" semantics | Context-dependent surprise |

## Context Files

**Core (modify):**
- `bin/pv` — all input handlers and help view

**Reference:**
- TUI conventions: vim (j/k/n/N), less (/n/N), ranger (consistent across panes)

## Design Principles

1. **Same key = same action** across views (where applicable)
2. **Vim-like search**: `/` to search, `n`/`N` for next/prev match (universal)
3. **Mnemonic consistency**: `n` = new, `f` = filter, `a` = all
4. **Graceful degradation**: keys do nothing rather than unexpected things

## Proposed Hotkey Map

```
┌─────────────────────────────────────────────────────────────────────────────┐
│ GLOBAL (all views)                                                          │
├─────────────────────────────────────────────────────────────────────────────┤
│ j/↓        Move down                                                        │
│ k/↑        Move up                                                          │
│ Enter/→    Drill down / expand                                              │
│ Esc/b      Go back / collapse                                               │
│ h/?        Help                                                             │
│ q          Quit                                                             │
└─────────────────────────────────────────────────────────────────────────────┘

┌─────────────────────────────────────────────────────────────────────────────┐
│ LIST VIEWS (portfolio, project, epic)                                       │
├─────────────────────────────────────────────────────────────────────────────┤
│ f          Cycle filter (open→all→active→stalled→archived)                  │
│ s          Cycle sort (portfolio only, no-op elsewhere)                     │
│ n          New entity (epic in project, feature in epic)                    │
│ A          Toggle archive (portfolio only)                                  │
│ t          Toggle tree view (portfolio only)                                │
└─────────────────────────────────────────────────────────────────────────────┘

┌─────────────────────────────────────────────────────────────────────────────┐
│ TREE VIEW                                                                   │
├─────────────────────────────────────────────────────────────────────────────┤
│ f          Cycle filter (same 5 modes as portfolio) ← FIX                   │
│ (a removed - use f to cycle filters)                                        │
│ n          New entity (context: epic on project, feature on epic)           │
│ /          Enter search mode                                                │
│ ^n         Next search match ← CHANGE from bare n                           │
│ ^p         Prev search match ← CHANGE from N                                │
│ o          Expand all under cursor                                          │
│ O          Collapse all ← CHANGE from M (vim-like)                          │
│ z          Zoom/unzoom                                                      │
│ A          Toggle archive (on project nodes)                                │
│ t          Return to table view                                             │
└─────────────────────────────────────────────────────────────────────────────┘

┌─────────────────────────────────────────────────────────────────────────────┐
│ FEATURE VIEW                                                                │
├─────────────────────────────────────────────────────────────────────────────┤
│ e          Enter edit mode                                                  │
│ D          Delete (with confirmation)                                       │
│ w          Write/save changes                                               │
│ Tab        Next field (in edit mode)                                        │
│ j/k        Cycle status options (in edit mode, on status field)             │
└─────────────────────────────────────────────────────────────────────────────┘

┌─────────────────────────────────────────────────────────────────────────────┐
│ SEARCH MODE (tree view)                                                     │
├─────────────────────────────────────────────────────────────────────────────┤
│ Enter      Confirm search, jump to match                                    │
│ Esc        Cancel search                                                    │
│ Backspace  Delete character                                                 │
│ (typing)   Add to query                                                     │
└─────────────────────────────────────────────────────────────────────────────┘
```

## Key Changes

### 1. Unify `f` filter behavior

**Current:**
- Portfolio: cycles `['open', 'all', 'active', 'stalled', 'archived']`
- Tree: toggles between `'open'` and `'all'` only

**Change:** Tree view cycles through all 5 filter modes, same as portfolio.

```python
# In handle_tree_input, replace:
elif key == 'f':
    state.filter_mode = 'all' if state.filter_mode != 'all' else 'open'

# With:
elif key == 'f':
    idx = FILTER_MODES.index(state.filter_mode)
    state.filter_mode = FILTER_MODES[(idx + 1) % len(FILTER_MODES)]
```

### 2. Remove `a` key, fix empty-tree hint

The hint "Press [a] to show all" appears on empty tree but `a` doesn't work elsewhere. Rather than adding another key, **remove `a` entirely** and update hint to use `f`:

```python
# In view_tree, replace:
lines.append(f"  {ansi('Press [a] to show all', COLOR_MUTED)}")

# With:
lines.append(f"  {ansi('Press [f] to cycle filters', COLOR_MUTED)}")

# In handle_tree_input empty-tree handler, remove the 'a' case:
# Delete lines 1862-1865 (elif key == 'a': ...)
```

This simplifies by removing a redundant key. Users press `f` to cycle filters everywhere.

### 3. Separate search navigation from `n` (new)

**Problem:** `n` means "new" in list views but "next match" in tree (when searching). This violates vim convention where `n`/`N` are always search navigation.

**Solution:** Use `Ctrl+n`/`Ctrl+p` for search navigation (like many editors), keep `n` for "new".

```python
# In getch(), Ctrl+n = '\x0e', Ctrl+p = '\x10'

# In handle_tree_input, replace:
elif key == 'n' and state.tree.search_matches:
    # Next match
    ...
elif key == 'N' and state.tree.search_matches:
    # Previous match
    ...

# With:
elif key == '\x0e' and state.tree.search_matches:  # Ctrl+n
    # Next match
    ...
elif key == '\x10' and state.tree.search_matches:  # Ctrl+p
    # Previous match
    ...
```

### 4. Change `M` → `O` for collapse-all

Vim uses `o`/`O` for open operations. Having `o` = expand-all and `O` = collapse-all is more intuitive than `o`/`M`.

```python
# In handle_tree_input, replace:
elif key == 'M':
    collapse_all(state.tree.root)

# With:
elif key == 'O':
    collapse_all(state.tree.root)
```

### 5. Unify `n`/`N` for new entities

**Current:**
- Project view: `N` creates epic
- Epic view: `n` creates feature
- Tree view: `n` creates (context-sensitive)

**Change:** Use `n` everywhere (lowercase). The context determines what's created.

```python
# In handle_project_input, change:
elif key == 'N':
    state.creation = CreationState(entity_type='epic', ...)

# To:
elif key == 'n':
    state.creation = CreationState(entity_type='epic', ...)
```

### 6. Update help view

Consolidate help text to reflect unified hotkeys:

```python
# NAVIGATION section - unchanged

# FILTERING section (new)
lines.append(section_header('FILTERING', inner))
lines.append('')
lines.append(f"  {ansi('f', bold=True)}          Cycle filter (open/all/active/stalled/archived)")
lines.append(f"  {ansi('s', bold=True)}          Cycle sort (portfolio only)")

# TREE VIEW section - update
lines.append(f"  {ansi('o', bold=True)}          Expand all under cursor")
lines.append(f"  {ansi('O', bold=True)}          Collapse all")
lines.append(f"  {ansi('/', bold=True)}          Search")
lines.append(f"  {ansi('^n', bold=True)}/{ansi('^p', bold=True)}      Next/prev search match")

# CREATION section (new)
lines.append(section_header('CREATION', inner))
lines.append('')
lines.append(f"  {ansi('n', bold=True)}          New entity (epic in project, feature in epic)")
```

### 7. Update footer hints

Footers should reflect unified keys:

```python
# Portfolio footer - unchanged
footer = f'[s]ort:{state.sort_mode} [f]ilter:{state.filter_mode} [A]rchive [t]ree [h]elp [q]uit'

# Tree footer - update
footer = f'[/]search [f]ilter:{state.filter_mode} [n]ew [t]able [h]elp [q]uit'

# When search matches exist, show match count:
footer = f'matches:{len(matches)} [^n/^p]nav [n]ew [t]able [q]uit'

# Project footer - add [n]ew
footer = '[n]ew [Esc]back [h]elp [q]uit'

# Epic footer - unchanged (already shows [n]ew)
footer = '[n]ew [Esc]back [h]elp [q]uit'
```

## Implementation Phases

### Phase 1: Unify filter behavior
- [x] Make tree `f` cycle through all 5 filter modes
- [x] Remove `a` key handler from empty-tree branch
- [x] Update empty-tree hint from `[a]` to `[f]`
- [x] Verify: `f` cycles same modes in portfolio and tree

### Phase 2: Fix search navigation conflict
- [x] Change search next/prev from `n`/`N` to `^n`/`^p`
- [x] Update footer hints for search mode (`[^n/^p]nav`)
- [x] Verify: `n` always means "new", ^n/^p navigate search

### Phase 3: Normalize new-entity keys
- [x] Already implemented: project view uses `n` for new epic
- [x] Footer already shows `[n]ew epic`
- [x] `n` works consistently in project view, epic view, and tree view

### Phase 4: Collapse-all key change
- [x] Change tree view `M` → `O` for collapse-all
- [x] Update help text
- [x] Verify: `o` expands all, `O` collapses all

### Phase 5: Update help and documentation
- [x] Update help: `M` → `O`, `n/N` → `^n/^p`, `f` description
- [x] Update docstring at top of file (added 'archived' to filter list)
- [x] Verify: help screen reflects all changes

### Phase 6: Final verification
- [x] Verified: no 'a' key handlers remain
- [x] Verified: no 'M' key handlers remain
- [x] Verified: ^n (\\x0e) and ^p (\\x10) handlers exist
- [x] Verified: FILTER_MODES used in portfolio, empty-tree, and tree handlers

## Verification Strategy

**Filter consistency:**
```
1. Start pv, press f multiple times in portfolio, note 5-mode cycle
2. Press t for tree view
3. Press f multiple times, verify same 5-mode cycle
4. Verify filter state persists when switching t back to portfolio
```

**Search + new separation:**
```
1. In tree view, press / and type query
2. Press Enter to confirm
3. Press Ctrl+n, verify cursor jumps to next match
4. Press n, verify creation mode opens (not next match)
```

**New entity consistency:**
```
1. In project view, press n, verify epic creation
2. Cancel, drill into epic
3. Press n, verify feature creation
4. Cancel, back to portfolio, t for tree
5. On project node, press n, verify epic creation
6. On epic node, press n, verify feature creation
```

## Risk Assessment

| Risk | Mitigation |
|------|------------|
| ^n/^p may not work in all terminals | Test on common terminals (iTerm, Terminal.app, kitty) |
| Users expect M for collapse | Document in help, O is vim-like |
| Breaking muscle memory | Changes are intuitive (same key = same action) |

## Rejected Alternatives

1. **Keep n/N for search, use different key for new**: Would break vim muscle memory for search navigation
2. **Remove filter cycling in tree, keep simple toggle**: Loses power-user functionality
3. **Different new keys per context (n/N/c)**: Adds cognitive load, current problem

---

*Plan scope: hotkey consistency only. Does not touch data model, rendering, or persistence.*
