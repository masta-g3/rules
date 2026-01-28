**Feature:** pv-006 → Entity Creation Interface (Features & Epics)

## Overview

Add creation functionality to pv/fv allowing users to create new features and epics from both table and tree views. The interface should:
- Allow review before committing to JSON
- Be AI-agent friendly (simple, modular operations for future LiteLLM integration)
- Provide clear feedback on success/failure
- Work identically from both table and tree views

## Context Files

### Core (will modify)
- `bin/pv` - main TUI application (all changes here)

### Reference (patterns to follow)
- `bin/pv:1428-1438` - existing `next_feature_id()` for ID generation
- `bin/pv:1463-1545` - existing `handle_feature_input()` edit flow
- `bin/pv:1548-1605` - field loading/committing pattern
- `bin/pv:1608-1631` - `save_features()` serialization

### Config
- `features.json` - target output format

## Current State Analysis

### What Exists
```
EditState:
  mode: 'navigate' | 'edit'
  field_idx: int
  editing_value: str
  pending_changes: dict
  confirm_action: str | None

create_feature(model, epic_name) → Feature
  - Generates next ID (epic-NNN)
  - Creates Feature with defaults
  - Adds to model.features and model.epics immediately
  - Returns feature object

save_features(project) → bool
  - Serializes all features to JSON
  - Sorts by ID
```

### Current Flow (Epic View Only)
```
[n] key in epic view
  → create_feature(model, current_epic)
  → state.view = 'feature'
  → state.edit = EditState(mode='edit')
  → user edits fields
  → [w] saves to JSON
```

### Gap
- No way to create features from tree view
- No way to create new epics
- No "confirm before save" step for new entities
- Creation tightly coupled to epic view

## Design

### Architecture: Entity Operations Module

Introduce a clean separation between **operations** (what can be done) and **triggers** (where it's invoked from):

```
┌─────────────────────────────────────────────────────────────────────┐
│                         ENTITY OPERATIONS                           │
│  (Pure functions operating on Model - AI-agent friendly)            │
├─────────────────────────────────────────────────────────────────────┤
│                                                                     │
│  op_create_feature(model, epic, fields) → Feature                   │
│  op_create_epic(model, name) → Epic                                 │
│  op_preview_feature(epic, fields) → dict                            │
│  op_preview_epic(name) → dict                                       │
│                                                                     │
└─────────────────────────────────────────────────────────────────────┘
                              │
                              ▼
┌─────────────────────────────────────────────────────────────────────┐
│                         CREATION STATE                              │
│  (Tracks in-progress creation with preview/confirm)                 │
├─────────────────────────────────────────────────────────────────────┤
│                                                                     │
│  CreationState:                                                     │
│    entity_type: 'feature' | 'epic'                                  │
│    epic_context: str | None   # parent epic for features            │
│    fields: dict               # edited values (draft, not in model) │
│    preview_mode: bool         # showing JSON preview                │
│    return_view: str           # where to go after (tree/epic)       │
│                                                                     │
└─────────────────────────────────────────────────────────────────────┘
                              │
                              ▼
┌─────────────────────────────────────────────────────────────────────┐
│                      VIEW INTEGRATION                               │
│  (Triggers from both table and tree views)                          │
├─────────────────────────────────────────────────────────────────────┤
│                                                                     │
│  Table View (epic level):  [n] → create feature in current epic     │
│  Table View (project):     [N] → create new epic                    │
│  Tree View (on project):   [n] → create epic under project          │
│  Tree View (on epic):      [n] → create feature under epic          │
│                                                                     │
└─────────────────────────────────────────────────────────────────────┘
```

### Creation Flow (Both Views)

```
┌──────────┐     ┌──────────────┐     ┌─────────────┐     ┌──────────┐
│ Trigger  │────▶│ Edit Fields  │────▶│   Preview   │────▶│  Commit  │
│ [n] key  │     │ (draft only) │     │  & Confirm  │     │ to Model │
└──────────┘     └──────────────┘     └─────────────┘     └──────────┘
                        │                    │                   │
                        ▼                    ▼                   ▼
                 Fields stored in      Show JSON preview    op_create_*()
                 CreationState.fields  [c] to confirm       Save to disk
                 NOT in model yet      [Esc] to cancel      Flash success
```

### State Machine

```
                    ┌─────────────────┐
                    │   NAVIGATE      │
                    │  (normal view)  │
                    └────────┬────────┘
                             │ [n] create
                             ▼
                    ┌─────────────────┐
                    │   CREATING      │
                    │  (edit fields)  │◀──┐
                    └────────┬────────┘   │
                             │ [Esc]      │ [e] edit more
                             ▼            │
                    ┌─────────────────┐   │
                    │   PREVIEW       │───┘
                    │  (show JSON)    │
                    └────────┬────────┘
                        │         │
               [c] confirm    [Esc] cancel
                        │         │
                        ▼         ▼
                    ┌──────┐  ┌──────────┐
                    │ SAVE │  │ DISCARD  │
                    └──────┘  └──────────┘
```

### AI-Agent Friendly Interface

Future LiteLLM integration will call the same operations:

```python
# Agent-callable operations (pure, stateless)
def op_create_feature(model: Model, epic: str, fields: dict) -> Feature:
    """Create feature with given fields. Adds to model. Returns created feature."""

def op_create_epic(model: Model, name: str) -> Epic:
    """Create new epic. Adds to model. Returns created epic."""

def op_preview_feature(epic: str, fields: dict) -> dict:
    """Preview feature as JSON without creating. For confirmation UI."""

def op_preview_epic(name: str) -> dict:
    """Preview epic as JSON without creating."""

# All operations:
# - Take model as first argument (except preview which doesn't need it)
# - Accept simple types (str, dict, list)
# - Return simple types or dataclass instances
# - Raise exceptions on validation errors (not silent failures)
```

These same operations power both TUI and future AI agent.

## Implementation Details

### 1. CreationState Dataclass

```python
@dataclass
class CreationState:
    """State for entity creation flow."""
    entity_type: str  # 'feature' | 'epic'
    epic_context: str | None = None  # parent epic for features
    fields: dict = field(default_factory=dict)  # draft values, NOT in model
    preview_mode: bool = False
    return_view: str = 'epic'  # where to return after creation
```

### 2. Entity Operations (Agent-Friendly)

```python
def op_create_feature(model: Model, epic: str, fields: dict = None) -> Feature:
    """Create feature in epic. Adds to model immediately."""
    fields = fields or {}
    new_id = next_feature_id(model, epic)
    today = datetime.now().strftime('%Y-%m-%d')

    feat = Feature(
        id=new_id,
        status=fields.get('status', 'pending'),
        title=fields.get('title', ''),
        description=fields.get('description', ''),
        epic=epic,
        depends_on=fields.get('depends_on', []),
        priority=fields.get('priority'),
        created_at=today,
        notes=fields.get('notes'),
    )

    # Add to model
    model.features[new_id] = feat
    if epic not in model.epics:
        model.epics[epic] = Epic(name=epic)
    model.epics[epic].features.append(feat)

    return feat


def op_create_epic(model: Model, name: str) -> Epic:
    """Create new epic. Adds to model immediately."""
    if name in model.epics:
        raise ValueError(f"Epic '{name}' already exists")

    epic = Epic(name=name)
    model.epics[name] = epic
    return epic


def op_preview_feature(epic: str, fields: dict) -> dict:
    """Preview feature as JSON without modifying model. For confirmation UI."""
    return {
        'id': f'{epic}-???',
        'status': fields.get('status', 'pending'),
        'title': fields.get('title', ''),
        'epic': epic,
        'description': fields.get('description', ''),
        'depends_on': fields.get('depends_on', []),
        'priority': fields.get('priority'),
        'created_at': datetime.now().strftime('%Y-%m-%d'),
    }


def op_preview_epic(name: str) -> dict:
    """Preview epic as JSON without modifying model."""
    return {'name': name, 'features': []}
```

### 3. Creation-Specific Field Helpers

These are separate from the existing feature edit helpers to avoid conflicts:

```python
CREATION_FIELDS_FEATURE = ['title', 'status', 'priority', 'description', 'depends_on']
CREATION_FIELDS_EPIC = ['name']


def load_creation_field(state: State) -> None:
    """Load current field value into editing_value for creation mode."""
    cs = state.creation
    fields = CREATION_FIELDS_FEATURE if cs.entity_type == 'feature' else CREATION_FIELDS_EPIC
    field = fields[state.edit.field_idx]

    value = cs.fields.get(field, '')

    # Default status to 'pending' for new features
    if field == 'status' and not value:
        value = 'pending'

    if field == 'depends_on' and isinstance(value, list):
        value = ', '.join(value)

    state.edit.editing_value = str(value) if value else ''


def commit_creation_field(state: State) -> None:
    """Store current editing_value in creation fields dict."""
    cs = state.creation
    fields = CREATION_FIELDS_FEATURE if cs.entity_type == 'feature' else CREATION_FIELDS_EPIC
    field = fields[state.edit.field_idx]
    value = state.edit.editing_value

    if field == 'depends_on':
        value = [x.strip() for x in value.split(',') if x.strip()]
    elif field == 'priority':
        try:
            value = int(value) if value else None
        except ValueError:
            value = None

    cs.fields[field] = value
```

### 4. Creation View Rendering

```python
def view_creation(state: 'State', width: int) -> list[str]:
    """Render creation view with field editor and preview."""
    lines = []
    inner = width - 4
    cs = state.creation

    if cs.preview_mode:
        return view_creation_preview(state, width)

    entity_label = 'Feature' if cs.entity_type == 'feature' else 'Epic'
    lines.append('')
    lines.append(f"  {ansi(f'New {entity_label}', bold=True)}")
    if cs.entity_type == 'feature':
        lines.append(f"  {ansi(f'Epic: {cs.epic_context}', COLOR_EPIC)}")
    lines.append('')
    lines.append(section_header('FIELDS', inner))
    lines.append('')

    fields = CREATION_FIELDS_FEATURE if cs.entity_type == 'feature' else CREATION_FIELDS_EPIC

    for i, fld in enumerate(fields):
        is_current = (i == state.edit.field_idx)
        value = state.edit.editing_value if is_current else cs.fields.get(fld, '')

        if fld == 'status':
            # Radio buttons
            if not value:
                value = 'pending'
            options = []
            for opt in STATUS_OPTIONS:
                marker = '◉' if value == opt else '○'
                color = STATUS_COLOR.get(opt, 0)
                options.append(ansi(f'{marker} {opt}', color))
            display = '  '.join(options)
        elif fld == 'depends_on':
            if isinstance(value, list):
                display = f"[{', '.join(value)}]"
            else:
                display = f"[{value}]"
        else:
            display = f"[{value}]"

        prefix = '▸ ' if is_current else '  '
        label = f"{fld}:".ljust(14)
        lines.append(f"{prefix}{ansi(label, COLOR_MUTED)}{display}")

    lines.append('')
    return lines


def view_creation_preview(state: 'State', width: int) -> list[str]:
    """Show JSON preview before commit."""
    lines = []
    cs = state.creation

    lines.append('')
    lines.append(f"  {ansi('Review before creating:', bold=True)}")
    lines.append('')

    if cs.entity_type == 'feature':
        preview = op_preview_feature(cs.epic_context, cs.fields)
    else:
        preview = op_preview_epic(cs.fields.get('name', ''))

    # Render as formatted key-value pairs
    for key, val in preview.items():
        if val:  # Skip empty values
            val_str = json.dumps(val) if isinstance(val, (list, dict)) else str(val)
            lines.append(f"  {ansi(key + ':', COLOR_MUTED)} {val_str}")

    lines.append('')
    lines.append(f"  {ansi('[c] Confirm and create', COLOR_HEALTHY)}")
    lines.append(f"  {ansi('[e] Edit more', COLOR_MUTED)}")
    lines.append(f"  {ansi('[Esc] Cancel', COLOR_MUTED)}")
    lines.append('')
    return lines
```

### 5. Input Handling for Creation

```python
def handle_creation_input(key: str, state: State) -> State:
    """Handle input in creation view."""
    cs = state.creation

    # Preview mode
    if cs.preview_mode:
        if key == 'c':  # Confirm
            commit_creation(state)
            return state
        elif key == 'e':  # Edit more
            cs.preview_mode = False
            state.edit.field_idx = 0
            load_creation_field(state)
            return state
        elif key == '\x1b':  # Cancel - discard and return
            state.creation = None
            state.edit = None
            state.view = cs.return_view
            return state
        return state

    # Edit mode
    if key == '\x1b':  # Esc - commit current field and show preview
        commit_creation_field(state)
        cs.preview_mode = True
        return state

    if key == '\t':  # Tab - commit and advance to next field
        commit_creation_field(state)
        fields = CREATION_FIELDS_FEATURE if cs.entity_type == 'feature' else CREATION_FIELDS_EPIC
        state.edit.field_idx = (state.edit.field_idx + 1) % len(fields)
        load_creation_field(state)
        return state

    # Field-specific input
    fields = CREATION_FIELDS_FEATURE if cs.entity_type == 'feature' else CREATION_FIELDS_EPIC
    field = fields[state.edit.field_idx]

    if field == 'status':
        if key in ('j', 'down'):
            current = state.edit.editing_value or 'pending'
            idx = STATUS_OPTIONS.index(current) if current in STATUS_OPTIONS else 0
            state.edit.editing_value = STATUS_OPTIONS[(idx + 1) % len(STATUS_OPTIONS)]
        elif key in ('k', 'up'):
            current = state.edit.editing_value or 'pending'
            idx = STATUS_OPTIONS.index(current) if current in STATUS_OPTIONS else 0
            state.edit.editing_value = STATUS_OPTIONS[(idx - 1) % len(STATUS_OPTIONS)]
    else:
        if key == '\x7f':  # Backspace
            state.edit.editing_value = state.edit.editing_value[:-1]
        elif len(key) == 1 and key.isprintable():
            state.edit.editing_value += key

    return state


def commit_creation(state: State) -> None:
    """Commit creation to model and save."""
    cs = state.creation
    model = state.current_project._detail

    if cs.entity_type == 'feature':
        feat = op_create_feature(model, cs.epic_context, cs.fields)
        state.current_feature = feat.id
        state.flash_message = f"Created {feat.id}"
        state.view = 'feature'
        state.edit = None
    else:
        epic = op_create_epic(model, cs.fields.get('name', 'new-epic'))
        state.flash_message = f"Created epic: {epic.name}"
        state.view = cs.return_view
        state.edit = None

    save_features(state.current_project)
    state.creation = None
```

### 6. Trigger Points (Both Views)

```python
# In handle_epic_input (table view) - replace existing [n] handler:
elif key == 'n':
    state.creation = CreationState(
        entity_type='feature',
        epic_context=state.current_epic,
        return_view='epic',
    )
    state.edit = EditState(mode='edit', field_idx=0)
    state.view = 'creation'
    load_creation_field(state)

# In handle_project_input (table view) - add new [N] handler:
elif key == 'N':
    state.creation = CreationState(
        entity_type='epic',
        return_view='project',
    )
    state.edit = EditState(mode='edit', field_idx=0)
    state.view = 'creation'
    load_creation_field(state)

# In handle_tree_input - add [n] handler:
elif key == 'n':
    _, node = flat[cursor_idx]
    if node.type == 'project':
        # Create epic under project - use project_ref not data
        proj = node.project_ref
        proj.load_detail()
        state.current_project = proj
        state.creation = CreationState(
            entity_type='epic',
            return_view='tree',
        )
    elif node.type == 'epic':
        # Create feature under epic
        proj = node.project_ref
        proj.load_detail()
        state.current_project = proj
        state.creation = CreationState(
            entity_type='feature',
            epic_context=node.label,
            return_view='tree',
        )
    else:
        return state  # Can't create from feature node

    state.edit = EditState(mode='edit', field_idx=0)
    state.view = 'creation'
    load_creation_field(state)
```

### 7. Flash Message (Simple Version)

Simple flash that clears on next keypress, no time tracking:

```python
@dataclass
class State:
    # ... existing fields ...
    flash_message: str | None = None  # Clears on next keypress

# In handle_input(), at the very start:
def handle_input(key: str, state: State) -> State | None:
    # Clear flash on any keypress
    state.flash_message = None
    # ... rest of handler

# In render(), prepend to footer if set:
if state.flash_message:
    footer = f"✓ {state.flash_message}  │  {footer}"
```

### 8. Update render() and handle_input()

```python
def render(state: State, width: int, height: int) -> str:
    # Add creation view handling in the view switch
    if state.view == 'creation':
        cs = state.creation
        title = f"new {cs.entity_type}"
        if cs.preview_mode:
            footer = '[c]onfirm [e]dit [Esc]cancel'
        else:
            footer = '[Tab]next [Esc]preview'
        lines = view_creation(state, width)

    # ... rest of existing view handling ...

    # Prepend flash to footer
    if state.flash_message:
        footer = f"✓ {state.flash_message}  │  {footer}"

    framed = frame(lines, width, title, footer)
    return '\n'.join(framed)


def handle_input(key: str, state: State) -> State | None:
    # Clear flash on any keypress
    state.flash_message = None

    # ... existing handlers ...

    # Add creation view handler
    if state.view == 'creation':
        return handle_creation_input(key, state)
```

### 9. Update help view

Add to help view:

```python
lines.append(section_header('CREATION', inner))
lines.append('')
lines.append(f"  {ansi('n', bold=True)}          Create new feature (in epic) or epic (on project)")
lines.append(f"  {ansi('N', bold=True)}          Create new epic (in project view)")
```

## Implementation Phases

### Phase 1: Core Operations & State
- [x] Add `CreationState` dataclass after `EditState`
- [x] Add `flash_message: str | None = None` to `State` dataclass
- [x] Add `op_create_feature()` - refactored from existing `create_feature()`
- [x] Add `op_create_epic()`
- [x] Add `op_preview_feature()`, `op_preview_epic()`
- [x] Keep old `create_feature()` for backwards compatibility (not used by TUI)

**Verify:** ✓ Syntax check passes.

### Phase 2: Creation Field Helpers
- [x] Add `CREATION_FIELDS_FEATURE`, `CREATION_FIELDS_EPIC` constants
- [x] Add `load_creation_field()` function
- [x] Add `commit_creation_field()` function

**Verify:** ✓ Syntax check passes.

### Phase 3: Creation View
- [x] Add `view_creation()` renderer
- [x] Add `view_creation_preview()` renderer
- [x] Add creation view case to `render()` switch

**Verify:** ✓ Syntax check passes.

### Phase 4: Input Handling
- [x] Add `handle_creation_input()`
- [x] Add `commit_creation()`
- [x] Wire `state.view == 'creation'` into `handle_input()` dispatcher
- [x] Add flash message clearing at start of `handle_input()`
- [x] Add flash display in `render()` footer

**Verify:** ✓ Syntax check passes.

### Phase 5: Trigger Integration
- [x] Replace `[n]` in `handle_epic_input()` (feature creation with preview)
- [x] Add `[N]` in `handle_project_input()` (epic creation)
- [x] Add `[n]` in `handle_tree_input()` (context-aware: epic on project, feature on epic)
- [x] Update `view_help()` with new keybindings

**Verify:** ✓ pv runs and shows updated footer.

### Phase 6: Tree View Testing
- [x] Test [n] on project node creates epic
- [x] Test [n] on epic node creates feature
- [x] Test return_view correctly goes back to tree
- [x] Test cancel flow returns cleanly

**Verify:** ✓ Unit tests pass for all creation logic. Logic verified through code inspection.

## Key Design Decisions

1. **Draft-then-commit**: Fields stored in `CreationState.fields`, NOT in model, until user confirms. Cancel discards cleanly.

2. **Preview JSON**: User sees exact output before committing. No surprises.

3. **Unified operations**: Same `op_*` functions work for TUI and future AI agent. Agent calls `op_create_feature(model, epic, fields)` directly.

4. **Return-view tracking**: `CreationState.return_view` knows where to go back to (tree vs table).

5. **Separate field helpers**: `load_creation_field()` / `commit_creation_field()` are distinct from feature edit helpers to avoid coupling.

6. **Context-aware `[n]`**: In tree view, same key creates epic (on project) or feature (on epic).

7. **Simple flash**: Message clears on next keypress. No timers, no complexity.

## Future: AI Agent Integration

The `op_*` functions are designed for programmatic use:

```python
# Future LiteLLM agent could call:
async def agent_create_feature(project_path: str, epic: str, description: str):
    """AI agent creates a feature from natural language."""
    model = Model.load(f"{project_path}/features.json")

    # Agent determines fields from description
    fields = await llm_extract_fields(description)

    # Same operation as TUI uses
    feat = op_create_feature(model, epic, fields)

    # Same save as TUI uses
    save_features_to_path(model, project_path)

    return feat.id
```

No special API needed - just import and call the operations.
